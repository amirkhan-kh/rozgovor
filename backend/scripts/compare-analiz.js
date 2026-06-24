// Test: Yandex STT raw output bo'yicha 2.5 Pro vs 3.1 Pro analiz solishtirish
require("dotenv").config({ path: "/var/www/prosales-backend/.env" });
process.env.GOOGLE_APPLICATION_CREDENTIALS = "/var/www/prosales-backend/credentials/big-quanta-469517-h6-55280c39d520.json";
process.env.VERTEX_PROJECT = "big-quanta-469517-h6";

const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const { randomUUID } = require("crypto");
const { GoogleAuth } = require("google-auth-library");
const { PrismaClient } = require("@prisma/client");
const { extractPcm, transcribePcmFile, wordsToLines } = require("/var/www/prosales-backend/dist/services/yandex-stt");

const prisma = new PrismaClient();

const AUDIO_ID = "cmov7u6xj00036awron8mo9hr"; // 334s qayta
const PROJECT = "big-quanta-469517-h6";

const PRICE = {
  "gemini-2.5-pro":         { in: 1.25, out: 10.00 },
  "gemini-3.1-pro-preview": { in: 2.00, out: 12.00 },
};

let _token = null, _exp = 0;
async function getToken() {
  if (_token && Date.now() < _exp) return _token;
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  _token = (await (await auth.getClient()).getAccessToken()).token;
  _exp = Date.now() + 50 * 60 * 1000;
  return _token;
}

async function callVertex(model, location, prompt) {
  const token = await getToken();
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${PROJECT}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const t0 = Date.now();
  const resp = await axios.post(url, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 8192 },
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000, validateStatus: () => true });
  const ms = Date.now() - t0;
  if (resp.status !== 200) throw new Error(`${model} ${resp.status}: ${JSON.stringify(resp.data).slice(0, 400)}`);
  const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const usage = resp.data?.usageMetadata || {};
  const inTok = usage.promptTokenCount || 0;
  const outTok = usage.candidatesTokenCount || 0;
  const price = PRICE[model] || { in: 0, out: 0 };
  const cost = (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
  return { ms, inTok, outTok, cost, text };
}

async function main() {
  const audio = await prisma.audioFile.findUnique({ where: { id: AUDIO_ID } });
  console.log(`=== ${audio.fileName}, ${audio.duration}s, ${audio.category} ===`);

  // 1. Download
  console.log("\n→ Yuklash...");
  const tmpFile = path.join(os.tmpdir(), `cmp-${randomUUID()}.mp3`);
  const dl = await axios.get(audio.fileUrl, { responseType: "arraybuffer", timeout: 300000 });
  fs.writeFileSync(tmpFile, Buffer.from(dl.data));

  // 2. Yandex STT
  console.log("→ Yandex STT (online streaming)...");
  const tStt = Date.now();
  const pcm = extractPcm(tmpFile, { normalize: false });
  const words = await transcribePcmFile(pcm);
  const sttLines = wordsToLines(words);
  fs.unlinkSync(pcm);
  fs.unlinkSync(tmpFile);
  const sttMs = Date.now() - tStt;
  console.log(`  ${(sttMs/1000).toFixed(1)}s, ${words.length} so'z, ${sttLines.length} qator`);

  if (sttLines.length === 0) {
    console.log("⚠ STT bo'sh, chiqamiz");
    process.exit(0);
  }

  // 3. Format raw transcript (no diarize, just timestamped lines)
  const rawTranscript = sttLines.map(l => {
    const mm = Math.floor(l.start / 60), ss = Math.floor(l.start % 60);
    return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}] ${l.text}`;
  }).join("\n");
  console.log(`  preview: ${rawTranscript.slice(0, 300)}...`);

  // 4. Build prompt
  const cat = await prisma.criteriaCategory.findFirst({
    where: { name: audio.category === "qayta" ? "Qayta qo'ng'iroq" : "Sotuv" },
    include: { criteria: { orderBy: { sortOrder: "asc" } } },
  });
  const criteriaText = cat.criteria.map((c, i) => `${i + 1}. ${c.name}\n   ${c.description}`).join("\n\n");
  const criteriaNames = cat.criteria.map(c => c.name);

  const prompt = `Sen sotuv qo'ng'iroqlarini tahlil qiluvchi ekspertsan. Quyidagi suhbat transkripti (Yandex STT, diarize yo'q — Menejer va Mijoz qatorlari aralash) bo'yicha "${cat.name}" mezonlari ostida baho qoy.

MEZONLAR:
${criteriaText}

SUHBAT (Yandex STT):
${rawTranscript}

Har mezonga 0-100 ball va 1-2 jumlali izoh ber. JSON format:
{"criteria": {"<mezon nomi>": {"score": <0-100>, "comment": "<izoh>"}}}`;

  // 5. Run both
  console.log("\n→ Gemini 2.5 Pro analiz...");
  const a = await callVertex("gemini-2.5-pro", "us-central1", prompt);
  console.log(`  ${(a.ms/1000).toFixed(1)}s | ${a.inTok}+${a.outTok} tok | $${a.cost.toFixed(4)}`);

  console.log("\n→ Gemini 3.1 Pro Preview analiz...");
  const b = await callVertex("gemini-3.1-pro-preview", "global", prompt);
  console.log(`  ${(b.ms/1000).toFixed(1)}s | ${b.inTok}+${b.outTok} tok | $${b.cost.toFixed(4)}`);

  // 6. Compare
  let sa, sb;
  try { sa = JSON.parse(a.text).criteria || {}; } catch { sa = {}; console.log("⚠ 2.5 parse fail"); }
  try { sb = JSON.parse(b.text).criteria || {}; } catch { sb = {}; console.log("⚠ 3.1 parse fail"); }

  console.log("\n═══ NATIJA ═══\n");
  console.log("MEZON                                              | 2.5 Pro | 3.1 Pro | farq");
  console.log("─".repeat(85));
  let s2 = 0, s3 = 0, n = 0;
  for (const name of criteriaNames) {
    const x = sa[name]?.score, y = sb[name]?.score;
    if (typeof x === "number") s2 += x;
    if (typeof y === "number") s3 += y;
    if (typeof x === "number" && typeof y === "number") n++;
    const diff = (typeof x === "number" && typeof y === "number") ? (y - x) : "?";
    console.log(`${name.padEnd(50).slice(0, 50)} | ${String(x ?? "?").padStart(6)}  | ${String(y ?? "?").padStart(6)}  | ${String(diff).padStart(4)}`);
  }
  console.log("─".repeat(85));
  console.log(`${"O'RTACHA".padEnd(50)} | ${(s2/criteriaNames.length).toFixed(1).padStart(6)}  | ${(s3/criteriaNames.length).toFixed(1).padStart(6)}  | ${((s3-s2)/criteriaNames.length).toFixed(1).padStart(4)}`);

  console.log(`\n═ Vaqt va narx ═`);
  console.log(`2.5 Pro: ${(a.ms/1000).toFixed(1)}s, $${a.cost.toFixed(4)}`);
  console.log(`3.1 Pro: ${(b.ms/1000).toFixed(1)}s, $${b.cost.toFixed(4)}`);
  console.log(`Farq:    vaqt ${(b.ms/a.ms).toFixed(2)}x, narx ${(b.cost/a.cost).toFixed(2)}x`);

  // Sample comments
  console.log(`\n═ Izoh namunalari (1-mezon) ═`);
  console.log(`2.5: ${sa[criteriaNames[0]]?.comment || "?"}`);
  console.log(`3.1: ${sb[criteriaNames[0]]?.comment || "?"}`);

  fs.writeFileSync("/tmp/compare-analiz-result.json", JSON.stringify({
    audio: { id: audio.id, fileName: audio.fileName, duration: audio.duration },
    transcript: rawTranscript,
    "2.5pro": { ms: a.ms, cost: a.cost, scores: sa },
    "3.1pro": { ms: b.ms, cost: b.cost, scores: sb },
  }, null, 2));
  console.log("\n→ /tmp/compare-analiz-result.json");

  await prisma.$disconnect();
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
