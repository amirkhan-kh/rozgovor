// 3 xil transkripsiya pipelinesini bitta audioda solishtirish skripti.
// Natija: DB ga 3 ta yangi AudioFile (asl audioning nusxasi) + har biriga
// alohida analysis + share token yaratiladi, 3 ta public linkni chop etadi.
//
// Ishlatilishi:
//   npx ts-node scripts/test-pipelines.ts <audioId> [baseUrl]
//   baseUrl default: https://prosales.asosit.uz
//
// Pipelinelar:
//   V1: Yandex STT + Gemini Flash (diarization) + Gemini Pro (analysis) — hozirgi
//   V2: Gemini Flash (audio -> transcript+diar) + Gemini Pro (analysis)
//   V3: Gemini Pro (audio -> transcript+diar) + Gemini Pro (analysis)

import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import { randomBytes } from "crypto";
import { writeFileSync } from "fs";
import { transcribeAudio } from "../src/services/call-transcriber";
import { analyzeCall, getCriteriaPrompt } from "../src/services/call-analyzer";

const prisma = new PrismaClient();

const AUDIO_ID = process.argv[2];
const BASE_URL = process.argv[3] || "https://prosales.asosit.uz";

if (!AUDIO_ID) {
  console.error("Usage: ts-node test-pipelines.ts <audioId> [baseUrl]");
  process.exit(1);
}

// ── Gemini narxlari (USD / 1M tokens), batch rejim uchun 50% chegirma ──
const PRICING = {
  proInput: 1.25,
  proOutput: 10.0,
  flashInput: 0.075,
  flashOutput: 0.3,
  batchDiscount: 0.5,
  yandexSttPerHour: 0.5, // Yandex SpeechKit deferred ~ $0.50/soat
};

function costForUsage(
  usage: { promptTokenCount?: number; candidatesTokenCount?: number } | undefined,
  model: "pro" | "flash"
): { input: number; output: number; total: number; batch: number } {
  const pIn = usage?.promptTokenCount || 0;
  const pOut = usage?.candidatesTokenCount || 0;
  const inputRate = model === "pro" ? PRICING.proInput : PRICING.flashInput;
  const outputRate = model === "pro" ? PRICING.proOutput : PRICING.flashOutput;
  const input = (pIn / 1_000_000) * inputRate;
  const output = (pOut / 1_000_000) * outputRate;
  const total = input + output;
  return { input, output, total, batch: total * PRICING.batchDiscount };
}

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

async function fetchAudio(fileUrl: string): Promise<Buffer> {
  const resp = await axios.get(fileUrl, {
    responseType: "arraybuffer",
    timeout: 180000,
    validateStatus: () => true,
  });
  if (resp.status >= 400) throw new Error(`Fetch audio: ${resp.status}`);
  return Buffer.from(resp.data);
}

async function withRetry<T>(fn: () => Promise<T>, name: string): Promise<T> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if ((msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) && attempt < 5) {
        const wait = 30 * attempt;
        console.log(`  [${name}] 429 rate limit, ${wait}s kutib qayta urinish (${attempt}/5)...`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("retry limit");
}

// ── V2 + V3: Gemini to'g'ridan-to'g'ri audio'ni transcribe qiladi ─────
async function transcribeWithGemini(
  audioBuffer: Buffer,
  fileName: string,
  model: "gemini-2.5-flash" | "gemini-2.5-pro",
  managerName: string
): Promise<{ transcript: string; usage: any }> {
  const ai = getAI();
  const ext = fileName.split(".").pop()?.toLowerCase() || "mp3";
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
  };
  const mimeType = mimeMap[ext] || "audio/mpeg";
  const base64 = audioBuffer.toString("base64");

  const prompt = `Bu o'zbek tilidagi sotuv qo'ng'iroqi. Menejer ismi: "${managerName}".

Audio'ni tinglab, har gapni alohida qator qilib transcribe qil.
Format: [MM:SS] SpeakerName: gap matni

Ikki speaker bor:
- Menejer (sotuvchi, odatda birinchi gapiruvchi rus/uzb aralash formulalar ishlatadi)
- Mijoz (mijoz)

Qoidalar:
- Har gap boshida aniq [MM:SS] timestamp bo'lsin (monotonic, orqaga qaytmasin)
- Uzun gaplar 2-3 qatorga bo'linsin
- O'zbekcha so'zlarni to'g'ri yoz
- Hech narsa ixtiro qilma — faqat audio'dagi haqiqiy gaplarni

Javobda faqat transcript qatorlarini ber, boshqa hech narsa emas.`;

  const resp = await withRetry(
    () =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: prompt },
            ],
          },
        ],
        config: { temperature: 0 },
      }),
    `transcribe-${model}`
  );
  return {
    transcript: resp.text?.trim() || "",
    usage: resp.usageMetadata,
  };
}

// ── Analiz (call-analyzer.ts dagi funksiyaning to'g'ridan-to'g'ri
//    Gemini Pro javobi, usageMetadata olish uchun) ──
async function analyzeTranscript(
  transcript: string,
  companyId: string,
  category: string
): Promise<{ analysis: any; usage: any }> {
  const ai = getAI();
  const criteriaPrompt = await getCriteriaPrompt(companyId, category);
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, courseInfo: true },
  });

  const prompt = `Siz sotuv qo'ng'iroqi tahlil qiluvchi AI'siz. Kompaniya: ${company?.name}.

${company?.courseInfo ? `=== KOMPANIYA MAHSULOTI ===\n${company.courseInfo.slice(0, 2000)}\n\n` : ""}
${criteriaPrompt}

=== TRANSKRIPT ===
${transcript}

=== VAZIFA ===
Yuqoridagi transkriptni tahlil qiling va strict JSON qaytaring:
{
  "summary": "2-3 jumla xulosa",
  "overallScore": 0-100,
  "leadQuality": "sovuq|iliq|issiq",
  "leadScore": 0-100,
  "criteria": { "<name>": { "score": 0-100, "comment": "..." } },
  "errors": [{ "type": "...", "description": "..." }],
  "winPoints": [{ "description": "...", "timestamp": "MM:SS" }],
  "lossPoints": [{ "description": "...", "timestamp": "MM:SS" }],
  "objections": [{ "type": "...", "count": N }],
  "managerSpeech": 0-100,
  "clientSpeech": 0-100
}`;

  const resp = await withRetry(
    () =>
      ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.3, responseMimeType: "application/json" },
      }),
    "analyze-pro"
  );
  return {
    analysis: JSON.parse(resp.text?.trim() || "{}"),
    usage: resp.usageMetadata,
  };
}

async function main() {
  const original = await prisma.audioFile.findUnique({
    where: { id: AUDIO_ID },
    include: { manager: { select: { id: true, name: true } }, company: true },
  });
  if (!original) {
    console.error("Audio topilmadi:", AUDIO_ID);
    process.exit(1);
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Test audio:", original.fileName);
  console.log("Duration:", original.duration, "sek =", Math.floor((original.duration || 0) / 60) + ":" + String((original.duration || 0) % 60).padStart(2, "0"));
  console.log("Manager:", original.manager?.name);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const buffer = await fetchAudio(original.fileUrl);
  console.log(`Buffer yuklandi: ${(buffer.length / 1024).toFixed(0)} KB\n`);

  const managerName = original.manager?.name || "Menejer";
  const durationSec = original.duration || 0;
  const durationHours = durationSec / 3600;
  const yandexSttCost = durationHours * PRICING.yandexSttPerHour;

  const results: Array<{
    name: string;
    desc: string;
    transcript: string;
    analysis: any;
    timeSec: number;
    cost: number;
    costBatch: number;
    sttCost: number;
    diarCost: number;
    analCost: number;
    audioId: string;
    shareToken: string;
  }> = [];

  // ════ V1: Yandex STT + Gemini Flash diar + Gemini Pro analysis ════
  console.log("━━━ V1: Yandex STT + Flash diar + Pro analysis (hozirgi) ━━━");
  const t1 = Date.now();
  const v1Transcript = await transcribeAudio(buffer, original.fileName, managerName, durationSec);
  const v1Analysis = await analyzeTranscript(v1Transcript, original.companyId, original.category);
  const v1Time = (Date.now() - t1) / 1000;
  const v1AnalCost = costForUsage(v1Analysis.usage, "pro");
  // Flash diarization cost taxmini: audio input (32 tokens/sek) + STT text ~10K tokens
  const flashAudioTokens = durationSec * 32;
  const flashTextTokens = Math.ceil(v1Transcript.length / 4); // rough
  const v1FlashCost =
    (flashAudioTokens / 1e6) * PRICING.flashInput +
    (flashTextTokens / 1e6) * PRICING.flashInput +
    (flashTextTokens / 1e6) * PRICING.flashOutput;
  const v1Total = yandexSttCost + v1FlashCost + v1AnalCost.total;
  const v1TotalBatch = yandexSttCost + v1FlashCost * 0.5 + v1AnalCost.batch;
  console.log(`  STT (Yandex): $${yandexSttCost.toFixed(4)}`);
  console.log(`  Diar (Flash): $${v1FlashCost.toFixed(4)} (audio ${flashAudioTokens} + text ~${flashTextTokens} tok)`);
  console.log(`  Analysis (Pro): $${v1AnalCost.total.toFixed(4)} (in ${v1Analysis.usage?.promptTokenCount} + out ${v1Analysis.usage?.candidatesTokenCount})`);
  console.log(`  Jami: $${v1Total.toFixed(4)} | Batch: $${v1TotalBatch.toFixed(4)}`);
  console.log(`  Vaqt: ${v1Time.toFixed(1)} sek\n`);

  // ════ V2: Flash (audio -> transcript+diar) + Pro analysis ════
  console.log("━━━ V2: Gemini Flash (audio) + Pro analysis ━━━");
  const t2 = Date.now();
  const v2Trans = await transcribeWithGemini(buffer, original.fileName, "gemini-2.5-flash", managerName);
  const v2Analysis = await analyzeTranscript(v2Trans.transcript, original.companyId, original.category);
  const v2Time = (Date.now() - t2) / 1000;
  const v2FlashCost = costForUsage(v2Trans.usage, "flash");
  const v2AnalCost = costForUsage(v2Analysis.usage, "pro");
  const v2Total = v2FlashCost.total + v2AnalCost.total;
  const v2TotalBatch = v2FlashCost.batch + v2AnalCost.batch;
  console.log(`  STT+Diar (Flash): $${v2FlashCost.total.toFixed(4)} (in ${v2Trans.usage?.promptTokenCount} + out ${v2Trans.usage?.candidatesTokenCount})`);
  console.log(`  Analysis (Pro): $${v2AnalCost.total.toFixed(4)} (in ${v2Analysis.usage?.promptTokenCount} + out ${v2Analysis.usage?.candidatesTokenCount})`);
  console.log(`  Jami: $${v2Total.toFixed(4)} | Batch: $${v2TotalBatch.toFixed(4)}`);
  console.log(`  Vaqt: ${v2Time.toFixed(1)} sek\n`);

  // ════ V3: Pro (audio -> transcript+diar) + Pro analysis ════
  console.log("━━━ V3: Gemini Pro (audio) + Pro analysis ━━━");
  const t3 = Date.now();
  const v3Trans = await transcribeWithGemini(buffer, original.fileName, "gemini-2.5-pro", managerName);
  const v3Analysis = await analyzeTranscript(v3Trans.transcript, original.companyId, original.category);
  const v3Time = (Date.now() - t3) / 1000;
  const v3ProTransCost = costForUsage(v3Trans.usage, "pro");
  const v3AnalCost = costForUsage(v3Analysis.usage, "pro");
  const v3Total = v3ProTransCost.total + v3AnalCost.total;
  const v3TotalBatch = v3ProTransCost.batch + v3AnalCost.batch;
  console.log(`  STT+Diar (Pro): $${v3ProTransCost.total.toFixed(4)} (in ${v3Trans.usage?.promptTokenCount} + out ${v3Trans.usage?.candidatesTokenCount})`);
  console.log(`  Analysis (Pro): $${v3AnalCost.total.toFixed(4)} (in ${v3Analysis.usage?.promptTokenCount} + out ${v3Analysis.usage?.candidatesTokenCount})`);
  console.log(`  Jami: $${v3Total.toFixed(4)} | Batch: $${v3TotalBatch.toFixed(4)}`);
  console.log(`  Vaqt: ${v3Time.toFixed(1)} sek\n`);

  // ════ Har variantni DB ga yozish: AudioFile + Analysis nusxasi ════
  const variants = [
    { name: "V1-Yandex+Flash+Pro", transcript: v1Transcript, analysis: v1Analysis.analysis, time: v1Time, cost: v1Total, costBatch: v1TotalBatch, sttCost: yandexSttCost, diarCost: v1FlashCost, analCost: v1AnalCost.total },
    { name: "V2-Flash+Pro", transcript: v2Trans.transcript, analysis: v2Analysis.analysis, time: v2Time, cost: v2Total, costBatch: v2TotalBatch, sttCost: 0, diarCost: v2FlashCost.total, analCost: v2AnalCost.total },
    { name: "V3-Pro+Pro", transcript: v3Trans.transcript, analysis: v3Analysis.analysis, time: v3Time, cost: v3Total, costBatch: v3TotalBatch, sttCost: 0, diarCost: v3ProTransCost.total, analCost: v3AnalCost.total },
  ];

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Natijalar DB ga yozilmoqda...");

  for (const v of variants) {
    const newId = `cmpr_${randomBytes(8).toString("hex")}`;
    const shareToken = randomBytes(16).toString("hex");
    const newFileName = original.fileName.replace(/\.mp3$/, `_${v.name}.mp3`);

    // AudioFile nusxasi
    const created = await prisma.audioFile.create({
      data: {
        id: newId,
        fileName: newFileName,
        fileUrl: original.fileUrl,
        companyId: original.companyId,
        managerId: original.managerId,
        phoneNumber: original.phoneNumber,
        duration: original.duration,
        category: original.category,
        status: "done",
        transcription: v.transcript,
        callDate: original.callDate,
        pipelineName: original.pipelineName,
        shareToken,
        sharedAt: new Date(),
      },
    });

    // Analysis
    const a = v.analysis;
    await prisma.analysis.create({
      data: {
        audioFileId: created.id,
        summary: a.summary || "",
        overallScore: a.overallScore || 0,
        leadQuality: a.leadQuality || "sovuq",
        leadScore: a.leadScore || 0,
        criteria: a.criteria || {},
        errors: a.errors || [],
        winPoints: a.winPoints || [],
        lossPoints: a.lossPoints || [],
        objections: a.objections || [],
        managerSpeech: a.managerSpeech || 50,
        clientSpeech: a.clientSpeech || 50,
      },
    });

    (v as any).audioId = created.id;
    (v as any).shareToken = shareToken;
  }

  // ════ Yakuniy hisobot ════
  console.log("\n━━━ SOLISHTIRUV (5 daqiqa audio uchun) ━━━\n");
  console.log("Variant          | Narx         | Batch        | Vaqt      | 300 soatga");
  console.log("-----------------|--------------|--------------|-----------|-------------");
  for (const v of variants) {
    const per300h = (v.cost / (durationSec / 3600)) * 300;
    const per300hBatch = (v.costBatch / (durationSec / 3600)) * 300;
    console.log(
      `${v.name.padEnd(16)} | $${v.cost.toFixed(4).padEnd(12)}| $${v.costBatch.toFixed(4).padEnd(12)}| ${v.time.toFixed(1)}s      | $${per300h.toFixed(0)} / $${per300hBatch.toFixed(0)} batch`
    );
  }

  console.log("\n━━━ PUBLIC LINKLAR ━━━\n");
  variants.forEach((v: any) => {
    console.log(`${v.name}:`);
    console.log(`  ${BASE_URL}/shared/audio/${v.shareToken}\n`);
  });

  // Markdown hisobot
  const report = `# Pipeline taqqoslash — ${original.fileName}

- Duration: ${durationSec}s (${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")})
- Manager: ${managerName}
- Test sanasi: ${new Date().toISOString()}

## Xarajatlar

| Variant | STT | Diarization | Analysis | **Jami** | **Batch** | 300 soatga |
|---|---|---|---|---|---|---|
${variants
  .map((v) => {
    const per300h = (v.cost / (durationSec / 3600)) * 300;
    const per300hBatch = (v.costBatch / (durationSec / 3600)) * 300;
    return `| ${v.name} | $${v.sttCost.toFixed(4)} | $${v.diarCost.toFixed(4)} | $${v.analCost.toFixed(4)} | **$${v.cost.toFixed(4)}** | **$${v.costBatch.toFixed(4)}** | $${per300h.toFixed(0)} / $${per300hBatch.toFixed(0)} batch |`;
  })
  .join("\n")}

## Linklar

${variants.map((v: any) => `- **${v.name}**: ${BASE_URL}/shared/audio/${v.shareToken}`).join("\n")}
`;
  writeFileSync("/tmp/pipeline-comparison.md", report);
  console.log("Hisobot: /tmp/pipeline-comparison.md\n");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
