require("dotenv").config();
const AWS = require("aws-sdk");
const s3 = new AWS.S3({
  endpoint: process.env.YANDEX_STORAGE_ENDPOINT,
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  signatureVersion: "v4",
});
const managerId = process.argv[2] || "bitrix_976";
(async () => {
  const r = await s3.listObjects({
    Bucket: process.env.YANDEX_BUCKET_AUDIO || "sales-ai-storage",
    Prefix: `manager-photos/${managerId}/`,
  }).promise();
  for (const obj of r.Contents || []) {
    console.log(`${obj.LastModified.toISOString()} ${(obj.Size / 1024).toFixed(1)}K ${obj.Key}`);
  }
})();
