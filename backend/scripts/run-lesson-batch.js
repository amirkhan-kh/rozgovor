// Lesson BATCH pipeline — Yandex STT poll + Gemini 2.5 Flash Vertex AI batch.
//
// PHASE 1 (upload vaqtida, lesson-processor.ts) Yandex deferred STT
// operation'ni yuborib qo'yadi. Bu skript shu operation'larni poll qilib,
// transkript tayyor bo'lganlar uchun Gemini Flash batch ishga tushiradi.
//
// Ishlatish:
//   DATABASE_URL=... GOOGLE_APPLICATION_CREDENTIALS=... node scripts/run-lesson-batch.js
//   # yoki kompaniya bo'yicha:
//   ... node scripts/run-lesson-batch.js <companyId>

require("ts-node/register");
const { runLessonBatchPipeline } = require("../src/services/lesson-batch");

(async () => {
  const companyId = process.argv[2] || undefined;
  if (companyId) {
    console.log(`[run-lesson-batch] companyId=${companyId}`);
  } else {
    console.log(`[run-lesson-batch] barcha kompaniyalar`);
  }

  try {
    const { sttReady, flashReady } = await runLessonBatchPipeline({ companyId });
    console.log(
      `[run-lesson-batch] DONE — STT ready: ${sttReady}, Flash ready: ${flashReady}`
    );
    process.exit(0);
  } catch (err) {
    console.error(`[run-lesson-batch] FATAL:`, err);
    process.exit(1);
  }
})();
