#!/usr/bin/env bash
# Build a signed + notarized macOS universal TrustBridge Desktop and upload it to GitHub Releases.
# Usage: scripts/release-macos.sh [--dry-run]
#   --dry-run   build (and sign/notarize) only, skip the GitHub upload
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
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
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
  echo "APPLE_API_KEY does not point to a file: $APPLE_API_KEY" >&2
  exit 1
fi
export APPLE_CODESIGN_IDENTITY APPLE_TEAM_ID APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER

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

echo "Building element-web from ../trustbridge-web..."
pnpm run build:element-web >> "$LOG_FILE" 2>&1 || fail "pnpm run build:element-web"

echo "Fetching + branding webapp.asar..."
pnpm run fetch:trustbridge:source >> "$LOG_FILE" 2>&1 || fail "pnpm run fetch:trustbridge:source"

echo "Building, signing and notarizing (universal)..."
rm -f dist/*.dmg dist/*.zip
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
if ! gh release view "$TAG" -R "$GH_REPO" >> "$LOG_FILE" 2>&1; then
  gh release create "$TAG" -R "$GH_REPO" --target develop --draft \
    --title "TrustBridge Desktop $VERSION" --notes "TrustBridge Desktop $VERSION" \
    >> "$LOG_FILE" 2>&1 || fail "gh release create $TAG"
fi
gh release upload "$TAG" -R "$GH_REPO" --clobber "${ARTIFACTS[@]}" >> "$LOG_FILE" 2>&1 \
  || fail "gh release upload $TAG"

echo "OK: $TAG macOS artifacts uploaded (${#ARTIFACTS[@]} file(s)). If the release was created by this run it is a DRAFT; publish it by hand."
