/**
 * OpenAI Text-to-Speech + S3 cache.
 *
 * Model: tts-1 (tez) yoki tts-1-hd (sifatli).
 * Ovozlar: nova (ayol), onyx (erkak). Ikkalasi ham multilingual — o'zbek
 * tilida yaxshi o'qiydi.
 * Cache: sha256(model+voice+speed+text) → S3.
 */
import { createHash } from "crypto";
import AWS from "aws-sdk";
import OpenAI from "openai";
import { prisma } from "../../utils/prisma";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const s3 = new AWS.S3({
  endpoint: process.env.S3_ENDPOINT,
  accessKeyId: process.env.S3_ACCESS_KEY,
  secretAccessKey: process.env.S3_SECRET_KEY,
  region: process.env.S3_REGION || "auto",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});
const BUCKET = process.env.S3_BUCKET || "salesai";

export type TTSVoice = "male" | "female";
export type YandexVoice = TTSVoice; // backward compat

export interface SpeakOptions {
  voice?: TTSVoice;
  emotion?: "neutral" | "good" | "evil";
  speed?: number;
}

// OpenAI TTS voice mapping
//   nova    — ayol, issiq (female uchun)
//   onyx    — erkak, quyuq (male uchun)
function openaiVoice(voice: TTSVoice): "nova" | "onyx" {
  return voice === "female" ? "nova" : "onyx";
}

function emotionToSpeed(
  emotion: "neutral" | "good" | "evil" | undefined,
  override?: number
): number {
  if (typeof override === "number") return Math.max(0.25, Math.min(4.0, override));
  if (emotion === "good") return 1.05;
  if (emotion === "evil") return 0.95;
  return 1.0;
}

function hashKey(text: string, voice: string, speed: number): string {
  return createHash("sha256")
    .update(`openai|tts-1|${voice}|${speed.toFixed(2)}|${text}`)
    .digest("hex");
}

async function s3GetMaybe(key: string): Promise<Buffer | null> {
  try {
    const r = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();
    return r.Body as Buffer;
  } catch (err: any) {
    if (err?.code === "NoSuchKey" || err?.statusCode === 404) return null;
    throw err;
  }
}

async function s3Put(key: string, body: Buffer): Promise<void> {
  await s3
    .putObject({ Bucket: BUCKET, Key: key, Body: body, ContentType: "audio/mpeg" })
    .promise();
}

/**
 * OpenAI TTS bilan matnni audio'ga o'giradi. Cache S3'da.
 */
export async function speak(
  text: string,
  opts: SpeakOptions = {}
): Promise<{ audio: Buffer; cached: boolean }> {
  const voice: TTSVoice = opts.voice || "female";
  const openaiVoiceName = openaiVoice(voice);
  const speed = emotionToSpeed(opts.emotion, opts.speed);

  const trimmed = text.trim();
  const hash = hashKey(trimmed, openaiVoiceName, speed);
  const s3Key = `tts-cache/${hash}.mp3`;

  // 1. Cache tekshirish
  const cacheRow = await prisma.ttsCache.findUnique({ where: { textHash: hash } });
  if (cacheRow) {
    const cached = await s3GetMaybe(cacheRow.gcsPath);
    if (cached) {
      await prisma.ttsCache.update({
        where: { textHash: hash },
        data: { hitCount: { increment: 1 }, lastUsedAt: new Date() },
      });
      return { audio: cached, cached: true };
    }
  }

  // 2. OpenAI TTS
  const resp = await openai.audio.speech.create({
    model: "tts-1",
    voice: openaiVoiceName,
    input: trimmed,
    speed,
    response_format: "mp3",
  });
  const audio = Buffer.from(await resp.arrayBuffer());

  // 3. Cache saqlash (fon)
  s3Put(s3Key, audio)
    .then(async () => {
      await prisma.ttsCache.upsert({
        where: { textHash: hash },
        create: {
          textHash: hash,
          text: trimmed.substring(0, 500),
          voice: openaiVoiceName,
          gcsPath: s3Key,
          bytes: audio.length,
        },
        update: {
          gcsPath: s3Key,
          bytes: audio.length,
          lastUsedAt: new Date(),
        },
      });
    })
    .catch((e) => console.error("[tts cache]", e?.message || e));

  return { audio, cached: false };
}
