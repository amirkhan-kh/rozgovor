// Qayta qo'ng'iroqlarni MAVJUD transkripsiyadan Gemini Pro bilan qayta mezonlar
// bo'yicha tahlil qilish. STT/diarization qaytarilmaydi — tejamkor.
//
// Ishga tushirish:
//   DATABASE_URL=... node scripts/reanalyze-qayta.js

require("ts-node/register");
const { PrismaClient } = require("@prisma/client");
const { analyzeCall, getCriteriaPrompt } = require("../src/services/call-analyzer");

const prisma = new PrismaClient();

const CONCURRENCY = 3;

async function runWithLimit(items, limit, fn) {
  const results = [];
  let idx = 0;
  const workers = Array(limit)
    .fill(0)
    .map(async () => {
      while (idx < items.length) {
        const i = idx++;
        try {
          results[i] = await fn(items[i], i);
        } catch (err) {
          results[i] = { error: err.message };
        }
      }
    });
  await Promise.all(workers);
  return results;
}

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Kompaniya topilmadi");
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name}`);

  // Qayta kategoriya + transkripsiyasi bor + status=done
  const audios = await prisma.audioFile.findMany({
    where: {
      companyId: company.id,
      category: "qayta",
      status: "done",
      transcription: { not: null },
    },
    select: {
      id: true,
      fileName: true,
      transcription: true,
      managerId: true,
      analysis: { select: { id: true } },
    },
  });

  console.log(`Qayta audio (transkripsiyasi bor): ${audios.length}`);
  if (audios.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Qayta mezonlar prompt + courseInfo
  const { text: criteriaText, criteriaNames } = await getCriteriaPrompt(company.id, "qayta");
  const courseInfo = company.courseInfo || "";
  console.log(`Qayta mezonlari: ${criteriaNames.length} ta → ${criteriaNames.join(", ")}`);
  console.log(`Konkurentlik: ${CONCURRENCY}, Jami: ${audios.length}`);
  console.log("---");

  let ok = 0;
  let fail = 0;
  const start = Date.now();

  await runWithLimit(audios, CONCURRENCY, async (a, i) => {
    const t0 = Date.now();
    try {
      const result = await analyzeCall(
        a.transcription,
        criteriaText,
        "qayta",
        criteriaNames,
        courseInfo,
        null
      );
      const fixed = result;

      // Analysis mavjud bo'lsa — update, aks holda create
      if (a.analysis?.id) {
        await prisma.analysis.update({
          where: { id: a.analysis.id },
          data: {
            criteria: fixed.criteria,
            overallScore: fixed.overallScore,
            summary: fixed.summary,
            managerSummary: fixed.managerSummary,
            conversationStage: fixed.conversationStage,
            confidenceLevel: fixed.confidenceLevel,
            clientEngagement: fixed.clientEngagement,
            nextSteps: fixed.nextSteps,
            saleProbability: fixed.saleProbability,
            objections: fixed.objections,
            errorTypes: fixed.errorTypes,
            strengths: fixed.strengths,
            improvements: fixed.improvements,
            keyMoments: fixed.keyMoments,
            redFlags: fixed.redFlags,
            greenFlags: fixed.greenFlags,
            questionsAsked: fixed.questionsAsked,
            clientQuestions: fixed.clientQuestions,
            clientProfile: fixed.clientProfile,
            isSale: fixed.isSale,
          },
        });
      } else {
        await prisma.analysis.create({
          data: {
            audioFileId: a.id,
            criteria: fixed.criteria,
            overallScore: fixed.overallScore,
            summary: fixed.summary,
            managerSummary: fixed.managerSummary,
            conversationStage: fixed.conversationStage,
            confidenceLevel: fixed.confidenceLevel,
            clientEngagement: fixed.clientEngagement,
            nextSteps: fixed.nextSteps,
            saleProbability: fixed.saleProbability,
            objections: fixed.objections,
            errorTypes: fixed.errorTypes,
            strengths: fixed.strengths,
            improvements: fixed.improvements,
            keyMoments: fixed.keyMoments,
            redFlags: fixed.redFlags,
            greenFlags: fixed.greenFlags,
            questionsAsked: fixed.questionsAsked,
            clientQuestions: fixed.clientQuestions,
            clientProfile: fixed.clientProfile,
            isSale: fixed.isSale,
          },
        });
      }
      ok++;
      process.stdout.write(
        `[${i + 1}/${audios.length}] ${a.fileName} ✓ ${fixed.overallScore}% (${Date.now() - t0}ms)\n`
      );
    } catch (err) {
      fail++;
      process.stdout.write(
        `[${i + 1}/${audios.length}] ${a.fileName} ✗ ${err.message.substring(0, 80)}\n`
      );
    }
  });

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log("---");
  console.log(`Yakun: ${ok} muvaffaqiyatli, ${fail} xato, ${elapsed}s`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("Xatolik:", e);
  process.exit(1);
});
