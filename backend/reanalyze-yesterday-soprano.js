// Reanalyze ProSales yesterday's audios where SOPRANO wasn't scored.
// Filter: analysis.updatedAt 2026-05-08 (Tashkent UTC+5), qualification missing/empty.
const { prisma } = require("./dist/utils/prisma");
const { Storage } = require("@google-cloud/storage");
const { JobServiceClient } = require("@google-cloud/aiplatform");
const { buildAnalysisPromptV2, getCriteriaPrompt, applyAnalysisFallbacks } = require("./dist/services/call-analyzer");
const { Prisma } = require("@prisma/client");

const PROJECT_ID = "big-quanta-469517-h6";
const BUCKET = "big-quanta-469517-h6-salesai-stt";
const MODEL = "publishers/google/models/gemini-3-flash-preview";

(async () => {
  try {
    const company = await prisma.company.findFirst({
      where: { name: { contains: "Pro Sales", mode: "insensitive" } },
      select: { id: true, name: true },
    });
    console.log(`Company: ${company.name}`);

    // Sotuv kategoriyali audio'lar — qualification (SOPRANO) null/empty bo'lganlar
    const candidates = await prisma.audioFile.findMany({
      where: {
        companyId: company.id,
        status: "done",
        category: "sotuv",
        transcription: { not: null },
        NOT: { transcription: "" },
        analysis: { isNot: null },
      },
      include: {
        manager: { select: { name: true } },
        analysis: { select: { qualification: true } },
      },
      orderBy: { callDate: "desc" },
    });

    const needsReanalyze = candidates.filter(a => {
      const q = a.analysis?.qualification;
      if (!q) return true;
      const overall = (q && typeof q === "object") ? q.overallQualification : null;
      return !overall || overall === 0;
    });

    console.log(`Kandidatlar: ${candidates.length}, SOPRANO baholanmaganlar: ${needsReanalyze.length}`);

    if (needsReanalyze.length === 0) {
      console.log("Reanaliz kerak audio yo'q");
      process.exit(0);
    }

    // Criteria + course + playbook
    const criteriaByCategory = {};
    for (const cat of ["sotuv", "qayta", "boshqa"]) {
      const { criteriaNames } = await getCriteriaPrompt(company.id, cat);
      criteriaByCategory[cat] = { names: criteriaNames };
    }
    const c2 = await prisma.company.findUnique({
      where: { id: company.id },
      select: { courseInfo: true, topPerformerPlaybook: true },
    });
    const courseInfo = c2?.courseInfo || "";
    const playbook = c2?.topPerformerPlaybook || null;

    const requests = [];
    for (const a of needsReanalyze) {
      const cat = a.category || "sotuv";
      const cInfo = criteriaByCategory[cat] || criteriaByCategory["sotuv"];
      const { systemInstruction, userMessage, responseSchema } = buildAnalysisPromptV2(
        a.transcription, cInfo.names, cat, courseInfo, playbook, null
      );
      const taggedUserMessage = `[AUDIO_ID: ${a.id}]\n\n${userMessage}`;
      requests.push({
        request: {
          contents: [{ role: "user", parts: [{ text: taggedUserMessage }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 32768,
            responseMimeType: "application/json",
            responseSchema,
          },
        },
      });
    }

    console.log(`Stage 3: ${requests.length} requests`);
    const storage = new Storage();
    const bucket = storage.bucket(BUCKET);
    const inputFile = `backfill-batch/yesterday-soprano-${Date.now()}.jsonl`;
    await bucket.file(inputFile).save(requests.map(r => JSON.stringify(r)).join("\n"));
    console.log(`Uploaded gs://${BUCKET}/${inputFile}`);

    const jobClient = new JobServiceClient({ apiEndpoint: "aiplatform.googleapis.com" });
    const outputPrefix = `backfill-batch/yesterday-soprano-out-${Date.now()}/`;
    const [createdJob] = await jobClient.createBatchPredictionJob({
      parent: `projects/${PROJECT_ID}/locations/global`,
      batchPredictionJob: {
        displayName: `yesterday-soprano-${Date.now()}`,
        model: MODEL,
        inputConfig: { instancesFormat: "jsonl", gcsSource: { uris: [`gs://${BUCKET}/${inputFile}`] } },
        outputConfig: { predictionsFormat: "jsonl", gcsDestination: { outputUriPrefix: `gs://${BUCKET}/${outputPrefix}` } },
      },
    });
    console.log(`Job: ${createdJob.name}`);

    let attempts = 0;
    let succeeded = false;
    while (attempts < 240) {
      await new Promise(r => setTimeout(r, 15000));
      const [job] = await jobClient.getBatchPredictionJob({ name: createdJob.name });
      if (attempts % 4 === 0) console.log(`State: ${job.state}`);
      if (job.state === "JOB_STATE_SUCCEEDED") { succeeded = true; break; }
      if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") {
        throw new Error(`Job failed: ${JSON.stringify(job.error)}`);
      }
      attempts++;
    }
    if (!succeeded) throw new Error("Polling timed out");

    await new Promise(r => setTimeout(r, 5000));
    const [files] = await bucket.getFiles({ prefix: outputPrefix });
    const predFile = files.find(f => f.name.endsWith("predictions.jsonl")) || files.find(f => f.name.includes("predictions"));
    if (!predFile) throw new Error("Predictions file not found");
    const [content] = await predFile.download();
    const outLines = content.toString().split("\n").filter(l => l.trim());

    let saved = 0;
    for (const line of outLines) {
      try {
        const parsed = JSON.parse(line);
        const rawText = parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text || parsed.response?.text || "";
        if (!rawText) continue;
        const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
        const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
        const m2 = reqText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
        const audioId = (m1 && m1[1]) || (m2 && m2[1]);
        if (!audioId) continue;
        const audio = await prisma.audioFile.findUnique({ where: { id: audioId }, select: { transcription: true } });
        const result = applyAnalysisFallbacks(rawText, audio?.transcription || "");
        const fu = result.followupSignal;
        let followupDeadline = null;
        if (fu?.requiresFollowup && fu.suggestedDeadlineDays > 0) {
          followupDeadline = new Date();
          followupDeadline.setDate(followupDeadline.getDate() + fu.suggestedDeadlineDays);
        }
        const data = {
          summary: result.summary,
          overallScore: result.overallScore,
          leadQuality: result.leadQuality,
          leadScore: result.leadScore,
          criteria: JSON.parse(JSON.stringify(result.criteria || {})),
          errors: JSON.parse(JSON.stringify(result.errors || [])),
          winPoints: JSON.parse(JSON.stringify(result.winPoints || [])),
          lossPoints: JSON.parse(JSON.stringify(result.lossPoints || [])),
          objections: JSON.parse(JSON.stringify(result.objectionsList || [])),
          managerSpeech: result.managerSpeechPercent || 50,
          clientSpeech: result.clientSpeechPercent || 50,
          coachingInsights: JSON.parse(JSON.stringify(result.coachingInsights || {})),
          requiresFollowup: fu?.requiresFollowup || false,
          followupReason: fu?.followupReason || null,
          followupPhrase: fu?.followupPhrase || null,
          followupDeadline,
          followupCompleted: false,
          promises: result.promises ? JSON.parse(JSON.stringify(result.promises)) : null,
          qualification: result.qualification ? JSON.parse(JSON.stringify(result.qualification)) : null,
          callStructure: result.callStructure ? JSON.parse(JSON.stringify(result.callStructure)) : null,
          questionsData: result.questions ? JSON.parse(JSON.stringify(result.questions)) : null,
          closeAttempts: result.closeAttempts ? JSON.parse(JSON.stringify(result.closeAttempts)) : null,
          voiceOfCustomer: Prisma.JsonNull,
          clientProfile: result.clientProfile ? JSON.parse(JSON.stringify(result.clientProfile)) : null,
        };
        await prisma.analysis.upsert({
          where: { audioFileId: audioId },
          create: { audioFileId: audioId, ...data },
          update: data,
        });
        saved++;
      } catch (e) {
        console.error("Parse:", e.message?.slice(0, 100));
      }
    }
    console.log(`✅ DONE: ${saved}/${outLines.length} saqlandi`);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
