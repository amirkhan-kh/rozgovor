// Mavjud manager rasmini Gemini Image bilan enhance qilib,
// customPhotoUrl'ni yangilaydi va (ixtiyoriy) videolarni qayta generate qiladi.
// Usage: node scripts/enhance-manager-photo.js <managerId> [--regen]
require("ts-node/register");
const https = require("https");
const { PrismaClient } = require("@prisma/client");
const { uploadManagerPhoto, startVideoGeneration } = require("../src/services/manager-videos");

const prisma = new PrismaClient();

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (r) => {
        if (r.statusCode !== 200) {
          reject(new Error(`download ${url}: ${r.statusCode}`));
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

(async () => {
  const managerId = process.argv[2] || "bitrix_976";
  const regen = process.argv.includes("--regen");

  const mgr = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { id: true, name: true, customPhotoUrl: true },
  });
  if (!mgr) {
    console.error("Manager topilmadi:", managerId);
    process.exit(1);
  }
  if (!mgr.customPhotoUrl) {
    console.error("customPhotoUrl yo'q:", mgr.name);
    process.exit(1);
  }

  console.log(`Manager: ${mgr.name} (${mgr.id})`);
  console.log(`Original: ${mgr.customPhotoUrl}`);

  const buffer = await download(mgr.customPhotoUrl);
  const mime = mgr.customPhotoUrl.endsWith(".png") ? "image/png" : "image/jpeg";

  console.log(`Downloaded ${buffer.length} bytes, enhancing...`);
  const newUrl = await uploadManagerPhoto(mgr.id, buffer, mime);
  console.log(`Enhanced URL: ${newUrl}`);

  if (regen) {
    console.log("Deleting old videos and regenerating...");
    await prisma.managerVideo.deleteMany({ where: { managerId: mgr.id } });
    const result = await startVideoGeneration(mgr.id);
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
