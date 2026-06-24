// Yandex S3'dagi manager-videos/ fayllarini DB'ga import qiladi.
// Har bir menejer+ssenariy uchun eng so'nggi video va thumbnail tanlanadi,
// ManagerVideo row'i status="ready", videoUrl, thumbnailUrl bilan yangilanadi.
//
// Ishlatish:
//   DATABASE_URL="..." node scripts/import-videos-from-storage.js
//   DATABASE_URL="..." node scripts/import-videos-from-storage.js --dry-run

require("dotenv").config();
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
});

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

async function listAll(prefix) {
  const files = [];
  let ContinuationToken;
  do {
    const resp = await s3
      .listObjectsV2({ Bucket: BUCKET, Prefix: prefix, ContinuationToken })
      .promise();
    for (const obj of resp.Contents || []) files.push(obj);
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return files;
}

function extractScenarioId(filename) {
  // "1-arms-crossing-in-<uuid>.mp4" → 1
  const m = filename.match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : null;
}

(async () => {
  console.log(dryRun ? "\n[DRY RUN] o'zgartirish yo'q\n" : "\n[IMPORT] Yandex → DB\n");

  const files = await listAll("manager-videos/");
  if (!files.length) {
    console.log("Storage bo'sh.");
    process.exit(0);
  }

  // Guruhlash: managerId → scenarioId → { videos: [], thumbs: [] }
  const map = {}; // map[managerId][scenarioId] = { videos: [], thumbs: [] }

  for (const f of files) {
    const parts = f.Key.split("/"); // ["manager-videos", managerId, filename]
    if (parts.length < 3) continue;
    const managerId = parts[1];
    const filename = parts[2];

    // Skip nested dirs (music/, final/)
    if (parts.length > 3) continue;

    const scenarioId = extractScenarioId(filename);
    if (!scenarioId) continue;

    if (!map[managerId]) map[managerId] = {};
    if (!map[managerId][scenarioId]) map[managerId][scenarioId] = { videos: [], thumbs: [] };

    if (filename.endsWith(".mp4")) {
      map[managerId][scenarioId].videos.push(f);
    } else if (filename.endsWith(".jpg") || filename.endsWith(".png") || filename.endsWith(".webp")) {
      map[managerId][scenarioId].thumbs.push(f);
    }
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const [managerId, scenarios] of Object.entries(map)) {
    for (const [scenarioIdStr, { videos, thumbs }] of Object.entries(scenarios)) {
      const scenarioId = parseInt(scenarioIdStr, 10);
      if (!videos.length) continue;

      // Eng so'nggi video (LastModified bo'yicha)
      videos.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
      const latestVideo = videos[0];
      const videoUrl = `${URL_PREFIX}${latestVideo.Key}`;

      // Eng so'nggi thumbnail
      let thumbnailUrl = null;
      if (thumbs.length) {
        thumbs.sort((a, b) => new Date(b.LastModified) - new Date(a.LastModified));
        thumbnailUrl = `${URL_PREFIX}${thumbs[0].Key}`;
      }

      // DB row topish
      const row = await prisma.managerVideo.findFirst({
        where: { managerId, scenarioId },
      });

      if (!row) {
        console.log(`  ⚠️  DB row yo'q: ${managerId} ssenariy ${scenarioId}`);
        notFound++;
        continue;
      }

      if (row.status === "ready" && row.videoUrl) {
        console.log(`  ✅ [${scenarioId}] ${managerId} — allaqachon ready, o'tkazib yuborildi`);
        skipped++;
        continue;
      }

      console.log(`  🔄 [${scenarioId}] ${managerId}`);
      console.log(`     video: ${latestVideo.Key.split("/").pop()} (${new Date(latestVideo.LastModified).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" })})`);
      if (thumbnailUrl) console.log(`     thumb: ${thumbs[0].Key.split("/").pop()}`);

      if (!dryRun) {
        await prisma.managerVideo.update({
          where: { id: row.id },
          data: {
            status: "ready",
            videoUrl,
            thumbnailUrl,
            errorMessage: null,
          },
        });
        updated++;
        console.log(`     → DB yangilandi ✓`);
      } else {
        updated++;
        console.log(`     → [DRY] yangilanishi kerak`);
      }
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`Yangilandi: ${updated} | O'tkazildi: ${skipped} | DB yo'q: ${notFound}\n`);

  await prisma.$disconnect();
  process.exit(0);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
