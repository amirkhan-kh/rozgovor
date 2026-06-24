// Test: 1 uzun audio bo'yicha 2.5 vs 3.1 pipeline solishtirish
require("dotenv").config({ path: "/var/www/prosales-backend/.env" });
process.env.GOOGLE_APPLICATION_CREDENTIALS = "/var/www/prosales-backend/credentials/big-quanta-469517-h6-55280c39d520.json";
process.env.VERTEX_PROJECT = "big-quanta-469517-h6";
process.env.VERTEX_LOCATION = "us-central1";

const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const { randomUUID } = require("crypto");
const { GoogleAuth } = require("google-auth-library");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const AUDIO_ID = "cmov7u6xj00036awron8mo9hr"; // 2015s, sotuv
const PROJECT = "big-quanta-469517-h6";

const PRICE = {
  "gemini-2.5-flash":            { in: 0.30, out: 2.50 },
  "gemini-2.5-pro":              { in: 1.25, out: 10.00 },
  "gemini-3.1-pro-preview":      { in: 2.00, out: 12.00 },        // tahminiy
  "gemini-3.1-flash-lite-preview": { in: 0.10, out: 0.40 },        // tahminiy
};

let _token = null, _tokExpiry = 0;
async function getToken() {
  if (_token && Date.now() < _tokExpiry) return _token;
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  _token = (await client.getAccessToken()).token;
  _tokExpiry = Date.now() + 50 * 60 * 1000;
  return _token;
}

async function callVertex(model, location, contents, config = {}) {
  const token = await getToken();
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${PROJECT}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const t0 = Date.now();
  const resp = await axios.post(url, { contents, generationConfig: config }, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: 600000,
    maxBodyLength: 200 * 1024 * 1024,
    maxContentLength: 200 * 1024 * 1024,
    validateStatus: () => true,
  });
  const ms = Date.now() - t0;
  if (resp.status !== 200) {
    throw new Error(`${model} ${resp.status}: ${JSON.stringify(resp.data).slice(0, 500)}`);
  }
  const usage = resp.data?.usageMetadata || {};
  const text = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const inTok = usage.promptTokenCount || 0;
  const outTok = usage.candidatesTokenCount || 0;
  const price = PRICE[model] || { in: 0, out: 0 };
  const cost = (inTok / 1e6) * price.in + (outTok / 1e6) * price.out;
  return { ms, inTok, outTok, cost, text };
}

const { transcribeAudio } = require("/var/www/prosales-backend/dist/services/call-transcriber");

async function main() {
  const audio = await prisma.audioFile.findUnique({ where: { id: AUDIO_ID } });
  console.log("=== Audio ===");
  console.log(`${audio.fileName}, ${audio.duration}s (${(audio.duration/60).toFixed(1)} min), ${audio.category}`);

  // 1. Download
  console.log("\n→ Yuklash...");
  const tmpFile = path.join(os.tmpdir(), `cmp-${randomUUID()}.mp3`);
  const dlResp = await axios.get(audio.fileUrl, { responseType: "arraybuffer", timeout: 300000 });
  fs.writeFileSync(tmpFile, Buffer.from(dlResp.data));
  const buf = fs.readFileSync(tmpFile);
  console.log(`  ${(buf.length / 1024 / 1024).toFixed(2)} MB`);

  // 2. Yandex STT + 2.5 Flash diarize (existing function — bu bizning pipeline A)
  console.log("\n→ Pipeline A: Yandex STT + Gemini 2.5 Flash diarize...");
  const tA0 = Date.now();
  const transcriptA = await transcribeAudio(buf, audio.fileName, "Menejer", audio.duration);
  const tAMs = Date.now() - tA0;
  console.log(`  STT+diarize: ${(tAMs / 1000).toFixed(1)}s, ${transcriptA.length} chars`);
  console.log(`  preview: ${transcriptA.split("\n").slice(0, 3).join(" | ").slice(0, 200)}`);

  // 3. Pipeline B uchun: STT'ni qaytadan olish kerak (audio + STT raw lines kerak)
  // Avvalgi transcriptA dan STT extract qilamiz (timestamp + text)
  const sttLinesA = transcriptA.split("\n")
    .map(line => {
      const m = line.match(/^\[(\d{2}):(\d{2})\]\s*(?:Menejer|Mijoz|System):\s*(.*)$/);
      if (!m) return null;
      return { text: m[3].trim(), start: parseInt(m[1]) * 60 + parseInt(m[2]) };
    })
    .filter(Boolean);

  // 3.1 Flash Lite Preview diarize (audio + STT)
  console.log("\n→ Pipeline B: Gemini 3.1 Flash Lite Preview diarize...");
  const ext = audio.fileName.split(".").pop()?.toLowerCase() || "mp3";
  const mimeMap = { mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav" };
  const mimeType = mimeMap[ext] || "audio/mpeg";
  const base64 = buf.toString("base64");

  const sttText = sttLinesA.map(l => {
    const mm = Math.floor(l.start / 60), ss = Math.floor(l.start % 60);
    return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}] ${l.text}`;
  }).join("\n");

  const diarizePrompt = `You are an expert audio diarization specialist. I provide:
1. Original audio
2. Yandex STT transcription with timestamps

Manager: "Menejer" (outgoing sales call).
Identify each STT phrase as "manager" | "client" | "system".
Return JSON: {"segments": [{"speaker", "text", "timestamp"}]}.

STT:
${sttText}`;

  const diarizeBContents = [{
    role: "user",
    parts: [
      { inlineData: { mimeType, data: base64 } },
      { text: diarizePrompt },
    ],
  }];

  const diarizeBConfig = { temperature: 0, responseMimeType: "application/json" };

  const diarB = await callVertex("gemini-3.1-flash-lite-preview", "global", diarizeBContents, diarizeBConfig);
  console.log(`  ${(diarB.ms / 1000).toFixed(1)}s | ${diarB.inTok} in + ${diarB.outTok} out | $${diarB.cost.toFixed(4)}`);

  let transcriptB;
  try {
    const parsed = JSON.parse(diarB.text);
    transcriptB = parsed.segments.map(s => {
      const role = s.speaker === "manager" ? "Menejer" : s.speaker === "client" ? "Mijoz" : "System";
      return `[${s.timestamp}] ${role}: ${s.text}`;
    }).join("\n");
  } catch (e) {
    transcriptB = transcriptA; // fallback
    console.log("  ⚠ 3.1 diarize parse fail, using A as B baseline");
  }
  console.log(`  preview: ${transcriptB.split("\n").slice(0, 3).join(" | ").slice(0, 200)}`);

  // 4. Build analiz prompt — same input both
  const cat = await prisma.criteriaCategory.findFirst({
    where: { name: audio.category === "qayta" ? "Qayta qo'ng'iroq" : "Sotuv" },
    include: { criteria: { orderBy: { sortOrder: "asc" } } },
  });
  const criteriaText = cat.criteria.map((c, i) => `${i + 1}. ${c.name}\n   ${c.description}`).join("\n\n");
  const criteriaNames = cat.criteria.map(c => c.name);

  const analyzePrompt = (transcript) => `Sen sotuv qo'ng'iroqlarini tahlil qiluvchi ekspert. Quyidagi suhbatni ${cat.name} kategoriyasi mezonlari bilan baholang:

MEZONLAR:
${criteriaText}

SUHBAT:
${transcript}

Har mezonga 0-100 ball va qisqa izoh bering. JSON format:
{"criteria": {"<mezon nomi>": {"score": <0-100>, "comment": "<izoh>"}}}`;

  // 5. Pipeline A: 2.5 Pro analiz
  console.log("\n→ Pipeline A analiz: Gemini 2.5 Pro...");
  const proA = await callVertex("gemini-2.5-pro", "us-central1",
    [{ role: "user", parts: [{ text: analyzePrompt(transcriptA) }] }],
    { temperature: 0.2, responseMimeType: "application/json" });
  console.log(`  ${(proA.ms / 1000).toFixed(1)}s | ${proA.inTok} in + ${proA.outTok} out | $${proA.cost.toFixed(4)}`);

  // 6. Pipeline B: 3.1 Pro Preview analiz
  console.log("\n→ Pipeline B analiz: Gemini 3.1 Pro Preview...");
  const proB = await callVertex("gemini-3.1-pro-preview", "global",
    [{ role: "user", parts: [{ text: analyzePrompt(transcriptB) }] }],
    { temperature: 0.2, responseMimeType: "application/json" });
  console.log(`  ${(proB.ms / 1000).toFixed(1)}s | ${proB.inTok} in + ${proB.outTok} out | $${proB.cost.toFixed(4)}`);

  // 7. Compare scores
  let scoresA, scoresB;
  try { scoresA = JSON.parse(proA.text).criteria || {}; } catch { scoresA = {}; }
  try { scoresB = JSON.parse(proB.text).criteria || {}; } catch { scoresB = {}; }

  console.log("\n\n═════ NATIJA ═════");
  console.log("\nMEZON                                              | A (2.5)  | B (3.1)  | diff");
  console.log("─".repeat(95));
  let sumA = 0, sumB = 0;
  for (const name of criteriaNames) {
    const a = scoresA[name]?.score;
    const b = scoresB[name]?.score;
    if (typeof a === "number") sumA += a;
    if (typeof b === "number") sumB += b;
    const diff = (typeof a === "number" && typeof b === "number") ? (b - a) : "?";
    console.log(`  ${name.padEnd(50).slice(0, 50)} | ${String(a ?? "?").padStart(6)} | ${String(b ?? "?").padStart(6)} | ${String(diff).padStart(4)}`);
  }
  const avgA = sumA / criteriaNames.length, avgB = sumB / criteriaNames.length;
  console.log("─".repeat(95));
  console.log(`  ${"O'RTACHA".padEnd(50)} | ${avgA.toFixed(1).padStart(6)} | ${avgB.toFixed(1).padStart(6)} | ${(avgB - avgA).toFixed(1).padStart(4)}`);

  console.log("\n═ Vaqt va narx ═");
  console.log(`Pipeline A (2.5 Flash diarize + 2.5 Pro analiz):`);
  console.log(`  STT+diarize: ${(tAMs/1000).toFixed(1)}s`);
  console.log(`  Analiz: ${(proA.ms/1000).toFixed(1)}s, $${proA.cost.toFixed(4)}`);
  console.log(`  Jami: ${((tAMs+proA.ms)/1000).toFixed(1)}s, $${(proA.cost).toFixed(4)} (STT $$$ alohida)`);

  console.log(`\nPipeline B (3.1 Flash Lite diarize + 3.1 Pro Preview analiz):`);
  console.log(`  Diarize: ${(diarB.ms/1000).toFixed(1)}s, $${diarB.cost.toFixed(4)}`);
  console.log(`  Analiz: ${(proB.ms/1000).toFixed(1)}s, $${proB.cost.toFixed(4)}`);
  console.log(`  Jami: ${((diarB.ms+proB.ms)/1000).toFixed(1)}s, $${(diarB.cost+proB.cost).toFixed(4)} (STT $$$ alohida)`);

  // Save
  fs.writeFileSync("/tmp/compare-result.json", JSON.stringify({
    audio: { id: audio.id, fileName: audio.fileName, duration: audio.duration },
    pipelineA: { transcript: transcriptA, scores: scoresA, time: { stt_diarize: tAMs, analiz: proA.ms }, cost: { analiz: proA.cost } },
    pipelineB: { transcript: transcriptB, scores: scoresB, time: { diarize: diarB.ms, analiz: proB.ms }, cost: { diarize: diarB.cost, analiz: proB.cost } },
  }, null, 2));
  console.log("\nNatija: /tmp/compare-result.json");

  fs.unlinkSync(tmpFile);
  await prisma.$disconnect();
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
