// Tezkor retry: Bitrix CDN timeout'larida fail bo'lgan fayllarni parallel+keep-alive bilan yuklab, Yandex S3 orqali STT + Pro ishlatadi
// Foydalanish: node scripts/fast-retry-failed.js
//
// Muammo tushuntirish:
//   Asosiy batch serial axios.get ishlatadi — TCP connection reuse buzilib,
//   ba'zi fayllar 600s timeout'ga ham yetib tugamaydi. Curl bilan 0.5s da yuklanadi.
//   Bu script: http.Agent keep-alive + concurrency=3 + retry bilan tez yuklaydi.

require("ts-node/register");
const axios = require("axios");
const http = require("http");
const https = require("https");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

// Keep-alive agent — connection reuse
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 3,
  timeout: 60000,
  rejectUnauthorized: false,
});
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 5 });

async function fetchBuffer(url, attempt = 1) {
  try {
    const resp = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 60000,
      httpsAgent,
      httpAgent,
      headers: {
        "User-Agent": "Mozilla/5.0 SalesAi-Retry/1.0",
        Connection: "keep-alive",
      },
      validateStatus: () => true,
    });
    if (resp.status >= 400) throw new Error(`HTTP ${resp.status}`);
    return Buffer.from(resp.data);
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return fetchBuffer(url, attempt + 1);
    }
    throw err;
  }
}

async function runWithLimit(items, limit, fn) {
  const results = [];
  let idx = 0;
  const workers = Array(limit)
    .fill(0)
    .map(async () => {
      while (idx < items.length) {
        const i = idx++;
        try {
          results[i] = await fn(items[i], i);
        } catch (err) {
          results[i] = { error: err.message };
        }
      }
    });
  await Promise.all(workers);
  return results;
}

(async () => {
  const company = await prisma.company.findFirst();

  // Barcha processing (fail bo'lgan) + pending audiolar
  const files = await prisma.audioFile.findMany({
    where: {
      companyId: company.id,
      status: { in: ["processing", "pending"] },
    },
    select: { id: true, fileName: true, fileUrl: true, duration: true },
  });

  console.log(`Fail/pending audiolar: ${files.length}`);
  console.log(`Parallel: 3, Keep-alive: ON, Retry: 3x`);
  console.log("---");

  // Avval barcha audiolarni buffer'ga yuklab, /tmp/pre-cached/ ga saqlaymiz
  // Bu keyingi batch'da ishlatiladi (fileUrl o'rniga local path)
  const cacheDir = "/tmp/salesai-prefetch";
  require("fs").mkdirSync(cacheDir, { recursive: true });

  let ok = 0, fail = 0;
  const results = await runWithLimit(files, 3, async (f, i) => {
    const cached = `${cacheDir}/${f.id}.mp3`;
    if (require("fs").existsSync(cached)) {
      process.stdout.write(`[${i + 1}/${files.length}] ${f.fileName} cached\n`);
      return { ok: true, path: cached };
    }
    const start = Date.now();
    try {
      const buf = await fetchBuffer(f.fileUrl);
      require("fs").writeFileSync(cached, buf);
      ok++;
      process.stdout.write(
        `[${i + 1}/${files.length}] ${f.fileName} ✓ ${buf.length} b in ${Date.now() - start}ms\n`
      );
      return { ok: true, path: cached, size: buf.length };
    } catch (err) {
      fail++;
      process.stdout.write(
        `[${i + 1}/${files.length}] ${f.fileName} ✗ ${err.message.substring(0, 60)}\n`
      );
      return { ok: false, error: err.message };
    }
  });

  console.log("---");
  console.log(`Yuklandi: ${ok}, Fail: ${fail}, Jami: ${files.length}`);
  console.log(`Cache: ${cacheDir}/`);
  console.log(`\nKeyingi qadam: batch-backfill.ts fetchAudioBuffer'da local cache tekshiradi.`);
  await prisma.$disconnect();
})().catch((err) => {
  console.error("Xatolik:", err.message);
  process.exit(1);
});
