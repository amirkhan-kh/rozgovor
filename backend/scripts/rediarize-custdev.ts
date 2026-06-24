// Mavjud custdev intervyularning transkriptlarini Gemini Flash bilan
// Menejer/Mijoz bo'yicha qayta bo'ladi, so'ng batch tahlilni qayta ishga tushiradi.
//
// Foydalanish:
//   npx ts-node scripts/rediarize-custdev.ts <custdevId>
import * as dotenv from "dotenv";
dotenv.config();

import { custdevPrisma as prisma } from "../src/utils/custdev-prisma";
import { diarizeTranscript } from "../src/services/custdev-processor";
import { runCustdevBatchAnalysis } from "../src/services/custdev-batch";

async function main() {
  const custdevId = process.argv[2];
  if (!custdevId) {
    console.error("Usage: ts-node scripts/rediarize-custdev.ts <custdevId>");
    process.exit(1);
  }

  const interviews = await prisma.custdevInterview.findMany({
    where: { custdevId, transcription: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  console.log(`[rediarize] ${interviews.length} intervyu topildi`);

  for (let i = 0; i < interviews.length; i++) {
    const iv = interviews[i];
    if (!iv.transcription) continue;
    // Agar allaqachon diarized bo'lsa (Menejer: yoki Mijoz: bor bo'lsa), skip
    if (/Menejer:|Mijoz:/i.test(iv.transcription)) {
      console.log(
        `[rediarize] [${i + 1}/${interviews.length}] ${iv.id} — allaqachon diarized, skip`
      );
      continue;
    }
    console.log(
      `[rediarize] [${i + 1}/${interviews.length}] ${iv.id} diarization...`
    );
    try {
      const diarized = await diarizeTranscript(iv.transcription);
      const ok = diarized !== iv.transcription;
      await prisma.custdevInterview.update({
        where: { id: iv.id },
        data: {
          transcription: diarized,
          status: "processing",
          aiSummary: null,
          errorMessage: null,
        },
      });
      // Eski javoblarni o'chiramiz — qaytadan yaratiladi
      await prisma.custdevAnswer.deleteMany({ where: { interviewId: iv.id } });
      console.log(`  ${ok ? "✓" : "⚠ raw matn qoldi"} — ${diarized.length} char`);
    } catch (err) {
      console.error(`  ✗ xato: ${(err as Error).message}`);
    }
  }

  console.log(`\n[rediarize] Diarization tugadi, endi batch tahlil...`);
  const saved = await runCustdevBatchAnalysis({});
  console.log(`\n[DONE] ${saved} intervyu qayta tahlil qilindi`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
