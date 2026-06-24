/**
 * Custdev Interview BATCH Analysis — Gemini 2.5 Pro batch prediction
 *
 * Workflow:
 *   1. `status="processing" AND transcription IS NOT NULL` — PHASE 2 ga tayyor intervyularni topish
 *   2. Har intervyu uchun Gemini Pro prompti yaratish (savol-javob ajratish + aiSummary)
 *   3. JSONL GCS'ga upload → createBatchPredictionJob
 *   4. Job tugashini poll qilish (max 4 soat)
 *   5. predictions.jsonl'ni parse qilib, CustdevAnswer + aiSummary yozish
 *   6. Affected Custdev'lar uchun cross-interview aggregate summary ni yangilash
 *
 * Pattern: `batch-backfill.ts` dagi `runStage3_ProBatch`ga o'xshash — bir xil Vertex
 * bucket, endpoint, model, polling strategy.
 *
 * CLAUDE.md rule: AI tahlil FAQAT batch (Vertex AI batch prediction), online loop emas.
 */
import { Storage } from "@google-cloud/storage";
import { JobServiceClient } from "@google-cloud/aiplatform";
import { custdevPrisma as prisma } from "../utils/custdev-prisma";
import { safeParseJson } from "../utils/json-repair";
import { recomputeCustdevAggregateSummary } from "./custdev-processor";

const PROJECT_ID = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const LOCATION = process.env.VERTEX_LOCATION || "global";
const BUCKET = process.env.VERTEX_BUCKET || "big-quanta-469517-h6-salesai-stt";
const PRO_MODEL_PATH = "publishers/google/models/gemini-3-flash-preview";

// Bir vaqtda bitta batch ishlashi uchun lock
let isRunning = false;

export function isCustdevBatchRunning(): boolean {
  return isRunning;
}

interface InterviewMeta {
  id: string;
  custdevId: string;
  custdevTitle: string;
  custdevDescription: string | null;
  transcription: string;
  questions: Array<{ id: string; text: string }>;
}

const SYSTEM_INSTRUCTION = `Sen Customer Development (mijoz bilan chuqur intervyu) tahlil eksperti. MUHIM QOIDALAR:
1. Javob FAQAT toza JSON bo'lishi kerak — hech qanday kirish matni yo'q
2. Markdown fence (\`\`\`json) ishlatma — faqat { bilan boshla, } bilan tugat`;

function buildInterviewPrompt(iv: InterviewMeta): string {
  const questionsBlock = iv.questions
    .map((q, i) => `Q${i + 1} (id: ${q.id}): ${q.text}`)
    .join("\n");

  // [INTERVIEW_ID] marker — parser ishlatadi (batch-backfill.ts AUDIO_ID pattern ga o'xshash)
  return `[INTERVIEW_ID: ${iv.id}]

Vazifa: mijoz bilan o'tkazilgan intervyu transkriptidan har savolga mijozning aniq javobini ajratib olish va qisqa xulosa tayyorlash.

─── CUSTDEV LOYIHASI ───
Sarlavha: ${iv.custdevTitle}
${iv.custdevDescription ? `Tavsif: ${iv.custdevDescription}\n` : ""}
─── SAVOLLAR RO'YXATI ───
${questionsBlock}

─── TRANSKRIPT (Yandex STT v3 + Gemini Flash diarization, [MM:SS] Menejer/Mijoz: format) ───
${iv.transcription.substring(0, 50000)}
${iv.transcription.length > 50000 ? "\n... (transkript qisqartirildi)" : ""}

─── VAZIFA ───

1. **Javoblar** — har savol uchun FAQAT "Mijoz:" rolidagi matnni oling:
   - Menejer bergan savollarni transkriptdan o'qib, mijozning javobini topib oling
   - "Menejer:" gaplarini javob sifatida OLMANG — ular savollar yoki izohlar
   - Agar mijoz savolga bilvosita (yoki boshqa joyda) javob bergan bo'lsa — shu qismni olib, qisqa va aniq qayta yozing
   - Javob bo'lmagan savollar uchun \`answer: "(javob yo'q)"\` qo'ying
   - Timestamp — javob boshlangan soniya (MM:SS dan konvertatsiya qiling, 0 dan boshlanadi)
   - Javob matni qisqa, lekin mijoz fikri to'liq aks etgan bo'lsin (1-4 jumla)
   - Mijozni aynan o'z so'zlari bilan (lekin qisqartib) qaytaring

2. **aiSummary** — umumiy xulosa (2-4 jumla):
   - Mijoz asosiy og'riqlari, ehtiyojlari, afzalliklari
   - Qaysi savollarda ma'lumot to'liq olinmagan
   - Mahsulot/xizmatga munosabati

─── JAVOB FORMATI ───
FAQAT quyidagi JSON tuzilmasi, markdown yoki qo'shimcha matnsiz:

{
  "interviewId": "${iv.id}",
  "aiSummary": "...",
  "answers": [
    {
      "questionId": "<savol id>",
      "answer": "...",
      "timestamp": 42
    }
  ]
}

Har savol uchun aynan bitta javob obyekti bo'lsin. Savollar ketma-ketligi — yuqoridagidek.`;
}

interface ParsedResult {
  interviewId: string;
  aiSummary: string;
  answers: Array<{ questionId: string; answer: string; timestamp: number | null }>;
}

function parseOneResult(
  rawText: string,
  reqText: string,
  validQuestionIds: Set<string>,
): ParsedResult | null {
  // INTERVIEW_ID — response yoki request dan
  const m1 = rawText.match(/\[INTERVIEW_ID:\s*([a-z0-9]+)\]/i);
  const m2 = reqText.match(/\[INTERVIEW_ID:\s*([a-z0-9]+)\]/i);
  const parsed = safeParseJson<any>(rawText);
  const interviewId =
    (m1 && m1[1]) ||
    (m2 && m2[1]) ||
    (parsed?.interviewId as string | undefined) ||
    null;
  if (!interviewId) return null;
  if (!parsed) return null;

  const aiSummary =
    typeof parsed.aiSummary === "string" && parsed.aiSummary.trim()
      ? parsed.aiSummary.trim()
      : "Qisqacha xulosa yaratib bo'lmadi.";

  const answers: ParsedResult["answers"] = [];
  if (Array.isArray(parsed.answers)) {
    for (const item of parsed.answers) {
      if (!item || typeof item !== "object") continue;
      const qid = typeof item.questionId === "string" ? item.questionId : null;
      if (!qid || !validQuestionIds.has(qid)) continue;
      const answer =
        typeof item.answer === "string" && item.answer.trim()
          ? item.answer.trim()
          : "(javob yo'q)";
      const ts =
        typeof item.timestamp === "number" && item.timestamp >= 0
          ? Math.floor(item.timestamp)
          : null;
      answers.push({ questionId: qid, answer, timestamp: ts });
    }
  }

  return { interviewId, aiSummary, answers };
}

/**
 * Batch tahlil uchun tayyor intervyularni topadi:
 *   status === "processing" AND transcription IS NOT NULL
 *
 * options.companyId berilsa faqat shu kompaniyaniki, aks holda barcha kompaniyalar.
 */
async function findPendingInterviews(options: {
  companyId?: string;
  limit?: number;
}): Promise<InterviewMeta[]> {
  const rows = await prisma.custdevInterview.findMany({
    where: {
      status: "processing",
      transcription: { not: null },
      ...(options.companyId
        ? { custdev: { companyId: options.companyId } }
        : {}),
    },
    include: {
      custdev: {
        select: {
          id: true,
          title: true,
          description: true,
          questions: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  const result: InterviewMeta[] = [];
  for (const r of rows) {
    if (!r.transcription) continue;
    if (r.custdev.questions.length === 0) {
      // Savolsiz custdev — faqat transkripsiya bilan completed qilamiz (batch shart emas)
      await prisma.custdevInterview.update({
        where: { id: r.id },
        data: {
          status: "completed",
          aiSummary: "Savollar yo'q — faqat transkriptsiya yaratildi.",
        },
      });
      continue;
    }
    result.push({
      id: r.id,
      custdevId: r.custdev.id,
      custdevTitle: r.custdev.title,
      custdevDescription: r.custdev.description,
      transcription: r.transcription,
      questions: r.custdev.questions.map((q) => ({ id: q.id, text: q.text })),
    });
  }
  return result;
}

/**
 * Berilgan intervyularni Vertex AI batch prediction orqali tahlil qiladi.
 * Natijalarni DB ga yozadi va cross-interview aggregate summary ni yangilaydi.
 *
 * @returns Tahlil qilingan intervyular soni
 */
export async function runCustdevBatchAnalysis(options: {
  companyId?: string;
  limit?: number;
} = {}): Promise<number> {
  if (isRunning) {
    console.log("[custdev-batch] allaqachon ishlamoqda — skip");
    return 0;
  }
  isRunning = true;
  try {
    const interviews = await findPendingInterviews(options);
    if (interviews.length === 0) {
      console.log("[custdev-batch] tahlil uchun intervyu yo'q");
      return 0;
    }

    console.log(`[custdev-batch] ${interviews.length} intervyu topildi — batch tayyorlanmoqda`);

    // Vertex setup
    const storage = new Storage();
    const bucket = storage.bucket(BUCKET);
    const jobClient = new JobServiceClient({
      apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
    });

    // JSONL yaratish
    const requests = interviews.map((iv) => ({
      request: {
        contents: [
          { role: "user", parts: [{ text: buildInterviewPrompt(iv) }] },
        ],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 16384,
          responseMimeType: "application/json",
        },
      },
    }));

    const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
    const stamp = Date.now();
    const inputFile = `custdev-batch/input-${stamp}.jsonl`;
    const outputPrefix = `custdev-batch/output-${stamp}/`;

    await bucket.file(inputFile).save(jsonl);
    console.log(`[custdev-batch] JSONL upload: gs://${BUCKET}/${inputFile}`);

    const [createdJob] = await jobClient.createBatchPredictionJob({
      parent: `projects/${PROJECT_ID}/locations/${LOCATION}`,
      batchPredictionJob: {
        displayName: `custdev-batch-${stamp}`,
        model: PRO_MODEL_PATH,
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
    console.log(`[custdev-batch] Job: ${createdJob.name}`);

    // Poll — max 4 soat
    const MAX_ATTEMPTS = 960; // 960 * 15s = 4 soat
    let attempts = 0;
    let succeeded = false;
    while (attempts < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 15000));
      const [job] = await jobClient.getBatchPredictionJob({
        name: createdJob.name,
      });
      if (attempts % 4 === 0) console.log(`[custdev-batch] state: ${job.state}`);
      if (job.state === "JOB_STATE_SUCCEEDED") {
        succeeded = true;
        break;
      }
      if (
        job.state === "JOB_STATE_FAILED" ||
        job.state === "JOB_STATE_CANCELLED"
      ) {
        throw new Error(`Custdev batch failed: ${JSON.stringify(job.error)}`);
      }
      attempts++;
    }
    if (!succeeded) {
      throw new Error(
        `Custdev batch polling timed out. Job: ${createdJob.name}`
      );
    }

    // predictions.jsonl yuklanmagunicha kutamiz
    await new Promise((r) => setTimeout(r, 5000));

    const [files] = await bucket.getFiles({ prefix: outputPrefix });
    const predFile =
      files.find((f) => f.name.endsWith("predictions.jsonl")) ||
      files.find((f) => f.name.includes("predictions"));
    if (!predFile) {
      throw new Error(
        `Custdev predictions not found under ${outputPrefix}. Files: ${files
          .map((f) => f.name)
          .join(", ")}`
      );
    }

    const [content] = await predFile.download();
    const outLines = content
      .toString()
      .split("\n")
      .filter((l) => l.trim());

    // interviewId → InterviewMeta
    const byId = new Map(interviews.map((iv) => [iv.id, iv]));
    const affectedCustdevIds = new Set<string>();
    let saved = 0;
    let failed = 0;

    for (const line of outLines) {
      let parsed: any;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }
      const rawText =
        parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        parsed.response?.text ||
        "";
      const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
      if (!rawText) continue;

      // Interview ID ni topish uchun avval req dan (response eng ishonchli)
      const midHint =
        rawText.match(/\[INTERVIEW_ID:\s*([a-z0-9]+)\]/i)?.[1] ||
        reqText.match(/\[INTERVIEW_ID:\s*([a-z0-9]+)\]/i)?.[1];
      const meta = midHint ? byId.get(midHint) : undefined;
      if (!meta) {
        console.error(
          `[custdev-batch] noma'lum interviewId, line: ${line.substring(0, 120)}`
        );
        continue;
      }

      const validQids = new Set(meta.questions.map((q) => q.id));
      const result = parseOneResult(rawText, reqText, validQids);
      if (!result) {
        failed++;
        try {
          await prisma.custdevInterview.update({
            where: { id: meta.id },
            data: {
              status: "failed",
              errorMessage: "Batch javobini parse qilishda xato",
            },
          });
        } catch {}
        continue;
      }

      // Savollarga mos keluvchi placeholder'lar + deduplicate (Gemini bir savol uchun
      // bir nechta javob qaytarishi mumkin — birinchi javobni olib, qolganini tashlaymiz)
      const dedupMap = new Map<string, typeof result.answers[number]>();
      for (const a of result.answers) {
        if (!dedupMap.has(a.questionId)) dedupMap.set(a.questionId, a);
      }
      for (const q of meta.questions) {
        if (!dedupMap.has(q.id)) {
          dedupMap.set(q.id, {
            questionId: q.id,
            answer: "(javob yo'q)",
            timestamp: null,
          });
        }
      }
      result.answers = Array.from(dedupMap.values());

      try {
        await prisma.$transaction(async (tx) => {
          await tx.custdevAnswer.deleteMany({ where: { interviewId: meta.id } });
          if (result.answers.length > 0) {
            await tx.custdevAnswer.createMany({
              data: result.answers.map((a) => ({
                interviewId: meta.id,
                questionId: a.questionId,
                answer: a.answer,
                timestamp: a.timestamp,
              })),
            });
          }
          await tx.custdevInterview.update({
            where: { id: meta.id },
            data: {
              aiSummary: result.aiSummary,
              status: "completed",
              errorMessage: null,
            },
          });
        });
        affectedCustdevIds.add(meta.custdevId);
        saved++;
      } catch (err) {
        failed++;
        console.error(
          `[custdev-batch] ${meta.id} save error:`,
          (err as Error).message
        );
      }
    }

    console.log(
      `[custdev-batch] saved ${saved}/${interviews.length}, failed ${failed}`
    );

    // Cross-interview aggregate summary — har o'zgargan custdev uchun
    for (const cid of affectedCustdevIds) {
      try {
        await recomputeCustdevAggregateSummary(cid);
      } catch (err) {
        console.error(
          `[custdev-batch] aggregate summary xatosi ${cid}:`,
          (err as Error).message
        );
      }
    }

    return saved;
  } finally {
    isRunning = false;
  }
}
