import { backupSession } from "../sessions";
import { checkExistingDaemon } from "../pid";
import { stop } from "./stop";

export async function clear() {
  const backup = await backupSession();

  if (backup) {
    console.log(`Резервная копия сессии создана → ${backup}`);
  } else {
    console.log("Нет активной сессии для резервного копирования.");
  }

  // If daemon is running, stop it so the next start gets a fresh session
  const pid = await checkExistingDaemon();
  if (pid) {
    console.log("Останавливаю демон, чтобы при следующем запуске создалась новая сессия...");
    await stop();
  } else {
    console.log("Демон не запущен. Следующий старт создаст новую сессию.");
    process.exit(0);
  }
}
