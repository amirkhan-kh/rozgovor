// Yandex STT vs Gemini 3 Flash Preview STT solishtirish
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
const PROJECT = "big-quanta-469517-h6";
const AUDIO_ID = "cmov7u6xj00036awron8mo9hr"; // 5.6 min qayta

const PRICE = {
  "gemini-3.1-flash-lite-preview": { in: 0.10, out: 0.40 },
  "gemini-3-flash-preview":         { in: 0.30, out: 2.50 },
};

let _t = null, _exp = 0;
async function getToken() {
  if (_t && Date.now() < _exp) return _t;
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  _t = (await (await auth.getClient()).getAccessToken()).token;
  _exp = Date.now() + 50 * 60 * 1000;
  return _t;
}

async function geminiSTT(model, audioBuf, mimeType) {
  const token = await getToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${model}:generateContent`;
  const prompt = `Sen audio transkripsiya va diarizatsiya bo'yicha ekspertsan. Quyidagi sotuv qo'ng'irog'i audiosini tinglab:

1. Har qatori uchun: gapiruvchini aniqlang (manager / client / system)
2. Aniq timestamp ber: [MM:SS] format
3. Uzbek tilini saqlang, hech qanday tarjima yo'q
4. STT xato bo'lgan so'zlarni audio asosida to'g'rilang
5. Ringing / fon shovqinni "system" deb belgilang

JSON format qaytaring:
{
  "segments": [
    {"timestamp": "00:08", "speaker": "manager"|"client"|"system", "text": "..."}
  ]
}`;

  const t0 = Date.now();
  const r = await axios.post(url, {
    contents: [{
      role: "user",
      parts: [
        { inlineData: { mimeType, data: audioBuf.toString("base64") } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      maxOutputTokens: 16384,
    },
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000, maxBodyLength: 200 * 1024 * 1024, validateStatus: () => true });
  const ms = Date.now() - t0;
  if (r.status !== 200) throw new Error(`${model} ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
  const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const u = r.data?.usageMetadata || {};
  const inTok = u.promptTokenCount || 0, outTok = u.candidatesTokenCount || 0;
  const p = PRICE[model] || { in: 0, out: 0 };
  const cost = (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
  return { ms, inTok, outTok, cost, text };
}

(async () => {
  const audio = await prisma.audioFile.findUnique({ where: { id: AUDIO_ID } });
  console.log(`=== ${audio.fileName}, ${audio.duration}s ===\n`);

  // Download
  const tmpFile = path.join(os.tmpdir(), `stt-${randomUUID()}.mp3`);
  console.log("→ Yuklash...");
  const dl = await axios.get(audio.fileUrl, { responseType: "arraybuffer", timeout: 300000 });
  fs.writeFileSync(tmpFile, Buffer.from(dl.data));
  const audioBuf = fs.readFileSync(tmpFile);
  console.log(`  ${(audioBuf.length / 1024 / 1024).toFixed(2)} MB\n`);

  // 1. Yandex STT
  console.log("→ Yandex STT (deferred-streaming)...");
  const tY = Date.now();
  const pcm = extractPcm(tmpFile, { normalize: false });
  const yandexWords = await transcribePcmFile(pcm);
  const yandexLines = wordsToLines(yandexWords);
  fs.unlinkSync(pcm);
  const yandexMs = Date.now() - tY;
  const yandexCost = (audio.duration / 60) * 0.0026; // ~ $0.156/h
  console.log(`  ${(yandexMs/1000).toFixed(1)}s | ${yandexWords.length} so'z | ${yandexLines.length} qator | ~$${yandexCost.toFixed(4)}`);

  const yandexTranscript = yandexLines.map(l => {
    const mm = Math.floor(l.start / 60), ss = Math.floor(l.start % 60);
    return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}] ${l.text}`;
  }).join("\n");

  // 2. Gemini 3 Flash Preview STT+diarize
  console.log("\n→ Gemini 3 Flash Preview (audio input → STT+diarize)...");
  const flash = await geminiSTT("gemini-3-flash-preview", audioBuf, "audio/mpeg");
  console.log(`  ${(flash.ms/1000).toFixed(1)}s | ${flash.inTok}+${flash.outTok} tok | $${flash.cost.toFixed(4)}`);

  let flashSegs = [];
  try { flashSegs = JSON.parse(flash.text).segments || []; } catch { console.log("  ⚠ parse fail"); }
  const flashTranscript = flashSegs.map(s => {
    const role = s.speaker === "manager" ? "Menejer" : s.speaker === "client" ? "Mijoz" : "System";
    return `[${s.timestamp}] ${role}: ${s.text}`;
  }).join("\n");

  // 3. Gemini 3.1 Flash Lite Preview STT+diarize
  console.log("\n→ Gemini 3.1 Flash Lite Preview (audio input → STT+diarize)...");
  let lite, liteSegs = [], liteTranscript = "";
  try {
    lite = await geminiSTT("gemini-3.1-flash-lite-preview", audioBuf, "audio/mpeg");
    console.log(`  ${(lite.ms/1000).toFixed(1)}s | ${lite.inTok}+${lite.outTok} tok | $${lite.cost.toFixed(4)}`);
    try { liteSegs = JSON.parse(lite.text).segments || []; } catch { console.log("  ⚠ parse fail"); }
    liteTranscript = liteSegs.map(s => {
      const role = s.speaker === "manager" ? "Menejer" : s.speaker === "client" ? "Mijoz" : "System";
      return `[${s.timestamp}] ${role}: ${s.text}`;
    }).join("\n");
  } catch (e) {
    console.log(`  ✗ FAIL: ${e.message.slice(0, 200)}`);
    lite = { ms: 0, cost: 0, inTok: 0, outTok: 0 };
  }

  fs.unlinkSync(tmpFile);

  // === Print all 3 transcripts ===
  console.log("\n\n══════ NATIJA ══════\n");
  console.log("┌─── YANDEX STT (raw, diarize yo'q) ───┐");
  console.log(yandexTranscript);
  console.log(`\n┌─── GEMINI 3 FLASH PREVIEW (STT+diarize) ───┐`);
  console.log(flashTranscript);
  console.log(`\n┌─── GEMINI 3.1 FLASH LITE PREVIEW (STT+diarize) ───┐`);
  console.log(liteTranscript || "(fail)");

  console.log("\n\n═════ JADVAL ═════\n");
  console.log("Provayder                       | Vaqt   | Qator| So'z | Narx     | Diarize");
  console.log("─".repeat(85));
  const yandexWordCount = yandexLines.reduce((s,l) => s + l.text.split(" ").length, 0);
  const flashWordCount = flashSegs.reduce((s,seg) => s + seg.text.split(" ").length, 0);
  const liteWordCount = liteSegs.reduce((s,seg) => s + seg.text.split(" ").length, 0);
  console.log(`Yandex STT v3                  | ${(yandexMs/1000).toFixed(1).padStart(5)}s | ${String(yandexLines.length).padStart(4)} | ${String(yandexWordCount).padStart(4)} | $${yandexCost.toFixed(4)} | ❌ Yo'q`);
  console.log(`Gemini 3 Flash Preview         | ${(flash.ms/1000).toFixed(1).padStart(5)}s | ${String(flashSegs.length).padStart(4)} | ${String(flashWordCount).padStart(4)} | $${flash.cost.toFixed(4)} | ✅ Bor`);
  console.log(`Gemini 3.1 Flash Lite Preview  | ${(lite.ms/1000).toFixed(1).padStart(5)}s | ${String(liteSegs.length).padStart(4)} | ${String(liteWordCount).padStart(4)} | $${lite.cost.toFixed(4)} | ✅ Bor`);

  fs.writeFileSync("/tmp/test-stt-result.json", JSON.stringify({
    audio: { id: audio.id, fileName: audio.fileName, duration: audio.duration },
    yandex: { ms: yandexMs, cost: yandexCost, wordCount: yandexWordCount, lineCount: yandexLines.length, transcript: yandexTranscript },
    "gemini-3-flash-preview": { ms: flash.ms, cost: flash.cost, segCount: flashSegs.length, wordCount: flashWordCount, segments: flashSegs },
    "gemini-3.1-flash-lite-preview": { ms: lite?.ms || 0, cost: lite?.cost || 0, segCount: liteSegs.length, wordCount: liteWordCount, segments: liteSegs },
  }, null, 2));
  console.log("\n→ /tmp/test-stt-result.json");

  await prisma.$disconnect();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
