// Aprel 2026 (yoki istalgan davr) qo'ng'iroqlarini 5 ta target menejer
// uchun batch tahlil qiladi:
//   - mavjud Analysis yozuvlari o'chiriladi (transcription qoladi)
//   - transcription bor audiolar → faqat Stage 3 (Pro batch)
//   - transcription yo'q audiolar → full pipeline (Yandex STT + Flash + Pro)
//
// CLI:
//   npx ts-node scripts/reanalyze-april-managers.ts [fromDate=2026-04-01] [toDate=2026-04-30]

import { PrismaClient } from "@prisma/client";
import { reanalyzeForManagers } from "../src/services/batch-backfill";

const prisma = new PrismaClient();

const TARGET_USERS = ["64", "976", "1534", "2042", "2140"];
const TARGET_NAMES: Record<string, string> = {
  "64": "Aziza",
  "976": "Muslima",
  "1534": "Visola",
  "2042": "Xusnora",
  "2140": "Zilolaxon",
};

const FROM_DATE = process.argv[2] || "2026-04-01";
const TO_DATE = process.argv[3] || "2026-04-30";

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "ProSalesGroup" },
  });
  if (!company) {
    console.error("ProSalesGroup company topilmadi");
    process.exit(1);
  }
  const managerIds = TARGET_USERS.map((u) => `bitrix_${u}`);
  const from = new Date(`${FROM_DATE}T00:00:00+05:00`);
  const to = new Date(`${TO_DATE}T23:59:59+05:00`);

  console.log(`Company: ${company.name}`);
  console.log(`Window:  ${FROM_DATE} ... ${TO_DATE}`);
  console.log(`Managers: ${managerIds.join(", ")}\n`);

  // 1) Mavjud Analysis yozuvlarini o'chirish
  const audios = await prisma.audioFile.findMany({
    where: {
      companyId: company.id,
      managerId: { in: managerIds },
      callDate: { gte: from, lte: to },
    },
    select: { id: true, transcription: true },
  });

  const withTrans = audios.filter((a) => a.transcription && a.transcription.trim().length > 0);
  const noTrans = audios.filter((a) => !a.transcription || a.transcription.trim().length === 0);

  console.log(`Topildi: ${audios.length} audio`);
  console.log(`  - transcription bor: ${withTrans.length}`);
  console.log(`  - transcription yo'q: ${noTrans.length}\n`);

  console.log("1) Eski Analysis yozuvlarini o'chirish...");
  const del = await prisma.analysis.deleteMany({
    where: { audioFileId: { in: audios.map((a) => a.id) } },
  });
  console.log(`   ${del.count} ta Analysis o'chirildi\n`);

  // 2) audios statusini reset
  console.log("2) Audio statuslarini reset...");
  // transcription bor → status='done' qoladi (Stage 3 oxirida bo'lishi kerak)
  // transcription yo'q → status='pending' (Stage 1+2+3 ishga tushadi)
  if (noTrans.length > 0) {
    await prisma.audioFile.updateMany({
      where: { id: { in: noTrans.map((a) => a.id) } },
      data: { status: "pending" },
    });
    console.log(`   ${noTrans.length} audio → 'pending'`);
  }
  if (withTrans.length > 0) {
    await prisma.audioFile.updateMany({
      where: { id: { in: withTrans.map((a) => a.id) } },
      data: { status: "processing" },
    });
    console.log(`   ${withTrans.length} audio → 'processing' (Stage 3 ga)`);
  }
  console.log("");

  // 3) reanalyzeForManagers ishga tushirish
  console.log("3) Batch pipeline boshlanmoqda...");
  console.log("   Stage 1: Yandex Deferred STT (transcription yo'q audiolar uchun)");
  console.log("   Stage 2: Gemini 2.5 Flash batch diarization");
  console.log("   Stage 3: Gemini 2.5 Pro batch analiz (8 mezonli prompt)\n");

  const result = await reanalyzeForManagers(company.id, managerIds, from, to);

  console.log("\n=== Yakun ===");
  console.log(`  Transcription bor:  ${result.withTrans}`);
  console.log(`  Transcription yo'q: ${result.noTrans}`);
  console.log(`  Tahlil qilindi:     ${result.analyzed}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
