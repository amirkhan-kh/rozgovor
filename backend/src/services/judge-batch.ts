/**
 * Stage 4: Sud Agent BATCH (Vertex AI batch prediction, Flash 3).
 *
 * Stage 3 (Pro batch analysis) tugagandan keyin chaqiriladi.
 * Past balli/shubhali tahlillar uchun BIR Vertex batch job yuborilib,
 * AI judge mijoz to'sqinligini menejer aybidan ajratadi.
 *
 * Pattern: Stage 2/3 bilan bir xil — GCS upload + createBatchPredictionJob + poll.
 */
import { Storage } from "@google-cloud/storage";
import { JobServiceClient } from "@google-cloud/aiplatform";
import { prisma } from "../utils/prisma";
import { safeParseJson } from "../utils/json-repair";
import { recordAudioCost } from "./cost-tracker";

const PROJECT_ID = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const BUCKET = process.env.GCS_BATCH_BUCKET || "salesai-vision-stt";

// Flash 3 (global). Stage 3 bilan bir xil endpoint.
const JUDGE_LOCATION = "global";
const JUDGE_API_ENDPOINT = "aiplatform.googleapis.com";
const JUDGE_MODEL = "publishers/google/models/gemini-3-flash-preview";

// Filter: qaysi tahlillar Stage 4 ga kiradi
function needsJudge(a: {
  overallScore: number | null;
  managerSpeech: number | null;
  clientSpeech: number | null;
  criteria: any;
  judgeOverridden?: boolean;
}): boolean {
  if (a.judgeOverridden) return false;
  if ((a.overallScore ?? 100) < 40) return true;
  if ((a.clientSpeech ?? 100) < 20) return true;
  if ((a.managerSpeech ?? 100) < 30) return true;
  if (a.criteria && typeof a.criteria === "object") {
    const scores = Object.values(a.criteria as Record<string, any>)
      .map((c: any) => Number(c?.score) || 0);
    if (scores.length > 0) {
      const lowRatio = scores.filter((s) => s < 30).length / scores.length;
      if (lowRatio > 0.5) return true;
    }
  }
  return false;
}

const SYSTEM_PROMPT = `Sen menejer reytingi adolatli bo'lishini ta'minlovchi Sud Agentsan.
Past balli sotuv qo'ng'iroqlarini tahlil qilib, bu menejer aybimi yoki mijoz to'sqinligimi hal qilasan.

QOIDALAR (mijoz to'sqinligi — SKIP qilish):
- early_rejection: Mijoz 1-2 daqiqada "kerak emas / qiziqmayman / qo'ng'iroq qilmang / yopaman" desa
- harassment: Mijoz so'kingan, agressiv, tahqirli
- wrong_number: Adashgan raqam, xato kompaniya
- transfer: Boshqa menejerga o'tkazilgan
- cold_lead: Mijoz mutlaqo qiziqmagan, sovuq
- language: Til muammosi (boshqa tilda)
- short_call: Audio juda qisqa, dialog bo'lmagan

QOIDALAR (BAHOLASH — DON'T skip):
- manager_fault: Menejer o'zi yomon ishlagan (savol bermagan, bosim yo'q, taqdimot zaif)
- normal: Oddiy past sotuv qo'ng'irog'i, lekin imkoniyat bor edi

OUTPUT — FAQAT toza JSON, hech qanday matnsiz:
{"audioId":"<beriladigan id>","isClientObstruction":true|false,"category":"early_rejection|harassment|wrong_number|transfer|cold_lead|language|short_call|manager_fault|normal","reason":"qisqa izoh (1 jumla)"}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    audioId: { type: "string" },
    isClientObstruction: { type: "boolean" },
    category: {
      type: "string",
      enum: [
        "early_rejection",
        "harassment",
        "wrong_number",
        "transfer",
        "cold_lead",
        "language",
        "short_call",
        "manager_fault",
        "normal",
      ],
    },
    reason: { type: "string" },
  },
  required: ["audioId", "isClientObstruction", "category", "reason"],
};

interface JudgeCandidate {
  audioFileId: string;
  transcription: string;
  summary: string | null;
  overallScore: number | null;
  managerSpeech: number | null;
  clientSpeech: number | null;
  criteria: any;
}

function buildUserMessage(c: JudgeCandidate): string {
  const criteriaText = c.criteria && typeof c.criteria === "object"
    ? Object.entries(c.criteria as Record<string, any>)
        .map(([k, v]: [string, any]) => `- ${k}: ${v?.score ?? "-"}/100`)
        .join("\n")
    : "(yo'q)";
  return `[AUDIO_ID: ${c.audioFileId}]

=== ANALYSIS NATIJASI ===
Umumiy ball: ${c.overallScore ?? "?"}/100
Menejer gap: ${c.managerSpeech ?? "?"}%
Mijoz gap: ${c.clientSpeech ?? "?"}%

Mezonlar:
${criteriaText}

AI xulosa: ${c.summary || "(yo'q)"}

=== TRANSKRIPSIYA ===
${(c.transcription || "").slice(0, 8000)}`;
}

/**
 * Stage 4 — Vertex AI batch prediction (Flash 3, global).
 */
export async function runStage4_JudgeBatch(
  audioIds: string[],
  companyId: string,
): Promise<void> {
  if (audioIds.length === 0) return;

  // Filter: faqat needsJudge'ga mos analizlar
  const candidates = await prisma.analysis.findMany({
    where: { audioFileId: { in: audioIds } },
    select: {
      audioFileId: true,
      overallScore: true,
      managerSpeech: true,
      clientSpeech: true,
      criteria: true,
      summary: true,
      judgeOverridden: true,
      audioFile: { select: { transcription: true } },
    },
  });

  const filtered: JudgeCandidate[] = candidates
    .filter((a) =>
      needsJudge({
        overallScore: a.overallScore,
        managerSpeech: a.managerSpeech,
        clientSpeech: a.clientSpeech,
        criteria: a.criteria,
        judgeOverridden: a.judgeOverridden ?? false,
      }),
    )
    .map((a) => ({
      audioFileId: a.audioFileId,
      transcription: a.audioFile?.transcription || "",
      summary: a.summary ?? null,
      overallScore: a.overallScore ?? null,
      managerSpeech: a.managerSpeech ?? null,
      clientSpeech: a.clientSpeech ?? null,
      criteria: a.criteria as any,
    }));

  console.log(`[Stage 4] Sud Agent batch: ${filtered.length}/${candidates.length} candidates`);
  if (filtered.length === 0) return;

  // Build JSONL — Vertex batch prediction requests
  const requests = filtered.map((c) => ({
    request: {
      contents: [{ role: "user", parts: [{ text: buildUserMessage(c) }] }],
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    },
  }));

  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);
  const ts = Date.now();
  const inputFile = `judge-batch/judge-input-${ts}.jsonl`;
  const outputPrefix = `judge-batch/judge-output-${ts}/`;

  const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
  await bucket.file(inputFile).save(jsonl);
  console.log(`[Stage 4] ${requests.length} requests uploaded → gs://${BUCKET}/${inputFile}`);

  const jobClient = new JobServiceClient({ apiEndpoint: JUDGE_API_ENDPOINT });

  const [createdJob] = await jobClient.createBatchPredictionJob({
    parent: `projects/${PROJECT_ID}/locations/${JUDGE_LOCATION}`,
    batchPredictionJob: {
      displayName: `judge-flash3-${companyId}-${ts}`,
      model: JUDGE_MODEL,
      inputConfig: {
        instancesFormat: "jsonl",
        gcsSource: { uris: [`gs://${BUCKET}/${inputFile}`] },
      },
      outputConfig: {
        predictionsFormat: "jsonl",
        gcsDestination: { outputUriPrefix: `gs://${BUCKET}/${outputPrefix}` },
      },
    },
  });

  console.log(`[Stage 4] Job: ${createdJob.name}`);

  // Poll — up to 60 min
  const MAX_ATTEMPTS = 240; // 240 * 15s = 60 min
  let attempts = 0;
  let succeeded = false;
  while (attempts < MAX_ATTEMPTS) {
    await new Promise((r) => setTimeout(r, 15000));
    const [job] = await jobClient.getBatchPredictionJob({ name: createdJob.name });
    if (attempts % 4 === 0) console.log(`[Stage 4] ${job.state}`);
    if (job.state === "JOB_STATE_SUCCEEDED") { succeeded = true; break; }
    if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") {
      console.error(`[Stage 4] Judge batch failed: ${JSON.stringify(job.error)}`);
      return;
    }
    attempts++;
  }
  if (!succeeded) {
    console.error(`[Stage 4] Polling timed out. Job: ${createdJob.name}`);
    return;
  }

  await new Promise((r) => setTimeout(r, 5000));

  const [files] = await bucket.getFiles({ prefix: outputPrefix });
  const predFile =
    files.find((f) => f.name.endsWith("predictions.jsonl")) ||
    files.find((f) => f.name.includes("predictions"));
  if (!predFile) {
    console.error(`[Stage 4] predictions yo'q: ${outputPrefix}`);
    return;
  }

  const [content] = await predFile.download();
  const outLines = content.toString().split("\n").filter((l) => l.trim());

  let saved = 0;
  let skipped = 0;

  for (let lineIdx = 0; lineIdx < outLines.length; lineIdx++) {
    const line = outLines[lineIdx];
    try {
      const parsed = JSON.parse(line);
      const rawText =
        parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        parsed.response?.text ||
        "";
      if (!rawText) continue;

      const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
      const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const m2 = reqText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const fallbackParsed = safeParseJson<any>(rawText);
      const audioId =
        (m1 && m1[1]) ||
        (m2 && m2[1]) ||
        fallbackParsed?.audioId ||
        filtered[lineIdx]?.audioFileId ||
        null;
      if (!audioId) continue;

      // Cost tracking
      const usage = parsed.response?.usageMetadata;
      const inTok = usage?.promptTokenCount || 0;
      const outTok = usage?.candidatesTokenCount || 0;
      if (inTok > 0 || outTok > 0) {
        void recordAudioCost({
          audioFileId: audioId,
          companyId,
          pro: { mode: "batch", inputTokens: inTok, outputTokens: outTok },
        });
      }

      const result = safeParseJson<{
        isClientObstruction?: boolean;
        category?: string;
        reason?: string;
      }>(rawText);
      if (!result || typeof result.isClientObstruction !== "boolean") continue;

      // Admin override qilgan bo'lsa, tegmaymiz
      const existing = await prisma.analysis.findUnique({
        where: { audioFileId: audioId },
        select: { judgeOverridden: true },
      });
      if (existing?.judgeOverridden) continue;

      if (result.isClientObstruction) {
        await prisma.analysis.update({
          where: { audioFileId: audioId },
          data: {
            judgeSkipped: true,
            judgeReason: `[Sud Agent: ${result.category || "unknown"}] ${(result.reason || "").slice(0, 240)}`,
          },
        });
        skipped++;
      } else {
        await prisma.analysis.update({
          where: { audioFileId: audioId },
          data: {
            judgeSkipped: false,
            judgeReason: null,
          },
        });
      }
      saved++;
    } catch (e) {
      console.error(`[Stage 4 parse] ${(e as Error).message?.slice(0, 100)}`);
    }
  }

  console.log(`[Stage 4] Sud Agent: ${saved}/${outLines.length} processed, ${skipped} skipped (client obstruction)`);
}
