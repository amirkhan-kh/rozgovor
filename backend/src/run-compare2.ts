import dotenv from "dotenv";
dotenv.config();

import { prisma } from "./utils/prisma";
import { getFileBuffer, getKeyFromUrl } from "./services/storage";
import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const AUDIO_ID = "cmnj6n66p00qlmyz9kbc65255";

const PROMPT = `Bu audio O'zbek tilida telefon suhbati. Vision School ingliz tili markazi sotuvchi menejeri mijozga qo'ng'iroq qilmoqda yoki mijoz markazga qo'ng'iroq qilmoqda.

VAZIFA: Audioni diqqat bilan tinglab, O'zbek tilida aniq transkripsiya qil.

FORMAT — har bir gap yangi qatorda:
[MM:SS] Menejer: gap
[MM:SS] Mijoz: gap

ROLLARNI ANIQLASH:
- Audioda IKKITA ALOHIDA OVOZ bor. OVOZ TEMBRI va MAZMUN orqali farqla.
- MENEJER: kurs haqida tushuntiradi, narx aytadi, taklif qiladi, KO'P GAPIRADI
- MIJOZ: savol beradi, qisqa javob beradi, KAM GAPIRADI
- Birinchi gapirayotgan = menejer EMAS. Faqat mazmun bo'yicha aniqla.

GALLYUTSINATSIYA QILMA:
- Agar suhbat bo'lmasa: "SUHBAT YO'Q: Qo'ng'iroq ulanmagan"
- Faqat eshitilgan gaplarni yoz!`;

const transcribeWithModel = async (buffer: Buffer, model: string): Promise<{
  text: string; inputTokens: number; outputTokens: number; timeMs: number;
}> => {
  const base64 = buffer.toString("base64");
  const start = Date.now();

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: "audio/mp3", data: base64 } },
          { text: PROMPT },
        ]}],
        generationConfig: { temperature: 0, maxOutputTokens: 16000 },
      }),
    }
  );

  const timeMs = Date.now() - start;
  const data = (await resp.json()) as any;

  if (!resp.ok) {
    throw new Error(`API error (${resp.status}): ${JSON.stringify(data).substring(0, 200)}`);
  }

  return {
    text: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
    inputTokens: data.usageMetadata?.promptTokenCount || 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount || 0,
    timeMs,
  };
};

async function main() {
  const audioFile = await prisma.audioFile.findUnique({ where: { id: AUDIO_ID } });
  if (!audioFile) { console.log("Topilmadi"); return; }

  const key = getKeyFromUrl(audioFile.fileUrl);
  const fullBuffer = await getFileBuffer(key);

  // 2 chunk: 0-600s va 600-end
  const tmpDir = join(tmpdir(), "compare_" + randomUUID());
  mkdirSync(tmpDir, { recursive: true });
  const inputPath = join(tmpDir, "input.mp3");
  writeFileSync(inputPath, fullBuffer);

  const chunk1Path = join(tmpDir, "chunk1.mp3");
  const chunk2Path = join(tmpDir, "chunk2.mp3");
  execSync(`ffmpeg -y -i "${inputPath}" -t 600 -ar 16000 -ac 1 "${chunk1Path}" 2>/dev/null`);
  execSync(`ffmpeg -y -i "${inputPath}" -ss 600 -ar 16000 -ac 1 "${chunk2Path}" 2>/dev/null`);

  const chunk1 = readFileSync(chunk1Path);
  const chunk2 = readFileSync(chunk2Path);

  console.log(`Audio: ${audioFile.fileName} (${audioFile.duration}s, 2 chunk)\n`);

  for (const model of ["gemini-2.5-flash", "gemini-2.5-pro"]) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  ${model.toUpperCase()}`);
    console.log(`${"=".repeat(60)}\n`);

    // Chunk 1
    console.log("Chunk 1 (00:00 - 10:00)...");
    const r1 = await transcribeWithModel(chunk1, model);
    console.log(`  Vaqt: ${(r1.timeMs / 1000).toFixed(1)}s | Tokens: ${r1.inputTokens}→${r1.outputTokens}`);

    // Chunk 2
    console.log("Chunk 2 (10:00 - end)...");
    const r2 = await transcribeWithModel(chunk2, model);
    console.log(`  Vaqt: ${(r2.timeMs / 1000).toFixed(1)}s | Tokens: ${r2.inputTokens}→${r2.outputTokens}`);

    // Chunk 2 timing tekshirish
    const lines2 = r2.text.split("\n").filter(l => l.trim());
    const firstTimestamp = lines2[0]?.match(/\[(\d{2}):(\d{2})\]/);
    const hasCorrectOffset = firstTimestamp && (parseInt(firstTimestamp[1]) >= 10);

    console.log(`\n  Chunk 2 birinchi vaqt: ${firstTimestamp ? `[${firstTimestamp[1]}:${firstTimestamp[2]}]` : "topilmadi"}`);
    console.log(`  Offset to'g'ri: ${hasCorrectOffset ? "HA ✅" : "YO'Q ❌ (00:xx dan boshlagan)"}`);

    // Rollar tekshirish
    const fullText = r1.text + "\n" + r2.text;
    const menejerLines = fullText.split("\n").filter(l => l.includes("Menejer:")).length;
    const mijozLines = fullText.split("\n").filter(l => l.includes("Mijoz:")).length;
    const totalLines = menejerLines + mijozLines;

    console.log(`\n  Jami qatorlar: ${totalLines} (Menejer: ${menejerLines}, Mijoz: ${mijozLines})`);
    console.log(`  Menejer %: ${totalLines > 0 ? Math.round(menejerLines / totalLines * 100) : 0}%`);

    // Birinchi 5 va oxirgi 3 qator
    const allLines = fullText.split("\n").filter(l => l.trim());
    console.log(`\n  --- Birinchi 5 qator ---`);
    allLines.slice(0, 5).forEach(l => console.log(`  ${l.substring(0, 100)}`));
    console.log(`\n  --- Chunk 2 birinchi 3 qator ---`);
    lines2.slice(0, 3).forEach(l => console.log(`  ${l.substring(0, 100)}`));

    // Narx hisoblash
    const totalInput = r1.inputTokens + r2.inputTokens;
    const totalOutput = r1.outputTokens + r2.outputTokens;
    const inputPrice = model.includes("pro") ? 1.25 : 0.15;
    const outputPrice = model.includes("pro") ? 10.0 : 0.60;
    const cost = (totalInput / 1e6) * inputPrice + (totalOutput / 1e6) * outputPrice;
    const totalTime = r1.timeMs + r2.timeMs;

    console.log(`\n  --- Xulosa ---`);
    console.log(`  Umumiy vaqt: ${(totalTime / 1000).toFixed(1)}s`);
    console.log(`  Umumiy tokens: ${totalInput} + ${totalOutput} = ${totalInput + totalOutput}`);
    console.log(`  Narx: $${cost.toFixed(4)}`);
    console.log(`  467 ta audio uchun: ~$${(cost * 467 / 2).toFixed(2)} (o'rtacha 1 chunk)`);
  }

  // Tozalash
  try { unlinkSync(chunk1Path); unlinkSync(chunk2Path); unlinkSync(inputPath); execSync(`rmdir "${tmpDir}"`); } catch {}

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
