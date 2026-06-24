// Pipeline A (Yandex STT + 2.5 Flash diarize) vs Pipeline B (3 Flash STT+diarize)
// Aniqlikni Gemini 3.1 Pro Preview hakam sifatida hisoblaydi
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

const prisma = new PrismaClient();
const PROJECT = "big-quanta-469517-h6";
const AUDIO_ID = "cmov7u6xj00036awron8mo9hr";

let _t = null, _exp = 0;
async function getToken() {
  if (_t && Date.now() < _exp) return _t;
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  _t = (await (await auth.getClient()).getAccessToken()).token;
  _exp = Date.now() + 50 * 60 * 1000;
  return _t;
}

async function callVertex(model, location, parts, config = {}) {
  const token = await getToken();
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${PROJECT}/locations/${location}/publishers/google/models/${model}:generateContent`;
  const r = await axios.post(url, {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 16384, ...config },
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000, maxBodyLength: 200 * 1024 * 1024, validateStatus: () => true });
  if (r.status !== 200) throw new Error(`${model} ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
  return r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function judge(audioBuf, transcript, label) {
  console.log(`\n→ Hakam baholaydi: ${label}...`);
  const prompt = `Sen audio transkripsiya aniqligini baholovchi ekspertsan.

QUYIDAGI AUDIONI TINGLA va transkriptga taqqosla:

TRANSKRIPT (${label}):
\`\`\`
${transcript}
\`\`\`

VAZIFA:
1. Audioni diqqat bilan tingla
2. Har so'z to'g'ri yozilganmi tekshir (uzbek tilida)
3. Har timestamp [MM:SS] haqiqiy moment bilan ±3 sekunddan kam farq qilganmi
4. Diarizatsiya — gapiruvchi to'g'ri belgilanganmi (manager/client/system)

JSON qaytaring:
{
  "wordAccuracy": <0-100, foiz>,
  "wordAccuracyExplain": "<qisqa izoh, qaysi so'zlar xato>",
  "timingAccuracy": <0-100, foiz>,
  "timingAccuracyExplain": "<qisqa izoh>",
  "diarizationAccuracy": <0-100, foiz>,
  "diarizationAccuracyExplain": "<qisqa izoh>",
  "overallScore": <0-100>,
  "topErrors": ["xato1", "xato2", "xato3"]
}`;

  const t0 = Date.now();
  const text = await callVertex("gemini-3.1-pro-preview", "global", [
    { inlineData: { mimeType: "audio/mpeg", data: audioBuf.toString("base64") } },
    { text: prompt },
  ]);
  const ms = Date.now() - t0;
  console.log(`  ${(ms / 1000).toFixed(1)}s`);
  try {
    return { ms, ...JSON.parse(text) };
  } catch (e) {
    console.log(`  ⚠ parse fail: ${text.slice(0, 200)}`);
    return { ms, parseError: true, raw: text };
  }
}

(async () => {
  const audio = await prisma.audioFile.findUnique({ where: { id: AUDIO_ID } });
  console.log(`=== ${audio.fileName}, ${audio.duration}s ===`);

  // Download audio
  const tmpFile = path.join(os.tmpdir(), `judge-${randomUUID()}.mp3`);
  const dl = await axios.get(audio.fileUrl, { responseType: "arraybuffer", timeout: 300000 });
  fs.writeFileSync(tmpFile, Buffer.from(dl.data));
  const audioBuf = fs.readFileSync(tmpFile);

  // Load existing test data
  const sttData = JSON.parse(fs.readFileSync("/tmp/test-stt-result.json", "utf-8"));

  // Pipeline A — Yandex STT raw + 2.5 Flash diarize
  console.log("\n→ Pipeline A: 2.5 Flash diarize Yandex STT ustida...");
  const yandexSttForDiarize = sttData.yandex.transcript;

  const diarizeAPrompt = `You are an expert audio diarization specialist. Listen to the audio and use the Yandex STT below as reference. Manager: outgoing sales call.

Task:
1. Identify each phrase as "manager"|"client"|"system"
2. Fix obvious STT errors using audio
3. Use STT timestamps as ground truth (don't shift)
4. Format JSON: {"segments": [{"timestamp": "MM:SS", "speaker": "manager|client|system", "text": "..."}]}

YANDEX STT:
${yandexSttForDiarize}`;

  const tA = Date.now();
  const diarizeAText = await callVertex("gemini-2.5-flash", "us-central1", [
    { inlineData: { mimeType: "audio/mpeg", data: audioBuf.toString("base64") } },
    { text: diarizeAPrompt },
  ]);
  const tAMs = Date.now() - tA;
  let segsA = [];
  try { segsA = JSON.parse(diarizeAText).segments || []; } catch (e) { console.log(`  ⚠ A parse fail: ${e.message}`); }
  const transcriptA = segsA.map(s => {
    const role = s.speaker === "manager" ? "Menejer" : s.speaker === "client" ? "Mijoz" : "System";
    return `[${s.timestamp}] ${role}: ${s.text}`;
  }).join("\n");
  console.log(`  ${(tAMs/1000).toFixed(1)}s, ${segsA.length} segment`);

  // Pipeline B — already in sttData
  const segsB = sttData["gemini-3-flash-preview"].segments;
  const transcriptB = segsB.map(s => {
    const role = s.speaker === "manager" ? "Menejer" : s.speaker === "client" ? "Mijoz" : "System";
    return `[${s.timestamp}] ${role}: ${s.text}`;
  }).join("\n");
  console.log(`Pipeline B: 3 Flash STT+diarize, ${segsB.length} segment`);

  // Judge
  const judgeA = await judge(audioBuf, transcriptA, "Pipeline A: Yandex + 2.5 Flash diarize");
  const judgeB = await judge(audioBuf, transcriptB, "Pipeline B: 3 Flash STT+diarize");

  fs.unlinkSync(tmpFile);

  console.log("\n\n══════ ANIQLIK BAHOSI ══════\n");
  console.log("Mezon                          | Pipeline A | Pipeline B | Farq");
  console.log("─".repeat(75));
  const rows = [
    ["So'z aniqligi (Word)", judgeA.wordAccuracy, judgeB.wordAccuracy],
    ["Timing aniqligi", judgeA.timingAccuracy, judgeB.timingAccuracy],
    ["Diarizatsiya aniqligi", judgeA.diarizationAccuracy, judgeB.diarizationAccuracy],
    ["Umumiy baho", judgeA.overallScore, judgeB.overallScore],
  ];
  for (const [name, a, b] of rows) {
    const diff = (typeof a === "number" && typeof b === "number") ? `${b > a ? "+" : ""}${b - a}` : "?";
    console.log(`${name.padEnd(30)} | ${String(a ?? "?").padStart(8)}%  | ${String(b ?? "?").padStart(8)}%  | ${diff}`);
  }

  console.log("\n═ Pipeline A (Yandex + 2.5 Flash diarize) izohlari ═");
  console.log(`So'z:    ${judgeA.wordAccuracyExplain || "?"}`);
  console.log(`Timing:  ${judgeA.timingAccuracyExplain || "?"}`);
  console.log(`Diarize: ${judgeA.diarizationAccuracyExplain || "?"}`);
  console.log(`Top xatolar: ${(judgeA.topErrors || []).join(" | ")}`);

  console.log("\n═ Pipeline B (3 Flash STT+diarize) izohlari ═");
  console.log(`So'z:    ${judgeB.wordAccuracyExplain || "?"}`);
  console.log(`Timing:  ${judgeB.timingAccuracyExplain || "?"}`);
  console.log(`Diarize: ${judgeB.diarizationAccuracyExplain || "?"}`);
  console.log(`Top xatolar: ${(judgeB.topErrors || []).join(" | ")}`);

  fs.writeFileSync("/tmp/judge-stt-result.json", JSON.stringify({
    audio: { id: audio.id, fileName: audio.fileName, duration: audio.duration },
    pipelineA: { transcript: transcriptA, judge: judgeA },
    pipelineB: { transcript: transcriptB, judge: judgeB },
  }, null, 2));
  console.log("\n→ /tmp/judge-stt-result.json");

  await prisma.$disconnect();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
