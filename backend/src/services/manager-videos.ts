// Wave 4 — Manager Celebration Videos backend service.
//
// Pipeline:
//   1) Manager rasm yuklaydi → Yandex S3 (manager-photos/<managerId>/<uuid>.ext)
//   2) startVideoGeneration: har 5 ssenariy uchun ManagerVideo row yaratiladi,
//      Vertex AI (VEO 3) orqali operation submit qilinadi. HTTP javobi
//      darhol qaytadi — operationId'lar DB'da saqlanadi.
//   3) pollVideoOperations (cron): "generating" status'dagi rowlarni poll
//      qiladi. Tayyor bo'lgan videolarni GCS'dan olib, Yandex S3'ga uploadga
//      o'tkazadi, thumbnail yasaydi, status="ready" qo'yadi.
//   4) mixVideoWithMusic: menejer video + musiqa (trim) + volume → ffmpeg
//      orqali final mp4 yasaydi, Yandex'ga upload qilib finalVideoUrl yozadi.
//
// CLAUDE.md qoidalari:
//   - Vertex AI batch style (submit + poll) — online loop YO'Q.
//   - Videolar Yandex'da uzoq muddatli — GCS faqat tranzit.
//   - Graceful error agar Vertex env yo'q bo'lsa.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { randomUUID } from "crypto";
import AWS from "aws-sdk";
import { GoogleGenAI } from "@google/genai";
import { Storage } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";
import { prisma } from "../utils/prisma";
import { ManagerVideo } from "@prisma/client";

// ─── Config ──────────────────────────────────────────────────────────────
const YANDEX_ENDPOINT =
  process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net";
const YANDEX_BUCKET =
  process.env.YANDEX_BUCKET_AUDIO || process.env.YANDEX_BUCKET || "sales-ai-storage";
const YANDEX_URL_PREFIX = `${YANDEX_ENDPOINT}/${YANDEX_BUCKET}/`;

const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
// Veo 3 "global" region'da MAVJUD EMAS — VERTEX_LOCATION dan mustaqil ravishda us-central1.
const VERTEX_LOCATION = process.env.VEO_LOCATION || "us-central1";
const VEO_MODEL = "veo-3.0-generate-001";
const GCS_BUCKET = process.env.VEO_GCS_BUCKET || "big-quanta-469517-h6-salesai-stt";
const GCS_OUTPUT_PREFIX = "veo-celebrations";

const yandexS3 = new AWS.S3({
  endpoint: YANDEX_ENDPOINT,
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
  httpOptions: { timeout: 600000, connectTimeout: 60000 },
  maxRetries: 5,
});

// ─── 5 SSENARIY PROMPTLAR ────────────────────────────────────────────────
// Manba: scripts/generate-celebration-videos.js (Wave 4 reference).
// Promptlar text-free — on-screen text keyin ffmpeg drawtext bilan qo'shiladi.

const NEGATIVE_PROMPT = [
  "any on-screen text",
  "captions",
  "subtitles",
  "logos",
  "watermarks",
  "cartoon effects",
  "shaky camera",
  "jump cut",
].join(", ");

export interface Scenario {
  id: number;
  name: string;
  prompt: string;
}

export const CELEBRATION_SCENARIOS: Scenario[] = [
  {
    id: 1,
    name: "arms-crossing-in",
    prompt: `An 8-second cinematic 16:9 celebration video shot against a pure solid black background with no other environment visible. The same person from the reference image stands at center on this completely black background. Golden light particles and glowing amber embers drift softly through the frame, lit against the pure black. At the start their arms hang relaxed at their sides. Over the first two seconds they smoothly raise their forearms and cross them over their chest, right over left, in one slow deliberate confident motion. They hold the crossed-arms pose for the remaining six seconds, their smile growing wider, their chin lifting slightly, giving one calm proud nod. Warm gold rim light from behind, soft cool key light from front, catchlights in their eyes. Locked medium chest-up shot, subtle slow push-in. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 2,
    name: "walk-in-confetti",
    prompt: `An 8-second cinematic 16:9 celebration video. In a dark warm space filled with soft golden confetti floating gently through the air, the same person from the reference image is seen from a distance at the start of the shot. They walk confidently toward the camera with a smooth proud stride. As they reach medium-shot distance around second five they slow to a stop, face the camera directly, and flash a wide proud smile. They give one slow energetic nod. Golden confetti drifts softly all around them throughout the walk. Warm amber bokeh glows behind them, warm gold backlight makes the confetti sparkle. Camera stays locked as they walk into frame. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 3,
    name: "open-arms-wide",
    prompt: `An 8-second cinematic 16:9 celebration video. The video opens in near darkness. At 0.4 seconds a focused white spotlight fades on from above revealing the same person from the reference image standing center-frame. Their arms are at their sides. From second one to second two they slowly spread both arms wide open to their sides, extending them horizontally outward, palms facing forward in a grand open gesture. They hold this wide open-arms pose until second six, a big proud confident smile on their face. At second six they slowly bring their arms back down to their sides and give one deliberate nod. Thin vertical streaks of golden light drift slowly in the atmospheric haze behind them. Hard top spotlight, dramatic theatrical feel, cool edge light from behind. Locked medium shot, subtle push-in. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 4,
    name: "cyan-thumbs-up",
    prompt: `An 8-second cinematic 16:9 celebration video. In a sleek modern dark atmosphere where soft cyan and violet bokeh light glows around the edges, the same person from the reference image stands confidently at center immersed in the cool colored light. Both arms start at their sides. Around second one they raise their right hand and give a clear thumbs up toward the camera. Around second three they raise their left hand as well, giving a strong double thumbs-up. They hold both thumbs up with a wide confident smile and give one small nod around second six. Cool blue rim light highlights their shoulders and hair, warm key light on their face, the cyan bokeh glowing around them. Locked medium shot, slight push-in. Modern premium cinematic style. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 5,
    name: "side-entry-golden",
    prompt: `An 8-second cinematic 16:9 celebration video. In a warm golden atmosphere with soft golden light particles drifting through dark air, the same person from the reference image enters the frame from the left side at the start of the shot, walking confidently toward the center. Their stride is smooth and proud. They slow to a stop at center frame around second five, turn to face the camera directly, and give a broad proud smile with a slow deliberate nod. Warm golden particles drift gently all around them throughout. Warm golden key light, strong amber rim light from behind, catchlights in their eyes. Camera stays locked as they walk into position. Premium prestigious cinematic style. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function extFromMime(mime: string, fallback = "png"): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  const slash = mime.indexOf("/");
  if (slash > 0) return mime.slice(slash + 1).toLowerCase();
  return fallback;
}

function mimeFromExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "webp") return "image/webp";
  return "image/png";
}

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: VERTEX_PROJECT,
    location: VERTEX_LOCATION,
  });
}

function getGcsStorage(): Storage {
  return new Storage();
}

async function downloadFromGcs(gsUri: string, destPath: string): Promise<void> {
  const m = gsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`bad gs uri: ${gsUri}`);
  const [, bucket, object] = m;
  await getGcsStorage().bucket(bucket).file(object).download({ destination: destPath });
}

async function downloadFromYandex(key: string, destPath: string): Promise<void> {
  const data = await yandexS3
    .getObject({ Bucket: YANDEX_BUCKET, Key: key })
    .promise();
  fs.writeFileSync(destPath, data.Body as Buffer);
}

function keyFromYandexUrl(url: string): string {
  if (url.startsWith(YANDEX_URL_PREFIX)) return url.slice(YANDEX_URL_PREFIX.length);
  return url;
}

async function uploadBufferToYandex(
  buffer: Buffer,
  key: string,
  mime: string,
): Promise<string> {
  await yandexS3
    .putObject({
      Bucket: YANDEX_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mime,
    })
    .promise();
  return `${YANDEX_URL_PREFIX}${key}`;
}

function findOverlayFont(): string | null {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

// drawtext text= qiymati uchun xavfsiz ekran qilish (apostrof, ikki nuqta, vergul)
function escapeDrawtextText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%");
}

function runCmd(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ch = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    ch.stderr.on("data", (b) => {
      stderr += b.toString();
    });
    const to = opts.timeoutMs
      ? setTimeout(() => {
          ch.kill("SIGKILL");
          reject(new Error(`${cmd} timeout after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs)
      : null;
    ch.on("error", (err) => {
      if (to) clearTimeout(to);
      reject(err);
    });
    ch.on("close", (code) => {
      if (to) clearTimeout(to);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

function runCmdCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const ch = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    ch.stdout.on("data", (b) => { stdout += b.toString(); });
    ch.on("error", reject);
    ch.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else resolve("");
    });
  });
}

async function probeVideoRotation(filePath: string): Promise<number> {
  // Yangi ffmpeg side_data orqali (iPhone/Android)
  const sd = await runCmdCapture("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream_side_data=rotation",
    "-of", "default=nw=1:nk=1", filePath,
  ]);
  const r1 = parseInt(sd.trim(), 10);
  if (Number.isFinite(r1) && r1 !== 0) return ((r1 % 360) + 360) % 360;
  // Eski metadata tag
  const tg = await runCmdCapture("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream_tags=rotate",
    "-of", "default=nw=1:nk=1", filePath,
  ]);
  const r2 = parseInt(tg.trim(), 10);
  if (Number.isFinite(r2) && r2 !== 0) return ((r2 % 360) + 360) % 360;
  return 0;
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Menejerning rasm faylini Yandex Object Storage'ga yuklaydi + Gemini Image bilan
 * fonni va kiyimni professional biznes ko'rinishga keltiradi.
 *
 * Pipeline:
 *   1. Original rasmni Yandex'ga saqlaymiz (backup)
 *   2. Gemini 2.5 Flash Image orqali: fon → qora studio, kiyim → pidjak+ko'ylak
 *   3. Enhanced rasmni ham Yandex'ga saqlaymiz
 *   4. Manager.customPhotoUrl = enhanced URL (VEO shuni ishlatadi)
 */
export async function uploadManagerPhoto(
  managerId: string,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Rasm fayli bo'sh");
  }
  const ext = extFromMime(mime, "png");

  // 1) Original — backup
  const originalKey = `manager-photos/${managerId}/original-${randomUUID()}.${ext}`;
  await uploadBufferToYandex(buffer, originalKey, mime || `image/${ext}`);

  // 2) Enhance via Gemini Image (fon + kiyim almashtirish)
  let finalUrl: string;
  try {
    const enhanced = await enhancePhotoWithGemini(buffer, mime);
    const enhancedKey = `manager-photos/${managerId}/enhanced-${randomUUID()}.png`;
    finalUrl = await uploadBufferToYandex(enhanced, enhancedKey, "image/png");
    console.log(`[manager-videos] photo enhanced for ${managerId}`);
  } catch (err) {
    console.warn(
      `[manager-videos] enhance failed for ${managerId}, using original:`,
      (err as Error).message,
    );
    finalUrl = `${YANDEX_URL_PREFIX}${originalKey}`;
  }

  await prisma.manager.update({
    where: { id: managerId },
    data: { customPhotoUrl: finalUrl },
  });

  return finalUrl;
}

/**
 * Gemini 2.5 Flash Image orqali menejer rasmini tahrirlash:
 *   - fon → toza qora studio
 *   - kiyim → professional biznes (pidjak + oq ko'ylak + galstuk)
 *   - yuz, soch, terim rangi, jins, yoshi — o'zgartirilmaydi
 */
async function enhancePhotoWithGemini(
  buffer: Buffer,
  mime: string,
): Promise<Buffer> {
  const ai = getAI();
  const base64 = buffer.toString("base64");
  const imageMime = mime || "image/png";

  const prompt =
    "Edit this photo into a cinematic 16:9 landscape composition (widescreen, horizontal orientation). " +
    "Keep the person's face, hair, skin tone, age, gender, and facial features exactly the same. " +
    "Remove the original background entirely and replace it with a clean solid dark studio background that fills the ENTIRE 16:9 frame edge-to-edge — no photo frame, no borders, no letterboxing, no picture-in-picture effect. " +
    "The person should be naturally placed IN the scene, chest-up centered, with ample dark studio space around them on both left and right sides to fill the widescreen frame. " +
    "Replace the clothing with a professional dark navy business suit jacket and a crisp white collared shirt. For men add a dark tie; for women keep a neat elegant neckline. " +
    "Natural soft studio lighting on the face, subtle warm rim light from behind. " +
    "Output: a single edited photo in 16:9 widescreen aspect ratio. No text overlays, no watermarks, no frames, no photo-within-photo.";

  const resp = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: base64, mimeType: imageMime } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "16:9" },
    } as any,
  });

  const parts =
    (resp as any)?.candidates?.[0]?.content?.parts ??
    (resp as any)?.response?.candidates?.[0]?.content?.parts ??
    [];
  for (const part of parts) {
    const data = part?.inlineData?.data || part?.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini Image no image part in response");
}

/**
 * 5 ta VEO 3 ssenariy operation'larini submit qiladi.
 * Har biri uchun ManagerVideo rowni upsert qilamiz (reset agar mavjud bo'lsa).
 * Eslatma: Vertex `generateVideos` — bu uzoq operatsiya, lekin submit o'zi
 * qisqa. Bu funksiya darhol 5 operation ni boshlab qaytadi; videolarni
 * keyin `pollVideoOperations` cron tayyorlaydi.
 */
export async function startVideoGeneration(
  managerId: string,
  extraPrompt?: string,
): Promise<ManagerVideo[]> {
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: {
      id: true,
      customPhotoUrl: true,
      photoUrl: true,
    },
  });
  if (!manager) throw new Error("Menejer topilmadi");

  const photoUrl = manager.customPhotoUrl || manager.photoUrl;
  if (!photoUrl) {
    throw new Error("Menejerda foto yo'q — avval /photo yuklash kerak");
  }

  // Vertex env mavjudligini tekshirish
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT) {
    // GoogleGenAI vertexai: true rejimida ADC kerak — yo'q bo'lsa graceful error
    // (credentials qatorda mavjud bo'lishi mumkin, shuning uchun warn qilamiz)
    console.warn(
      "[manager-videos] VERTEX credentials topilmadi, startVideoGeneration xatolikka olib kelishi mumkin",
    );
  }

  // Rasmni Yandex (yoki boshqa URL) orqali yuklab olish
  const imageBuf = await fetchImageBuffer(photoUrl);
  const imageB64 = imageBuf.toString("base64");
  const imgMime = mimeFromExt(path.extname(photoUrl) || ".png");

  const ai = getAI();
  const results: ManagerVideo[] = [];

  for (const scenario of CELEBRATION_SCENARIOS) {
    // Rowni upsert — mavjud bo'lsa reset qilamiz
    const row = await prisma.managerVideo.upsert({
      where: {
        managerId_scenarioId: { managerId, scenarioId: scenario.id },
      },
      create: {
        managerId,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        status: "pending",
      },
      update: {
        scenarioName: scenario.name,
        status: "pending",
        operationId: null,
        videoUrl: null,
        thumbnailUrl: null,
        errorMessage: null,
      },
    });

    try {
      const gcsOut = `gs://${GCS_BUCKET}/${GCS_OUTPUT_PREFIX}/${managerId}/${scenario.id}-${scenario.name}/`;
      const finalPrompt = extraPrompt?.trim()
        ? `${scenario.prompt} Additional instruction: ${extraPrompt.trim()}`
        : scenario.prompt;
      const operation = await ai.models.generateVideos({
        model: VEO_MODEL,
        prompt: finalPrompt,
        image: { imageBytes: imageB64, mimeType: imgMime },
        config: {
          aspectRatio: "16:9",
          durationSeconds: 8,
          numberOfVideos: 1,
          resolution: "720p",
          personGeneration: "allow_adult",
          generateAudio: false,
          negativePrompt: NEGATIVE_PROMPT,
          outputGcsUri: gcsOut,
        },
      });

      const opName = operation.name || null;
      const updated = await prisma.managerVideo.update({
        where: { id: row.id },
        data: {
          status: "generating",
          operationId: opName,
          errorMessage: null,
        },
      });
      results.push(updated);
      console.log(
        `[manager-videos] submitted v${scenario.id} (${scenario.name}) for ${managerId}: ${opName}`,
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(
        `[manager-videos] v${scenario.id} submit xato (${managerId}):`,
        msg,
      );
      const updated = await prisma.managerVideo.update({
        where: { id: row.id },
        data: {
          status: "failed",
          errorMessage: msg.slice(0, 800),
        },
      });
      results.push(updated);
    }
  }

  return results;
}

/**
 * Rasmni URL orqali (Yandex yoki tashqi) buffer sifatida olib keladi.
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith(YANDEX_URL_PREFIX)) {
    const key = keyFromYandexUrl(url);
    const res = await yandexS3
      .getObject({ Bucket: YANDEX_BUCKET, Key: key })
      .promise();
    return res.Body as Buffer;
  }
  // Tashqi URL — https/http orqali
  return await new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? require("https") : require("http");
    mod
      .get(url, (res: any) => {
        if (res.statusCode !== 200) {
          reject(new Error(`fetch ${url} status=${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

/**
 * Cron job — "generating" status'dagi ManagerVideo rowlarini poll qiladi.
 * DONE bo'lganlarini GCS'dan yuklab olib Yandex'ga push qiladi, thumbnail
 * yasaydi va status="ready" qo'yadi. FAILED — errorMessage saqlanadi.
 */
export async function pollVideoOperations(): Promise<{
  ready: number;
  failed: number;
  pending: number;
}> {
  const pendings = await prisma.managerVideo.findMany({
    where: { status: "generating", operationId: { not: null } },
    take: 25, // quota/rate uchun cheklov
  });

  if (pendings.length === 0) {
    return { ready: 0, failed: 0, pending: 0 };
  }

  const ai = getAI();
  let ready = 0;
  let failed = 0;
  let stillPending = 0;

  // Vertex AI operation name'lari long-running API'si. @google/genai SDK'da
  // operation obj kerak, saqlangan name'dan restore qila olmaydi. Shuning
  // uchun raw REST call orqali pollaymiz.
  const location = process.env.VEO_LOCATION || "us-central1";
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const authClient = await auth.getClient();

  for (const row of pendings) {
    if (!row.operationId) continue;
    try {
      // VEO 3 operation'ini pollash uchun ":fetchPredictOperation" endpoint.
      // operationId format: "projects/.../models/veo-3.0-generate-001/operations/<uuid>"
      // Model resource'ni operationId'dan ajratib olish:
      const modelResource = row.operationId.split("/operations/")[0];
      const url = `https://${location}-aiplatform.googleapis.com/v1/${modelResource}:fetchPredictOperation`;
      const resp = await authClient.request<{
        done?: boolean;
        error?: { code?: number; message?: string };
        response?: {
          // REST shape (fetchPredictOperation):
          videos?: Array<{ gcsUri?: string; bytesBase64Encoded?: string; mimeType?: string }>;
          raiMediaFilteredCount?: number;
          raiMediaFilteredReasons?: string[];
          // SDK-compat shape (legacy):
          generatedVideos?: Array<{ video?: { uri?: string; bytesBase64Encoded?: string; mimeType?: string } }>;
        };
        metadata?: unknown;
      }>({
        url,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: { operationName: row.operationId },
      });
      const op = resp.data;

      if (!op.done) {
        stillPending += 1;
        continue;
      }

      if (op.error) {
        const msg = JSON.stringify(op.error).slice(0, 800);
        await prisma.managerVideo.update({
          where: { id: row.id },
          data: { status: "failed", errorMessage: msg },
        });
        failed += 1;
        console.error(`[manager-videos poll] v${row.scenarioId} error:`, msg);
        continue;
      }

      const rai = (op.response as any)?.raiMediaFilteredReasons;
      // REST (fetchPredictOperation) shape: response.videos[0].gcsUri
      // SDK shape (legacy): response.generatedVideos[0].video.uri
      const restVideo = (op.response as any)?.videos?.[0];
      const sdkVideo = (op.response as any)?.generatedVideos?.[0]?.video;
      const video = restVideo
        ? { uri: restVideo.gcsUri, bytesBase64Encoded: restVideo.bytesBase64Encoded, mimeType: restVideo.mimeType }
        : sdkVideo;
      if (!video || (!video.uri && !video.bytesBase64Encoded)) {
        const respKeys = op.response ? Object.keys(op.response) : [];
        const respSnippet = JSON.stringify(op.response || {}).slice(0, 500);
        console.error(`[manager-videos poll] v${row.scenarioId} no video. Keys: ${respKeys.join(",")} | Snippet: ${respSnippet}`);
        const msg = rai?.length
          ? `RAI filtered: ${JSON.stringify(rai)}`
          : `no video in response. Keys: ${respKeys.join(",")} | ${respSnippet}`;
        await prisma.managerVideo.update({
          where: { id: row.id },
          data: { status: "failed", errorMessage: msg.slice(0, 800) },
        });
        failed += 1;
        continue;
      }

      // Videoni tmp faylga yozish (GCS yoki inline bytes)
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrvid-"));
      const tmpVideo = path.join(tmpDir, "source.mp4");
      const tmpThumb = path.join(tmpDir, "thumb.jpg");

      try {
        if (video.uri && String(video.uri).startsWith("gs://")) {
          await downloadFromGcs(video.uri, tmpVideo);
        } else if (video.videoBytes) {
          fs.writeFileSync(tmpVideo, Buffer.from(video.videoBytes, "base64"));
        } else {
          throw new Error("video has no uri or bytes");
        }

        // Yandex'ga upload
        const vidKey = `manager-videos/${row.managerId}/${row.scenarioId}-${row.scenarioName}-${randomUUID()}.mp4`;
        const vidBuf = fs.readFileSync(tmpVideo);
        const vidUrl = await uploadBufferToYandex(vidBuf, vidKey, "video/mp4");

        // Thumbnail — birinchi frame (ffmpeg)
        let thumbUrl: string | null = null;
        try {
          await runCmd(
            "ffmpeg",
            [
              "-y",
              "-hide_banner",
              "-loglevel",
              "error",
              "-i",
              tmpVideo,
              "-frames:v",
              "1",
              "-q:v",
              "3",
              tmpThumb,
            ],
            { timeoutMs: 60000 },
          );
          if (fs.existsSync(tmpThumb)) {
            const thumbKey = `manager-videos/${row.managerId}/${row.scenarioId}-${row.scenarioName}-${randomUUID()}.jpg`;
            const thumbBuf = fs.readFileSync(tmpThumb);
            thumbUrl = await uploadBufferToYandex(thumbBuf, thumbKey, "image/jpeg");
          }
        } catch (thumbErr) {
          console.warn(
            `[manager-videos poll] thumbnail xato (${row.id}):`,
            (thumbErr as Error).message,
          );
        }

        await prisma.managerVideo.update({
          where: { id: row.id },
          data: {
            status: "ready",
            videoUrl: vidUrl,
            thumbnailUrl: thumbUrl,
            errorMessage: null,
          },
        });
        ready += 1;
        console.log(
          `[manager-videos poll] ready v${row.scenarioId} (${row.managerId}) → ${vidUrl}`,
        );
      } finally {
        try {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(
        `[manager-videos poll] v${row.scenarioId} (${row.managerId}) xato:`,
        msg,
      );
      // Poll xatosi — oshkor (operation yo'q, network) — faqat log, keyingi tick sinab ko'radi
      // Lekin agar "operation not found" bo'lsa — failed
      if (/not.*found|INVALID|PERMISSION/i.test(msg)) {
        await prisma.managerVideo.update({
          where: { id: row.id },
          data: { status: "failed", errorMessage: msg.slice(0, 800) },
        });
        failed += 1;
      } else {
        stillPending += 1;
      }
    }
  }

  return { ready, failed, pending: stillPending };
}

/**
 * Menejer musiqa faylini Yandex'ga yuklaydi va ManagerVideo'ga biriktiradi.
 */
export async function uploadVideoMusic(
  videoId: string,
  buffer: Buffer,
  mime: string,
  originalName?: string,
  track: 1 | 2 = 1,
): Promise<ManagerVideo> {
  const row = await prisma.managerVideo.findUnique({ where: { id: videoId } });
  if (!row) throw new Error("Video topilmadi");

  const ext =
    (originalName && path.extname(originalName).replace(/^\./, "")) ||
    extFromMime(mime, "mp3");
  const key = `manager-videos/${row.managerId}/music/${videoId}-t${track}-${randomUUID()}.${ext}`;
  const url = await uploadBufferToYandex(buffer, key, mime || `audio/${ext}`);

  if (track === 2) {
    return prisma.managerVideo.update({
      where: { id: videoId },
      data: {
        musicUrl2: url,
        musicKey2: key,
        musicStartSec2: 0,
        musicEndSec2: null,
        musicVolume2: 1.0,
      },
    });
  }

  // Yangi musiqa yuklanganda eski trim/volume qiymatlari reset bo'ladi
  return prisma.managerVideo.update({
    where: { id: videoId },
    data: {
      musicUrl: url,
      musicKey: key,
      musicStartSec: 0,
      musicEndSec: null,
      musicVolume: 1.0,
    },
  });
}

/**
 * Trim parametrlarini yangilaydi. Render qilmaydi — bu faqat metadata.
 */
export async function updateMusicTrim(
  videoId: string,
  params: { startSec?: number; endSec?: number; volume?: number; track?: 1 | 2 },
): Promise<ManagerVideo> {
  const row = await prisma.managerVideo.findUnique({ where: { id: videoId } });
  if (!row) throw new Error("Video topilmadi");

  const data: Record<string, unknown> = {};
  const track = params.track ?? 1;
  const prefix = track === 2 ? "2" : "";

  if (typeof params.startSec === "number" && !Number.isNaN(params.startSec)) {
    data[`musicStartSec${prefix}`] = Math.max(0, params.startSec);
  }
  if (typeof params.endSec === "number" && !Number.isNaN(params.endSec)) {
    data[`musicEndSec${prefix}`] = Math.max(0, params.endSec);
  }
  if (typeof params.volume === "number" && !Number.isNaN(params.volume)) {
    data[`musicVolume${prefix}`] = Math.max(0, Math.min(2, params.volume));
  }

  return prisma.managerVideo.update({ where: { id: videoId }, data });
}

/**
 * ffmpeg mix:
 *   - Video ustiga drawtext bilan menejer ismi va "+1 SOTUV" overlay
 *     qo'shiladi (alpha animatsiya — ism ~0.8s da, "+1 SOTUV" ~2s da chiqadi).
 *   - Bitta musiqa track'i — start..end bo'yicha kesib, volume bilan mix qiladi.
 *   - VEO 3 video'sida audio yo'q (generateAudio=false), faqat musiqa qo'yiladi.
 *   - Output H.264 + AAC.
 */
export async function mixVideoWithMusic(
  videoId: string,
  opts?: {
    musicUrl?: string;
    startSec?: number;
    endSec?: number;
    volume?: number;
  },
): Promise<string> {
  const row = await prisma.managerVideo.findUnique({
    where: { id: videoId },
    include: { manager: { select: { name: true } } },
  });
  if (!row) throw new Error("Video topilmadi");
  if (!row.videoUrl) throw new Error("Video hali tayyor emas");

  const musicUrl = opts?.musicUrl ?? row.musicUrl;
  if (!musicUrl) throw new Error("Musiqa biriktirilmagan");

  const startSec = typeof opts?.startSec === "number" ? opts.startSec : row.musicStartSec ?? 0;
  const endSec = typeof opts?.endSec === "number" ? opts.endSec : row.musicEndSec ?? null;
  const volume = typeof opts?.volume === "number" ? opts.volume : row.musicVolume ?? 1.0;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mgrmix-"));
  const srcVideo = path.join(tmpDir, "in.mp4");
  const srcMusic = path.join(tmpDir, "music1" + (path.extname(musicUrl) || ".mp3"));
  const outFinal = path.join(tmpDir, "final.mp4");

  try {
    // 1) Download video
    if (row.videoUrl.startsWith(YANDEX_URL_PREFIX)) {
      await downloadFromYandex(keyFromYandexUrl(row.videoUrl), srcVideo);
    } else {
      const buf = await fetchImageBuffer(row.videoUrl);
      fs.writeFileSync(srcVideo, buf);
    }

    // 2) Download music
    if (musicUrl.startsWith(YANDEX_URL_PREFIX)) {
      await downloadFromYandex(keyFromYandexUrl(musicUrl), srcMusic);
    } else {
      const buf = await fetchImageBuffer(musicUrl);
      fs.writeFileSync(srcMusic, buf);
    }

    // 3) ffmpeg args
    const args: string[] = ["-y", "-hide_banner", "-loglevel", "error", "-i", srcVideo];

    if (startSec > 0) args.push("-ss", String(startSec));
    if (endSec && endSec > startSec) args.push("-t", String(endSec - startSec));
    args.push("-i", srcMusic);

    const vol = Math.max(0, Math.min(2, volume));

    // 4) drawtext overlay (menejer ismi + "+1 SOTUV")
    const font = findOverlayFont();
    const managerName = (row.manager?.name || "").trim();
    const nameUpper = managerName.toUpperCase();

    const videoFilters: string[] = [];

    // Auto-rotate: telefonda yozilgan portrait videolar metadatadan rotatsiya
    // bilan keladi, drawtext filter bu metadatani yo'qotadi — shuning uchun
    // pixel'larni transpose orqali fizik aylantirib ifodalaymiz.
    const rot = ((await probeVideoRotation(srcVideo)) % 360 + 360) % 360;
    if (rot === 90) videoFilters.push("transpose=1");
    else if (rot === 180) videoFilters.push("transpose=2,transpose=2");
    else if (rot === 270) videoFilters.push("transpose=2");

    if (font && nameUpper) {
      const fontEsc = font.replace(/:/g, "\\:");
      const nameEsc = escapeDrawtextText(nameUpper);
      // alpha: ism 0.8..1.2s da chiqadi; "+1 SOTUV" 2..2.4s da chiqadi
      const nameAlpha = "if(lt(t,0.8),0,if(lt(t,1.2),(t-0.8)/0.4,1))";
      const tagAlpha = "if(lt(t,2),0,if(lt(t,2.4),(t-2)/0.4,1))";
      videoFilters.push(
        `drawtext=fontfile='${fontEsc}':text='${nameEsc}':fontcolor=white:fontsize=42:x=80:y=h-130:shadowcolor=black@0.7:shadowx=2:shadowy=2:alpha='${nameAlpha}'`,
        `drawtext=fontfile='${fontEsc}':text='+1':fontcolor=white:fontsize=180:x=w-320:y=h/2-220:shadowcolor=black@0.7:shadowx=3:shadowy=3:alpha='${tagAlpha}'`,
        `drawtext=fontfile='${fontEsc}':text='SOTUV':fontcolor=white:fontsize=92:x=w-370:y=h/2+0:shadowcolor=black@0.7:shadowx=3:shadowy=3:alpha='${tagAlpha}'`,
      );
    } else if (!font) {
      console.warn("[manager-videos mix] font topilmadi — drawtext o'tkazib yuborildi");
    }

    let filterComplex: string;
    if (videoFilters.length > 0) {
      const vChain = videoFilters.join(",");
      filterComplex = `[0:v]${vChain}[vout];[1:a]volume=${vol.toFixed(2)}[aout]`;
    } else {
      filterComplex = `[1:a]volume=${vol.toFixed(2)}[aout]`;
    }

    args.push(
      "-filter_complex", filterComplex,
      "-map", videoFilters.length > 0 ? "[vout]" : "0:v:0",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "20",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      outFinal,
    );

    await runCmd("ffmpeg", args, { timeoutMs: 5 * 60 * 1000 });

    if (!fs.existsSync(outFinal)) {
      throw new Error("ffmpeg output yo'q");
    }

    // 5) Upload to Yandex
    const finalKey = `manager-videos/${row.managerId}/final/${row.scenarioId}-${randomUUID()}.mp4`;
    const finalBuf = fs.readFileSync(outFinal);
    const finalUrl = await uploadBufferToYandex(finalBuf, finalKey, "video/mp4");

    await prisma.managerVideo.update({
      where: { id: videoId },
      data: {
        musicUrl,
        musicStartSec: startSec ?? undefined,
        musicEndSec: endSec ?? undefined,
        musicVolume: volume,
        finalVideoUrl: finalUrl,
        finalMixedAt: new Date(),
      },
    });

    return finalUrl;
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
