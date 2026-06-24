// Muvaffaqiyatsiz (yoki diarization'siz) intervyularni qayta ishlaydi:
// 1. Diarization yo'q bo'lganlarini qayta diarize qiladi
// 2. status=processing ga o'tkazib, eski javoblarni o'chirib, batch qayta ishlatadi
import * as dotenv from "dotenv";
dotenv.config();

import { custdevPrisma as prisma } from "../src/utils/custdev-prisma";
import { diarizeTranscript } from "../src/services/custdev-processor";
import { runCustdevBatchAnalysis } from "../src/services/custdev-batch";

async function main() {
  const custdevId = process.argv[2];
  if (!custdevId) {
    console.error("Usage: ts-node scripts/retry-custdev-failed.ts <custdevId>");
    process.exit(1);
  }

  const rows = await prisma.custdevInterview.findMany({
    where: {
      custdevId,
      transcription: { not: null },
    },
  });

  const toRetry = rows.filter(
    (r) =>
      r.status === "processing" ||
      r.status === "failed" ||
      (r.transcription && !/Menejer:|Mijoz:/i.test(r.transcription))
  );
  console.log(`[retry] ${toRetry.length} intervyu qayta ishlov talab qiladi`);

  for (let i = 0; i < toRetry.length; i++) {
    const iv = toRetry[i];
    if (!iv.transcription) continue;
    const needsDiarize = !/Menejer:|Mijoz:/i.test(iv.transcription);

    let newTranscript = iv.transcription;
    if (needsDiarize) {
      console.log(
        `[retry] [${i + 1}/${toRetry.length}] ${iv.id} — diarization kerak`
      );
      // 2 marta urinish
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          newTranscript = await diarizeTranscript(iv.transcription);
          if (/Menejer:|Mijoz:/i.test(newTranscript)) break;
        } catch (err) {
          console.error(
            `  attempt ${attempt} xato: ${(err as Error).message}`
          );
        }
        if (attempt === 1) await new Promise((r) => setTimeout(r, 2000));
      }
    }

    await prisma.custdevAnswer.deleteMany({ where: { interviewId: iv.id } });
    await prisma.custdevInterview.update({
      where: { id: iv.id },
      data: {
        transcription: newTranscript,
        status: "processing",
        aiSummary: null,
        errorMessage: null,
      },
    });
    console.log(
      `  ✓ reset qilindi (${/Menejer:|Mijoz:/i.test(newTranscript) ? "diarized" : "raw"})`
    );
  }

  console.log(`\n[retry] Batch tahlil...`);
  const saved = await runCustdevBatchAnalysis({});
  console.log(`\n[DONE] ${saved} intervyu qayta tahlil qilindi`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
