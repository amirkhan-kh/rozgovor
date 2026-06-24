// Yandex S3'dagi manager-videos/ va manager-photos/ prefixidagi fayllarni ro'yxatlaydi.
// Ishlatish:
//   node scripts/list-storage-videos.js
//   node scripts/list-storage-videos.js --prefix manager-videos/
//   node scripts/list-storage-videos.js --db   (DB'dagi ManagerVideo statuslari ham)

require("dotenv").config();
const AWS = require("aws-sdk");

const ENDPOINT = process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net";
const BUCKET = process.env.YANDEX_BUCKET || "sales-ai-storage";

const s3 = new AWS.S3({
  endpoint: ENDPOINT,
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});

const args = process.argv.slice(2);
const prefixArg = args.find((a) => a.startsWith("--prefix="))?.split("=")[1];
const withDb = args.includes("--db");
const prefix = prefixArg || "manager-videos/";

async function listAll(prefix) {
  const files = [];
  let ContinuationToken;
  do {
    const resp = await s3
      .listObjectsV2({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken,
      })
      .promise();
    for (const obj of resp.Contents || []) {
      files.push(obj);
    }
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return files;
}

function fmtSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(1) + " MB";
  if (bytes >= 1e3) return (bytes / 1e3).toFixed(1) + " KB";
  return bytes + " B";
}

function fmtDate(d) {
  return new Date(d).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
}

(async () => {
  console.log(`\n📦 Bucket: ${BUCKET}  |  Prefix: ${prefix}\n`);

  const files = await listAll(prefix);

  if (!files.length) {
    console.log("  (bo'sh — hech narsa topilmadi)");
    process.exit(0);
  }

  // Group by manager id (second segment of key: manager-videos/<managerId>/...)
  const byManager = {};
  for (const f of files) {
    const parts = f.Key.split("/"); // [manager-videos, <managerId>, filename]
    const managerId = parts[1] || "unknown";
    if (!byManager[managerId]) byManager[managerId] = [];
    byManager[managerId].push(f);
  }

  let totalSize = 0;
  for (const [mid, objs] of Object.entries(byManager)) {
    const videos = objs.filter((o) => o.Key.endsWith(".mp4"));
    const thumbs = objs.filter((o) => o.Key.endsWith(".jpg") || o.Key.endsWith(".png") || o.Key.endsWith(".webp"));
    const music = objs.filter((o) => /\.(mp3|m4a|wav|aac|ogg)$/.test(o.Key));
    const other = objs.filter((o) => !videos.includes(o) && !thumbs.includes(o) && !music.includes(o));
    const manSize = objs.reduce((s, o) => s + (o.Size || 0), 0);
    totalSize += manSize;

    console.log(`👤 ${mid}  (${fmtSize(manSize)})`);
    if (videos.length) {
      console.log(`   🎬 Videolar (${videos.length}):`);
      for (const v of videos) {
        const name = v.Key.split("/").pop();
        console.log(`      ${name}  [${fmtSize(v.Size)}]  ${fmtDate(v.LastModified)}`);
        console.log(`      URL: ${ENDPOINT}/${BUCKET}/${v.Key}`);
      }
    }
    if (thumbs.length) {
      console.log(`   🖼️  Thumbnaillar (${thumbs.length}): ${thumbs.map((t) => t.Key.split("/").pop()).join(", ")}`);
    }
    if (music.length) {
      console.log(`   🎵 Musiqalar (${music.length}): ${music.map((m) => m.Key.split("/").pop()).join(", ")}`);
    }
    if (other.length) {
      console.log(`   📄 Boshqa (${other.length}): ${other.map((o) => o.Key.split("/").pop()).join(", ")}`);
    }
    console.log();
  }

  console.log(`─────────────────────────────────────`);
  console.log(`Jami: ${files.length} fayl | ${fmtSize(totalSize)} | ${Object.keys(byManager).length} menejer\n`);

  // DB statuslari (--db flag)
  if (withDb) {
    try {
      const { PrismaClient } = require("@prisma/client");
      const prisma = new PrismaClient();
      const rows = await prisma.managerVideo.findMany({
        orderBy: [{ managerId: "asc" }, { scenarioId: "asc" }],
        select: {
          id: true,
          managerId: true,
          scenarioId: true,
          scenarioName: true,
          status: true,
          videoUrl: true,
          finalVideoUrl: true,
          errorMessage: true,
          createdAt: true,
        },
      });
      console.log(`\n🗄️  DB ManagerVideo rowlari (${rows.length}):\n`);
      for (const r of rows) {
        const icon =
          r.status === "ready" ? "✅" :
          r.status === "generating" ? "⏳" :
          r.status === "failed" ? "❌" : "⬜";
        console.log(
          `  ${icon} [${r.scenarioId}] ${r.scenarioName}  manager=${r.managerId}  status=${r.status}`
        );
        if (r.videoUrl) console.log(`       videoUrl: ${r.videoUrl}`);
        if (r.finalVideoUrl) console.log(`       finalUrl: ${r.finalVideoUrl}`);
        if (r.status === "failed" && r.errorMessage)
          console.log(`       error: ${r.errorMessage.slice(0, 120)}`);
      }
      await prisma.$disconnect();
    } catch (e) {
      console.error("\n[DB] Ulanishda xato:", e.message);
    }
  }

  process.exit(0);
})().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
