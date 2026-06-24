// Yandex SpeechKit deferred STT (longRunningRecognize v2).
//
// Streaming v3 dan ~4× arzon. Audio S3'ga yuklanadi → operation submit →
// natija kelguncha polling. Sotuv qo'ng'iroqlarini batch tahlil qilish uchun
// ishlatiladi (interactive emas, lekin foydalanuvchi qo'ng'iroq tahlilini
// 1-10 daqiqa kutishga tayyor).
//
// Imtihon va trainer interactive — ular streaming (call-transcriber.ts ichida).

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import * as https from "https";
import AWS from "aws-sdk";

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "b1g2pqsf7rl50fkdr84t";
const YANDEX_BUCKET = process.env.YANDEX_BUCKET_STT || process.env.YANDEX_BUCKET || "sales-ai-storage";

const yandexS3 = new AWS.S3({
  endpoint: process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net",
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  httpOptions: { timeout: 600_000, connectTimeout: 60_000 },
  maxRetries: 5,
});

export interface SttWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SttLine {
  text: string;
  start: number;
}

function bufferToOgg(buffer: Buffer, srcExt: string): string {
  const tmpDir = os.tmpdir();
  const uid = randomUUID();
  const srcPath = path.join(tmpDir, `stt-deferred-${uid}.${srcExt}`);
  const oggPath = path.join(tmpDir, `stt-deferred-${uid}.ogg`);
  fs.writeFileSync(srcPath, buffer);
  try {
    execSync(
      `ffmpeg -y -i "${srcPath}" -vn -c:a libopus -b:a 48k -ar 48000 -ac 1 "${oggPath}" 2>/dev/null`,
      { maxBuffer: 1024 * 1024 * 1024 }
    );
  } finally {
    try { fs.unlinkSync(srcPath); } catch {}
  }
  return oggPath;
}

async function uploadToS3(buffer: Buffer, key: string): Promise<string> {
  await yandexS3.putObject({ Bucket: YANDEX_BUCKET, Key: key, Body: buffer }).promise();
  return `https://storage.yandexcloud.net/${YANDEX_BUCKET}/${key}`;
}

async function deleteFromS3(key: string): Promise<void> {
  try {
    await yandexS3.deleteObject({ Bucket: YANDEX_BUCKET, Key: key }).promise();
  } catch {
    // best-effort
  }
}

export async function submitDeferredSTT(s3Uri: string): Promise<string> {
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

  return new Promise<string>((resolve, reject) => {
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
            if (parsed.id) resolve(parsed.id as string);
            else reject(new Error(parsed.message || JSON.stringify(parsed)));
          } catch {
            reject(new Error(data.substring(0, 300)));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export interface PollResult {
  done: boolean;
  words?: SttWord[];
  error?: string;
}

export async function checkOperation(operationId: string): Promise<PollResult> {
  return new Promise<PollResult>((resolve, reject) => {
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
          try {
            const result = JSON.parse(data);
            if (!result.done) {
              resolve({ done: false });
              return;
            }
            if (result.error) {
              resolve({
                done: true,
                error: result.error.message || JSON.stringify(result.error).substring(0, 300),
              });
              return;
            }
            const words: SttWord[] = [];
            const chunks = result.response?.chunks || [];
            for (const chunk of chunks) {
              for (const alt of chunk.alternatives || []) {
                for (const w of alt.words || []) {
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
          } catch {
            resolve({ done: false });
          }
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

/**
 * To'liq sinxron bo'lib ko'rinadigan deferred STT — buffer kiradi, lines chiqadi.
 * Ichkarida: OGG'ga o'tkazadi → S3'ga yuklaydi → operation submit qiladi →
 * polling (har 5s) → tayyor bo'lganda lines qaytaradi → S3 temp keyni o'chiradi.
 *
 * Default poll: 90 daqiqa kutadi (1080 attempts × 5s). Yandex deferred STT
 * sotuv qo'ng'iroqlari (1-15 daqiqa) uchun odatda 30s-3 daqiqa ichida tayyor.
 */
export async function transcribeBufferDeferred(
  buffer: Buffer,
  fileExt: string,
  opts: { keyPrefix?: string; maxAttempts?: number; intervalMs?: number } = {}
): Promise<SttLine[]> {
  if (!YANDEX_API_KEY) throw new Error("YANDEX_API_KEY environment muhitida yo'q");

  const keyPrefix = opts.keyPrefix || "stt-deferred-tmp";
  const maxAttempts = opts.maxAttempts ?? 1080; // 90 minut
  const intervalMs = opts.intervalMs ?? 5_000;

  const oggPath = bufferToOgg(buffer, fileExt);
  const s3Key = `${keyPrefix}/${randomUUID()}.ogg`;

  try {
    const oggBuf = fs.readFileSync(oggPath);
    const s3Uri = await uploadToS3(oggBuf, s3Key);
    const operationId = await submitDeferredSTT(s3Uri);

    let words: SttWord[] | undefined;
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const res = await checkOperation(operationId);
      if (!res.done) continue;
      if (res.error) {
        throw new Error(`Yandex deferred STT xato: ${res.error.substring(0, 200)}`);
      }
      words = res.words || [];
      break;
    }
    if (!words) {
      throw new Error(`Yandex deferred STT timeout (${operationId})`);
    }

    return wordsToLines(words);
  } finally {
    try { fs.unlinkSync(oggPath); } catch {}
    void deleteFromS3(s3Key);
  }
}
