// Yuborilgan Pro Batch Job'ni kutish va natijalarni DB ga yozish.
// Usage: node scripts/poll-pro-batch.js <job-name>
//   yoki: node scripts/poll-pro-batch.js  (oxirgi jobni topadi)

require("ts-node/register");
const { JobServiceClient } = require("@google-cloud/aiplatform");
const { Storage } = require("@google-cloud/storage");
const { PrismaClient } = require("@prisma/client");
const { applyAnalysisFallbacks } = require("../src/services/call-analyzer");

const prisma = new PrismaClient();
const BUCKET = "big-quanta-469517-h6-salesai-stt";
const LOCATION = "us-central1";
const PROJECT_ID = "big-quanta-469517-h6";

const JOB_NAME = process.argv[2] ||
  "projects/869888426422/locations/us-central1/batchPredictionJobs/2486425544829173760";

(async () => {
  console.log(`Job: ${JOB_NAME}`);

  const jobClient = new JobServiceClient({
    apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
  });

  // Poll
  const MAX_ATTEMPTS = 240; // 240 * 15s = 1 soat
  let attempts = 0;
  let job = null;
  while (attempts < MAX_ATTEMPTS) {
    [job] = await jobClient.getBatchPredictionJob({ name: JOB_NAME });
    const state = job.state;
    if (attempts % 4 === 0) {
      console.log(`[${new Date().toLocaleTimeString()}] ${state}`);
    }
    if (state === "JOB_STATE_SUCCEEDED") break;
    if (state === "JOB_STATE_FAILED" || state === "JOB_STATE_CANCELLED") {
      console.error(`Job ${state}:`, JSON.stringify(job.error));
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 15000));
    attempts++;
  }
  if (!job || job.state !== "JOB_STATE_SUCCEEDED") {
    console.error("Polling timed out.");
    process.exit(1);
  }

  // Output prefix ni topish
  const outputUri = job.outputConfig?.gcsDestination?.outputUriPrefix;
  const outputInfoPrefix = job.outputInfo?.gcsOutputDirectory;
  const prefix = (outputInfoPrefix || outputUri || "").replace(`gs://${BUCKET}/`, "");
  console.log(`Output prefix: ${prefix}`);

  await new Promise((r) => setTimeout(r, 5000));

  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);
  const [files] = await bucket.getFiles({ prefix });
  const predFile =
    files.find((f) => f.name.endsWith("predictions.jsonl")) ||
    files.find((f) => f.name.includes("predictions"));
  if (!predFile) {
    console.error(`predictions.jsonl topilmadi. Files:`, files.map((f) => f.name));
    process.exit(1);
  }
  console.log(`Downloading: ${predFile.name}`);

  const [content] = await predFile.download();
  const outLines = content.toString().split("\n").filter((l) => l.trim());
  console.log(`${outLines.length} ta natija, DB ga yozilyapti...`);

  let saved = 0;
  for (const line of outLines) {
    try {
      const parsed = JSON.parse(line);
      const rawText =
        parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        parsed.response?.text || "";
      if (!rawText) continue;

      const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
      const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const m2 = reqText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const audioId = (m1 && m1[1]) || (m2 && m2[1]) || null;
      if (!audioId) continue;

      const audio = await prisma.audioFile.findUnique({
        where: { id: audioId },
        select: { transcription: true },
      });

      let result;
      try {
        result = applyAnalysisFallbacks(rawText, audio?.transcription || "");
      } catch (e) {
        console.error(`[parse] ${audioId}: ${e.message?.substring(0, 80)}`);
        continue;
      }

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
        voiceOfCustomer: result.voiceOfCustomer ? JSON.parse(JSON.stringify(result.voiceOfCustomer)) : null,
        intentSignals: result.intentSignals ? JSON.parse(JSON.stringify(result.intentSignals)) : null,
        clientProfile: result.clientProfile ? JSON.parse(JSON.stringify(result.clientProfile)) : null,
      };

      await prisma.analysis.upsert({
        where: { audioFileId: audioId },
        create: { audioFileId: audioId, ...data },
        update: data,
      });
      await prisma.audioFile.update({
        where: { id: audioId },
        data: { status: "done" },
      });

      try {
        const { aggregateClientFromAnalysis } = require("../src/services/client-profiler");
        await aggregateClientFromAnalysis(audioId);
      } catch {}

      saved++;
      if (saved % 10 === 0) process.stdout.write(`${saved} `);
    } catch (e) {
      console.error(`[parse]`, e.message?.substring(0, 80));
    }
  }

  console.log(`\nYakun: ${saved}/${outLines.length} ✅`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("Xato:", e);
  process.exit(1);
});
