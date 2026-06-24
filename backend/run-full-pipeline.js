// Full 3-stage pipeline for ProSales pending audios:
// Stage 1: Yandex STT deferred → transkripsiya
// Stage 2: Gemini 3 Flash batch diarization
// Stage 3: Gemini 3 Flash batch analysis (V2 + 7 mezon + SOPRANO)
const { prisma } = require("./dist/utils/prisma");
const { runBatchBackfill } = require("./dist/services/batch-backfill");

(async () => {
  try {
    const company = await prisma.company.findFirst({
      where: { name: { contains: "Pro Sales", mode: "insensitive" } },
      select: { id: true, name: true },
    });
    console.log(`Company: ${company.name}`);
    console.log(`runBatchBackfill: pending audio'lar uchun to'liq 3-bosqichli pipeline`);
    const processed = await runBatchBackfill(company.id, {});
    console.log(`✅ DONE: ${processed} ta audio to'liq tahlil qilindi`);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
