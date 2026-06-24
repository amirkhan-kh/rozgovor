// Lokal fayldan manager rasmini yuklab, enhance va videolarni qayta generatsiya qilish.
// Usage: node scripts/upload-photo-from-file.js <managerId> <filePath> [--regen]
require("ts-node/register");
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { uploadManagerPhoto, startVideoGeneration } = require("../src/services/manager-videos");

const prisma = new PrismaClient();

(async () => {
  const managerId = process.argv[2];
  const filePath = process.argv[3];
  const regen = process.argv.includes("--regen");

  if (!managerId || !filePath) {
    console.error("Usage: node scripts/upload-photo-from-file.js <managerId> <filePath> [--regen]");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error("Fayl topilmadi:", filePath);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";

  console.log(`Manager: ${managerId}`);
  console.log(`File:    ${filePath} (${(buffer.length / 1024).toFixed(1)}K, ${mime})`);
  console.log("Uploading + enhancing...");

  const url = await uploadManagerPhoto(managerId, buffer, mime);
  console.log(`Enhanced: ${url}`);

  if (regen) {
    console.log("Deleting old videos and regenerating...");
    await prisma.managerVideo.deleteMany({ where: { managerId } });
    const result = await startVideoGeneration(managerId);
    console.log(`Regenerated ${result.length} videos`);
    result.forEach((v) =>
      console.log(`  v${v.scenarioId} ${v.scenarioName} → ${v.operationId?.slice(-30)}`),
    );
  }

  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
