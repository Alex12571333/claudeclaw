# ClaudeClaw

ClaudeClaw — это плагин для Claude Code, который запускает проектного агента в фоне, поддерживает Telegram-бота, heartbeat-задачи и задачи по расписанию.

Плагин работает внутри текущего проекта и хранит своё состояние локально в `.claude/claudeclaw/`.

## Возможности

- фоновый daemon-режим для Claude Code
- Telegram-бот для общения с агентом
- heartbeat по интервалу
- задачи по расписанию из markdown-файлов
- общая Claude-сессия для фоновых задач и Telegram
- наследование модели и провайдера из Claude Code

## Установка из GitHub

Внутри Claude Code:

```text
/plugin marketplace add Alex12571333/claudeclaw
/plugin install claudeclaw
/reload-plugins
```

После установки открой нужный проект и запусти:

```text
/claudeclaw:start
```

## Локальная установка

Если нужно установить эту версию из локальной папки:

```text
/plugin marketplace add /Users/aleksandrbogdanov/Downloads/myopenagent/claudeclaw
/plugin install claudeclaw@claudeclaw
/reload-plugins
```

## Требования

- `claude`
- `bun`
- `node`

Проверка:

```bash
claude --version
bun --version
node --version
```

## Первый запуск

Открой Claude Code именно в папке проекта и выполни:

```text
/claudeclaw:start
```

Мастер запуска поможет настроить:

- heartbeat
- Telegram bot token
- Telegram user ID
- режим безопасности

## Telegram-команды

Встроенные команды бота:

- `/start` — приветствие
- `/new` — новая сессия
- `/status` — статус текущей сессии
- `/context` — использование контекстного окна

## Как работает модель

ClaudeClaw не выбирает модель сам.

Он использует ту модель и того провайдера, которые уже настроены в Claude Code. Если в Claude Code включён MiniMax, ClaudeClaw автоматически будет работать через MiniMax. Если в Claude Code стоит другой провайдер, ClaudeClaw будет использовать его.

## Пример настройки MiniMax для Claude Code

Файл:

```text
~/.claude/settings.json
```

Содержимое:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "<MINIMAX_API_KEY>",
    "API_TIMEOUT_MS": "3000000",
    "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC": 1,
    "ANTHROPIC_MODEL": "MiniMax-M2.7",
    "ANTHROPIC_SMALL_FAST_MODEL": "MiniMax-M2.7",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M2.7",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M2.7",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7"
  }
}
```

Примечания:

- для международного региона используй `https://api.minimax.io/anthropic`
- для Китая используй `https://api.minimaxi.com/anthropic`
- переменные окружения shell имеют приоритет над `~/.claude/settings.json`

После изменения настроек полностью перезапусти `claude`.

## Структура файлов

ClaudeClaw использует:

- `.claude/claudeclaw/settings.json` — настройки
- `.claude/claudeclaw/session.json` — общая сессия
- `.claude/claudeclaw/jobs/*.md` — задачи
- `.claude/claudeclaw/logs/` — логи

## Пример settings.json

```json
{
  "timezone": "UTC+0",
  "heartbeat": {
    "enabled": true,
    "interval": 30,
    "prompt": "Проверь последние изменения и скажи, есть ли что-то важное.",
    "excludeWindows": [],
    "forwardToTelegram": true
  },
  "telegram": {
    "token": "123456:ABC-DEF...",
    "allowedUserIds": [123456789]
  },
  "security": {
    "level": "moderate",
    "allowedTools": [],
    "disallowedTools": []
  }
}
```

## Режимы безопасности

- `locked` — только чтение и поиск
- `strict` — без bash и web-инструментов
- `moderate` — полный набор инструментов в пределах проекта
- `unrestricted` — полный доступ без ограничений директорией

## Задачи по расписанию

Каждая задача — это markdown-файл в `.claude/claudeclaw/jobs/`:

```markdown
---
schedule: "0 9 * * *"
---
Проверь репозиторий и кратко напиши, если есть что-то важное.
```

## Публикация своего форка

Если ты форкнул проект и хочешь, чтобы он ставился так же легко:

```text
/plugin marketplace add ТВОЙ_ЛОГИН/claudeclaw
/plugin install claudeclaw
```

Главное, чтобы в репозитории оставались:

- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

## Состояние проекта

ClaudeClaw — это Telegram-first daemon-плагин для Claude Code с автоматизацией, heartbeat-задачами и наследованием провайдера из Claude Code.
