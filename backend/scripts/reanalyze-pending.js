// Pending statusdagi, transkripsiyasi bor audio'larni qayta tahlil qilish.
// Har audio uchun o'z kategoriyasiga mos prompt (sotuv / qayta).
// Field nomlari processor.ts bilan bir xil.

require("ts-node/register");
const { PrismaClient } = require("@prisma/client");
const { analyzeCall, getCriteriaPrompt } = require("../src/services/call-analyzer");

const prisma = new PrismaClient();
const CONCURRENCY = 3;

async function runWithLimit(items, limit, fn) {
  let idx = 0;
  const workers = Array(limit)
    .fill(0)
    .map(async () => {
      while (idx < items.length) {
        const i = idx++;
        try {
          await fn(items[i], i);
        } catch (err) {
          console.error(`worker xato: ${err.message}`);
        }
      }
    });
  await Promise.all(workers);
}

const safeJson = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Kompaniya topilmadi");
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name}`);

  const audios = await prisma.audioFile.findMany({
    where: {
      companyId: company.id,
      status: "pending",
      transcription: { not: null },
    },
    select: { id: true, fileName: true, transcription: true, category: true, leadId: true, callDate: true },
  });

  console.log(`Pending + transkripsiya bor: ${audios.length} ta`);
  if (audios.length === 0) {
    await prisma.$disconnect();
    return;
  }

  const sotuvPrompt = await getCriteriaPrompt(company.id, "sotuv");
  const qaytaPrompt = await getCriteriaPrompt(company.id, "qayta");
  const courseInfo = company.courseInfo || "";

  console.log(`Sotuv mezonlari: ${sotuvPrompt.criteriaNames.length}`);
  console.log(`Qayta mezonlari: ${qaytaPrompt.criteriaNames.length}`);
  console.log(`CourseInfo: ${courseInfo.length} belgi`);
  console.log(`Konkurentlik: ${CONCURRENCY}`);
  console.log("---");

  let ok = 0, fail = 0;
  const start = Date.now();

  await runWithLimit(audios, CONCURRENCY, async (a, i) => {
    const t0 = Date.now();
    const cat = a.category === "qayta" ? "qayta" : "sotuv";
    const { text: criteriaText, criteriaNames } =
      cat === "qayta" ? qaytaPrompt : sotuvPrompt;
    try {
      const r = await analyzeCall(
        a.transcription,
        criteriaText,
        cat,
        criteriaNames,
        courseInfo,
        null
      );

      // Follow-up deadline (processor.ts kabi)
      const fu = r.followupSignal;
      let followupDeadline = null;
      if (fu?.requiresFollowup && fu.suggestedDeadlineDays > 0) {
        followupDeadline = new Date();
        followupDeadline.setDate(followupDeadline.getDate() + fu.suggestedDeadlineDays);
      }

      const analysisData = {
        summary: r.summary || "",
        overallScore: r.overallScore || 0,
        leadQuality: r.leadQuality || "medium",
        leadScore: r.leadScore || 0,
        criteria: safeJson(r.criteria) || {},
        errors: safeJson(r.errors) || [],
        winPoints: safeJson(r.winPoints) || [],
        lossPoints: safeJson(r.lossPoints) || [],
        objections: safeJson(r.objectionsList) || [],
        managerSpeech: r.managerSpeechPercent || 0,
        clientSpeech: r.clientSpeechPercent || 0,
        coachingInsights: safeJson(r.coachingInsights),
        requiresFollowup: fu?.requiresFollowup || false,
        followupReason: fu?.followupReason || null,
        followupPhrase: fu?.followupPhrase || null,
        followupDeadline,
        followupCompleted: false,
        promises: safeJson(r.promises),
        qualification: safeJson(r.qualification),
        callStructure: safeJson(r.callStructure),
        questionsData: safeJson(r.questions),
        closeAttempts: safeJson(r.closeAttempts),
        voiceOfCustomer: safeJson(r.voiceOfCustomer),
        intentSignals: safeJson(r.intentSignals),
        clientProfile: safeJson(r.clientProfile),
        respect: safeJson(r.respect),
        leadHeatScore: r.leadHeatScore ?? null,
      };

      await prisma.analysis.upsert({
        where: { audioFileId: a.id },
        create: { audioFileId: a.id, ...analysisData },
        update: analysisData,
      });

      // Client profile aggregation — har tahlildan keyin
      try {
        const { aggregateClientFromAnalysis } = require("../src/services/client-profiler");
        await aggregateClientFromAnalysis(a.id);
      } catch (err) {
        // non-fatal
      }

      // status=done faqat muvaffaqiyatli bo'lsa
      await prisma.audioFile.update({
        where: { id: a.id },
        data: { status: "done" },
      });

      ok++;
      process.stdout.write(
        `[${i + 1}/${audios.length}] ${cat} ${a.fileName} ✓ ${r.overallScore}% (${Date.now() - t0}ms)\n`
      );
    } catch (err) {
      fail++;
      process.stdout.write(
        `[${i + 1}/${audios.length}] ${cat} ${a.fileName} ✗ ${(err.message || "?").substring(0, 80)}\n`
      );
    }
  });

  const elapsed = Math.round((Date.now() - start) / 1000);
  console.log("---");
  console.log(`Yakun: ${ok} ✓, ${fail} ✗, ${elapsed}s`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("Xatolik:", e);
  process.exit(1);
});
