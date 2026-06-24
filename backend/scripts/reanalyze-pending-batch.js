// Pending audio'larni Vertex AI BATCH prediction orqali Gemini 2.5 Pro bilan
// qayta tahlil qilish. Batch job Vertex Console > Batch Predictions da ko'rinadi.
//
// Ishlatish:
//   DATABASE_URL=... GOOGLE_APPLICATION_CREDENTIALS=... node scripts/reanalyze-pending-batch.js

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
      status: "pending",
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
  });

  console.log(`Pending + transkripsiya bor: ${audios.length}`);
  if (audios.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const byCategory = audios.reduce((acc, a) => {
    acc[a.category || "sotuv"] = (acc[a.category || "sotuv"] || 0) + 1;
    return acc;
  }, {});
  console.log(`Kategoriya:`, byCategory);
  console.log(`Batch job yuborilyapti — Vertex Console > Batch Predictions'da ko'rinadi.`);
  console.log(`Kutish vaqti: ~15-30 daqiqa (Gemini 2.5 Pro).`);
  console.log("---");

  // AudioMeta formatiga o'zgartirish
  const audioMetas = audios.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    fileUrl: a.fileUrl || "",
    duration: a.duration,
    managerName: a.manager?.name || "Noma'lum",
    category: a.category,
    transcription: a.transcription,
  }));

  const start = Date.now();
  try {
    await runStage3_ProBatch(audioMetas, company.id);
    console.log(`\nTayyor ✅ (${Math.round((Date.now() - start) / 1000)}s)`);
  } catch (err) {
    console.error(`\nXato ✗:`, err.message);
    process.exit(1);
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
