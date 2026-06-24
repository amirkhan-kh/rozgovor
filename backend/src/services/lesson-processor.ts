// Darslik video'sini BATCH pipeline'ning PHASE 1 qismi:
//   1. ffmpeg → OGG OPUS (Yandex deferred STT talab qiladi — bu format eng ixcham)
//   2. Yandex Object Storage'ga upload (stt-batch/<lessonId>.ogg)
//   3. Yandex longRunningRecognize (v2) — operation id qaytaradi
//   4. Lesson'ga sttOperationId + sttAudioKey yoziladi, status = "processing"
//   5. Qaytadi — poll qilmaydi. Batch cron (har 30 daq) keyin davom ettiradi.
//
// PHASE 2 (STT poll + Gemini Flash batch + test/AI generatsiya) →
// `src/services/lesson-batch.ts` ichida. CLAUDE.md: "reanalyze/backfill faqat
// Vertex AI batch, online loop taqiq" — Gemini endi online chaqirilmaydi.
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import * as https from "https";
import AWS from "aws-sdk";
import { prisma } from "../utils/prisma";

const YANDEX_API_KEY =
  process.env.YANDEX_API_KEY || "AQVNzJY66YR6RQ9jA1UZW-uYbgaMCtrk8OpcR-4m";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "b1g2pqsf7rl50fkdr84t";
const YANDEX_BUCKET_STT = process.env.YANDEX_BUCKET || "sales-ai-storage";

// Yandex S3 client (batch-backfill.ts bilan bir xil konfig)
const yandexS3 = new AWS.S3({
  endpoint:
    process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net",
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  httpOptions: { timeout: 600000, connectTimeout: 60000 },
  maxRetries: 5,
});

export interface TestQuestion {
  q: string;
  options: string[]; // har doim 4 ta
  correctIdx: number;
  explanation: string;
  topicTimestamp?: number; // soniya — mavzu qaysi joydan
}

export interface FlashResult {
  questions: TestQuestion[];
  aiSystemPrompt: string;
  aiKeyTopics: string[];
}

// Umumiy — qancha savol yaratilishi kerak (darslik uzunligiga qarab).
export function targetQuestionCount(durationSec: number): number {
  const mins = durationSec / 60;
  // 0-20 min → 5 savol, 20-40 → 7, 40-60 → 10, 60-90 → 12, 90+ → 15
  if (mins < 20) return 5;
  if (mins < 40) return 7;
  if (mins < 60) return 10;
  if (mins < 90) return 12;
  return 15;
}

/**
 * Video fayldan OGG Opus yaratadi (48 kbps, 48 kHz mono).
 * Yandex deferred STT ushbu formatni qabul qiladi va transkript katta (1+ soat)
 * darsliklar uchun streaming'dan ko'ra barqaror ishlaydi.
 */
function videoToOgg(videoPath: string): string {
  const oggPath = path.join(os.tmpdir(), `lesson-${randomUUID()}.ogg`);
  execSync(
    `ffmpeg -y -i "${videoPath}" -vn -c:a libopus -b:a 48k -ar 48000 -ac 1 "${oggPath}" 2>/dev/null`,
    { maxBuffer: 1024 * 1024 * 1024 }
  );
  return oggPath;
}

async function uploadToYandexS3(buffer: Buffer, key: string): Promise<string> {
  await yandexS3
    .putObject({
      Bucket: YANDEX_BUCKET_STT,
      Key: key,
      Body: buffer,
    })
    .promise();
  return `https://storage.yandexcloud.net/${YANDEX_BUCKET_STT}/${key}`;
}

/**
 * Yandex STT v2 longRunningRecognize — async job. Operation id qaytaradi.
 * Keyinchalik `pollDeferredSTT(opId)` bilan tekshiriladi.
 */
async function submitDeferredSTT(s3Uri: string): Promise<string> {
  const body = JSON.stringify({
    config: {
      specification: {
        languageCode: "uz-UZ",
        model: "general",
        audioEncoding: "OGG_OPUS",
        sampleRateHertz: 48000,
        audioChannelCount: 1,
        rawResults: true,
      },
    },
    audio: { uri: s3Uri },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "transcribe.api.cloud.yandex.net",
        path: "/speech/stt/v2/longRunningRecognize",
        method: "POST",
        headers: {
          Authorization: `Api-Key ${YANDEX_API_KEY}`,
          "x-folder-id": YANDEX_FOLDER_ID,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.id) resolve(parsed.id);
            else reject(new Error(parsed.message || JSON.stringify(parsed)));
          } catch {
            reject(new Error(data));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * PHASE 1: video fayldan OGG chiqarib, Yandex S3'ga upload qiladi va
 * deferred STT operation'ni ishga tushiradi. Lesson.sttOperationId +
 * sttAudioKey DB'ga yoziladi. Keyingi batch cron operation tayyor bo'lishini
 * kutib, transcription + Flash batch tahlilni amalga oshiradi.
 */
export async function processLesson(lessonId: string): Promise<void> {
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) {
    console.error(`[lesson-processor] Lesson ${lessonId} topilmadi`);
    return;
  }

  console.log(
    `[lesson-processor] ${lessonId} PHASE 1 boshlandi: ${lesson.title}`
  );

  let oggPath: string | null = null;
  try {
    if (!fs.existsSync(lesson.videoUrl)) {
      throw new Error(`Video fayl topilmadi: ${lesson.videoUrl}`);
    }

    await prisma.lesson.update({
      where: { id: lessonId },
      data: { status: "processing", processingError: null },
    });

    // 1. Video → OGG Opus
    console.log(`[lesson-processor] ${lessonId} ffmpeg → OGG`);
    oggPath = videoToOgg(lesson.videoUrl);
    const oggBuf = fs.readFileSync(oggPath);
    console.log(
      `[lesson-processor] ${lessonId} OGG hajmi: ${(oggBuf.length / 1024 / 1024).toFixed(1)} MB`
    );

    // 2. Yandex S3'ga upload (OGG — STT uchun)
    const s3Key = `lesson-stt/${lesson.companyId}/${lessonId}.ogg`;
    const s3Uri = await uploadToYandexS3(oggBuf, s3Key);
    console.log(`[lesson-processor] ${lessonId} upload: ${s3Uri}`);

    // 2b. Original video'ni ham Yandex'ga yuklash (doimiy storage)
    let yandexVideoUrl: string | null = null;
    try {
      const videoExt = path.extname(lesson.videoUrl) || ".mp4";
      const videoKey = `lesson-videos/${lesson.companyId}/${lessonId}${videoExt}`;
      const videoBuf = fs.readFileSync(lesson.videoUrl);
      yandexVideoUrl = await uploadToYandexS3(videoBuf, videoKey);
      console.log(`[lesson-processor] ${lessonId} video → Yandex: ${yandexVideoUrl}`);
    } catch (videoUploadErr) {
      console.warn(`[lesson-processor] ${lessonId} video Yandex upload failed (ignored):`, (videoUploadErr as Error).message);
    }

    // 3. Deferred STT submit
    const opId = await submitDeferredSTT(s3Uri);
    console.log(`[lesson-processor] ${lessonId} STT operation: ${opId}`);

    // 4. DB'ga yozish — status "processing" qoladi, transcription null
    await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...(yandexVideoUrl ? { videoUrl: yandexVideoUrl } : {}),
        sttOperationId: opId,
        sttAudioKey: s3Key,
        transcription: null,
        transcriptionJson: undefined as any,
        testQuestions: undefined as any,
        aiSystemPrompt: null,
        aiKeyTopics: undefined as any,
        status: "processing",
        processingError: null,
      },
    });

    // Local video faylini o'chirish (Yandex'ga ko'chirildi)
    if (yandexVideoUrl && lesson.videoUrl && !lesson.videoUrl.startsWith("http")) {
      try { fs.unlinkSync(lesson.videoUrl); } catch {}
    }

    console.log(
      `[lesson-processor] ${lessonId} ✓ PHASE 1 done — batch kutmoqda`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[lesson-processor] ${lessonId} ✗ FAILED:`, msg);
    await prisma.lesson.update({
      where: { id: lessonId },
      data: {
        status: "failed",
        processingError: msg,
      },
    });
  } finally {
    if (oggPath) {
      try {
        fs.unlinkSync(oggPath);
      } catch {}
    }
  }
}

/**
 * Background'da ishga tushirish — upload response'ni bloklamaydi.
 */
export function triggerProcessLesson(lessonId: string): void {
  setImmediate(() => {
    processLesson(lessonId).catch((err) => {
      console.error(
        `[lesson-processor] unhandled error for ${lessonId}:`,
        err
      );
    });
  });
}
