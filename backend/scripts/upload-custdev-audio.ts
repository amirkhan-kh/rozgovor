// Script: custdev projectga lokal audio fayllarni yuklaydi va tahlilni boshlaydi.
// Usage: ts-node scripts/upload-custdev-audio.ts
import * as fs from "fs";
import * as path from "path";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { custdevPrisma as prisma } from "../src/utils/custdev-prisma";
import { processInterview } from "../src/services/custdev-processor";
import * as dotenv from "dotenv";
dotenv.config();

const AUDIO_DIR  = path.join(__dirname, "../../..", "audio");
const CUSTDEV_ID = "cmob21cto0001l1c5rqbqd9ub";
const COMPANY_ID = "cmo1gdp6u0000b0u1zmix7x2z";

const YANDEX_ENDPOINT = process.env.YANDEX_STORAGE_ENDPOINT!;
const YANDEX_BUCKET   = process.env.YANDEX_BUCKET!;

const s3 = new AWS.S3({
  endpoint: YANDEX_ENDPOINT,
  accessKeyId:     process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});

function extOf(file: string) {
  return path.extname(file).slice(1).toLowerCase() || "mp3";
}

function mimeOf(ext: string) {
  if (ext === "m4a")  return "audio/mp4";
  if (ext === "ogg")  return "audio/ogg";
  if (ext === "mp3")  return "audio/mpeg";
  if (ext === "wav")  return "audio/wav";
  return "audio/mpeg";
}

// Extract participant name from m4a filenames like "Rohila Opa.m4a"
function participantName(filename: string): string | undefined {
  const base = path.basename(filename, path.extname(filename));
  // Skip ogg files — no meaningful name
  if (path.extname(filename).toLowerCase() === ".ogg") return undefined;
  // Remove phone number suffixes: "Xolisxon Opa 936279599" → "Xolisxon Opa"
  const cleaned = base.replace(/\s+\d{7,}.*$/, "").trim();
  // Also handle "936983770 _ Aziz aka" → "Aziz aka"
  const stripped = cleaned.replace(/^\d+\s*_\s*/, "").trim();
  return stripped || undefined;
}

async function uploadToYandex(buffer: Buffer, ext: string, mime: string) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const key = `audio/${COMPANY_ID}/${y}/${m}/${uuidv4()}.${ext}`;
  await s3.putObject({ Bucket: YANDEX_BUCKET, Key: key, Body: buffer, ContentType: mime }).promise();
  return { url: `${YANDEX_ENDPOINT}/${YANDEX_BUCKET}/${key}`, key };
}

async function main() {
  const files = fs.readdirSync(AUDIO_DIR).filter(f => /\.(m4a|ogg|mp3|wav)$/i.test(f));
  console.log(`Topildi: ${files.length} ta audio fayl`);

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filepath = path.join(AUDIO_DIR, filename);
    const ext  = extOf(filename);
    const mime = mimeOf(ext);
    const name = participantName(filename);

    console.log(`\n[${i + 1}/${files.length}] ${filename}`);
    console.log(`  Ishtirokchi: ${name || "(nomsiz)"}`);

    try {
      const buffer = fs.readFileSync(filepath);
      console.log(`  Yandexga yuklanyapti... (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

      const { url, key } = await uploadToYandex(buffer, ext, mime);
      console.log(`  Yuklandi: ${url.slice(0, 70)}...`);

      const interview = await prisma.custdevInterview.create({
        data: {
          custdevId: CUSTDEV_ID,
          audioUrl:  url,
          audioKey:  key,
          status:    "pending",
        },
      });
      // Log participant name for reference
      if (name) console.log(`  Ishtirokchi nomi: ${name}`);
      console.log(`  DB: interview ${interview.id} yaratildi`);

      // Tahlilni boshlash (background)
      processInterview(interview.id)
        .then(() => console.log(`  ✓ Tahlil tugadi: ${interview.id}`))
        .catch((e: Error) => console.error(`  ✗ Tahlil xatosi (${interview.id}):`, e.message));

      console.log(`  Tahlil boshlandi (fon)`);
    } catch (e: any) {
      console.error(`  XATO: ${e.message}`);
    }
  }

  console.log("\nBarcha fayllar yuklandi. Tahlil fonda davom etmoqda...");
  // Keep process alive to let async processing complete
  await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
