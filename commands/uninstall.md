---
description: Полностью очистить ClaudeClaw в текущем проекте перед удалением плагина
---

Run the full local cleanup for ClaudeClaw in the current project.

Execute:

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/src/index.ts uninstall
```

Then report the result to the user and tell them to run:

```text
/plugin uninstall claudeclaw
```

This command should:

- stop the running ClaudeClaw daemon for the current project
- remove `.claude/claudeclaw`
- remove `.claude/statusline.cjs`
- remove ClaudeClaw `statusLine` config from project `.claude/settings.json`

Do not delete unrelated project files.
