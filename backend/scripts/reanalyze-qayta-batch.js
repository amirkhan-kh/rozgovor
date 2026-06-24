// Qayta qo'ng'iroq audiolarni Vertex AI BATCH (Gemini 2.5 Pro) bilan
// QAYTA mezonlar (5 ta) bo'yicha qayta tahlil qiladi.
//
// Bu skript batch-backfill.ts'dagi runStage3_ProBatch'ni chaqiradi —
// fixdan keyin har audioning kategoriyasi bo'yicha to'g'ri mezonlarni
// passes qiladi.
//
// Ishlatish:
//   DATABASE_URL=... GOOGLE_APPLICATION_CREDENTIALS=... \
//   node scripts/reanalyze-qayta-batch.js

require("ts-node/register");
const { PrismaClient } = require("@prisma/client");
const { runStage3_ProBatch } = require("../src/services/batch-backfill");

const prisma = new PrismaClient();

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Kompaniya topilmadi");
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name} (${company.id})`);

  const audios = await prisma.audioFile.findMany({
    where: {
      companyId: company.id,
      category: "qayta",
      transcription: { not: null },
    },
    select: {
      id: true,
      fileName: true,
      fileUrl: true,
      duration: true,
      category: true,
      transcription: true,
      manager: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Qayta audio (transkripsiyasi bor): ${audios.length}`);
  if (audios.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const audioMetas = audios.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    fileUrl: a.fileUrl || "",
    duration: a.duration,
    managerName: a.manager?.name || "Noma'lum",
    category: a.category,
    transcription: a.transcription,
  }));

  console.log("Vertex AI batch yuborilmoqda — Vertex Console > Batch Predictions'da ko'rinadi.");
  console.log("Kutish vaqti: ~15-30 daqiqa.");
  console.log("---");

  const start = Date.now();
  try {
    await runStage3_ProBatch(audioMetas, company.id);
    console.log(`\nTayyor ✅ batch yuborildi (${Math.round((Date.now() - start) / 1000)}s)`);
  } catch (err) {
    console.error(`\nXato ✗:`, err.message);
    process.exit(1);
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
