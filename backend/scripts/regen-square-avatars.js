// Hamma menejerlar uchun 1:1 SQUARE portrait avatar generatsiya qilish.
//
// Sabab: Gemini 16:9 widescreen rasm beradi (celebration video uchun).
// Profil avatar yumaloq bo'lgani sababli kvadrat (1:1) zarur — yuz va yelka
// to'liq ko'rinishi uchun.
//
// Natija: Manager.customPhotoUrl = yangi 1:1 PNG. Original `photoUrl` ham
// portretga teng bo'lganligi uchun fallback'da yaxshi ishlaydi.
//
// Usage:
//   node scripts/regen-square-avatars.js              — barcha photoUrl bor menejerlar
//   node scripts/regen-square-avatars.js --only=ID,ID
require("ts-node/register");
const https = require("https");
const http = require("http");
const { randomUUID } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { GoogleGenAI } = require("@google/genai");
const AWS = require("aws-sdk");

const prisma = new PrismaClient();

// ── Yandex va Wasabi konfig ─────────────────────────────────────
const YANDEX_ENDPOINT = process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net";
const YANDEX_BUCKET = process.env.YANDEX_BUCKET_AUDIO || "sales-ai-storage";

const yandexS3 = new AWS.S3({
  endpoint: YANDEX_ENDPOINT,
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});

const WASABI_ENDPOINT = process.env.WASABI_ENDPOINT || "https://s3.eu-central-2.wasabisys.com";
const WASABI_BUCKET = process.env.WASABI_BUCKET || "verdramma";

const wasabiS3 = new AWS.S3({
  endpoint: WASABI_ENDPOINT,
  accessKeyId: process.env.WASABI_ACCESS_KEY,
  secretAccessKey: process.env.WASABI_SECRET_KEY,
  region: "eu-central-2",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});

async function uploadToStorage(buffer, key, mime) {
  // Avval Yandex, AccessDenied bo'lsa Wasabi
  try {
    await yandexS3.putObject({ Bucket: YANDEX_BUCKET, Key: key, Body: buffer, ContentType: mime }).promise();
    return `${YANDEX_ENDPOINT}/${YANDEX_BUCKET}/${key}`;
  } catch (err) {
    const code = err?.code || "";
    if (code === "AccessDenied" || code === "Forbidden") {
      await wasabiS3.putObject({ Bucket: WASABI_BUCKET, Key: key, Body: buffer, ContentType: mime }).promise();
      // proxy URL — backend `mediaRedirect` orqali Wasabi presigned redirect
      return `https://proaudit.app/api/media/${key}`;
    }
    throw err;
  }
}

const args = process.argv.slice(2);
const ONLY = (() => {
  const a = args.find((x) => x.startsWith("--only="));
  if (!a) return null;
  return new Set(a.slice("--only=".length).split(",").map((x) => x.trim()).filter(Boolean));
})();

function download(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (r) => {
        if (r.statusCode === 301 || r.statusCode === 302) {
          const loc = r.headers.location;
          if (!loc) return reject(new Error(`redirect without location: ${url}`));
          return download(loc).then(resolve, reject);
        }
        if (r.statusCode !== 200) {
          reject(new Error(`download ${url}: HTTP ${r.statusCode}`));
          return;
        }
        const chunks = [];
        r.on("data", (c) => chunks.push(c));
        r.on("end", () => resolve(Buffer.concat(chunks)));
        r.on("error", reject);
      })
      .on("error", reject);
  });
}

function detectMime(url) {
  const u = String(url).toLowerCase().split("?")[0];
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

// ── Gemini 1:1 portrait prompt ───────────────────────────────────
const VERTEX_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "big-quanta-469517-h6";
const VERTEX_LOCATION = process.env.VEO_LOCATION || "us-central1";

let ai = null;
function getAI() {
  if (!ai) {
    ai = new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: VERTEX_LOCATION });
  }
  return ai;
}

async function generateSquareAvatar(buffer, mime, attrs) {
  const base64 = buffer.toString("base64");
  const imageMime = mime || "image/png";

  const wearsHijab = !!attrs?.wearsHijab;
  const gender = attrs?.gender;

  let clothingRule;
  if (wearsHijab) {
    clothingRule =
      "CRITICAL: PRESERVE THE EXISTING HIJAB/HEADSCARF EXACTLY as in the original photo — " +
      "same color, fabric pattern, wrapping style, coverage. " +
      "Do not remove or modify the headscarf. " +
      "Add a professional dark navy blazer over the modest top, keeping the neckline fully covered.";
  } else if (gender === "female") {
    clothingRule =
      "Replace clothing with an elegant professional dark navy blazer over a neat modest top. No tie.";
  } else {
    clothingRule =
      "Replace clothing with a professional dark navy business suit jacket, a crisp white collared shirt, and a dark tie.";
  }

  const prompt =
    "Edit this photo into a SQUARE 1:1 professional portrait headshot avatar. " +
    "Keep the person's face, hair, skin tone, age, gender, and facial features EXACTLY the same. " +
    "Frame the shot as a close head-and-shoulders portrait — the face should fill most of the frame vertically, centered horizontally. " +
    "Replace the entire background with a clean solid dark studio backdrop (no frames, no borders, no letterboxing, no picture-in-picture). " +
    clothingRule + " " +
    "Natural soft studio lighting on the face, subtle warm rim light from behind. " +
    "Output: a single edited photo in 1:1 SQUARE aspect ratio, head-and-shoulders portrait, dark studio background filling the entire square frame.";

  const resp = await getAI().models.generateContent({
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
      imageConfig: { aspectRatio: "1:1" },
    },
  });

  const parts =
    resp?.candidates?.[0]?.content?.parts ??
    resp?.response?.candidates?.[0]?.content?.parts ??
    [];
  for (const part of parts) {
    const data = part?.inlineData?.data || part?.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
  }
  throw new Error("Gemini Image no image part in response");
}

(async () => {
  const managers = await prisma.manager.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      customPhotoUrl: true,
      gender: true,
      wearsHijab: true,
    },
    orderBy: { name: "asc" },
  });

  const targets = managers.filter((m) => {
    if (ONLY && !ONLY.has(m.id)) return false;
    return !!(m.photoUrl || m.customPhotoUrl);
  });

  console.log(`\n== Square avatar regen ==`);
  console.log(`Jami faol menejerlar: ${managers.length}`);
  console.log(`Enhance qilinadi: ${targets.length}`);
  console.log("");

  let done = 0;
  let failed = 0;
  for (const m of targets) {
    // Square avatar uchun ORIGINAL photoUrl'ni manba qilamiz (Gemini-ning oldingi
    // 16:9 versiyasi emas) — Bitrix'dagi original portret odatda kvadratga yaqin
    const source = m.photoUrl || m.customPhotoUrl;
    const prefix = `[${done + failed + 1}/${targets.length}] ${m.name} (${m.id})`;
    try {
      console.log(`${prefix} downloading source...`);
      const buf = await download(source);
      const mime = detectMime(source);
      console.log(`${prefix} ${buf.length} bytes → Gemini 1:1...`);
      const sq = await generateSquareAvatar(buf, mime, {
        gender: m.gender,
        wearsHijab: m.wearsHijab,
      });
      const key = `manager-photos/${m.id}/avatar-${randomUUID()}.png`;
      const url = await uploadToStorage(sq, key, "image/png");
      await prisma.manager.update({
        where: { id: m.id },
        data: { customPhotoUrl: url },
      });
      console.log(`${prefix} ✓ ${url}`);
      done += 1;
    } catch (e) {
      console.error(`${prefix} ✗ ${e.message}`);
      failed += 1;
    }
  }

  console.log(`\n== Done ==`);
  console.log(`✓ Success: ${done}`);
  console.log(`✗ Failed:  ${failed}`);
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error("FATAL:", e.message);
  try { await prisma.$disconnect(); } catch {}
  process.exit(1);
});
