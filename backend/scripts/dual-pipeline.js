// Dual pipeline test: ESKI vs YANGI avlod
// ESKI: Yandex STT + 2.5 Flash diarize + 2.5 Pro analiz
// YANGI: Gemini 3 Flash Preview STT+diarize + 3 Flash Preview analiz
require("dotenv").config({ path: "/var/www/prosales-backend/.env" });
process.env.GOOGLE_APPLICATION_CREDENTIALS = "/var/www/prosales-backend/credentials/big-quanta-469517-h6-55280c39d520.json";
process.env.VERTEX_PROJECT = "big-quanta-469517-h6";

const fs = require("fs");
const os = require("os");
const path = require("path");
const axios = require("axios");
const { randomUUID, randomBytes } = require("crypto");
const { GoogleAuth } = require("google-auth-library");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PROJECT = "big-quanta-469517-h6";
const SOURCE_AUDIO_ID = "cmov21t7500dbaxvsavw9a6i5"; // 244s qayta

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
  const t0 = Date.now();
  const r = await axios.post(url, {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 16384, ...config },
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000, maxBodyLength: 200 * 1024 * 1024, validateStatus: () => true });
  const ms = Date.now() - t0;
  if (r.status !== 200) throw new Error(`${model} ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
  const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const u = r.data?.usageMetadata || {};
  return { ms, text, inTok: u.promptTokenCount || 0, outTok: u.candidatesTokenCount || 0 };
}

async function buildAnalysisPrompt(transcript, category) {
  const cat = await prisma.criteriaCategory.findFirst({
    where: { name: category === "qayta" ? "Qayta qo'ng'iroq" : "Sotuv" },
    include: { criteria: { orderBy: { sortOrder: "asc" } } },
  });
  const criteriaText = cat.criteria.map((c, i) => `${i + 1}. ${c.name}\n   ${c.description}`).join("\n\n");
  const criteriaNames = cat.criteria.map(c => c.name);

  const prompt = `Sen sotuv qo'ng'iroqlarini tahlil qiluvchi ekspertsan. Quyidagi suhbatni "${cat.name}" mezonlari bo'yicha baho qoy.

MEZONLAR:
${criteriaText}

SUHBAT:
${transcript}

JSON qaytaring:
{
  "summary": "<3-4 jumlali umumiy xulosa>",
  "overallScore": <0-100>,
  "leadQuality": "<sovuq|iliq|issiq>",
  "leadScore": <0-100>,
  "criteria": {
    "<mezon nomi>": {"score": <0-100>, "comment": "<2-3 jumla>"}
  },
  "errors": ["<xato 1>", "<xato 2>"],
  "winPoints": ["<plus 1>", "<plus 2>"],
  "lossPoints": ["<minus 1>", "<minus 2>"],
  "objections": [{"objection": "<mijoz e'tirozi>", "managerResponse": "<menejer javobi>", "wasResolved": <bool>}],
  "managerSpeech": <0-1, menejer gapirish foizi>,
  "clientSpeech": <0-1, mijoz gapirish foizi>,
  "coachingInsights": {
    "speechRatioAlert": <bool>,
    "surrenderedObjections": <count>,
    "openEnding": <bool>,
    "criticalMoments": []
  }
}`;
  return { prompt, criteriaNames };
}

async function runPipelineA(srcAudio, audioBuf) {
  console.log("\n████ PIPELINE A (ESKI AVLOD) ████");
  console.log("STT: Yandex (mavjud transkriptsiya), Analiz: gemini-2.5-pro");

  // Already have transcription from current backfill
  const transcript = srcAudio.transcription;
  console.log(`  Mavjud transkripsiya: ${transcript.length} chars`);

  const { prompt } = await buildAnalysisPrompt(transcript, srcAudio.category);

  console.log("→ Analiz: gemini-2.5-pro...");
  let analysisResult;
  try {
    analysisResult = await callVertex("gemini-2.5-pro", "us-central1", [{ text: prompt }]);
    console.log(`  ${(analysisResult.ms/1000).toFixed(1)}s | ${analysisResult.inTok}+${analysisResult.outTok} tok | $${((analysisResult.inTok/1e6)*1.25 + (analysisResult.outTok/1e6)*10).toFixed(4)}`);
  } catch (e) {
    console.log(`  ✗ ${e.message.slice(0,150)}`);
    return null;
  }

  let parsed;
  try { parsed = JSON.parse(analysisResult.text); } catch (e) { console.log(`  ⚠ JSON parse fail`); return null; }

  // Create duplicate AudioFile (label: ESKI)
  const newAudio = await prisma.audioFile.create({
    data: {
      companyId: srcAudio.companyId,
      managerId: srcAudio.managerId,
      fileName: `[ESKI] ${srcAudio.fileName}`,
      fileUrl: srcAudio.fileUrl,
      duration: srcAudio.duration,
      category: srcAudio.category,
      status: "completed",
      transcription: transcript,
      callDate: srcAudio.callDate,
      direction: srcAudio.direction,
      leadCreatedAt: srcAudio.leadCreatedAt,
      pipelineName: srcAudio.pipelineName,
      shareToken: randomBytes(16).toString("hex"),
      sharedAt: new Date(),
    },
  });
  console.log(`  AudioFile yaratildi: ${newAudio.id}`);

  // Save Analysis
  await prisma.analysis.create({
    data: {
      audioFileId: newAudio.id,
      summary: parsed.summary || "",
      overallScore: parsed.overallScore || 0,
      leadQuality: parsed.leadQuality || "iliq",
      leadScore: parsed.leadScore || 0,
      criteria: parsed.criteria || {},
      errors: parsed.errors || [],
      winPoints: parsed.winPoints || [],
      lossPoints: parsed.lossPoints || [],
      objections: parsed.objections || [],
      managerSpeech: parsed.managerSpeech || 0.5,
      clientSpeech: parsed.clientSpeech || 0.5,
      coachingInsights: parsed.coachingInsights || {},
    },
  });
  console.log(`  Analysis saqlandi`);

  return { audioId: newAudio.id, shareToken: newAudio.shareToken, analiz: parsed, time: analysisResult.ms, cost: ((analysisResult.inTok/1e6)*1.25 + (analysisResult.outTok/1e6)*10) };
}

async function runPipelineB(srcAudio, audioBuf) {
  console.log("\n████ PIPELINE B (YANGI AVLOD) ████");
  console.log("STT+Diarize: gemini-3-flash-preview, Analiz: gemini-3-flash-preview");

  // Stage 1: STT + diarize
  const sttPrompt = `Sen audio transkripsiya va diarizatsiya bo'yicha ekspertsan. Quyidagi sotuv qo'ng'irog'i audiosini tinglab:
1. Har qatori uchun gapiruvchini aniqlang (manager / client / system)
2. Aniq timestamp [MM:SS] format
3. Uzbek tilida saqlang
4. Ringing/fon shovqinni "system" deb belgilang
5. Bitta gapirish davomida segmentlarga bo'lib yubormang

JSON: {"segments": [{"timestamp": "MM:SS", "speaker": "manager|client|system", "text": "..."}]}`;

  console.log("→ STT+Diarize: gemini-3-flash-preview...");
  const sttResult = await callVertex("gemini-3-flash-preview", "global", [
    { inlineData: { mimeType: "audio/mpeg", data: audioBuf.toString("base64") } },
    { text: sttPrompt },
  ], { maxOutputTokens: 16384 });
  console.log(`  ${(sttResult.ms/1000).toFixed(1)}s | ${sttResult.inTok}+${sttResult.outTok} tok | $${((sttResult.inTok/1e6)*0.30 + (sttResult.outTok/1e6)*2.50).toFixed(4)}`);

  let segments;
  try { segments = JSON.parse(sttResult.text).segments || []; } catch (e) { console.log(`  ⚠ STT parse fail`); return null; }

  // Post-process: merge consecutive same-speaker segments (over-segmentation fix)
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.text += " " + seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  console.log(`  Original: ${segments.length} segment, post-merge: ${merged.length}`);

  const transcript = merged.map(s => {
    const role = s.speaker === "manager" ? "Menejer" : s.speaker === "client" ? "Mijoz" : "System";
    return `[${s.timestamp}] ${role}: ${s.text}`;
  }).join("\n");

  // Stage 2: analiz
  const { prompt: analizPrompt } = await buildAnalysisPrompt(transcript, srcAudio.category);

  console.log("→ Analiz: gemini-3-flash-preview...");
  const analizResult = await callVertex("gemini-3-flash-preview", "global", [{ text: analizPrompt }], { maxOutputTokens: 8192 });
  console.log(`  ${(analizResult.ms/1000).toFixed(1)}s | ${analizResult.inTok}+${analizResult.outTok} tok | $${((analizResult.inTok/1e6)*0.30 + (analizResult.outTok/1e6)*2.50).toFixed(4)}`);

  let parsed;
  try { parsed = JSON.parse(analizResult.text); } catch (e) { console.log(`  ⚠ analiz parse fail`); return null; }

  // Create AudioFile (label: YANGI)
  const newAudio = await prisma.audioFile.create({
    data: {
      companyId: srcAudio.companyId,
      managerId: srcAudio.managerId,
      fileName: `[YANGI] ${srcAudio.fileName}`,
      fileUrl: srcAudio.fileUrl,
      duration: srcAudio.duration,
      category: srcAudio.category,
      status: "completed",
      transcription: transcript,
      callDate: srcAudio.callDate,
      direction: srcAudio.direction,
      leadCreatedAt: srcAudio.leadCreatedAt,
      pipelineName: srcAudio.pipelineName,
      shareToken: randomBytes(16).toString("hex"),
      sharedAt: new Date(),
    },
  });
  console.log(`  AudioFile yaratildi: ${newAudio.id}`);

  await prisma.analysis.create({
    data: {
      audioFileId: newAudio.id,
      summary: parsed.summary || "",
      overallScore: parsed.overallScore || 0,
      leadQuality: parsed.leadQuality || "iliq",
      leadScore: parsed.leadScore || 0,
      criteria: parsed.criteria || {},
      errors: parsed.errors || [],
      winPoints: parsed.winPoints || [],
      lossPoints: parsed.lossPoints || [],
      objections: parsed.objections || [],
      managerSpeech: parsed.managerSpeech || 0.5,
      clientSpeech: parsed.clientSpeech || 0.5,
      coachingInsights: parsed.coachingInsights || {},
    },
  });
  console.log(`  Analysis saqlandi`);

  const totalCost = ((sttResult.inTok/1e6)*0.30 + (sttResult.outTok/1e6)*2.50) + ((analizResult.inTok/1e6)*0.30 + (analizResult.outTok/1e6)*2.50);
  return { audioId: newAudio.id, shareToken: newAudio.shareToken, analiz: parsed, time: sttResult.ms + analizResult.ms, cost: totalCost, transcript };
}

(async () => {
  const src = await prisma.audioFile.findUnique({ where: { id: SOURCE_AUDIO_ID } });
  console.log(`=== SOURCE: ${src.fileName}, ${src.duration}s, ${src.category} ===`);

  // Download once
  const tmpFile = path.join(os.tmpdir(), `dual-${randomUUID()}.mp3`);
  console.log("→ Yuklash...");
  const dl = await axios.get(src.fileUrl, { responseType: "arraybuffer", timeout: 300000 });
  fs.writeFileSync(tmpFile, Buffer.from(dl.data));
  const audioBuf = fs.readFileSync(tmpFile);

  const [resA, resB] = await Promise.all([
    runPipelineA(src, audioBuf).catch(e => { console.error("A FAIL:", e.message); return null; }),
    runPipelineB(src, audioBuf).catch(e => { console.error("B FAIL:", e.message); return null; }),
  ]);

  fs.unlinkSync(tmpFile);

  console.log("\n\n══════ NATIJA ══════\n");

  if (resA) {
    console.log("PIPELINE A (ESKI AVLOD):");
    console.log(`  AudioId:   ${resA.audioId}`);
    console.log(`  Frontend:  https://prosales.asosit.uz/audio/${resA.audioId}`);
    console.log(`  Public:    https://prosales.asosit.uz/shared/audio/${resA.shareToken}`);
    console.log(`  Vaqt:      ${(resA.time/1000).toFixed(1)}s (analiz qismi)`);
    console.log(`  Narx:      $${resA.cost.toFixed(4)} (analiz)`);
    console.log(`  Overall:   ${resA.analiz.overallScore}/100`);
  }

  if (resB) {
    console.log("\nPIPELINE B (YANGI AVLOD):");
    console.log(`  AudioId:   ${resB.audioId}`);
    console.log(`  Frontend:  https://prosales.asosit.uz/audio/${resB.audioId}`);
    console.log(`  Public:    https://prosales.asosit.uz/shared/audio/${resB.shareToken}`);
    console.log(`  Vaqt:      ${(resB.time/1000).toFixed(1)}s (STT+diarize+analiz)`);
    console.log(`  Narx:      $${resB.cost.toFixed(4)}`);
    console.log(`  Overall:   ${resB.analiz.overallScore}/100`);
  }

  if (resA && resB) {
    console.log("\n═ Tezlik: ", `Pipeline B/A = ${(resB.time/resA.time).toFixed(2)}x`);
    console.log("═ Narx:    ", `Pipeline B/A = ${(resB.cost/resA.cost).toFixed(2)}x`);
  }

  fs.writeFileSync("/tmp/dual-pipeline-result.json", JSON.stringify({ A: resA, B: resB }, null, 2));
  await prisma.$disconnect();
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
