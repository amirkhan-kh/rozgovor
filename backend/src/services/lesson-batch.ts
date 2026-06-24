/**
 * Lesson BATCH pipeline — PHASE 2
 *
 * Pass 1 — Yandex STT poll:
 *   - `Lesson.status="processing" AND sttOperationId IS NOT NULL AND transcription IS NULL`
 *   - Har operatsiyani poll qiladi; tayyor bo'lganini transcriptionga saqlaydi.
 *   - Tayyor bo'lgan darsliklar ikkinchi pass uchun tayyor (transcription not null).
 *
 * Pass 2 — Gemini 2.5 Flash batch prediction:
 *   - `Lesson.status="processing" AND transcription IS NOT NULL AND testQuestions IS NULL`
 *   - Bitta Vertex AI batch job ichida hamma darsliklar uchun test + AI prompt generatsiya.
 *   - Natija DB'ga yoziladi, status = "ready".
 *
 * Pattern `custdev-batch.ts` dan olindi — bir xil JobServiceClient, polling strategy,
 * [LESSON_ID] marker.
 *
 * CLAUDE.md: "reanalyze/backfill faqat Vertex AI batch, online loop taqiq".
 */
import { Storage } from "@google-cloud/storage";
import { JobServiceClient } from "@google-cloud/aiplatform";
import * as https from "https";
import { prisma } from "../utils/prisma";
import { safeParseJson } from "../utils/json-repair";
import {
  targetQuestionCount,
  type TestQuestion,
  type FlashResult,
} from "./lesson-processor";
import type { SttWord, SttLine } from "./yandex-stt";

const PROJECT_ID = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const LOCATION = process.env.VERTEX_LOCATION || "global";
const BUCKET = process.env.VERTEX_BUCKET || "big-quanta-469517-h6-salesai-stt";
const FLASH_MODEL_PATH = "publishers/google/models/gemini-3-flash-preview";

const YANDEX_API_KEY =
  process.env.YANDEX_API_KEY || "AQVNzJY66YR6RQ9jA1UZW-uYbgaMCtrk8OpcR-4m";

// Overlap oldini olish uchun lock (custdev-batch bilan bir xil pattern)
let isRunning = false;

export function isLessonBatchRunning(): boolean {
  return isRunning;
}

// ─── Yandex deferred STT — operation poll ────────────────────────────────
// NOT qiladi — bitta request, tayyor bo'lmasa kutmaydi (background cron
// keyingi yugurishda yana urinishadi).
async function checkDeferredSTT(
  operationId: string
): Promise<{ done: boolean; words?: SttWord[]; error?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "operation.api.cloud.yandex.net",
        path: `/operations/${operationId}`,
        method: "GET",
        headers: { Authorization: `Api-Key ${YANDEX_API_KEY}` },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          let result: any;
          try {
            result = JSON.parse(data);
          } catch {
            resolve({ done: false });
            return;
          }
          if (!result.done) {
            resolve({ done: false });
            return;
          }
          if (result.error) {
            resolve({
              done: true,
              error:
                result.error.message ||
                JSON.stringify(result.error).substring(0, 200),
            });
            return;
          }
          const words: SttWord[] = [];
          const chunks = result.response?.chunks || [];
          for (const chunk of chunks) {
            for (const alt of chunk.alternatives || []) {
              for (const w of alt.words || []) {
                // Yandex v2 `startTime`/`endTime` — "12.340s" formatda
                const parseTs = (t: string): number => {
                  if (!t) return 0;
                  const v = parseFloat(t.replace("s", ""));
                  return isFinite(v) ? Math.round(v * 1000) : 0;
                };
                words.push({
                  word: w.word || "",
                  startMs: parseTs(w.startTime),
                  endMs: parseTs(w.endTime),
                });
              }
            }
          }
          resolve({ done: true, words });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function wordsToLines(words: SttWord[]): SttLine[] {
  const lines: SttLine[] = [];
  let current = { start: 0, text: "" };
  for (const w of words) {
    const startSec = w.startMs / 1000;
    if (!current.text) current.start = startSec;
    current.text += (current.text ? " " : "") + w.word;
    if (w.word.match(/[.!?]$/) || current.text.split(" ").length > 25) {
      lines.push({ ...current });
      current = { start: 0, text: "" };
    }
  }
  if (current.text) lines.push(current);
  return lines;
}

function wordsToPlainText(words: SttWord[]): string {
  return words.map((w) => w.word).join(" ");
}

/**
 * Pass 1 — har "processing + sttOperationId + transcription=NULL" darslik uchun
 * Yandex operation'ni tekshiradi. Tayyor bo'lganlarni DB'ga yozadi.
 *
 * @returns Shu yugurishda yangi yozilgan (ready STT) darsliklar soni
 */
async function pollPendingStt(): Promise<number> {
  const pending = await prisma.lesson.findMany({
    where: {
      status: "processing",
      sttOperationId: { not: null },
      transcription: null,
    },
    select: {
      id: true,
      title: true,
      sttOperationId: true,
    },
  });

  if (pending.length === 0) {
    return 0;
  }

  console.log(`[lesson-batch] STT poll: ${pending.length} darslik tekshirilmoqda`);

  let completed = 0;
  for (const lesson of pending) {
    if (!lesson.sttOperationId) continue;
    try {
      const res = await checkDeferredSTT(lesson.sttOperationId);
      if (!res.done) {
        // Hali tugamagan — keyingi cron yugurishida yana tekshiriladi
        continue;
      }
      if (res.error) {
        console.error(
          `[lesson-batch] STT error ${lesson.id}: ${res.error.substring(0, 120)}`
        );
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            status: "failed",
            processingError: `Yandex STT xato: ${res.error.substring(0, 300)}`,
          },
        });
        continue;
      }

      const words = res.words || [];
      if (words.length === 0) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            status: "failed",
            processingError:
              "STT bo'sh natija qaytardi (ovoz yo'q yoki noto'g'ri format)",
          },
        });
        continue;
      }

      const lastWord = words[words.length - 1];
      const actualDuration = Math.ceil(lastWord.endMs / 1000);
      const plainText = wordsToPlainText(words);

      await prisma.lesson.update({
        where: { id: lesson.id },
        data: {
          transcription: plainText,
          transcriptionJson: words as any,
          videoDurationSec: actualDuration,
          status: "processing", // Flash batch kutmoqda
          processingError: null,
        },
      });
      completed++;
      console.log(
        `[lesson-batch] STT ready ${lesson.id}: ${words.length} so'z, ${actualDuration}s`
      );
    } catch (err) {
      console.error(
        `[lesson-batch] STT poll ${lesson.id} failed:`,
        (err as Error).message?.substring(0, 120)
      );
    }
  }

  return completed;
}

// ─── Pass 2: Gemini Flash batch — test + AI prompt + key topics ─────────

interface LessonMeta {
  id: string;
  title: string;
  description: string | null;
  transcription: string;
  words: SttWord[];
  durationSec: number;
}

const SYSTEM_INSTRUCTION = `Sen kompaniya ichki o'quv darsining sifatini tekshiruvchi AI ekspertsan. MUHIM QOIDALAR:
1. Javob FAQAT toza JSON bo'lishi kerak — hech qanday kirish matni yo'q
2. Markdown fence (\`\`\`json) ishlatma — faqat { bilan boshla, } bilan tugat`;

function buildLessonPrompt(l: LessonMeta): string {
  const qCount = targetQuestionCount(l.durationSec);
  const lines = wordsToLines(l.words);
  const transcript = lines
    .map((ln) => {
      const mins = Math.floor(ln.start / 60);
      const secs = Math.floor(ln.start % 60);
      const ts = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      return `[${ts}] ${ln.text}`;
    })
    .join("\n");

  // [LESSON_ID] marker — parser ishlatadi (custdev-batch'dagi INTERVIEW_ID pattern)
  return `[LESSON_ID: ${l.id}]

Vazifa: quyidagi video dars transkripti bo'yicha menejerlarni tekshirish uchun
test savollar va AI suhbat tayyorlash.

─── DARSLIK HAQIDA ───
Sarlavha: ${l.title}
Tavsif: ${l.description || "(yo'q)"}
Davomiyligi: ${Math.floor(l.durationSec / 60)} daqiqa

─── TRANSKRIPT (so'z-darajali Yandex STT, [MM:SS] timestamp bilan) ───
${transcript.substring(0, 40000)}
${transcript.length > 40000 ? "\n... (transkript qisqartirildi)" : ""}

─── VAZIFA ───

1. **Testlar** — ${qCount} ta ko'p variantli (4 variant) savol tuzing:
   - Savollar DARS MAVZUSI bo'yicha, faqat transkriptda aytilgan narsalarga asosan
   - "Umumiy" savollardan qoching — aniq, amaliy holatlar
   - Har savolda 4 ta variant: 1 ta to'g'ri, 3 ta noto'g'ri, lekin ishonarli
   - \`correctIdx\` 0-3 oralig'ida
   - \`explanation\` — nima uchun to'g'ri, darsning qaysi joyidan olingan
   - \`topicTimestamp\` — shu mavzu transkriptda qayerda ko'rsatilgan (soniyalarda)
   - Savollar KETMA-KETLIK bo'yicha turli mavzularga tegishli bo'lsin
   - YODLASH emas, TUSHUNISH ni tekshiring (nima qilinadi, qachon, nega)

2. **aiSystemPrompt** — manager bilan AI suhbat uchun sistema prompti:
   - O'zbek tilida, instruktor ovozida
   - 3-8 ta chuqurlashuvchi savol bersin (dars mavzulariga qarab)
   - Har javobdan keyin tushunish darajasini ichida baholasin
   - Yetarlicha ma'lumot olgandan keyin "\\n[END_CONVERSATION]" belgisini qo'yib chiqsin
   - Managerga do'stona, ragbatlantiruvchi ohangda

3. **aiKeyTopics** — darsning 3-8 ta asosiy mavzulari (qisqa iboralar)

─── JAVOB FORMATI ───
FAQAT quyidagi JSON tuzilmasi, markdown yoki qo'shimcha matnsiz:

{
  "lessonId": "${l.id}",
  "questions": [
    {
      "q": "...",
      "options": ["...", "...", "...", "..."],
      "correctIdx": 0,
      "explanation": "...",
      "topicTimestamp": 125
    }
  ],
  "aiSystemPrompt": "Sen ...",
  "aiKeyTopics": ["mavzu 1", "mavzu 2", "mavzu 3"]
}`;
}

function parseOneResult(rawText: string): FlashResult | null {
  const parsed = safeParseJson<any>(rawText);
  if (!parsed || !Array.isArray(parsed.questions)) return null;

  const questions: TestQuestion[] = parsed.questions
    .filter((q: any) => {
      return (
        q &&
        typeof q.q === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctIdx === "number" &&
        q.correctIdx >= 0 &&
        q.correctIdx < 4
      );
    })
    .map((q: any) => ({
      q: q.q,
      options: q.options.map(String),
      correctIdx: q.correctIdx,
      explanation: q.explanation || "",
      topicTimestamp:
        typeof q.topicTimestamp === "number" ? q.topicTimestamp : undefined,
    }));

  if (questions.length === 0) return null;

  return {
    questions,
    aiSystemPrompt:
      typeof parsed.aiSystemPrompt === "string" && parsed.aiSystemPrompt.trim()
        ? parsed.aiSystemPrompt.trim()
        : "Sen instruktorsan, managerni shu darslik bo'yicha baholaysan.",
    aiKeyTopics: Array.isArray(parsed.aiKeyTopics)
      ? parsed.aiKeyTopics.filter((s: any) => typeof s === "string")
      : [],
  };
}

/**
 * Pass 2 — Flash batch tahlil uchun tayyor darsliklarni topadi:
 *   status === "processing" AND transcription IS NOT NULL AND testQuestions IS NULL
 */
async function findPendingFlashLessons(options: {
  companyId?: string;
  limit?: number;
}): Promise<LessonMeta[]> {
  const rows = await prisma.lesson.findMany({
    where: {
      status: "processing",
      transcription: { not: null },
      testQuestions: { equals: null as any },
      ...(options.companyId ? { companyId: options.companyId } : {}),
    },
    orderBy: { createdAt: "asc" },
    ...(options.limit ? { take: options.limit } : {}),
  });

  const result: LessonMeta[] = [];
  for (const r of rows) {
    if (!r.transcription) continue;
    const words = (r.transcriptionJson as unknown as SttWord[] | null) || [];
    const lastWord = words.length > 0 ? words[words.length - 1] : null;
    const duration =
      r.videoDurationSec ||
      (lastWord ? Math.ceil(lastWord.endMs / 1000) : 0);
    result.push({
      id: r.id,
      title: r.title,
      description: r.description,
      transcription: r.transcription,
      words,
      durationSec: duration,
    });
  }
  return result;
}

/**
 * Pass 2 — Vertex AI batch prediction (Gemini 2.5 Flash).
 * Darslik uchun testQuestions + aiSystemPrompt + aiKeyTopics yaratadi.
 */
async function runFlashBatch(lessons: LessonMeta[]): Promise<number> {
  if (lessons.length === 0) return 0;
  console.log(
    `[lesson-batch] Flash batch tayyorlanmoqda: ${lessons.length} darslik`
  );

  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);
  const jobClient = new JobServiceClient({
    apiEndpoint: `${LOCATION}-aiplatform.googleapis.com`,
  });

  const requests = lessons.map((l) => ({
    request: {
      contents: [{ role: "user", parts: [{ text: buildLessonPrompt(l) }] }],
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    },
  }));

  const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
  const stamp = Date.now();
  const inputFile = `lesson-batch/input-${stamp}.jsonl`;
  const outputPrefix = `lesson-batch/output-${stamp}/`;

  await bucket.file(inputFile).save(jsonl);
  console.log(`[lesson-batch] JSONL upload: gs://${BUCKET}/${inputFile}`);

  const [createdJob] = await jobClient.createBatchPredictionJob({
    parent: `projects/${PROJECT_ID}/locations/${LOCATION}`,
    batchPredictionJob: {
      displayName: `lesson-batch-${stamp}`,
      model: FLASH_MODEL_PATH,
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
  console.log(`[lesson-batch] Job: ${createdJob.name}`);

  // Poll — max 4 soat (batch-backfill.ts bilan bir xil chegara)
  const MAX_ATTEMPTS = 960; // 960 * 15s = 4 soat
  let attempts = 0;
  let succeeded = false;
  while (attempts < MAX_ATTEMPTS) {
    await new Promise((r) => setTimeout(r, 15000));
    const [job] = await jobClient.getBatchPredictionJob({
      name: createdJob.name,
    });
    if (attempts % 4 === 0) console.log(`[lesson-batch] state: ${job.state}`);
    if (job.state === "JOB_STATE_SUCCEEDED") {
      succeeded = true;
      break;
    }
    if (
      job.state === "JOB_STATE_FAILED" ||
      job.state === "JOB_STATE_CANCELLED"
    ) {
      throw new Error(`Lesson batch failed: ${JSON.stringify(job.error)}`);
    }
    attempts++;
  }
  if (!succeeded) {
    throw new Error(
      `Lesson batch polling timed out. Job: ${createdJob.name}`
    );
  }

  // predictions.jsonl flushed bo'lishi uchun qisqa pauza
  await new Promise((r) => setTimeout(r, 5000));

  const [files] = await bucket.getFiles({ prefix: outputPrefix });
  const predFile =
    files.find((f) => f.name.endsWith("predictions.jsonl")) ||
    files.find((f) => f.name.includes("predictions"));
  if (!predFile) {
    throw new Error(
      `Lesson predictions not found under ${outputPrefix}. Files: ${files
        .map((f) => f.name)
        .join(", ")}`
    );
  }

  const [content] = await predFile.download();
  const outLines = content
    .toString()
    .split("\n")
    .filter((l) => l.trim());

  const byId = new Map(lessons.map((l) => [l.id, l]));
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

    // LESSON_ID ni topish — request yoki response ichidan
    const midHint =
      rawText.match(/\[LESSON_ID:\s*([a-z0-9]+)\]/i)?.[1] ||
      reqText.match(/\[LESSON_ID:\s*([a-z0-9]+)\]/i)?.[1];
    const meta = midHint ? byId.get(midHint) : undefined;
    if (!meta) {
      console.error(
        `[lesson-batch] noma'lum lessonId, line: ${line.substring(0, 120)}`
      );
      continue;
    }

    const result = parseOneResult(rawText);
    if (!result) {
      failed++;
      try {
        await prisma.lesson.update({
          where: { id: meta.id },
          data: {
            status: "failed",
            processingError: "Flash batch javobini parse qilishda xato",
          },
        });
      } catch {}
      continue;
    }

    try {
      await prisma.lesson.update({
        where: { id: meta.id },
        data: {
          testQuestions: result.questions as any,
          aiSystemPrompt: result.aiSystemPrompt,
          aiKeyTopics: result.aiKeyTopics as any,
          status: "ready",
          processingError: null,
        },
      });
      saved++;
    } catch (err) {
      failed++;
      console.error(
        `[lesson-batch] ${meta.id} save error:`,
        (err as Error).message?.substring(0, 120)
      );
    }
  }

  console.log(
    `[lesson-batch] Flash saved ${saved}/${lessons.length}, failed ${failed}`
  );

  return saved;
}

/**
 * To'liq batch pipeline. Cron va manual endpoint shu funksiyani chaqiradi.
 *
 *   Pass 1: STT poll (tayyor bo'lgan Yandex operationlardan transkripsiya o'qish)
 *   Pass 2: Flash batch (transcription bor + testQuestions null bo'lganlar uchun)
 *
 * @returns { sttReady, flashReady } — shu yugurishda nechta darslik har bir pass'da tayyor bo'ldi
 */
export async function runLessonBatchPipeline(
  options: { companyId?: string; limit?: number } = {}
): Promise<{ sttReady: number; flashReady: number }> {
  if (isRunning) {
    console.log("[lesson-batch] allaqachon ishlamoqda — skip");
    return { sttReady: 0, flashReady: 0 };
  }
  isRunning = true;
  try {
    // Pass 1: STT poll
    const sttReady = await pollPendingStt().catch((err) => {
      console.error("[lesson-batch] STT poll fatal:", (err as Error).message);
      return 0;
    });

    // Pass 2: Flash batch — STT tayyor bo'lgan lessonlar uchun
    const pending = await findPendingFlashLessons(options);
    if (pending.length === 0) {
      if (sttReady > 0) {
        console.log(
          `[lesson-batch] STT ${sttReady} yangi tayyor, Flash batch keyingi yugurishda`
        );
      } else {
        console.log("[lesson-batch] tahlil uchun darslik yo'q");
      }
      return { sttReady, flashReady: 0 };
    }

    const flashReady = await runFlashBatch(pending);
    return { sttReady, flashReady };
  } finally {
    isRunning = false;
  }
}
