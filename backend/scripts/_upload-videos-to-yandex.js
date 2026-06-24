// Lokal lesson videolarini Yandex Storage'ga yuklaydi va URL ro'yxatini chiqaradi.
//
// Ishga tushirish:
//   YANDEX_STORAGE_KEY_ID=... YANDEX_STORAGE_SECRET=... node scripts/_upload-videos-to-yandex.js

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const AWS = require("aws-sdk");

const ENDPOINT =
  process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net";
const BUCKET = process.env.YANDEX_BUCKET_AUDIO || process.env.YANDEX_BUCKET || "sales-ai-storage";
const URL_PREFIX = `${ENDPOINT}/${BUCKET}/`;

const s3 = new AWS.S3({
  endpoint: ENDPOINT,
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
  httpOptions: { timeout: 1200000 },
});

(async () => {
  const dir = path.resolve(__dirname, "../uploads/lessons");
  if (!fs.existsSync(dir)) {
    console.error("uploads/lessons topilmadi:", dir);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mp4"));
  console.log(`Topildi ${files.length} video\n`);

  const uploaded = [];
  for (const f of files) {
    const localPath = path.join(dir, f);
    const stats = fs.statSync(localPath);
    const sizeMB = (stats.size / 1e6).toFixed(1);
    const key = `lessons/${f}`;
    const url = URL_PREFIX + key;

    console.log(`→ ${f} (${sizeMB} MB)`);
    try {
      // HEAD — agar bor bo'lsa skip
      try {
        await s3.headObject({ Bucket: BUCKET, Key: key }).promise();
        console.log(`  [skip] allaqachon bor: ${url}`);
        uploaded.push({ file: f, url });
        continue;
      } catch {
        /* yo'q, davom etamiz */
      }

      const stream = fs.createReadStream(localPath);
      await s3
        .upload({
          Bucket: BUCKET,
          Key: key,
          Body: stream,
          ContentType: "video/mp4",
        })
        .promise();
      console.log(`  ✓ ${url}`);
      uploaded.push({ file: f, url });
    } catch (err) {
      console.error(`  ✗ ${err.message}`);
    }
  }

  console.log("\n=== URL ro'yxati ===");
  for (const u of uploaded) {
    console.log(`${u.file}\n  ${u.url}`);
  }

  // JSON ham yozamiz — seed skript ishlatishi uchun
  const outPath = path.join(__dirname, "_lesson-urls.json");
  fs.writeFileSync(outPath, JSON.stringify(uploaded, null, 2));
  console.log(`\nJSON: ${outPath}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
