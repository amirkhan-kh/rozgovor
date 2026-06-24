// Recovery: Vertex Pro batch tugashini kutib, predictions'ni DB'ga yozadi
require("dotenv").config({ path: "/var/www/prosales-backend/.env" });
process.env.GOOGLE_APPLICATION_CREDENTIALS = "/var/www/prosales-backend/credentials/big-quanta-469517-h6-55280c39d520.json";

const { Storage } = require("/var/www/prosales-backend/node_modules/@google-cloud/storage");
const { JobServiceClient } = require("/var/www/prosales-backend/node_modules/@google-cloud/aiplatform");
const { PrismaClient, Prisma } = require("/var/www/prosales-backend/node_modules/@prisma/client");
const { applyAnalysisFallbacks } = require("/var/www/prosales-backend/dist/services/call-analyzer");

const prisma = new PrismaClient();

const PROJECT_ID = "big-quanta-469517-h6";
const LOCATION = "us-central1";
const BUCKET = "big-quanta-469517-h6-salesai-stt";
const JOB_NAME = `projects/${PROJECT_ID}/locations/${LOCATION}/batchPredictionJobs/7442855050369564672`;

(async () => {
  const jobClient = new JobServiceClient({ apiEndpoint: `${LOCATION}-aiplatform.googleapis.com` });
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);

  // 1. Poll until done
  console.log("→ Vertex Pro batch'ni kutmoqdaman:", JOB_NAME);
  let job, attempts = 0;
  while (true) {
    [job] = await jobClient.getBatchPredictionJob({ name: JOB_NAME });
    const stats = job.completionStats || {};
    if (attempts % 4 === 0) {
      console.log(`  ${new Date().toISOString()} ${job.state} | succ=${stats.successfulCount} incomplete=${stats.incompleteCount}`);
    }
    if (job.state === "JOB_STATE_SUCCEEDED") break;
    if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") {
      console.error("Job failed:", job.error);
      process.exit(1);
    }
    attempts++;
    await new Promise(r => setTimeout(r, 30000));
  }

  console.log("✓ Job succeeded! Predictions yuklamoqdaman...");
  const outputUri = job.outputInfo?.gcsOutputDirectory;
  console.log("Output:", outputUri);

  if (!outputUri) {
    console.error("No outputInfo.gcsOutputDirectory");
    process.exit(1);
  }
  // outputUri = gs://bucket/prefix
  const prefix = outputUri.replace(`gs://${BUCKET}/`, "");
  const [files] = await bucket.getFiles({ prefix });
  const predFile = files.find(f => f.name.endsWith("predictions.jsonl")) || files.find(f => f.name.includes("predictions"));
  if (!predFile) {
    console.error("Predictions fayli topilmadi. Files:", files.map(f => f.name).join(", "));
    process.exit(1);
  }

  const [content] = await predFile.download();
  const lines = content.toString().split("\n").filter(l => l.trim());
  console.log(`${lines.length} prediction satrini ishlamoqdaman...`);

  let saved = 0, failed = 0;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      const rawText = parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text || parsed.response?.text || "";
      const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
      const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const m2 = reqText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const audioId = (m1 && m1[1]) || (m2 && m2[1]) || null;
      if (!audioId || !rawText) { failed++; continue; }

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
      await prisma.audioFile.update({ where: { id: audioId }, data: { status: "done" } });
      saved++;
      if (saved % 20 === 0) console.log(`  saved ${saved}/${lines.length}`);
    } catch (e) {
      console.error("parse fail:", e.message?.slice(0, 80));
      failed++;
    }
  }

  console.log(`\n✓ Tugadi: saved=${saved}, failed=${failed}`);
  await prisma.$disconnect();
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
