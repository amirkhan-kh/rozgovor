// Test pipeline: Yandex STT + Gemini Flash diarize + Flash vs Pro analiz
require("dotenv").config({ path: "/var/www/prosales-backend/.env" });

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const { PrismaClient } = require("@prisma/client");

const { transcribeAudio } = require("/var/www/prosales-backend/dist/services/call-transcriber");
const { buildAnalysisPrompt, applyAnalysisFallbacks } = require("/var/www/prosales-backend/dist/services/call-analyzer");

const prisma = new PrismaClient();

// Pricing per 1M tokens (Gemini Vertex pricing as of 2026, approx)
const PRICE = {
  "gemini-2.5-flash": { in: 0.30, out: 2.50 },
  "gemini-2.5-pro":   { in: 1.25, out: 10.00 },
};

const TARGET_IDS = [
  "cmov21tvb00nlaxvs0329c54b", // 67s qayta
  "cmov21t1b00axaxvsedhmjk19", // 140s sotuv
  "cmov3jv87000914h61wwjvhk9", // 402s sotuv
];

async function downloadAudio(url, dest) {
  const resp = await axios.get(url, { responseType: "arraybuffer", timeout: 120000 });
  fs.writeFileSync(dest, Buffer.from(resp.data));
  return dest;
}

async function getCriteriaContext(category) {
  const cats = await prisma.criteriaCategory.findMany({
    where: { name: category === "qayta" ? "Qayta qo'ng'iroq" : "Sotuv" },
    include: { criteria: { orderBy: { sortOrder: "asc" } } },
  });
  if (!cats[0]) throw new Error(`Kategoriya topilmadi: ${category}`);
  const cat = cats[0];
  const criteriaText = cat.criteria.map((c, i) => `${i + 1}. ${c.name}\n   ${c.description}`).join("\n\n");
  const criteriaNames = cat.criteria.map((c) => c.name);
  return { criteriaText, criteriaNames };
}

async function analyzeWithModel(model, prompt) {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT,
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
  const t0 = Date.now();
  const result = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });
  const ms = Date.now() - t0;
  const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const usage = result.usageMetadata || {};
  const inTok = usage.promptTokenCount || 0;
  const outTok = usage.candidatesTokenCount || 0;
  const price = PRICE[model] || { in: 0, out: 0 };
  const cost = (inTok / 1_000_000) * price.in + (outTok / 1_000_000) * price.out;
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { parsed = { _raw: text.slice(0, 500), _parse_err: e.message }; }
  return { ms, inTok, outTok, cost, parsed };
}

async function processOne(audioId) {
  const audio = await prisma.audioFile.findUnique({ where: { id: audioId } });
  console.log(`\n━━━ ${audio.fileName} (${audio.duration}s, ${audio.category}) ━━━`);

  const tmpFile = path.join(os.tmpdir(), `test-${randomUUID()}.mp3`);
  console.log("→ download...");
  await downloadAudio(audio.fileUrl, tmpFile);
  const buf = fs.readFileSync(tmpFile);
  console.log(`  ${(buf.length / 1024).toFixed(0)} KB`);

  console.log("→ transcribe (Yandex STT + Gemini 2.5 Flash diarize)...");
  const t1 = Date.now();
  const transcription = await transcribeAudio(buf, audio.fileName, "Menejer", audio.duration);
  const transcribeMs = Date.now() - t1;
  console.log(`  ${(transcribeMs / 1000).toFixed(1)}s, ${transcription.length} chars`);
  console.log(`  preview: ${transcription.split("\n").slice(0, 3).join(" | ").slice(0, 200)}`);

  if (!transcription || transcription.includes("SUHBAT YO'Q")) {
    console.log("⚠ transcript bo'sh — skip analiz");
    fs.unlinkSync(tmpFile);
    return null;
  }

  const { criteriaText, criteriaNames } = await getCriteriaContext(audio.category);
  const prompt = buildAnalysisPrompt(transcription, criteriaText, audio.category, criteriaNames, "", "");

  console.log("→ analiz Flash (gemini-2.5-flash)...");
  const flash = await analyzeWithModel("gemini-2.5-flash", prompt);
  console.log(`  ${(flash.ms / 1000).toFixed(1)}s | ${flash.inTok} in + ${flash.outTok} out tok | $${flash.cost.toFixed(4)}`);

  console.log("→ analiz Pro (gemini-2.5-pro)...");
  const pro = await analyzeWithModel("gemini-2.5-pro", prompt);
  console.log(`  ${(pro.ms / 1000).toFixed(1)}s | ${pro.inTok} in + ${pro.outTok} out tok | $${pro.cost.toFixed(4)}`);

  // Compare scores
  const flashScores = flash.parsed?.criteria || {};
  const proScores = pro.parsed?.criteria || {};
  console.log("\n  MEZON                                    | FLASH | PRO  | diff");
  console.log("  ─────────────────────────────────────────┼───────┼──────┼─────");
  for (const name of criteriaNames) {
    const f = flashScores[name]?.score;
    const p = proScores[name]?.score;
    const diff = (typeof f === "number" && typeof p === "number") ? (p - f) : "?";
    console.log(`  ${name.padEnd(40).slice(0, 40)} | ${String(f ?? "?").padStart(5)} | ${String(p ?? "?").padStart(4)} | ${diff}`);
  }

  fs.unlinkSync(tmpFile);
  return {
    audioId, duration: audio.duration, category: audio.category,
    transcribeMs,
    flash: { ms: flash.ms, inTok: flash.inTok, outTok: flash.outTok, cost: flash.cost, scores: flashScores },
    pro:   { ms: pro.ms,   inTok: pro.inTok,   outTok: pro.outTok,   cost: pro.cost,   scores: proScores },
    transcriptPreview: transcription.split("\n").slice(0, 5).join("\n"),
  };
}

(async () => {
  const results = [];
  for (const id of TARGET_IDS) {
    try {
      const r = await processOne(id);
      if (r) results.push(r);
    } catch (e) {
      console.error(`✗ ${id}:`, e.message);
    }
  }

  console.log("\n\n═══ XULOSA ═══");
  let totFlashCost = 0, totProCost = 0, totFlashMs = 0, totProMs = 0;
  for (const r of results) {
    totFlashCost += r.flash.cost; totProCost += r.pro.cost;
    totFlashMs += r.flash.ms; totProMs += r.pro.ms;
  }
  console.log(`Audio soni: ${results.length}`);
  console.log(`Flash: jami ${(totFlashMs / 1000).toFixed(1)}s, $${totFlashCost.toFixed(4)}, o'rtacha ${(totFlashMs / results.length / 1000).toFixed(1)}s/audio`);
  console.log(`Pro:   jami ${(totProMs / 1000).toFixed(1)}s, $${totProCost.toFixed(4)}, o'rtacha ${(totProMs / results.length / 1000).toFixed(1)}s/audio`);
  console.log(`Pro / Flash narx: ${(totProCost / totFlashCost).toFixed(1)}x, vaqt: ${(totProMs / totFlashMs).toFixed(1)}x`);

  fs.writeFileSync("/tmp/test-results.json", JSON.stringify(results, null, 2));
  console.log("\nNatija: /tmp/test-results.json");
  await prisma.$disconnect();
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
