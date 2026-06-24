// Mavjud transkriptlardan Lesson yaratadi (STT qayta qilmaymiz).
// Faqat Flash dan testlar va AI prompt so'raydi, keyin DB ga yozadi.
// Foydalanish: npx ts-node scripts/seed-lessons.ts
import * as fs from "fs";
import * as path from "path";
require("dotenv").config();

import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { SttLine, SttWord } from "../src/services/yandex-stt";
import { LESSON_UPLOAD_DIR } from "../src/middlewares/lessonUpload";

const prisma = new PrismaClient();

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
  description: string,
  lines: SttLine[],
  durationSec: number,
  qCount: number
): string {
  const transcript = lines
    .map((l) => {
      const mins = Math.floor(l.start / 60);
      const secs = Math.floor(l.start % 60);
      return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}] ${l.text}`;
    })
    .join("\n");

  return `Sen kompaniya ichki o'quv darsining sifatini tekshiruvchi AI ekspertsan.
Vazifa: quyidagi video dars transkripti bo'yicha menejerlarni tekshirish uchun
test savollar va AI suhbat tayyorlash.

─── DARSLIK HAQIDA ───
Sarlavha: ${title}
Tavsif: ${description}
Davomiyligi: ${Math.floor(durationSec / 60)} daqiqa

─── TRANSKRIPT ───
${transcript.substring(0, 40000)}

─── VAZIFA ───
1. ${qCount} ta test savol (4 variant, 1 to'g'ri, izoh + topicTimestamp sek)
2. aiSystemPrompt (manager bilan suhbat uchun, o'zbek tilida, oxirida [END_CONVERSATION])
3. aiKeyTopics (3-8 ta asosiy mavzu)

Faqat JSON:
{
  "questions": [{"q":"","options":["","","",""],"correctIdx":0,"explanation":"","topicTimestamp":0}],
  "aiSystemPrompt": "",
  "aiKeyTopics": ["",""]
}
`;
}

async function generateFlash(
  title: string,
  description: string,
  lines: SttLine[],
  durationSec: number
) {
  const qCount = targetQuestionCount(durationSec);
  const prompt = buildFlashPrompt(title, description, lines, durationSec, qCount);
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

  let text = (response.text || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const parsed = JSON.parse(text);
  return parsed;
}

interface SeedSpec {
  videoPath: string;
  linesPath: string;
  wordsPath: string;
  textPath: string;
  title: string;
  description: string;
  sortOrder: number;
}

async function seedOne(companyId: string, spec: SeedSpec) {
  console.log(`\n=== ${spec.title} ===`);

  // Video faylni uploads/lessons/ ga nusxalash
  if (!fs.existsSync(LESSON_UPLOAD_DIR)) {
    fs.mkdirSync(LESSON_UPLOAD_DIR, { recursive: true });
  }
  const ext = path.extname(spec.videoPath);
  const destName = `seed-${Date.now()}-${spec.sortOrder}${ext}`;
  const destPath = path.join(LESSON_UPLOAD_DIR, destName);
  if (!fs.existsSync(destPath)) {
    console.log(`  Video nusxalash...`);
    fs.copyFileSync(spec.videoPath, destPath);
  }
  const stats = fs.statSync(destPath);

  // Transkriptlarni o'qish
  const lines: SttLine[] = JSON.parse(fs.readFileSync(spec.linesPath, "utf8"));
  const words: SttWord[] = JSON.parse(fs.readFileSync(spec.wordsPath, "utf8"));
  const transcript = fs.readFileSync(spec.textPath, "utf8");
  const durationSec = lines.length ? Math.ceil(lines[lines.length - 1].start) : 0;
  console.log(`  Transkript: ${words.length} so'z, ${lines.length} jumla, ${durationSec}s`);

  // Flash dan test + AI prompt
  console.log(`  Flash ga so'rov...`);
  const startTs = Date.now();
  const flash = await generateFlash(spec.title, spec.description, lines, durationSec);
  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`  Flash tugadi (${elapsed}s): ${flash.questions?.length || 0} savol`);

  // DB ga yozish
  const lesson = await prisma.lesson.create({
    data: {
      companyId,
      title: spec.title,
      description: spec.description,
      videoUrl: destPath,
      videoDurationSec: durationSec,
      videoSizeBytes: BigInt(stats.size),
      transcription: transcript,
      transcriptionJson: words as any,
      testQuestions: flash.questions as any,
      aiSystemPrompt: flash.aiSystemPrompt,
      aiKeyTopics: flash.aiKeyTopics as any,
      status: "ready",
      sortOrder: spec.sortOrder,
    },
  });
  console.log(`  ✓ Lesson yaratildi: ${lesson.id}`);
  return lesson;
}

(async () => {
  const companies = await prisma.company.findMany();
  if (companies.length === 0) {
    console.error("Company topilmadi");
    process.exit(1);
  }
  const company = companies[0];
  console.log(`Company: ${company.name} (${company.id})`);

  const ROOT = "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales";
  const TR = path.join(ROOT, "lesson-transcripts");

  const specs: SeedSpec[] = [
    {
      videoPath: path.join(ROOT, "1)  kurs darsli .mp4"),
      linesPath: path.join(TR, "kurs-darsli-lines.json"),
      wordsPath: path.join(TR, "kurs-darsli-words.json"),
      textPath: path.join(TR, "kurs-darsli.txt"),
      title: "ProSotuvchi kursi — 1-dars: Kirish va asoslar",
      description: "Sotuvchilik kasbiga kirish, ichki kuchni topish, SWOT tahlili",
      sortOrder: 0,
    },
    {
      videoPath: path.join(ROOT, "dars .mp4"),
      linesPath: path.join(TR, "dars-lines.json"),
      wordsPath: path.join(TR, "dars-words.json"),
      textPath: path.join(TR, "dars.txt"),
      title: "ProSotuvchi kursi — 2-dars",
      description: "Kursning ikkinchi qismi",
      sortOrder: 1,
    },
  ];

  for (const spec of specs) {
    try {
      await seedOne(company.id, spec);
    } catch (err) {
      console.error(`✗ ${spec.title} xatolik:`, err instanceof Error ? err.message : err);
    }
  }

  // Managerga tayinlash
  const managers = await prisma.manager.findMany({
    where: { companyId: company.id, isActive: true },
    select: { id: true, name: true, role: true },
    take: 5,
  });
  console.log(`\nManagerlar (${managers.length}):`, managers.map((m) => `${m.name} [${m.role}]`).join(", "));

  const allLessons = await prisma.lesson.findMany({
    where: { companyId: company.id },
    select: { id: true, title: true },
  });
  console.log(`\nJami darslar: ${allLessons.length}`);

  await prisma.$disconnect();
  console.log("\n✅ Seed tugadi");
})();
