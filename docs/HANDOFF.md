# TrustBridge Desktop — handoff

Состояние на 19.09.2026. Общий контекст и команды — в `CLAUDE.md`.

## Что сделано
- Ребрендинг: конфиг, вход по логину без регистрации, тема (светлая и тёмная), тексты en/ru без «Element»/«Matrix», иконка macOS и Linux.
- Миграция на сборку веба из исходников (`../trustbridge-web`) завершена: `fetch:trustbridge:source` + `apply-trustbridge-branding.ts`.
- CI `build-trustbridge.yml` собирает macOS universal (подпись Developer ID + нотаризация по API-ключу), Windows x64 (msi, exe), Linux x64 (AppImage, deb).
- Релиз v1.12.13 выложен (12.09.2026): dmg, msi, exe, AppImage, deb.
- Добавлены `scripts/release-macos.sh`, `CLAUDE.md`, `.claude/settings.json`, этот файл.

## Что решено
- Лицензия: AGPL/GPL, коммерческой нет; `LICENSE-*` не трогать.
- Только языки en и ru.
- Брендинг живёт в `trustbridge/` и скрипте патчей, а не в правках собранного бандла.
- Токены цветов ведутся в `trustbridge/design-tokens.json` и переносятся на iOS/Android вручную.
- Локальный скрипт делает только macOS; Windows и Linux остаются за CI. Ключи скрипта — в файле вне репозитория.
- Скрипт создаёт релиз только черновиком, публикация вручную.

## Что открыто
- `scripts/release-macos.sh` ещё не запускался и не проверялся. Первый прогон: `--dry-run`.
- Файл `~/Projects/trustbridge-cert-apple/desktop.env` не создан (переменные перечислены в `CLAUDE.md`).
- Windows не подписан: нет `ESIGNER_*` в GitHub Secrets (SSL.com eSigner). Решить: завести или оставить без подписи.
- `build/icon.ico` не обновлён.
- Полная де-брендизация: иконки на Lucide, убрать «Message layout», диалоги комнат, эмодзи, About, звуки, заставка.
- Аватар с обрезкой при загрузке (компонент `AvatarSetting` в `trustbridge-web`).
- Версия в `package.json` всё ещё 1.12.13 (как у Element); схему версий TrustBridge не выбрали.
- Правки `.gitignore` предложены, но не применены (секреты и `build/*.log`).
- Ручные шаги выкладки Windows/Linux описаны в `CLAUDE.md`.
