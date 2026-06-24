// Stage 3 only for 5 audios with transcription but no analysis.
const { prisma } = require("./dist/utils/prisma");
const { Storage } = require("@google-cloud/storage");
const { JobServiceClient } = require("@google-cloud/aiplatform");
const { buildAnalysisPromptV2, getCriteriaPrompt, applyAnalysisFallbacks } = require("./dist/services/call-analyzer");
const { Prisma } = require("@prisma/client");

const PROJECT_ID = "big-quanta-469517-h6";
const BUCKET = process.env.GCS_BATCH_BUCKET || "big-quanta-469517-h6-salesai-stt";
const MODEL = "publishers/google/models/gemini-3-flash-preview";

(async () => {
  try {
    const company = await prisma.company.findFirst({
      where: { name: { contains: "Pro Sales", mode: "insensitive" } },
      select: { id: true, name: true },
    });
    const audios = await prisma.audioFile.findMany({
      where: {
        companyId: company.id,
        analysis: null,
        transcription: { not: null },
        NOT: { transcription: "" },
        status: { notIn: ["too_short", "no_audio", "no_conversation", "transferred", "disconnected"] },
      },
      include: { manager: { select: { name: true } } },
    });
    console.log(`Stage 3 only: ${audios.length} audio`);
    if (audios.length === 0) { console.log("Yo'q"); process.exit(0); }

    const criteriaByCategory = {};
    for (const cat of ["sotuv", "qayta", "boshqa"]) {
      const { criteriaNames } = await getCriteriaPrompt(company.id, cat);
      criteriaByCategory[cat] = { names: criteriaNames };
    }
    const c2 = await prisma.company.findUnique({ where: { id: company.id }, select: { courseInfo: true, topPerformerPlaybook: true } });

    const requests = [];
    for (const a of audios) {
      const cat = a.category || "sotuv";
      const cInfo = criteriaByCategory[cat] || criteriaByCategory["sotuv"];
      const { systemInstruction, userMessage, responseSchema } = buildAnalysisPromptV2(
        a.transcription, cInfo.names, cat, c2?.courseInfo || "", c2?.topPerformerPlaybook || null, null
      );
      requests.push({
        request: {
          contents: [{ role: "user", parts: [{ text: `[AUDIO_ID: ${a.id}]\n\n${userMessage}` }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0, maxOutputTokens: 32768, responseMimeType: "application/json", responseSchema },
        },
      });
    }

    const storage = new Storage();
    const bucket = storage.bucket(BUCKET);
    const inputFile = `backfill-batch/stage3-${Date.now()}.jsonl`;
    await bucket.file(inputFile).save(requests.map(r => JSON.stringify(r)).join("\n"));
    const jobClient = new JobServiceClient({ apiEndpoint: "aiplatform.googleapis.com" });
    const outputPrefix = `backfill-batch/stage3-out-${Date.now()}/`;
    const [createdJob] = await jobClient.createBatchPredictionJob({
      parent: `projects/${PROJECT_ID}/locations/global`,
      batchPredictionJob: {
        displayName: `stage3-only-${Date.now()}`,
        model: MODEL,
        inputConfig: { instancesFormat: "jsonl", gcsSource: { uris: [`gs://${BUCKET}/${inputFile}`] } },
        outputConfig: { predictionsFormat: "jsonl", gcsDestination: { outputUriPrefix: `gs://${BUCKET}/${outputPrefix}` } },
      },
    });
    console.log(`Job: ${createdJob.name}`);
    let attempts = 0, succeeded = false;
    while (attempts < 240) {
      await new Promise(r => setTimeout(r, 15000));
      const [job] = await jobClient.getBatchPredictionJob({ name: createdJob.name });
      if (attempts % 4 === 0) console.log(`State: ${job.state}`);
      if (job.state === "JOB_STATE_SUCCEEDED") { succeeded = true; break; }
      if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") throw new Error(`Failed: ${JSON.stringify(job.error)}`);
      attempts++;
    }
    if (!succeeded) throw new Error("Timed out");

    await new Promise(r => setTimeout(r, 5000));
    const [files] = await bucket.getFiles({ prefix: outputPrefix });
    const predFile = files.find(f => f.name.endsWith("predictions.jsonl")) || files.find(f => f.name.includes("predictions"));
    const [content] = await predFile.download();
    const outLines = content.toString().split("\n").filter(l => l.trim());
    let saved = 0;
    for (const line of outLines) {
      try {
        const parsed = JSON.parse(line);
        const rawText = parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!rawText) continue;
        const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
        const m2 = (parsed.request?.contents?.[0]?.parts?.[0]?.text || "").match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
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
          summary: result.summary, overallScore: result.overallScore, leadQuality: result.leadQuality, leadScore: result.leadScore,
          criteria: JSON.parse(JSON.stringify(result.criteria || {})),
          errors: JSON.parse(JSON.stringify(result.errors || [])),
          winPoints: JSON.parse(JSON.stringify(result.winPoints || [])),
          lossPoints: JSON.parse(JSON.stringify(result.lossPoints || [])),
          objections: JSON.parse(JSON.stringify(result.objectionsList || [])),
          managerSpeech: result.managerSpeechPercent || 50, clientSpeech: result.clientSpeechPercent || 50,
          coachingInsights: JSON.parse(JSON.stringify(result.coachingInsights || {})),
          requiresFollowup: fu?.requiresFollowup || false, followupReason: fu?.followupReason || null,
          followupPhrase: fu?.followupPhrase || null, followupDeadline, followupCompleted: false,
          promises: result.promises ? JSON.parse(JSON.stringify(result.promises)) : null,
          qualification: result.qualification ? JSON.parse(JSON.stringify(result.qualification)) : null,
          callStructure: result.callStructure ? JSON.parse(JSON.stringify(result.callStructure)) : null,
          questionsData: result.questions ? JSON.parse(JSON.stringify(result.questions)) : null,
          closeAttempts: result.closeAttempts ? JSON.parse(JSON.stringify(result.closeAttempts)) : null,
          voiceOfCustomer: Prisma.JsonNull,
          clientProfile: result.clientProfile ? JSON.parse(JSON.stringify(result.clientProfile)) : null,
        };
        await prisma.analysis.upsert({ where: { audioFileId: audioId }, create: { audioFileId: audioId, ...data }, update: data });
        await prisma.audioFile.update({ where: { id: audioId }, data: { status: "done" } });
        saved++;
      } catch (e) { console.error("parse:", e.message?.slice(0, 100)); }
    }
    console.log(`✅ DONE: ${saved}/${outLines.length}`);
    process.exit(0);
  } catch (e) { console.error("Error:", e?.stack || e?.message || e); process.exit(1); }
})();
