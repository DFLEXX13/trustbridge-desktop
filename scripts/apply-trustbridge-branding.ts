#!/usr/bin/env -S npx tsx
/**
 * Applies TrustBridge branding patches on top of a freshly-fetched element-web deploy.
 *
 * `pnpm run fetch` only copies config.json into the deploy directory - it does not touch
 * the rest of the downloaded element-web source (logos, i18n strings, theme CSS). Those
 * live inside the versioned tarball and get wiped out whenever `deploys/element-v<version>`
 * is re-fetched for a new version. This script re-applies our branding patches on top of
 * whatever deploy is currently present, so it must be re-run after every `pnpm run fetch`
 * (see the "fetch:trustbridge" package.json script, which does this automatically).
 *
 * Safe to run multiple times (idempotent): each replacement is matched by its exact
 * key+old-value pair, so a version bump that changes the wording will surface as a
 * "not found" warning instead of silently no-op'ing or (worse) clobbering the wrong key -
 * i18n key names like "description" repeat across the file, so matching by key alone
 * would be unsafe.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as childProcess from "node:child_process";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_SRC = path.join(REPO_ROOT, "trustbridge", "assets", "logo-1024.png");
const CPD_LIGHT_VARS_SRC = path.join(REPO_ROOT, "trustbridge", "assets", "cpd-light-theme-vars.css");
const DESIGN_TOKENS: {
    color: Record<"light" | "dark", Record<string, string>>;
} = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "trustbridge", "design-tokens.json"), "utf8"));

interface Replacement {
    key: string;
    old: string;
    new: string;
}

// English (en_EN) - de-branding "Element" and "Matrix" (protocol name) from user-visible strings.
const EN_REPLACEMENTS: Replacement[] = [
    {
        key: "console_dev_note",
        old: "If you know what you're doing, Element is open-source, be sure to check out our GitHub (https://github.com/vector-im/element-web/) and contribute!",
        new: "If you know what you're doing, TrustBridge is open-source, be sure to check out our GitHub and contribute!",
    },
    { key: "elementCallUrl", old: "Element Call URL", new: "TrustBridge Call URL" },
    {
        key: "invalid_json",
        old: "Your Element configuration contains invalid JSON. Please correct the problem and reload the page.",
        new: "Your TrustBridge configuration contains invalid JSON. Please correct the problem and reload the page.",
    },
    { key: "misconfigured", old: "Your Element is misconfigured", new: "Your TrustBridge is misconfigured" },
    { key: "element_call_video_rooms", old: "Element Call video rooms", new: "TrustBridge Call video rooms" },
    {
        key: "feature_disable_call_per_sender_encryption",
        old: "Disable per-sender encryption for Element Call",
        new: "Disable per-sender encryption for TrustBridge Call",
    },
    {
        key: "sliding_sync_description",
        old: "Under active development, cannot be disabled. Currently, not compatible with Element Call.",
        new: "Under active development, cannot be disabled. Currently, not compatible with TrustBridge Call.",
    },
    {
        key: "echo_cancellation_description",
        old: "Removes echo from your microphone input during calls. This setting also applies to Element Call.",
        new: "Removes echo from your microphone input during calls. This setting also applies to TrustBridge Call.",
    },
    {
        key: "noise_suppression_description",
        old: "Reduces background noise in your microphone input during calls. This setting also applies to Element Call.",
        new: "Reduces background noise in your microphone input during calls. This setting also applies to TrustBridge Call.",
    },
    { key: "element_call", old: "Element Call", new: "TrustBridge Call" },
    { key: "welcome_to_element", old: "Welcome to Element", new: "Welcome to TrustBridge" },
    { key: "powered_by_matrix", old: "Powered by Matrix", new: "" },
    {
        key: "autodiscovery_invalid_hs",
        old: "Homeserver URL does not appear to be a valid Matrix homeserver",
        new: "Homeserver URL does not appear to be a valid homeserver",
    },
    {
        key: "reset_password_email_not_associated",
        old: "Your email address does not appear to be associated with a Matrix ID on this homeserver.",
        new: "Your email address does not appear to be associated with an account on this homeserver.",
    },
    {
        key: "server_picker_description",
        old: "You can use the custom server options to sign into other Matrix servers by specifying a different homeserver URL. This allows you to use %(brand)s with an existing Matrix account on a different homeserver.",
        new: "You can use the custom server options to sign into other servers by specifying a different homeserver URL. This allows you to use %(brand)s with an existing account on a different homeserver.",
    },
    {
        key: "server_picker_explainer",
        old: "Use your preferred Matrix homeserver if you have one, or host your own.",
        new: "Use your preferred homeserver if you have one, or host your own.",
    },
    {
        key: "matrix_security_issue",
        old: "To report a Matrix-related security issue, please read the Matrix.org <a>Security Disclosure Policy</a>.",
        new: "To report a security issue, please read our <a>Security Disclosure Policy</a>.",
    },
    { key: "matrix", old: "Matrix", new: "" },
    {
        key: "ask_anyway_description",
        old: "Unable to find profiles for the Matrix IDs listed below - would you like to start a DM anyway?",
        new: "Unable to find profiles for the IDs listed below - would you like to start a DM anyway?",
    },
    {
        key: "unable_find_profiles_description_default",
        old: "Unable to find profiles for the Matrix IDs listed below - would you like to invite them anyway?",
        new: "Unable to find profiles for the IDs listed below - would you like to invite them anyway?",
    },
    {
        key: "unfederated",
        old: "This room is not accessible by remote Matrix servers",
        new: "This room is not accessible by remote servers",
    },
    {
        key: "description",
        old: "%(brand)s requires a service worker for loading authenticated media from Matrix content repositories. This is not supported by your browser so you may experience media failing to load.",
        new: "%(brand)s requires a service worker for loading authenticated media from content repositories. This is not supported by your browser so you may experience media failing to load.",
    },
    {
        key: "export_description_1",
        old: "This process allows you to export the keys for messages you have received in encrypted rooms to a local file. You will then be able to import the file into another Matrix client in the future, so that client will also be able to decrypt these messages.",
        new: "This process allows you to export the keys for messages you have received in encrypted rooms to a local file. You will then be able to import the file into another client in the future, so that client will also be able to decrypt these messages.",
    },
    {
        key: "import_description_1",
        old: "This process allows you to import encryption keys that you had previously exported from another Matrix client. You will then be able to decrypt any messages that the other client could decrypt.",
        new: "This process allows you to import encryption keys that you had previously exported from another client. You will then be able to decrypt any messages that the other client could decrypt.",
    },
    {
        key: "unverified_session_explainer_3",
        old: "For best security and privacy, it is recommended to use Matrix clients that support encryption.",
        new: "For best security and privacy, it is recommended to use clients that support encryption.",
    },
    {
        key: "query_not_found_phone_number",
        old: "Unable to find Matrix ID for phone number",
        new: "Unable to find ID for phone number",
    },
    { key: "network_dropdown_selected_label", old: "Show: Matrix rooms", new: "Show: rooms" },
    {
        key: "unsupported_server_description",
        old: "This server is using an older version of Matrix. Upgrade to Matrix %(version)s to use %(brand)s without errors.",
        new: "This server is using an outdated protocol version. Upgrade to version %(version)s to use %(brand)s without errors.",
    },
    {
        key: "server_picker_matrix.org",
        old: "Matrix.org is the biggest public homeserver in the world, so it's a good place for many.",
        new: "This is a large public homeserver, so it's a good place for many.",
    },
];

const RU_REPLACEMENTS: Replacement[] = [
    { key: "welcome_to_element", old: "Добро пожаловать в Element", new: "Добро пожаловать в TrustBridge" },
    { key: "powered_by_matrix", old: "Powered by Matrix", new: "" },
    {
        key: "console_dev_note",
        old: "Если вы знаете, что делаете, Element с открытым исходным кодом, обязательно зайдите на наш GitHub (https://github.com/vector-im/element-web/) и внесите свой вклад!",
        new: "Если вы знаете, что делаете, TrustBridge с открытым исходным кодом, обязательно загляните на наш GitHub и внесите свой вклад!",
    },
    { key: "elementCallUrl", old: "URL-адрес Element Call", new: "URL-адрес TrustBridge Call" },
    {
        key: "invalid_json",
        old: "Конфигурация Element содержит неверный JSON. Исправьте проблему и обновите страницу.",
        new: "Конфигурация TrustBridge содержит неверный JSON. Исправьте проблему и обновите страницу.",
    },
    { key: "misconfigured", old: "Ваш Element неверно настроен", new: "Ваш TrustBridge неверно настроен" },
    { key: "element_call_video_rooms", old: "Видеокомнаты Element Call", new: "Видеокомнаты TrustBridge Call" },
    {
        key: "feature_disable_call_per_sender_encryption",
        old: "Отключить шифрование для каждого отправителя Element Call",
        new: "Отключить шифрование для каждого отправителя TrustBridge Call",
    },
    { key: "element_call", old: "Element Call", new: "TrustBridge Call" },
    {
        key: "server_picker_matrix.org",
        old: "Matrix.org — крупнейший в мире домашний публичный сервер, который подходит многим.",
        new: "Это крупный публичный домашний сервер, который подходит многим.",
    },
    {
        key: "autodiscovery_invalid_hs",
        old: "URL-адрес домашнего сервера не является допустимым домашним сервером Matrix",
        new: "URL-адрес домашнего сервера недействителен",
    },
    {
        key: "reset_password_email_not_associated",
        old: "Похоже, ваш адрес электронной почты не связан с идентификатором Matrix ID на этом домашнем сервере.",
        new: "Похоже, ваш адрес электронной почты не связан с учётной записью на этом домашнем сервере.",
    },
    {
        key: "server_picker_description",
        old: "Вы можете использовать пользовательские опции сервера для входа на другие серверы Matrix, указав URL-адрес другого домашнего сервера. Это позволяет использовать %(brand)s с существующей учётной записью Matrix на другом домашнем сервере.",
        new: "Вы можете использовать пользовательские опции сервера для входа на другие серверы, указав URL-адрес другого домашнего сервера. Это позволяет использовать %(brand)s с существующей учётной записью на другом домашнем сервере.",
    },
    {
        key: "server_picker_explainer",
        old: "Если вы предпочитаете домашний сервер Matrix, используйте его. Вы также можете настроить свой собственный домашний сервер, если хотите.",
        new: "Если у вас уже есть домашний сервер, используйте его. Вы также можете настроить свой собственный домашний сервер, если хотите.",
    },
    {
        key: "matrix_security_issue",
        old: "Чтобы сообщить о проблеме безопасности Matrix, пожалуйста, прочитайте <a>Политику раскрытия информации</a> Matrix.org.",
        new: "Чтобы сообщить о проблеме безопасности, пожалуйста, прочитайте <a>Политику раскрытия информации</a>.",
    },
    { key: "matrix", old: "Matrix", new: "" },
    {
        key: "ask_anyway_description",
        old: "Не можем найти профиль для Matrix ID, перечисленных ниже - вы все равно хотите начать DM?",
        new: "Не можем найти профиль для ID, перечисленных ниже - вы все равно хотите начать DM?",
    },
    {
        key: "unable_find_profiles_description_default",
        old: "Не возможно найти профили для MatrixID, приведенных ниже — все равно желаете их пригласить?",
        new: "Не возможно найти профили для ID, приведенных ниже — все равно желаете их пригласить?",
    },
    {
        key: "unfederated",
        old: "Это комната недоступна из других серверов Matrix",
        new: "Эта комната недоступна с других серверов",
    },
    {
        key: "description",
        old: "%(brand)s Для загрузки аутентифицированных медиафайлов из репозиториев Matrix требуется сервис-воркер. Ваш браузер не поддерживает эту функцию, поэтому медиафайлы могут не загружаться.",
        new: "%(brand)s Для загрузки аутентифицированных медиафайлов требуется сервис-воркер. Ваш браузер не поддерживает эту функцию, поэтому медиафайлы могут не загружаться.",
    },
    {
        key: "export_description_1",
        old: "Этот процесс позволяет вам экспортировать ключи для сообщений, которые вы получили в комнатах с шифрованием, в локальный файл. Вы сможете импортировать эти ключи в другой клиент Matrix чтобы расшифровать эти сообщения.",
        new: "Этот процесс позволяет вам экспортировать ключи для сообщений, которые вы получили в комнатах с шифрованием, в локальный файл. Вы сможете импортировать эти ключи в другой клиент, чтобы расшифровать эти сообщения.",
    },
    {
        key: "import_description_1",
        old: "Этот процесс позволит вам импортировать ключи шифрования, которые вы экспортировали ранее из клиента Matrix. Это позволит вам расшифровать историю чата.",
        new: "Этот процесс позволит вам импортировать ключи шифрования, которые вы экспортировали ранее из другого клиента. Это позволит вам расшифровать историю чата.",
    },
    {
        key: "unverified_session_explainer_3",
        old: "Для лучшей безопасности и конфиденциальности, рекомендуется использовать клиенты Matrix с поддержкой шифрования.",
        new: "Для лучшей безопасности и конфиденциальности, рекомендуется использовать клиенты с поддержкой шифрования.",
    },
    {
        key: "query_not_found_phone_number",
        old: "Не удалось найти Matrix ID для номера телефона",
        new: "Не удалось найти ID для номера телефона",
    },
    { key: "network_dropdown_selected_label", old: "Показать: комнаты Matrix", new: "Показать: комнаты" },
    {
        key: "unsupported_server_description",
        old: "На этом сервере используется старая версия Matrix. Перейдите на Matrix%(version)s, чтобы использовать %(brand)s ее без ошибок.",
        new: "На этом сервере используется устаревшая версия протокола. Обновитесь до версии %(version)s, чтобы использовать %(brand)s без ошибок.",
    },
];

// Only these locales have been de-branded (see EN_REPLACEMENTS / RU_REPLACEMENTS above).
// The other ~39 languages element-web ships still say "Element"/"Matrix" in a few strings,
// so we hide them from the language switcher entirely rather than ship untranslated branding.
// Re-enable a language here once someone has run it through the same replacement pass.
const SUPPORTED_LANGUAGES = ["en", "ru"];

// Static HTML pages bundled outside the i18n system. These are effectively dead code in the
// packaged Electron app (it ships its own Chromium, so "incompatible browser" can't trigger,
// and "unable to load" only fires if webapp.asar itself is corrupt) - low traffic, but cheap
// to de-brand while we're here.
const STATIC_HTML_REPLACEMENTS: Replacement[] = [
    { key: "unable-to-load:heading", old: "Element can't load", new: "TrustBridge can't load" },
    {
        key: "unable-to-load:body",
        old: "Something went wrong and Element was unable to load.",
        new: "Something went wrong and TrustBridge was unable to load.",
    },
    {
        key: "unable-to-load:footer-link",
        old: '<a href="https://element.io" target="_blank" class="mx_FooterLink"> Go to element.io </a>',
        new: '<a href="https://trustbridge.space" target="_blank" class="mx_FooterLink"> Go to trustbridge.space </a>',
    },
    { key: "incompatible-browser:heading", old: "Your browser can't run Element", new: "Your browser can't run TrustBridge" },
    {
        key: "incompatible-browser:body",
        old: "Element uses many advanced browser features, some of which are not available or experimental in",
        new: "TrustBridge uses many advanced browser features, some of which are not available or experimental in",
    },
    {
        key: "incompatible-browser:footer-link",
        old: '<a href="https://element.io" target="_blank" class="mx_FooterLink"> Go to element.io </a>',
        new: '<a href="https://trustbridge.space" target="_blank" class="mx_FooterLink"> Go to trustbridge.space </a>',
    },
];

const CSS_MARKER = "/* trustbridge-branding */";

function buildCssOverride(): string {
    // trailing declaration in the source rule has no semicolon (valid before a `}`, invalid once
    // we splice more declarations after it) - always add one rather than relying on the source.
    const cpdLightVars = fs.readFileSync(CPD_LIGHT_VARS_SRC, "utf8").trim().replace(/;?$/, ";");
    return `
${CSS_MARKER}
/* Sign-in screen: brand gradient backdrop, white card.
 * Re-declaring the light-theme design tokens on .mx_AuthPage is not enough on its own - some
 * text/input colors in this build are resolved from other CSS classes rather than purely
 * inheriting these custom properties, so they stay dark-theme even when the tokens are
 * overridden. Force the visible colors directly with !important as a second, unconditional
 * pass so this stays correct regardless of how any individual element gets its color. */
.mx_AuthPage {
    ${cpdLightVars}
    background: linear-gradient(135deg, #2678E3, #4C26E3) !important;
}
.mx_AuthPage_modal { background-color: #ffffff !important; }
.mx_AuthPage_modalContent { background-color: transparent !important; }
.mx_AuthBody { background-color: #ffffff !important; }
.mx_AuthHeader, .mx_AuthHeaderLogo { background: transparent !important; }
.mx_AuthBody .mx_Field label {
    background-color: #ffffff !important;
}
.mx_AuthPage_modal, .mx_AuthPage_modal * { color: #0A2433 !important; }
.mx_AuthPage_modal a { color: #2678E3 !important; }
.mx_AuthPage_modal input,
.mx_AuthPage_modal select,
.mx_AuthPage_modal [class*="Dropdown"],
.mx_AuthPage_modal [class*="Field_input"] {
    background-color: #ffffff !important;
    border-color: #D6DEE5 !important;
}
.mx_AuthPage_modalBlur { display: none !important; }
.mx_AuthFooter a[href="https://matrix.org"] { display: none !important; }
`;
}

/**
 * App-wide re-skin (sidebar, room list, message timeline, buttons, links - everything
 * outside the sign-in screen). Element's whole UI is themed through a small set of
 * *semantic* Compound Design System tokens (--cpd-color-bg-canvas-default,
 * --cpd-color-text-primary, --cpd-color-bg-accent-rest, etc.) that each point at a stop in
 * a large base color ramp (--cpd-color-gray-1400, --cpd-color-green-900, ...). Overriding
 * only the ~20 semantic tokens - not the base ramp - reskins the whole app without touching
 * anything that carries its own meaning (red for errors, green for success/presence, etc).
 * Element's own accent is green; we replace only the accent-branded tokens with TrustBridge
 * blue, and leave success/danger/info tokens alone.
 *
 * These tokens are redeclared multiple times in the shipped CSS under selectors of matching
 * specificity (theme detection quirk), so plain re-declaration at the end of the file is not
 * reliable - `!important` is required to guarantee we win regardless of selector order.
 */
function buildGlobalThemeOverride(theme: "light" | "dark"): string {
    const c = DESIGN_TOKENS.color[theme];
    const accentHover = theme === "dark" ? "#1F63C1" : "#1A54A3";
    const accentPressed = theme === "dark" ? "#164A8E" : "#154585";
    return `
${CSS_MARKER}-global-${theme}
/* App-wide re-skin: semantic design tokens only, base color ramp left untouched. */
:root, body {
    --cpd-color-theme-bg: ${c.bgCanvas} !important;
    --cpd-color-bg-canvas-default: ${c.bgCanvas} !important;
    --cpd-color-bg-canvas-disabled: ${c.bgElevated} !important;
    --cpd-color-bg-subtle-primary: ${c.bgElevated} !important;
    --cpd-color-bg-subtle-secondary: ${c.bgElevated2} !important;
    --cpd-color-bg-action-secondary-rest: ${c.bgCanvas} !important;
    --cpd-color-bg-action-tertiary-rest: ${c.bgCanvas} !important;
    --cpd-color-text-primary: ${c.textPrimary} !important;
    --cpd-color-text-secondary: ${c.textSecondary} !important;
    --cpd-color-text-action-primary: ${c.textPrimary} !important;
    --cpd-color-icon-primary: ${c.textPrimary} !important;
    --cpd-color-icon-secondary: ${c.textSecondary} !important;
    --cpd-color-icon-tertiary: ${c.textMuted} !important;
    --cpd-color-icon-quaternary: ${c.textMuted} !important;
    --cpd-color-border-interactive-primary: ${c.border} !important;
    --cpd-color-border-interactive-secondary: ${c.border} !important;
    --cpd-color-bg-accent-rest: ${c.accent} !important;
    --cpd-color-bg-accent-hovered: ${accentHover} !important;
    --cpd-color-bg-accent-pressed: ${accentPressed} !important;
    --cpd-color-icon-accent-primary: ${c.accent} !important;
    --cpd-color-icon-accent-tertiary: ${c.accent} !important;
    --cpd-color-text-action-accent: ${c.accent} !important;
    --cpd-color-border-accent-subtle: ${c.accent} !important;
    --cpd-color-gradient-action-stop1: ${c.accentGradientStart} !important;
    --cpd-color-gradient-action-stop2: ${c.accentGradientEnd} !important;
    --cpd-color-gradient-action-stop3: ${c.accentGradientEnd} !important;
    --cpd-color-gradient-action-stop4: ${c.accentGradientStart} !important;
}
.mx_LeftPanel { background-color: ${c.bgCanvas} !important; }
.mx_RoomTile_selected, .mx_RoomTile:focus-within, .mx_RoomTile:hover {
    background-color: ${c.bgElevated2} !important;
}
.mx_RoomHeader { background-color: ${c.bgCanvas} !important; border-bottom-color: ${c.border} !important; }
/* Own/other message bubbles: on the source-built app (packages/shared-components
 * EventTileView) these are driven by --event-tile-bubble-self-background/
 * --event-tile-bubble-other-background/--event-tile-bubble-self-color custom
 * properties declared on the stable .mx_EventTile class and inherited down into the
 * (CSS-modules-hashed) bubble element - overriding them here does not depend on those
 * hashes. Own bubble defaults to Element's pale mint green regardless of theme, which
 * doesn't hold contrast against brand blue, hence the forced white text
 * (--event-tile-bubble-self-color is a TrustBridge addition to EventTileView.module.css
 * for exactly this purpose - it doesn't exist upstream). */
.mx_EventTile {
    --event-tile-bubble-self-background: linear-gradient(135deg, ${c.accentGradientStart}, ${c.accentGradientEnd}) !important;
    --event-tile-bubble-self-color: #ffffff !important;
    --event-tile-bubble-other-background: ${c.bgElevated2} !important;
}
`;
}

function findDeployDirs(): string[] {
    return globSync(path.join(REPO_ROOT, "deploys", "*", "index.html")).map((p) => path.dirname(p));
}

function patchLogo(deployDir: string): void {
    const dest = path.join(deployDir, "themes", "element", "img", "logos", "trustbridge-logo.png");
    if (!fs.existsSync(LOGO_SRC)) {
        console.warn(`[branding] logo source missing: ${LOGO_SRC}`);
        return;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(LOGO_SRC, dest);
    console.log(`[branding] logo -> ${path.relative(REPO_ROOT, dest)}`);
}

function jsonEscape(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function patchI18nFile(filePath: string, replacements: Replacement[]): void {
    let contents = fs.readFileSync(filePath, "utf8");
    let changed = 0;
    let alreadyApplied = 0;
    for (const { key, old, new: next } of replacements) {
        const oldPattern = `"${key}": "${jsonEscape(old)}"`;
        const newPattern = `"${key}": "${jsonEscape(next)}"`;
        if (contents.includes(oldPattern)) {
            contents = contents.replace(oldPattern, newPattern);
            changed++;
        } else if (contents.includes(newPattern)) {
            alreadyApplied++;
        } else {
            console.warn(
                `[branding] i18n string not found (upstream wording may have changed - check manually): key="${key}" in ${path.basename(filePath)}`,
            );
        }
    }
    fs.writeFileSync(filePath, contents);
    console.log(
        `[branding] i18n patched (${changed} changed, ${alreadyApplied} already applied) -> ${path.relative(REPO_ROOT, filePath)}`,
    );
}

function patchI18n(deployDir: string): void {
    const enFiles = globSync(path.join(deployDir, "i18n", "en_EN.*.json"));
    for (const f of enFiles) patchI18nFile(f, EN_REPLACEMENTS);

    const ruFiles = globSync(path.join(deployDir, "i18n", "ru.*.json"));
    for (const f of ruFiles) patchI18nFile(f, RU_REPLACEMENTS);
}

function patchLanguages(deployDir: string): void {
    const file = path.join(deployDir, "i18n", "languages.json");
    if (!fs.existsSync(file)) {
        console.warn(`[branding] languages.json not found (skipped): ${file}`);
        return;
    }
    const all = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
    const filtered: Record<string, string> = {};
    for (const lang of SUPPORTED_LANGUAGES) {
        if (all[lang]) filtered[lang] = all[lang];
        else console.warn(`[branding] language "${lang}" missing from languages.json`);
    }
    fs.writeFileSync(file, JSON.stringify(filtered, null, 4));
    console.log(
        `[branding] languages.json restricted to [${Object.keys(filtered).join(", ")}] (was ${Object.keys(all).length} languages) -> ${path.relative(REPO_ROOT, file)}`,
    );
}

function patchPlainTextFile(filePath: string, replacements: Replacement[]): void {
    let contents = fs.readFileSync(filePath, "utf8");
    let changed = 0;
    let alreadyApplied = 0;
    for (const { key, old, new: next } of replacements) {
        if (contents.includes(old)) {
            contents = contents.replace(old, next);
            changed++;
        } else if (next && contents.includes(next)) {
            alreadyApplied++;
        } else if (!contents.includes(old)) {
            console.warn(`[branding] plain-text string not found (skipped): ${key} in ${path.basename(filePath)}`);
        }
    }
    fs.writeFileSync(filePath, contents);
    console.log(
        `[branding] html patched (${changed} changed, ${alreadyApplied} already applied) -> ${path.relative(REPO_ROOT, filePath)}`,
    );
}

function patchStaticHtml(deployDir: string): void {
    const unableToLoad = path.join(deployDir, "static", "unable-to-load.html");
    if (fs.existsSync(unableToLoad)) {
        patchPlainTextFile(
            unableToLoad,
            STATIC_HTML_REPLACEMENTS.filter((r) => r.key.startsWith("unable-to-load:")),
        );
    }
    const incompatibleBrowser = path.join(deployDir, "static", "incompatible-browser.html");
    if (fs.existsSync(incompatibleBrowser)) {
        patchPlainTextFile(
            incompatibleBrowser,
            STATIC_HTML_REPLACEMENTS.filter((r) => r.key.startsWith("incompatible-browser:")),
        );
    }

    const indexHtml = path.join(deployDir, "index.html");
    if (fs.existsSync(indexHtml)) {
        patchPlainTextFile(indexHtml, [
            {
                key: "index:og-image",
                old: 'content="https://app.element.io/themes/element/img/logos/opengraph.png"',
                new: 'content="themes/element/img/logos/trustbridge-logo.png"',
            },
            {
                key: "index:title",
                old: "<title>Element</title>",
                new: "<title>TrustBridge</title>",
            },
            {
                key: "index:apple-mobile-web-app-title",
                old: '<meta name="apple-mobile-web-app-title" content="Element">',
                new: '<meta name="apple-mobile-web-app-title" content="TrustBridge">',
            },
            {
                key: "index:application-name",
                old: '<meta name="application-name" content="Element">',
                new: '<meta name="application-name" content="TrustBridge">',
            },
        ]);
    }
}

function patchManifest(deployDir: string): void {
    const file = path.join(deployDir, "manifest.json");
    if (!fs.existsSync(file)) {
        console.warn(`[branding] manifest.json not found (skipped): ${file}`);
        return;
    }
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    manifest.name = "TrustBridge";
    manifest.short_name = "TrustBridge";
    manifest.theme_color = DESIGN_TOKENS.color.light.accent;
    delete manifest.related_applications;
    fs.writeFileSync(file, JSON.stringify(manifest, null, 4));
    console.log(`[branding] manifest.json rebranded -> ${path.relative(REPO_ROOT, file)}`);
}

function patchFavicons(deployDir: string): void {
    const iconDir = path.join(deployDir, "vector-icons");
    if (!fs.existsSync(iconDir)) {
        console.warn(`[branding] vector-icons dir not found (skipped): ${iconDir}`);
        return;
    }
    if (!fs.existsSync(LOGO_SRC)) {
        console.warn(`[branding] logo source missing: ${LOGO_SRC}`);
        return;
    }
    const files = fs.readdirSync(iconDir).filter((f) => /^\d+(\.[0-9a-f]+)?\.png$/.test(f));
    const sizeCache = new Map<number, Buffer>();
    for (const file of files) {
        const size = parseInt(file.split(".")[0], 10);
        if (!sizeCache.has(size)) {
            const tmp = path.join(iconDir, `.trustbridge-tmp-${size}.png`);
            childProcess.execFileSync("sips", ["-z", String(size), String(size), LOGO_SRC, "--out", tmp], {
                stdio: "ignore",
            });
            sizeCache.set(size, fs.readFileSync(tmp));
            fs.unlinkSync(tmp);
        }
        fs.writeFileSync(path.join(iconDir, file), sizeCache.get(size)!);
    }
    console.log(`[branding] favicons/touch-icons rebranded (${files.length} files) -> ${path.relative(REPO_ROOT, iconDir)}`);
}

function patchThemeCss(deployDir: string): void {
    const authOverride = buildCssOverride();
    const cssFiles = globSync(path.join(deployDir, "bundles", "*", "theme-*.css"));
    for (const f of cssFiles) {
        let contents = fs.readFileSync(f, "utf8");
        const markerIdx = contents.indexOf(CSS_MARKER);
        // strip any previously-appended override block (everything from the marker onward,
        // since we always append at the end) so re-running with an updated override replaces
        // it instead of stacking duplicates or keeping stale rules.
        if (markerIdx !== -1) contents = contents.slice(0, markerIdx);
        const isDark = path.basename(f).includes("dark");
        const globalOverride = buildGlobalThemeOverride(isDark ? "dark" : "light");
        fs.writeFileSync(f, contents + authOverride + globalOverride);
        console.log(`[branding] css patched (${isDark ? "dark" : "light"}) -> ${path.relative(REPO_ROOT, f)}`);
    }
}

function main(): void {
    const deployDirs = findDeployDirs();
    if (deployDirs.length === 0) {
        console.error("[branding] No deploy directory found under deploys/ - run `pnpm run fetch` first.");
        process.exit(1);
    }
    for (const dir of deployDirs) {
        console.log(`[branding] Patching ${path.relative(REPO_ROOT, dir)}`);
        patchLogo(dir);
        patchI18n(dir);
        patchLanguages(dir);
        patchStaticHtml(dir);
        patchManifest(dir);
        patchFavicons(dir);
        patchThemeCss(dir);
    }
    console.log(
        "[branding] Done. Repack with `pnpm run fetch -d trustbridge/release` to pull config.json into webapp.asar again.",
    );
}

main();
