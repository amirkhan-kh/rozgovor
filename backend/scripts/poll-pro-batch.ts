// Vertex AI Pro batch job'ini kuzatib, tayyor bo'lgach predictions'ni
// DB ga yozadi. runStage3_ProBatch dastlabki yuborishda `running` flag
// sozlanmagani uchun polling birdan tugab qoladi — shu skript uni
// to'g'ri kuzatadi.
//
// Ishlatish:
//   DATABASE_URL=... GOOGLE_APPLICATION_CREDENTIALS=... \
//   npx ts-node scripts/poll-pro-batch.ts <jobName> <outputPrefix>
//
// Yoki argumentsiz — so'nggi submitted job nomi va output prefix kodda.

import * as dotenv from "dotenv";
dotenv.config();

import { JobServiceClient } from "@google-cloud/aiplatform";
import { Storage } from "@google-cloud/storage";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/utils/prisma";
import { applyAnalysisFallbacks } from "../src/services/call-analyzer";

const BUCKET =
  process.env.VEO_GCS_BUCKET || "big-quanta-469517-h6-salesai-stt";
const LOCATION = process.env.VERTEX_LOCATION || "us-central1";

async function main() {
  const jobName =
    process.argv[2] ||
    "projects/869888426422/locations/us-central1/batchPredictionJobs/4957570231674339328";

  console.log(`[poll] Job: ${jobName}`);

  const jobClient = new JobServiceClient({
    apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
  });

  let terminalState: string | null = null;
  let outputUriPrefix: string | null = null;

  const MAX_MINUTES = 120;
  const DELAY_MS = 20_000;
  const start = Date.now();

  while ((Date.now() - start) / 60000 < MAX_MINUTES) {
    const [job] = await jobClient.getBatchPredictionJob({ name: jobName });
    const state = String(job.state);
    const elapsed = Math.round((Date.now() - start) / 1000);
    console.log(`[poll ${elapsed}s] ${state}`);

    outputUriPrefix =
      job.outputConfig?.gcsDestination?.outputUriPrefix || outputUriPrefix;

    if (state === "JOB_STATE_SUCCEEDED") {
      terminalState = state;
      break;
    }
    if (
      state === "JOB_STATE_FAILED" ||
      state === "JOB_STATE_CANCELLED" ||
      state === "JOB_STATE_EXPIRED"
    ) {
      console.error(`[poll] Terminal: ${state}`, job.error);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  if (terminalState !== "JOB_STATE_SUCCEEDED") {
    console.error("[poll] Timeout — job davom etyapti, keyinroq qayta urining.");
    process.exit(1);
  }

  if (!outputUriPrefix) {
    console.error("[poll] outputUriPrefix topilmadi");
    process.exit(1);
  }

  console.log(`[poll] Succeeded. Output: ${outputUriPrefix}`);

  // Download predictions
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);

  // outputUriPrefix format: gs://BUCKET/prefix/
  const prefix = outputUriPrefix.replace(`gs://${BUCKET}/`, "").replace(/\/$/, "");
  const [files] = await bucket.getFiles({ prefix });
  const predFile =
    files.find((f) => f.name.endsWith("predictions.jsonl")) ||
    files.find((f) => f.name.includes("predictions"));

  if (!predFile) {
    console.error(
      `[poll] Predictions file topilmadi. Files: ${files.map((f) => f.name).join(", ")}`
    );
    process.exit(1);
  }

  console.log(`[poll] Predictions: ${predFile.name}`);
  const [content] = await predFile.download();
  const outLines = content.toString().split("\n").filter((l) => l.trim());

  console.log(`[poll] ${outLines.length} predictions`);

  let saved = 0;
  let skipped = 0;
  let errors = 0;

  for (const line of outLines) {
    try {
      const parsed = JSON.parse(line);
      const rawText =
        parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        parsed.response?.text ||
        "";
      if (!rawText) {
        skipped++;
        continue;
      }

      const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
      const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const m2 = reqText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const audioId = (m1 && m1[1]) || (m2 && m2[1]) || null;
      if (!audioId) {
        skipped++;
        continue;
      }

      const audio = await prisma.audioFile.findUnique({
        where: { id: audioId },
        select: { transcription: true },
      });

      let result;
      try {
        result = applyAnalysisFallbacks(rawText, audio?.transcription || "");
      } catch (e) {
        errors++;
        console.error(`[parse err] ${audioId}: ${(e as Error).message?.slice(0, 80)}`);
        continue;
      }

      const fu = result.followupSignal;
      let followupDeadline: Date | null = null;
      if (fu?.requiresFollowup && fu.suggestedDeadlineDays > 0) {
        followupDeadline = new Date();
        followupDeadline.setDate(followupDeadline.getDate() + fu.suggestedDeadlineDays);
      }

      const data = {
        summary: result.summary,
        overallScore: result.overallScore,
        leadQuality: result.leadQuality,
        leadScore: result.leadScore,
        criteria: JSON.parse(JSON.stringify(result.criteria || {})) as any,
        errors: JSON.parse(JSON.stringify(result.errors || [])) as any,
        winPoints: JSON.parse(JSON.stringify(result.winPoints || [])) as any,
        lossPoints: JSON.parse(JSON.stringify(result.lossPoints || [])) as any,
        objections: JSON.parse(
          JSON.stringify(result.objectionsList || [])
        ) as any,
        managerSpeech: result.managerSpeechPercent || 50,
        clientSpeech: result.clientSpeechPercent || 50,
        coachingInsights: JSON.parse(
          JSON.stringify(result.coachingInsights || {})
        ) as any,
        requiresFollowup: fu?.requiresFollowup || false,
        followupReason: fu?.followupReason || null,
        followupPhrase: fu?.followupPhrase || null,
        followupDeadline,
        followupCompleted: false,
        promises: result.promises
          ? (JSON.parse(JSON.stringify(result.promises)) as any)
          : null,
        qualification: result.qualification
          ? (JSON.parse(JSON.stringify(result.qualification)) as any)
          : null,
        callStructure: result.callStructure
          ? (JSON.parse(JSON.stringify(result.callStructure)) as any)
          : null,
        questionsData: result.questions
          ? (JSON.parse(JSON.stringify(result.questions)) as any)
          : null,
        closeAttempts: result.closeAttempts
          ? (JSON.parse(JSON.stringify(result.closeAttempts)) as any)
          : null,
        voiceOfCustomer: Prisma.JsonNull,
        clientProfile: (result as any).clientProfile
          ? (JSON.parse(JSON.stringify((result as any).clientProfile)) as any)
          : null,
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
      saved++;
    } catch (err) {
      errors++;
      console.error(`[line err]`, (err as Error).message?.slice(0, 80));
    }
  }

  console.log(`\n[DONE] saved=${saved} skipped=${skipped} errors=${errors}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
