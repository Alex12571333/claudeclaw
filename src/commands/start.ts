import { writeFile, unlink, mkdir } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { run, runUserMessage, streamUserMessage, bootstrap, ensureProjectClaudeMd, loadHeartbeatPromptTemplate } from "../runner";
import { writeState, type StateData } from "../statusline";
import { cronMatches, nextCronMatch } from "../cron";
import { clearJobSchedule, loadJobs } from "../jobs";
import { writePidFile, cleanupPidFile, checkExistingDaemon } from "../pid";
import { initConfig, loadSettings, reloadSettings, resolvePrompt, type HeartbeatConfig, type Settings } from "../config";
import { getDayAndMinuteAtOffset } from "../timezone";
import type { Job } from "../jobs";

const CLAUDE_DIR = join(process.cwd(), ".claude");
const HEARTBEAT_DIR = join(CLAUDE_DIR, "claudeclaw");
const STATUSLINE_FILE = join(CLAUDE_DIR, "statusline.cjs");
const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");
const PREFLIGHT_SCRIPT = fileURLToPath(new URL("../preflight.ts", import.meta.url));

// --- Statusline setup/teardown ---

const STATUSLINE_SCRIPT = `#!/usr/bin/env node
const { readFileSync } = require("fs");
const { join } = require("path");

const DIR = join(__dirname, "claudeclaw");
const STATE_FILE = join(DIR, "state.json");
const PID_FILE = join(DIR, "daemon.pid");

const R = "\\x1b[0m";
const DIM = "\\x1b[2m";
const RED = "\\x1b[31m";
const GREEN = "\\x1b[32m";

function fmt(ms) {
  if (ms <= 0) return GREEN + "сейчас!" + R;
  var s = Math.floor(ms / 1000);
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + "h " + m + "m";
  if (m > 0) return m + "m";
  return (s % 60) + "s";
}

function alive() {
  try {
    var pid = readFileSync(PID_FILE, "utf-8").trim();
    process.kill(Number(pid), 0);
    return true;
  } catch { return false; }
}

var B = DIM + "\\u2502" + R;
var TL = DIM + "\\u256d" + R;
var TR = DIM + "\\u256e" + R;
var BL = DIM + "\\u2570" + R;
var BR = DIM + "\\u256f" + R;
var H = DIM + "\\u2500" + R;
var HEADER = TL + H.repeat(6) + " \\ud83e\\udd9e ClaudeClaw \\ud83e\\udd9e " + H.repeat(6) + TR;
var FOOTER = BL + H.repeat(30) + BR;

if (!alive()) {
  process.stdout.write(
    HEADER + "\\n" +
    B + "      " + RED + "\\u25cb не запущен" + R + "            " + B + "\\n" +
    FOOTER
  );
  process.exit(0);
}

try {
  var state = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
  var now = Date.now();
  var info = [];

  if (state.heartbeat) {
    info.push("\\ud83d\\udc93 " + fmt(state.heartbeat.nextAt - now));
  }

  var jc = (state.jobs || []).length;
  info.push("\\ud83d\\udccb " + jc + " зад.");
  info.push(GREEN + "\\u25cf активен" + R);

  if (state.telegram) {
    info.push(GREEN + "\\ud83d\\udce1" + R);
  }

  var mid = " " + info.join(" " + B + " ") + " ";

  process.stdout.write(HEADER + "\\n" + B + mid + B + "\\n" + FOOTER);
} catch {
  process.stdout.write(
    HEADER + "\\n" +
    B + DIM + "        ожидание...        " + R + B + "\\n" +
    FOOTER
  );
}
`;

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function parseClockMinutes(value: string): number | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isHeartbeatExcludedNow(config: HeartbeatConfig, timezoneOffsetMinutes: number): boolean {
  return isHeartbeatExcludedAt(config, timezoneOffsetMinutes, new Date());
}

function isHeartbeatExcludedAt(config: HeartbeatConfig, timezoneOffsetMinutes: number, at: Date): boolean {
  if (!Array.isArray(config.excludeWindows) || config.excludeWindows.length === 0) return false;
  const local = getDayAndMinuteAtOffset(at, timezoneOffsetMinutes);

  for (const window of config.excludeWindows) {
    const start = parseClockMinutes(window.start);
    const end = parseClockMinutes(window.end);
    if (start == null || end == null) continue;
    const days = Array.isArray(window.days) && window.days.length > 0 ? window.days : ALL_DAYS;
    const sameDay = start < end;

    if (sameDay) {
      if (days.includes(local.day) && local.minute >= start && local.minute < end) return true;
      continue;
    }

    if (start === end) {
      if (days.includes(local.day)) return true;
      continue;
    }

    if (local.minute >= start && days.includes(local.day)) return true;
    const previousDay = (local.day + 6) % 7;
    if (local.minute < end && days.includes(previousDay)) return true;
  }

  return false;
}

function nextAllowedHeartbeatAt(
  config: HeartbeatConfig,
  timezoneOffsetMinutes: number,
  intervalMs: number,
  fromMs: number
): number {
  const interval = Math.max(60_000, Math.round(intervalMs));
  let candidate = fromMs + interval;
  let guard = 0;

  while (isHeartbeatExcludedAt(config, timezoneOffsetMinutes, new Date(candidate)) && guard < 20_000) {
    candidate += interval;
    guard++;
  }

  return candidate;
}

async function setupStatusline() {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(STATUSLINE_FILE, STATUSLINE_SCRIPT);

  let settings: Record<string, unknown> = {};
  try {
    settings = await Bun.file(CLAUDE_SETTINGS_FILE).json();
  } catch {
    // file doesn't exist or isn't valid JSON
  }
  settings.statusLine = {
    type: "command",
    command: "node .claude/statusline.cjs",
  };
  await writeFile(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

async function teardownStatusline() {
  try {
    const settings = await Bun.file(CLAUDE_SETTINGS_FILE).json();
    delete settings.statusLine;
    await writeFile(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  } catch {
    // file doesn't exist, nothing to clean up
  }

  try {
    await unlink(STATUSLINE_FILE);
  } catch {
    // already gone
  }
}

// --- Main ---

export async function start(args: string[] = []) {
  let hasPromptFlag = false;
  let hasTriggerFlag = false;
  let telegramFlag = false;
  let debugFlag = false;
  let replaceExistingFlag = false;
  const payloadParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--prompt") {
      hasPromptFlag = true;
    } else if (arg === "--trigger") {
      hasTriggerFlag = true;
    } else if (arg === "--telegram") {
      telegramFlag = true;
    } else if (arg === "--debug") {
      debugFlag = true;
    } else if (arg === "--replace-existing") {
      replaceExistingFlag = true;
    } else {
      payloadParts.push(arg);
    }
  }
  const payload = payloadParts.join(" ").trim();
  if (hasPromptFlag && !payload) {
    console.error("Использование: claudeclaw start --prompt <текст> [--trigger] [--telegram] [--debug] [--replace-existing]");
    process.exit(1);
  }
  if (!hasPromptFlag && payload) {
    console.error("Текст запроса нужно передавать через `--prompt`.");
    process.exit(1);
  }
  if (telegramFlag && !hasTriggerFlag) {
    console.error("Флаг `--telegram` с `start` требует `--trigger`.");
    process.exit(1);
  }
  // One-shot mode: explicit prompt without trigger.
  if (hasPromptFlag && !hasTriggerFlag) {
    const existingPid = await checkExistingDaemon();
    if (existingPid) {
      console.error(`\x1b[31mAborted: daemon already running in this directory (PID ${existingPid})\x1b[0m`);
      console.error("Пока демон запущен, используйте `claudeclaw send <сообщение> [--telegram]`.");
      process.exit(1);
    }

    await initConfig();
    await loadSettings();
    await ensureProjectClaudeMd();
    const result = await runUserMessage("prompt", payload);
    console.log(result.stdout);
    if (result.exitCode !== 0) process.exit(result.exitCode);
    return;
  }

  const existingPid = await checkExistingDaemon();
  if (existingPid) {
    if (!replaceExistingFlag) {
      console.error(`\x1b[31mОстановлено: в этой папке уже запущен демон (PID ${existingPid})\x1b[0m`);
      console.error(`Сначала выполните --stop или завершите PID ${existingPid} вручную.`);
      process.exit(1);
    }

    console.log(`Заменяю текущий демон (PID ${existingPid})...`);
    try {
      process.kill(existingPid, "SIGTERM");
    } catch {
      // ignore if process is already dead
    }

    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      try {
        process.kill(existingPid, 0);
        await Bun.sleep(100);
      } catch {
        break;
      }
    }

    await cleanupPidFile();
  }

  await initConfig();
  const settings = await loadSettings();
  await ensureProjectClaudeMd();
  const jobs = await loadJobs();

  await setupStatusline();
  await writePidFile();

  async function shutdown() {
    await teardownStatusline();
    await cleanupPidFile();
    process.exit(0);
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  console.log("Демон ClaudeClaw запущен");
  console.log(`  PID: ${process.pid}`);
  console.log(`  Безопасность: ${settings.security.level}`);
  if (settings.security.allowedTools.length > 0)
    console.log(`    + разрешено: ${settings.security.allowedTools.join(", ")}`);
  if (settings.security.disallowedTools.length > 0)
    console.log(`    - заблокировано: ${settings.security.disallowedTools.join(", ")}`);
  console.log(`  Heartbeat: ${settings.heartbeat.enabled ? `каждые ${settings.heartbeat.interval} мин.` : "выключен"}`);
  if (debugFlag) console.log("  Отладка: включена");
  console.log(`  Загружено задач: ${jobs.length}`);
  jobs.forEach((j) => console.log(`    - ${j.name} [${j.schedule}]`));

  // --- Mutable state ---
  let currentSettings: Settings = settings;
  let currentJobs: Job[] = jobs;
  let nextHeartbeatAt = 0;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  const daemonStartedAt = Date.now();

  // --- Telegram ---
  let telegramSend: ((chatId: number, text: string) => Promise<void>) | null = null;
  let telegramToken = "";

  async function initTelegram(token: string) {
    if (token && token !== telegramToken) {
      const { startPolling, sendMessage } = await import("./telegram");
      startPolling(debugFlag);
      telegramSend = (chatId, text) => sendMessage(token, chatId, text);
      telegramToken = token;
      console.log(`[${ts()}] Telegram: включен`);
    } else if (!token && telegramToken) {
      telegramSend = null;
      telegramToken = "";
      console.log(`[${ts()}] Telegram: выключен`);
    }
  }

  await initTelegram(currentSettings.telegram.token);
  if (!telegramToken) console.log("  Telegram: не настроен");

  // --- Helpers ---
  function ts() { return new Date().toLocaleTimeString(); }

  function startPreflightInBackground(projectPath: string): void {
    try {
      const proc = Bun.spawn([process.execPath, "run", PREFLIGHT_SCRIPT, projectPath], {
        stdin: "ignore",
        stdout: "inherit",
        stderr: "inherit",
      });
      proc.unref();
      console.log(`[${ts()}] Предпроверка плагина запущена в фоне`);
    } catch (err) {
      console.error(`[${ts()}] Не удалось запустить предпроверку плагина:`, err);
    }
  }

  function forwardToTelegram(label: string, result: { exitCode: number; stdout: string; stderr: string }) {
    if (!telegramSend || currentSettings.telegram.allowedUserIds.length === 0) return;
    const text = result.exitCode === 0
      ? `${label ? `[${label}]\n` : ""}${result.stdout || "(пусто)"}`
      : `${label ? `[${label}] ` : ""}ошибка (код ${result.exitCode}): ${result.stderr || "Неизвестно"}`;
    for (const userId of currentSettings.telegram.allowedUserIds) {
      telegramSend(userId, text).catch((err) =>
        console.error(`[Telegram] Не удалось переслать сообщение пользователю ${userId}: ${err}`)
      );
    }
  }

  // --- Heartbeat scheduling ---
  function scheduleHeartbeat() {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = null;

    if (!currentSettings.heartbeat.enabled) {
      nextHeartbeatAt = 0;
      return;
    }

    const ms = currentSettings.heartbeat.interval * 60_000;
    nextHeartbeatAt = nextAllowedHeartbeatAt(
      currentSettings.heartbeat,
      currentSettings.timezoneOffsetMinutes,
      ms,
      Date.now()
    );

    function tick() {
      if (isHeartbeatExcludedNow(currentSettings.heartbeat, currentSettings.timezoneOffsetMinutes)) {
        console.log(`[${ts()}] Heartbeat пропущен из-за тихого окна`);
        nextHeartbeatAt = nextAllowedHeartbeatAt(
          currentSettings.heartbeat,
          currentSettings.timezoneOffsetMinutes,
          ms,
          Date.now()
        );
        return;
      }
      Promise.all([
        resolvePrompt(currentSettings.heartbeat.prompt),
        loadHeartbeatPromptTemplate(),
      ])
        .then(([prompt, template]) => {
          const userPromptSection = prompt.trim()
            ? `User custom heartbeat prompt:\n${prompt.trim()}`
            : "";
          const mergedPrompt = [template.trim(), userPromptSection]
            .filter((part) => part.length > 0)
            .join("\n\n");
          if (!mergedPrompt) return null;
          return run("heartbeat", mergedPrompt);
        })
        .then((r) => {
          if (!r) return;
          const shouldForward = currentSettings.heartbeat.forwardToTelegram || !r.stdout.trim().startsWith("HEARTBEAT_OK");
          if (shouldForward) {
            forwardToTelegram("", r);
          }
        });
      nextHeartbeatAt = nextAllowedHeartbeatAt(
        currentSettings.heartbeat,
        currentSettings.timezoneOffsetMinutes,
        ms,
        Date.now()
      );
    }

    heartbeatTimer = setTimeout(function runAndReschedule() {
      tick();
      heartbeatTimer = setTimeout(runAndReschedule, ms);
    }, ms);
  }

  // Startup init:
  // - trigger mode: run exactly one trigger prompt (no separate bootstrap)
  // - normal mode: bootstrap to initialize session context
  if (hasTriggerFlag) {
    const triggerPrompt = hasPromptFlag ? payload : "Проснись, мой друг!";
    const triggerResult = await run("trigger", triggerPrompt);
    console.log(triggerResult.stdout);
    if (telegramFlag) forwardToTelegram("", triggerResult);
    if (triggerResult.exitCode !== 0) {
      console.error(`[${ts()}] Стартовый триггер завершился с ошибкой (код ${triggerResult.exitCode}). Демон продолжит работу.`);
    }
  } else {
    // Bootstrap the session first so system prompt is initial context
    // and session.json is created immediately.
    await bootstrap();
  }

  // Install plugins without blocking daemon startup.
  startPreflightInBackground(process.cwd());

  if (currentSettings.heartbeat.enabled) scheduleHeartbeat();

  // --- Hot-reload loop (every 30s) ---
  setInterval(async () => {
    try {
      const newSettings = await reloadSettings();
      const newJobs = await loadJobs();

      // Detect heartbeat config changes
      const hbChanged =
        newSettings.heartbeat.enabled !== currentSettings.heartbeat.enabled ||
        newSettings.heartbeat.interval !== currentSettings.heartbeat.interval ||
        newSettings.heartbeat.prompt !== currentSettings.heartbeat.prompt ||
        newSettings.timezoneOffsetMinutes !== currentSettings.timezoneOffsetMinutes ||
        newSettings.timezone !== currentSettings.timezone ||
        JSON.stringify(newSettings.heartbeat.excludeWindows) !== JSON.stringify(currentSettings.heartbeat.excludeWindows);

      // Detect security config changes
      const secChanged =
        newSettings.security.level !== currentSettings.security.level ||
        newSettings.security.allowedTools.join(",") !== currentSettings.security.allowedTools.join(",") ||
        newSettings.security.disallowedTools.join(",") !== currentSettings.security.disallowedTools.join(",");

      if (secChanged) {
        console.log(`[${ts()}] Уровень безопасности изменён → ${newSettings.security.level}`);
      }

      if (hbChanged) {
        console.log(`[${ts()}] Обнаружено изменение конфигурации — heartbeat: ${newSettings.heartbeat.enabled ? `каждые ${newSettings.heartbeat.interval} мин.` : "выключен"}`);
        currentSettings = newSettings;
        scheduleHeartbeat();
      } else {
        currentSettings = newSettings;
      }
      // Detect job changes
      const jobNames = newJobs.map((j) => `${j.name}:${j.schedule}:${j.prompt}`).sort().join("|");
      const oldJobNames = currentJobs.map((j) => `${j.name}:${j.schedule}:${j.prompt}`).sort().join("|");
      if (jobNames !== oldJobNames) {
        console.log(`[${ts()}] Задачи перезагружены: ${newJobs.length}`);
        newJobs.forEach((j) => console.log(`    - ${j.name} [${j.schedule}]`));
      }
      currentJobs = newJobs;

      await initTelegram(newSettings.telegram.token);
    } catch (err) {
      console.error(`[${ts()}] Ошибка горячей перезагрузки:`, err);
    }
  }, 30_000);

  // --- Cron tick (every 60s) ---
  function updateState() {
    const now = new Date();
    const state: StateData = {
      heartbeat: currentSettings.heartbeat.enabled
        ? { nextAt: nextHeartbeatAt }
        : undefined,
      jobs: currentJobs.map((job) => ({
        name: job.name,
        nextAt: nextCronMatch(job.schedule, now, currentSettings.timezoneOffsetMinutes).getTime(),
      })),
      security: currentSettings.security.level,
      telegram: !!currentSettings.telegram.token,
      startedAt: daemonStartedAt,
    };
    writeState(state);
  }

  updateState();

  setInterval(() => {
    const now = new Date();
    for (const job of currentJobs) {
      if (cronMatches(job.schedule, now, currentSettings.timezoneOffsetMinutes)) {
        resolvePrompt(job.prompt)
          .then((prompt) => run(job.name, prompt))
          .then((r) => {
            if (job.notify === false) return;
            if (job.notify === "error" && r.exitCode === 0) return;
            forwardToTelegram(job.name, r);
          })
          .finally(async () => {
            if (job.recurring) return;
            try {
              await clearJobSchedule(job.name);
              console.log(`[${ts()}] Расписание одноразовой задачи очищено: ${job.name}`);
            } catch (err) {
              console.error(`[${ts()}] Не удалось очистить расписание для ${job.name}:`, err);
            }
          });
      }
    }
    updateState();
  }, 60_000);
}
