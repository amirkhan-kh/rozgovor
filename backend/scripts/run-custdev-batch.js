// Custdev Interview BATCH tahlil — Vertex AI batch prediction (Gemini 2.5 Pro).
// status="processing" va transcription != null bo'lgan barcha intervyularni tahlil
// qiladi. Batch job 15-30 daqiqa davom etadi.
//
// Ishlatish:
//   DATABASE_URL=... GOOGLE_APPLICATION_CREDENTIALS=... node scripts/run-custdev-batch.js
//   # yoki kompaniya bo'yicha:
//   ... node scripts/run-custdev-batch.js <companyId>

require("ts-node/register");
const { runCustdevBatchAnalysis } = require("../src/services/custdev-batch");

(async () => {
  const companyId = process.argv[2] || undefined;
  if (companyId) {
    console.log(`[run-custdev-batch] companyId=${companyId}`);
  } else {
    console.log(`[run-custdev-batch] barcha kompaniyalar`);
  }

  try {
    const n = await runCustdevBatchAnalysis({ companyId });
    console.log(`[run-custdev-batch] DONE: ${n} intervyu tahlil qilindi`);
    process.exit(0);
  } catch (err) {
    console.error(`[run-custdev-batch] FATAL:`, err);
    process.exit(1);
  }
})();
