// Manual trigger — Wave 4 Manager Celebration Videos poll.
//
// "generating" status'dagi ManagerVideo rowlarini Vertex AI operation'lari
// orqali poll qiladi. Tayyor videolarni GCS → Yandex'ga ko'chiradi, thumbnail
// yasaydi, status="ready" qo'yadi.
//
// Ishlatish:
//   DATABASE_URL=... GOOGLE_APPLICATION_CREDENTIALS=... node scripts/run-video-poll.js

require("ts-node/register");
require("dotenv").config();

const { pollVideoOperations } = require("../src/services/manager-videos");

(async () => {
  try {
    const r = await pollVideoOperations();
    console.log(
      `[run-video-poll] DONE — ready=${r.ready} failed=${r.failed} pending=${r.pending}`,
    );
    process.exit(0);
  } catch (err) {
    console.error("[run-video-poll] FATAL:", err);
    process.exit(1);
  }
})();
