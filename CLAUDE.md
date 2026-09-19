# TrustBridge Desktop

Ребрендинг Element Desktop (Electron, клиент Matrix) для TrustBridge. Форк `element-hq/element-desktop`,
remote `origin` = `DFLEXX13/trustbridge-desktop`, рабочая ветка `develop`, `upstream` = Element.
Собирается под macOS, Windows и Linux из одного кода. Текущая версия: 1.12.13.
Владелец — не разработчик: объяснения короткие и по-русски. Другие платформы: iOS `trustbridge-app-v2`,
Android `trustbridge-android`. См. также `docs/HANDOFF.md`.

## Структура
- `trustbridge/release/config.json` — конфиг веба (сервер `chat.trustbridge.space`, бренд, вход только по логину).
- `trustbridge/release/build.json` — appId `space.trustbridge.desktop`, productName `TrustBridge`, протоколы.
- `trustbridge/design-tokens.json` — цвета и радиусы (эталон для других платформ); `trustbridge/assets/` — логотип и CSS-переменные.
- `scripts/apply-trustbridge-branding.ts` — патчи текстов/CSS поверх собранного веба, идемпотентный.
- `scripts/release-macos.sh` — сборка и выкладка macOS (см. ниже).
- `electron-builder.ts` — цели сборки; `build/` — иконки (`icon.icon`, `icon.png`) и логи скриптов.
- `.github/workflows/build-trustbridge.yml` — CI для macOS, Windows, Linux. Остальные workflow — унаследованные от Element.
- Соседний репозиторий `../trustbridge-web` (форк element-web, ветка `develop`) — исходники веб-части. Должен лежать рядом.

## Сборка
Node из `.node-version` (nvm), пакетный менеджер pnpm. Нужна именно эта версия: `nvm install $(cat .node-version)`.
- Веб из исходников: `pnpm run build:element-web`, затем `pnpm run fetch:trustbridge:source` (копирует, брендирует, пакует `webapp.asar`).
- Запуск для проверки: `pnpm run start`.
- Установщик: `pnpm run build:ts && pnpm run build:res && npx electron-builder --universal --publish never`.
- Старый путь `pnpm run fetch:trustbridge` (готовый tarball Element) больше не основной.

## Выкладка
- macOS (локально): `scripts/release-macos.sh` — сборка, подпись, нотаризация, загрузка `.dmg`/`.zip` в GitHub Release `v<версия>`.
  Если релиза нет, создаётся **черновик**. `--dry-run` пропускает только загрузку в GitHub: подпись и
  нотаризация выполняются, нотаризация занимает от нескольких минут до получаса.
  Полный лог: `build/release-macos.log`; в консоль идёт итог и последние 20 строк при ошибке.
- Windows и Linux (CI): `gh workflow run build-trustbridge.yml --ref develop -R DFLEXX13/trustbridge-desktop`,
  затем `gh run download <id> -R DFLEXX13/trustbridge-desktop -n trustbridge-windows-x64|trustbridge-linux-x64 -D <папка>`.
  Тот же workflow собирает и macOS с подписью из GitHub Secrets.
- Ключи локальной сборки: файл вне репозитория `~/Projects/trustbridge-cert-apple/desktop.env` (путь меняется через `SECRETS_FILE`).
  Нужные переменные: `APPLE_CODESIGN_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_API_KEY` (путь к `.p8`), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`.
  Сертификат Developer ID должен быть в связке ключей. Файл `desktop.env` ещё не создан — его создаёт владелец.
- Ключи CI: GitHub Secrets `APPLE_CSC_LINK`, `APPLE_CSC_KEY_PASSWORD`, `APPLE_API_KEY_BASE64`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`, переменная `APPLE_TEAM_ID`.
- Значения ключей нигде не печатать и не читать; каталог `trustbridge-cert-apple` закрыт в `.claude/settings.json`.

## Ручные шаги (скриптом не автоматизированы)
- Создать файл `desktop.env` и завести секреты в GitHub.
- Запуск workflow для Windows/Linux, ожидание (~10 минут), скачивание артефактов.
- Прикрепить `.msi`, `.exe`, `.AppImage`, `.deb` к релизу, написать описание и опубликовать черновик.
- Дождаться нотаризации Apple (обычно минуты) и проверить `.dmg` на чистом Mac (Gatekeeper).
- Подпись Windows: секретов SSL.com (`ESIGNER_*`) в GitHub нет, установщики не подписаны.

## Известные проблемы
- Кэш Electron переживает пересборку: перед проверкой CSS удалить `~/Library/Application Support/TrustBridge/{Cache,Code Cache,GPUCache}`.
- В блоках CSS-переменных из файлов может не быть `;` в конце; перед склейкой добавлять (`.replace(/;?$/, ";")`).
- Без `APPLE_API_KEY` в env `electron-builder.ts` отключает нотаризацию; без `APPLE_TEAM_ID` сбрасывает подпись на ad-hoc.
- `build/icon.ico` (Windows) не обновлён под TrustBridge.
- Остались следы Element: иконки (нужен Lucide), переключатель «Message layout», диалоги создания комнат, эмодзи, About.
- В оболочке `ls` — алиас с другими флагами; использовать `command ls`.
- `gh` без `-R` может обратиться к `upstream` (Element), всегда указывать `-R DFLEXX13/trustbridge-desktop`.
- Публичные `element.io/New_Vector_Ltd.pem` и `.github/SSLcom-sandbox.crt` — не секреты, не удалять.

## Соглашения
- Файлы `LICENSE-*` и заголовки copyright не трогать (AGPL/GPL, коммерческой лицензии нет).
- Брендинг только через `trustbridge/` и `apply-trustbridge-branding.ts`, чтобы он переживал пересборку; из текстов убирать «Element» и «Matrix».
- Языки только `en` и `ru`.
- Перед крупными изменениями сначала план, потом код; решения без лишних усложнений.
- Коммиты и `push` только по просьбе владельца. Секреты в репозиторий не добавлять.
