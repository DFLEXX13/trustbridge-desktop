#!/usr/bin/env bash
# Build a signed + notarized macOS universal TrustBridge Desktop and upload it to GitHub Releases.
# Usage: scripts/release-macos.sh [--dry-run] [--replace]
#   --dry-run   build (and sign/notarize) only, skip the GitHub upload and the git/release checks
#   --replace   allow overwriting files of an already PUBLISHED release with the same tag
# A real run stops if: either repo has uncommitted changes, HEAD (or ../trustbridge-web HEAD) is not
# pushed, or the release tag is already published. A missing release is created as a DRAFT pinned
# to the built commit; an existing draft just gets the files.
#
# Windows/Linux installers are NOT built here: they come from the CI workflow
# (.github/workflows/build-trustbridge.yml) and are attached to the release by hand.
#
# Secrets are never read from ad-hoc shell env vars. They live in a single file
# OUTSIDE this repo:
#   SECRETS_FILE (default: ~/Projects/trustbridge-cert-apple/desktop.env)
# That file must define:
#   APPLE_CODESIGN_IDENTITY  Developer ID Application identity name (must be in the login keychain)
#   APPLE_TEAM_ID            Apple Developer Team ID
#   APPLE_API_KEY            path to the App Store Connect AuthKey_<id>.p8 (notarization)
#   APPLE_API_KEY_ID         that key's id
#   APPLE_API_ISSUER         App Store Connect issuer id
# Upload uses the existing `gh auth` login; no token is read by this script.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DRY_RUN=false
REPLACE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --replace) REPLACE=true ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

GH_REPO="DFLEXX13/trustbridge-desktop"
SECRETS_FILE="${SECRETS_FILE:-$HOME/Projects/trustbridge-cert-apple/desktop.env}"
if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "Secrets file not found: $SECRETS_FILE" >&2
  echo "Create it with the variables listed in the header of this script." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$SECRETS_FILE"
for v in APPLE_CODESIGN_IDENTITY APPLE_TEAM_ID APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER; do
  if [[ -z "${!v:-}" ]]; then
    echo "$v is not set in $SECRETS_FILE" >&2
    exit 1
  fi
done
if [[ ! -f "$APPLE_API_KEY" ]]; then
  echo "APPLE_API_KEY in $SECRETS_FILE does not point to an existing file" >&2
  exit 1
fi
# electron-builder rejects the "Developer ID Application:" prefix in the identity name
APPLE_CODESIGN_IDENTITY="${APPLE_CODESIGN_IDENTITY#Developer ID Application: }"
export APPLE_CODESIGN_IDENTITY APPLE_TEAM_ID APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER
if ! security find-identity -v -p codesigning | grep -F "Developer ID Application: " | grep -qF "$APPLE_CODESIGN_IDENTITY"; then
  echo "APPLE_CODESIGN_IDENTITY in $SECRETS_FILE matches no Developer ID Application certificate in the keychain" >&2
  echo "Compare with: security find-identity -v -p codesigning" >&2
  exit 1
fi
# TrustBridge variant (appId, productName, protocols), same as CI
export VARIANT_PATH="trustbridge/release/build.json"

BUILD_DIR="$REPO_ROOT/build"
LOG_FILE="$BUILD_DIR/release-macos.log"
mkdir -p "$BUILD_DIR"
: > "$LOG_FILE"

fail() {
  echo "FAILED: $1"
  echo "--- last 20 lines of $LOG_FILE ---"
  tail -n 20 "$LOG_FILE"
  exit 1
}

# Node version comes from .node-version (via nvm if it is not already active)
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  nvm use "$(cat .node-version)" >> "$LOG_FILE" 2>&1 || fail "nvm use $(cat .node-version)"
fi

[[ -d ../trustbridge-web ]] || fail "sibling repo ../trustbridge-web not found"

VERSION="$(node -p "require('./package.json').version")"
TAG="v$VERSION"

# Real run only: refuse to publish from a state that cannot be reproduced from git,
# and refuse to touch an already published release. All checks run before the long build.
if ! $DRY_RUN; then
  [[ -z "$(git status --porcelain)" ]] || fail "uncommitted changes in trustbridge-desktop"
  [[ -z "$(git -C ../trustbridge-web status --porcelain)" ]] || fail "uncommitted changes in ../trustbridge-web"
  git fetch -q origin >> "$LOG_FILE" 2>&1 || fail "git fetch origin"
  git branch -r --contains HEAD | grep -q 'origin/develop' || fail "HEAD is not pushed to origin/develop"
  git -C ../trustbridge-web fetch -q origin >> "$LOG_FILE" 2>&1 || fail "git fetch in ../trustbridge-web"
  [[ -z "$(git -C ../trustbridge-web log origin/develop..HEAD --oneline)" ]] || fail "unpushed commits in ../trustbridge-web"
  RELEASES_JSON="$(gh release list -R "$GH_REPO" --limit 200 --json tagName,isDraft 2>>"$LOG_FILE")" \
    || fail "gh release list"
  RELEASE_STATE="$(node -e '
    const r = JSON.parse(process.argv[1]).find((x) => x.tagName === process.argv[2]);
    console.log(!r ? "none" : r.isDraft ? "draft" : "published");
  ' "$RELEASES_JSON" "$TAG")"
  if [[ "$RELEASE_STATE" == "published" ]] && ! $REPLACE; then
    fail "release $TAG is already published (use --replace to overwrite its files)"
  fi
fi

echo "Building element-web from ../trustbridge-web..."
pnpm run build:element-web >> "$LOG_FILE" 2>&1 || fail "pnpm run build:element-web"

echo "Fetching + branding webapp.asar..."
pnpm run fetch:trustbridge:source >> "$LOG_FILE" 2>&1 || fail "pnpm run fetch:trustbridge:source"

echo "Building, signing and notarizing (universal)..."
rm -f dist/*.dmg dist/*.zip dist/Element-*.blockmap
{ pnpm run build:ts && pnpm run build:res && npx electron-builder --universal --publish never; } \
  >> "$LOG_FILE" 2>&1 || fail "electron-builder --universal"

shopt -s nullglob
ARTIFACTS=(dist/*.dmg dist/*.zip)
shopt -u nullglob
if [[ ${#ARTIFACTS[@]} -eq 0 ]]; then
  fail "no .dmg/.zip found in dist/ after build"
fi

if $DRY_RUN; then
  echo "DRY RUN: $TAG built, ${#ARTIFACTS[@]} artifact(s) in dist/ (not uploaded). Log: $LOG_FILE"
  exit 0
fi

echo "Uploading to GitHub release $TAG..."
if [[ "$RELEASE_STATE" == "none" ]]; then
  # The tag is created on publish; pin it to the exact commit that was built
  gh release create "$TAG" -R "$GH_REPO" --target "$(git rev-parse HEAD)" --draft \
    --title "TrustBridge Desktop $VERSION" --notes "TrustBridge Desktop $VERSION" \
    >> "$LOG_FILE" 2>&1 || fail "gh release create $TAG"
fi
gh release upload "$TAG" -R "$GH_REPO" --clobber "${ARTIFACTS[@]}" >> "$LOG_FILE" 2>&1 \
  || fail "gh release upload $TAG"

echo "OK: $TAG macOS artifacts uploaded (${#ARTIFACTS[@]} file(s)). If the release was created by this run it is a DRAFT; publish it by hand."
