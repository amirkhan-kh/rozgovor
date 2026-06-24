// Mavjud tahlil qilingan audiolarni clientProfile maydoni bilan qayta tahlil qilish.
// Foydalanish: node scripts/reanalyze-for-client-profile.js [limit]
//
// Ish tartibi:
//   1) Analysis.clientProfile = null (eski tahlillar) bo'lgan audiolarni topadi
//   2) Audio status'ini "pending" ga qaytaradi
//   3) runBatchBackfill(companyId) chaqiradi — batch STT + Flash + Pro
//   4) Pro prompt endi clientProfile ham chiqaradi (call-analyzer.ts yangilangan)
//   5) Tahlil tugaganda aggregateClientFromAnalysis avto ishlaydi (processor.ts hook)

require("ts-node/register");
const { PrismaClient, Prisma } = require("@prisma/client");
const prisma = new PrismaClient();

const limitArg = parseInt(process.argv[2] || "", 10);
const LIMIT = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : undefined;

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Kompaniya topilmadi");
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name} (${company.id})`);

  // clientProfile bo'lmagan tahlil qilingan audiolar (DB-level NULL)
  const analyses = await prisma.analysis.findMany({
    where: {
      clientProfile: { equals: Prisma.DbNull },
      audioFile: {
        companyId: company.id,
        status: "done",
      },
    },
    select: { audioFileId: true },
    take: LIMIT,
  });

  if (analyses.length === 0) {
    console.log("Barcha tahlillarda clientProfile mavjud. Hech narsa qilish kerak emas.");
    await prisma.$disconnect();
    return;
  }

  console.log(`${analyses.length} ta audio qayta tahlil qilinadi...`);

  const audioIds = analyses.map((a) => a.audioFileId);

  // status → pending (batch backfill bularni oladi)
  await prisma.audioFile.updateMany({
    where: { id: { in: audioIds } },
    data: { status: "pending" },
  });
  console.log(`✓ ${audioIds.length} ta audio status=pending ga o'zgartirildi`);

  // runBatchBackfill
  const { runBatchBackfill } = require("../src/services/batch-backfill");
  console.log("Batch pipeline boshlandi (Yandex STT → Flash diarization → Pro analysis)...");
  console.log("Bu uzoq vaqt olishi mumkin. Serverdagi loglarni kuzating.\n");

  try {
    const saved = await runBatchBackfill(company.id, LIMIT ? { limit: LIMIT } : {});
    console.log(`\n✅ ${saved} ta audio muvaffaqiyatli qayta tahlil qilindi.`);
  } catch (err) {
    console.error("Batch xatolik:", err.message);
  }

  await prisma.$disconnect();
})();
