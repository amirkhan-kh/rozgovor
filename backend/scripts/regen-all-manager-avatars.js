// Hamma menejerlar uchun Gemini Image bilan profil avatar qayta yaratish.
//
// Manba — Manager.photoUrl (Bitrix PERSONAL_PHOTO) yoki customPhotoUrl bor bo'lsa
// undan ishlatamiz (re-enhance). Natija — Manager.customPhotoUrl = enhanced URL.
//
// Usage:
//   node scripts/regen-all-manager-avatars.js              — hamma faol menejerlar
//   node scripts/regen-all-manager-avatars.js --force      — customPhotoUrl bor
//                                                            bo'lsa ham qayta
//   node scripts/regen-all-manager-avatars.js --only=ID,ID — faqat shu menejerlar
require("ts-node/register");
const https = require("https");
const http = require("http");
const { PrismaClient } = require("@prisma/client");
const { uploadManagerPhoto } = require("../src/services/manager-videos");

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
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

(async () => {
  const managers = await prisma.manager.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      photoUrl: true,
      customPhotoUrl: true,
      companyId: true,
    },
    orderBy: { name: "asc" },
  });

  const targets = managers.filter((m) => {
    if (ONLY && !ONLY.has(m.id)) return false;
    const source = m.photoUrl || m.customPhotoUrl;
    if (!source) return false; // rasm yo'q
    if (m.customPhotoUrl && !FORCE) return false; // allaqachon enhanced
    return true;
  });

  console.log(`\n== Regen plan ==`);
  console.log(`Jami faol menejerlar: ${managers.length}`);
  console.log(`Rasm bor: ${managers.filter((m) => m.photoUrl || m.customPhotoUrl).length}`);
  console.log(`Enhance qilinadi: ${targets.length} ${FORCE ? "(--force)" : ""}`);
  if (ONLY) console.log(`Filter --only: ${[...ONLY].join(", ")}`);
  console.log("");

  let done = 0;
  let failed = 0;
  for (const m of targets) {
    const source = m.photoUrl || m.customPhotoUrl;
    const prefix = `[${done + failed + 1}/${targets.length}] ${m.name} (${m.id})`;
    try {
      console.log(`${prefix} downloading...`);
      const buf = await download(source);
      const mime = detectMime(source);
      console.log(`${prefix} downloaded ${buf.length} bytes, enhancing...`);
      const url = await uploadManagerPhoto(m.id, buf, mime);
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
