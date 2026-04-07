import { rm, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { cleanupPidFile, getPidPath } from "../pid";

const CLAUDE_DIR = join(process.cwd(), ".claude");
const HEARTBEAT_DIR = join(CLAUDE_DIR, "claudeclaw");
const STATUSLINE_FILE = join(CLAUDE_DIR, "statusline.cjs");
const CLAUDE_SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");

async function removeStatusline(): Promise<void> {
  try {
    const settings = await Bun.file(CLAUDE_SETTINGS_FILE).json();
    delete settings.statusLine;
    await writeFile(CLAUDE_SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  } catch {
    // ignore missing or invalid settings
  }

  try {
    await unlink(STATUSLINE_FILE);
  } catch {
    // already gone
  }
}

async function stopDaemonIfRunning(): Promise<void> {
  let pid = "";
  try {
    pid = (await Bun.file(getPidPath()).text()).trim();
  } catch {
    return;
  }

  if (!pid) return;

  try {
    process.kill(Number(pid), "SIGTERM");
    console.log(`Остановлен демон (PID ${pid}).`);
  } catch {
    console.log(`Демон ${pid} уже не запущен.`);
  }

  await cleanupPidFile();
}

export async function uninstall() {
  await stopDaemonIfRunning();
  await removeStatusline();

  try {
    await rm(HEARTBEAT_DIR, { recursive: true, force: true });
    console.log(`Удалена папка данных: ${HEARTBEAT_DIR}`);
  } catch {
    // ignore
  }

  console.log("");
  console.log("Очистка ClaudeClaw для текущего проекта завершена.");
  console.log("Теперь выполни в Claude Code:");
  console.log("  /plugin uninstall claudeclaw");
}
