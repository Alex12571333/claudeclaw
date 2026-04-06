# ClaudeClaw

ClaudeClaw — это project-scoped плагин для Claude Code, который запускает агента как фоновый демон, работает через Telegram, выполняет heartbeat-задачи по интервалу и запускает планировщик задач из markdown-файлов.

Этот форк сфокусирован на следующем:

- русский интерфейс
- Telegram как основной канал
- без Discord
- без web UI
- модель и провайдер берутся из самого Claude Code

## Что умеет

- запускает фоновый демон внутри текущего проекта
- использует одну общую Claude-сессию для демона и Telegram-диалога
- поддерживает heartbeat-промпты по интервалу
- поддерживает cron-подобные задачи из `.claude/claudeclaw/jobs/*.md`
- поддерживает Telegram: текст, изображения, документы и голосовые сообщения
- показывает компактную statusline внутри Claude Code

## Важно

ClaudeClaw больше не выбирает модель и провайдера самостоятельно.

Он использует то, что уже настроено в Claude Code. Это значит:

- если Claude Code работает через Anthropic, ClaudeClaw тоже работает через Anthropic
- если Claude Code работает через MiniMax, ClaudeClaw тоже работает через MiniMax
- если ты позже поменяешь провайдера в Claude Code, ClaudeClaw автоматически подхватит это изменение

ClaudeClaw больше не подставляет свои `ANTHROPIC_*` переменные и не переключает провайдера внутри себя.

## Установка из GitHub

После того как ты загрузишь этот форк в GitHub, установить его в Claude Code можно так:

```text
/plugin marketplace add ТВОЙ_GITHUB_ЛОГИН/claudeclaw
/plugin install claudeclaw
/reload-plugins
```

Потом в нужном проекте запусти:

```text
/claudeclaw:start
```

Замени `ТВОЙ_GITHUB_ЛОГИН/claudeclaw` на свой реальный GitHub-репозиторий.

## Локальная установка

Если хочешь установить плагин из локальной папки до публикации в GitHub:

```text
/plugin marketplace add /абсолютный/путь/до/claudeclaw
/plugin install claudeclaw@claudeclaw
/reload-plugins
```

Пример:

```text
/plugin marketplace add /Users/aleksandrbogdanov/Downloads/myopenagent/claudeclaw
/plugin install claudeclaw@claudeclaw
/reload-plugins
```

## Требования

- установленный Claude Code
- установленный `bun`
- установленный `node`

Проверка:

```bash
claude --version
bun --version
node --version
```

## Пример настройки MiniMax для Claude Code

Если хочешь, чтобы Claude Code и ClaudeClaw работали через MiniMax, настраивать нужно сам Claude Code в `~/.claude/settings.json`:

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

- международный endpoint: `https://api.minimax.io/anthropic`
- endpoint для Китая: `https://api.minimaxi.com/anthropic`
- переменные окружения shell имеют приоритет над `~/.claude/settings.json`

После изменения настроек Claude Code полностью перезапусти `claude`.

## Первый запуск

Открой Claude Code прямо в папке проекта и выполни:

```text
/claudeclaw:start
```

Мастер запуска поможет настроить:

- heartbeat-интервал
- Telegram bot token
- разрешённые Telegram user ID
- режим безопасности

## Команды Telegram-бота

Встроенные команды Telegram-бота:

- `/start` — показать приветствие
- `/new` — сбросить общую сессию и начать заново
- `/status` — показать статус текущей сессии
- `/context` — показать использование контекстного окна

Кроме этого, в Telegram могут автоматически появляться дополнительные slash-команды из установленных skills Claude Code.

## Файлы проекта

ClaudeClaw хранит данные проекта здесь:

- `.claude/claudeclaw/settings.json` — настройки плагина
- `.claude/claudeclaw/jobs/*.md` — задачи по расписанию
- `.claude/claudeclaw/logs/` — логи запусков
- `.claude/claudeclaw/session.json` — общая Claude-сессия

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
- `strict` — без bash и web tools
- `moderate` — полный набор инструментов в пределах проекта
- `unrestricted` — полный доступ без project-scoping

## Задачи

Каждая задача — это markdown-файл в `.claude/claudeclaw/jobs/`:

```markdown
---
schedule: "0 9 * * *"
---
Проверь репозиторий и кратко напиши, если есть что-то важное.
```

## Как опубликовать

Если хочешь, чтобы люди ставили этот форк так же легко, как оригинальный плагин:

1. Загрузи этот репозиторий в GitHub.
2. Оставь `.claude-plugin/plugin.json` и `.claude-plugin/marketplace.json` в корне репозитория.
3. После этого пользователи смогут установить его так:

```text
/plugin marketplace add ТВОЙ_GITHUB_ЛОГИН/claudeclaw
/plugin install claudeclaw
```

## Текущее состояние форка

Этот форк теперь сфокусирован на:

- daemon-режиме для Claude Code
- Telegram-интеграции
- автоматизации и задачах по расписанию
- наследовании провайдера и модели из Claude Code

В форке больше нет:

- Discord-интеграции
- встроенного роутинга моделей
- переключения провайдера на стороне плагина
- web dashboard
