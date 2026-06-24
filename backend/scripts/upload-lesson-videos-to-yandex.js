// Mavjud darslik video fayllarini Yandex S3'ga ko'chiradi.
// videoUrl = lokal path bo'lgan darslarni topib, Yandex'ga yuklaydi, URL'ni yangilaydi.
//
// Serverda ishga tushirish:
//   DATABASE_URL="..." node scripts/upload-lesson-videos-to-yandex.js
//   DATABASE_URL="..." node scripts/upload-lesson-videos-to-yandex.js --dry-run

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const AWS = require("aws-sdk");
const { PrismaClient } = require("@prisma/client");

const ENDPOINT = process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net";
const BUCKET = process.env.YANDEX_BUCKET || "sales-ai-storage";
const URL_PREFIX = `${ENDPOINT}/${BUCKET}/`;

const s3 = new AWS.S3({
  endpoint: ENDPOINT,
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
  httpOptions: { timeout: 600000 },
});

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

function fmtSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  return (bytes / 1e3).toFixed(1) + " KB";
}

(async () => {
  console.log(dryRun ? "\n[DRY RUN]\n" : "\n[UPLOAD] Dars videolari → Yandex\n");

  const lessons = await prisma.lesson.findMany({
    select: { id: true, title: true, companyId: true, videoUrl: true, status: true },
  });

  const toUpload = lessons.filter((l) => l.videoUrl && !l.videoUrl.startsWith("http"));
  const alreadyYandex = lessons.filter((l) => l.videoUrl?.startsWith("http"));

  console.log(`Jami: ${lessons.length} dars | Yandex'da: ${alreadyYandex.length} | Upload kerak: ${toUpload.length}\n`);

  if (!toUpload.length) {
    console.log("Hamma dars allaqachon Yandex'da. Bajarildi.");
    await prisma.$disconnect();
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const lesson of toUpload) {
    const localPath = lesson.videoUrl;
    if (!fs.existsSync(localPath)) {
      console.log(`  ⚠️  [${lesson.id}] "${lesson.title}" — fayl yo'q: ${localPath}`);
      skipped++;
      continue;
    }

    const stat = fs.statSync(localPath);
    const ext = path.extname(localPath) || ".mp4";
    const key = `lesson-videos/${lesson.companyId}/${lesson.id}${ext}`;
    const yandexUrl = `${URL_PREFIX}${key}`;

    console.log(`  📤 [${lesson.id}] "${lesson.title}" (${fmtSize(stat.size)})`);
    console.log(`       ${localPath}`);
    console.log(`     → ${key}`);

    if (!dryRun) {
      try {
        const buf = fs.readFileSync(localPath);
        await s3.putObject({
          Bucket: BUCKET,
          Key: key,
          Body: buf,
          ContentType: ext === ".webm" ? "video/webm" : ext === ".mov" ? "video/quicktime" : "video/mp4",
        }).promise();

        await prisma.lesson.update({
          where: { id: lesson.id },
          data: { videoUrl: yandexUrl },
        });

        // Lokal faylni o'chirish (xavfsiz: Yandex'ga ko'chdi)
        try { fs.unlinkSync(localPath); } catch {}

        uploaded++;
        console.log(`     ✓ Yuklandi\n`);
      } catch (err) {
        failed++;
        console.error(`     ✗ XATO: ${err.message}\n`);
      }
    } else {
      uploaded++;
      console.log(`     → [DRY] yuklanadi\n`);
    }
  }

  console.log(`─────────────────────────────────────`);
  console.log(`Yuklandi: ${uploaded} | O'tkazildi: ${skipped} | Xato: ${failed}\n`);

  await prisma.$disconnect();
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
