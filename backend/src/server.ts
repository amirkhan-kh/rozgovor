import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import { initTelegramBot } from "./services/telegram";
import { initScheduler } from "./services/scheduler";
import { initWebSocket } from "./services/websocket";
import { initVoiceExamLiveProxy } from "./services/voice-exam-live-proxy";
import { initSaleWatcher } from "./services/sale-watcher";

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  initWebSocket(server);
  initVoiceExamLiveProxy(server);
  initSaleWatcher();

  // Local dev uchun — scheduler/telegram/AmoCRM auto-refresh bilan prod DB'ga aralashmaslik
  if (process.env.DISABLE_SCHEDULER === "1") {
    console.log("[init] DISABLE_SCHEDULER=1 → skipping telegram bot + scheduler");
    return;
  }

  if (process.env.DISABLE_TELEGRAM === "1") {
    console.log("[init] DISABLE_TELEGRAM=1 → skipping telegram bot");
  } else {
    initTelegramBot();
  }
  initScheduler();
});

// Imtihon suhbati uzoq davom etishi mumkin — timeout cheklanmagan.
server.timeout = 0;
server.keepAliveTimeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
