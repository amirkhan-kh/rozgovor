// Gemini gallutsinatsiya qilgan (Vision School / IELTS / "ingliz tili")
// tahlillarni topib, Analysis ni o'chiradi va AudioFile'ni pending'ga qaytaradi.
// Transkripsiya saqlanadi — kerak bo'lsa qayta tahlil qilish mumkin.
//
// Ishlatish: DATABASE_URL=... node scripts/clean-hallucinated-analyses.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const PATTERNS = ["vision school", "ielts", "ingliz til", "general english"];

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Kompaniya topilmadi");
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name}`);

  // Barcha tahlillarni olish (summary + clientProfile)
  const analyses = await prisma.analysis.findMany({
    where: { audioFile: { companyId: company.id } },
    select: {
      id: true,
      audioFileId: true,
      summary: true,
      audioFile: { select: { fileName: true } },
    },
  });

  const badIds = [];
  const badAudioIds = [];
  for (const a of analyses) {
    const text = (a.summary || "").toLowerCase();
    if (PATTERNS.some((p) => text.includes(p))) {
      badIds.push(a.id);
      badAudioIds.push(a.audioFileId);
    }
  }

  console.log(`Tahlillardan gallutsinatsiya: ${badIds.length} ta`);
  if (badIds.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Namuna
  const sample = analyses.filter((a) => badIds.includes(a.id)).slice(0, 3);
  for (const s of sample) {
    console.log(`  - ${s.audioFile.fileName}: ${s.summary.slice(0, 80)}...`);
  }

  // Analysis o'chirish
  const del = await prisma.analysis.deleteMany({
    where: { id: { in: badIds } },
  });
  console.log(`\nO'chirildi: ${del.count} ta Analysis`);

  // AudioFile'ni pending'ga qaytarish (transcription saqlanadi)
  const upd = await prisma.audioFile.updateMany({
    where: { id: { in: badAudioIds } },
    data: { status: "pending" },
  });
  console.log(`Pending'ga qaytarildi: ${upd.count} ta AudioFile`);

  await prisma.$disconnect();
  console.log(`\nTayyor ✅ — keyinchalik batch-backfill yoki reanalyze-qayta bilan qayta tahlil qilish mumkin.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
