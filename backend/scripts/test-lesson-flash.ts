// Real transkript asosida Flash test generation'ni sinash.
// Foydalanish: npx ts-node scripts/test-lesson-flash.ts
import * as fs from "fs";
import * as path from "path";

// Env yuklash — dotenv
require("dotenv").config();

import { SttLine } from "../src/services/yandex-stt";
import { GoogleGenAI } from "@google/genai";

const FLASH_MODEL = "gemini-2.5-flash";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

function targetQuestionCount(durationSec: number): number {
  const mins = durationSec / 60;
  if (mins < 20) return 5;
  if (mins < 40) return 7;
  if (mins < 60) return 10;
  if (mins < 90) return 12;
  return 15;
}

function buildFlashPrompt(
  title: string,
  description: string | null,
  lines: SttLine[],
  durationSec: number,
  qCount: number
): string {
  const transcript = lines
    .map((l) => {
      const mins = Math.floor(l.start / 60);
      const secs = Math.floor(l.start % 60);
      const ts = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      return `[${ts}] ${l.text}`;
    })
    .join("\n");

  return `Sen kompaniya ichki o'quv darsining sifatini tekshiruvchi AI ekspertsan.
Vazifa: quyidagi video dars transkripti bo'yicha menejerlarni tekshirish uchun
test savollar va AI suhbat tayyorlash.

─── DARSLIK HAQIDA ───
Sarlavha: ${title}
Tavsif: ${description || "(yo'q)"}
Davomiyligi: ${Math.floor(durationSec / 60)} daqiqa

─── TRANSKRIPT (so'z-darajali Yandex STT, [MM:SS] timestamp bilan) ───
${transcript.substring(0, 40000)}
${transcript.length > 40000 ? "\n... (transkript qisqartirildi)" : ""}

─── VAZIFA ───

1. **Testlar** — ${qCount} ta ko'p variantli (4 variant) savol tuzing.
2. **aiSystemPrompt** — manager bilan AI suhbat uchun sistema prompti.
3. **aiKeyTopics** — darsning 3-8 ta asosiy mavzulari.

Faqat JSON, markdown yo'q:
{
  "questions": [
    {"q": "...", "options": ["...", "...", "...", "..."], "correctIdx": 0, "explanation": "...", "topicTimestamp": 125}
  ],
  "aiSystemPrompt": "...",
  "aiKeyTopics": ["...", "..."]
}
`;
}

(async () => {
  const linesPath = path.join(
    "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales/lesson-transcripts",
    "kurs-darsli-lines.json"
  );

  if (!fs.existsSync(linesPath)) {
    console.error("Transkript fayl topilmadi:", linesPath);
    process.exit(1);
  }

  const lines: SttLine[] = JSON.parse(fs.readFileSync(linesPath, "utf8"));
  console.log(`Jumlalar: ${lines.length}`);
  const durationSec = lines.length
    ? Math.ceil(lines[lines.length - 1].start)
    : 0;
  console.log(`Davomiyligi: ${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`);

  const qCount = targetQuestionCount(durationSec);
  console.log(`Kutilgan test soni: ${qCount}`);

  const prompt = buildFlashPrompt(
    "ProSotuvchi kursi — 1-dars",
    "Sotuvchi uchun darslikning birinchi qismi",
    lines,
    durationSec,
    qCount
  );

  console.log(`\nFlash ga so'rov yuborilmoqda (prompt uzunligi ${prompt.length} belgi)...`);
  const startTs = Date.now();
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: FLASH_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 16384,
      responseMimeType: "application/json",
    },
  });

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`✓ Flash javob keldi (${elapsed}s)`);

  const rawText = response.text || "";
  let jsonText = rawText.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }

  try {
    const parsed = JSON.parse(jsonText);
    console.log(`\n━━━ NATIJA ━━━`);
    console.log(`Savollar: ${parsed.questions?.length || 0}`);
    console.log(`Kalit mavzular: ${parsed.aiKeyTopics?.length || 0}`);
    console.log(`\nMavzular:`, parsed.aiKeyTopics);

    console.log(`\n━━━ SAVOLLAR ━━━`);
    (parsed.questions || []).forEach((q: any, i: number) => {
      console.log(`\n${i + 1}. ${q.q}`);
      q.options.forEach((opt: string, j: number) => {
        const mark = j === q.correctIdx ? "✓" : " ";
        console.log(`   [${mark}] ${String.fromCharCode(65 + j)}. ${opt}`);
      });
      console.log(`   Izoh: ${q.explanation}`);
      if (q.topicTimestamp) {
        const m = Math.floor(q.topicTimestamp / 60);
        const s = Math.floor(q.topicTimestamp % 60);
        console.log(`   Mavzu vaqti: ${m}:${String(s).padStart(2, "0")}`);
      }
    });

    console.log(`\n━━━ AI SYSTEM PROMPT ━━━`);
    console.log(parsed.aiSystemPrompt);

    // Saqlash
    const outPath = path.join(
      "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales/lesson-transcripts",
      "kurs-darsli-flash-result.json"
    );
    fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2));
    console.log(`\nSaqlandi: ${outPath}`);
  } catch (err) {
    console.error("JSON parse xatolik:", err);
    console.error("Raw:", jsonText.substring(0, 1000));
    process.exit(1);
  }
})();
