// Import "Pro Sotuvchi" kursining 1-modulini (2 dars) mavjud transkript va flash
// natijalaridan. STT qayta qilinmaydi — faqat fayllarni o'qib DB ga yoziladi.
//
// Hierarchy: Course "Pro Sotuvchi" → Module "1-Modul: Kirish va asoslar"
//   → Lesson "1-dars: Kirish" (kurs-darsli transcription)
//   → Lesson "2-dars: Inson evolyusiyasi" (dars transcription)
//
// Video fayllar uploads/lessons/ ga nusxalanadi (lesson-processor lokal path orqali
// streaming qiladi). Shu bilan birga Yandex Object Storage ga backup sifatida
// yuklanadi (uploadFile bilan).
//
// Foydalanish:
//   cd salesai/backend
//   npx ts-node scripts/import-pro-sotuvchi-module-1.ts
require("dotenv").config();
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { GoogleGenAI } from "@google/genai";
import { uploadFile } from "../src/services/storage";
import { LESSON_UPLOAD_DIR } from "../src/middlewares/lessonUpload";

const prisma = new PrismaClient();
const FLASH_MODEL = "gemini-2.5-flash";

const COMPANY_ID = "cmo1gdp6u0000b0u1zmix7x2z"; // ProSalesGroup
const COURSE_TITLE = "Pro Sotuvchi";
const COURSE_DESC = "Sotuvchilik kasbiga kirish: ichki kuch, o'z-o'zini tahlil, SWOT, sotuv texnikalari.";
const MODULE_TITLE = "1-Modul: Kirish va asoslar";
const MODULE_DESC = "Kursga kirish, sotuvchining ahamiyati, o'z-o'zini tahlil qilish va SWOT.";

const ROOT = "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales";
const TR = path.join(ROOT, "lesson-transcripts");

interface SeedSpec {
  videoPath: string;
  linesPath: string;
  wordsPath: string;
  textPath: string;
  flashResultPath?: string; // Agar mavjud bo'lsa — flash chaqiruvdan qochiladi
  title: string;
  description: string;
  sortOrder: number;
}

interface SttLine {
  start: number;
  end: number;
  text: string;
}

interface FlashResult {
  questions: Array<{
    q: string;
    options: string[];
    correctIdx: number;
    explanation: string;
    topicTimestamp?: number;
  }>;
  aiSystemPrompt: string;
  aiKeyTopics: string[];
}

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
): Promise<FlashResult> {
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
  return JSON.parse(text) as FlashResult;
}

async function ensureCourse(): Promise<string> {
  const existing = await prisma.course.findFirst({
    where: { companyId: COMPANY_ID, title: COURSE_TITLE },
  });
  if (existing) {
    console.log(`✓ Kurs mavjud: ${existing.id} (${existing.title})`);
    return existing.id;
  }
  const last = await prisma.course.findFirst({
    where: { companyId: COMPANY_ID },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;
  const created = await prisma.course.create({
    data: {
      companyId: COMPANY_ID,
      title: COURSE_TITLE,
      description: COURSE_DESC,
      sortOrder,
    },
  });
  console.log(`✓ Kurs yaratildi: ${created.id} (${created.title})`);
  return created.id;
}

async function ensureModule(courseId: string): Promise<string> {
  const existing = await prisma.lessonModule.findFirst({
    where: { companyId: COMPANY_ID, courseId, title: MODULE_TITLE },
  });
  if (existing) {
    console.log(`✓ Modul mavjud: ${existing.id} (${existing.title})`);
    return existing.id;
  }
  const last = await prisma.lessonModule.findFirst({
    where: { companyId: COMPANY_ID, courseId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;
  const created = await prisma.lessonModule.create({
    data: {
      companyId: COMPANY_ID,
      courseId,
      title: MODULE_TITLE,
      description: MODULE_DESC,
      sortOrder,
    },
  });
  console.log(`✓ Modul yaratildi: ${created.id} (${created.title})`);
  return created.id;
}

async function seedLesson(moduleId: string, spec: SeedSpec): Promise<void> {
  console.log(`\n=== ${spec.title} ===`);

  // 1) Video faylni uploads/lessons/ ga nusxalash
  if (!fs.existsSync(LESSON_UPLOAD_DIR)) {
    fs.mkdirSync(LESSON_UPLOAD_DIR, { recursive: true });
  }
  if (!fs.existsSync(spec.videoPath)) {
    throw new Error(`Video fayl topilmadi: ${spec.videoPath}`);
  }
  const ext = path.extname(spec.videoPath).toLowerCase() || ".mp4";
  const destName = `pro-sotuvchi-m1-${spec.sortOrder}-${Date.now()}${ext}`;
  const localPath = path.join(LESSON_UPLOAD_DIR, destName);
  if (!fs.existsSync(localPath)) {
    console.log(`  Video nusxalash (${Math.round(fs.statSync(spec.videoPath).size / (1024 * 1024))}MB)...`);
    fs.copyFileSync(spec.videoPath, localPath);
  }
  const stats = fs.statSync(localPath);

  // 2) Yandex Object Storage ga backup yuklash (uploadFile)
  // Yandex URL alohida yozilmaydi — lokal path videoUrl sifatida qoladi (lesson-processor
  // va streaming endpoint lokal faylni kutadi). Yandex backup faqat log'ga yoziladi.
  let yandexUrl: string | undefined;
  try {
    const buf = fs.readFileSync(localPath);
    const mime = ext === ".mp4" ? "video/mp4" : ext === ".webm" ? "video/webm" : "application/octet-stream";
    const up = await uploadFile(buf, COMPANY_ID, mime, ext.replace(/^\./, ""));
    yandexUrl = up.url;
    console.log(`  Yandex backup: ${yandexUrl}`);
  } catch (err) {
    console.warn(`  ⚠ Yandex upload xato (lokal nusxa ishlaydi):`, err instanceof Error ? err.message : err);
  }

  // 3) Transkriptlarni o'qish
  const lines: SttLine[] = JSON.parse(fs.readFileSync(spec.linesPath, "utf8"));
  const words: any[] = JSON.parse(fs.readFileSync(spec.wordsPath, "utf8"));
  const transcript = fs.readFileSync(spec.textPath, "utf8");
  const durationSec = lines.length
    ? Math.ceil(lines[lines.length - 1].end || lines[lines.length - 1].start)
    : 0;
  console.log(`  Transkript: ${words.length} so'z, ${lines.length} jumla, ${durationSec}s`);

  // 4) Flash natijasini olish (cache bo'lsa, aks holda chaqirish)
  let flash: FlashResult;
  if (spec.flashResultPath && fs.existsSync(spec.flashResultPath)) {
    console.log(`  Flash keshdan o'qilmoqda: ${path.basename(spec.flashResultPath)}`);
    flash = JSON.parse(fs.readFileSync(spec.flashResultPath, "utf8"));
  } else {
    console.log(`  Flash ga so'rov yuborilmoqda...`);
    const t0 = Date.now();
    flash = await generateFlash(spec.title, spec.description, lines, durationSec);
    console.log(`  Flash tugadi (${((Date.now() - t0) / 1000).toFixed(1)}s): ${flash.questions?.length || 0} savol`);
  }

  // 5) Mavjud darsni tekshirish
  const existing = await prisma.lesson.findFirst({
    where: { companyId: COMPANY_ID, moduleId, title: spec.title },
  });
  if (existing) {
    console.log(`  ! Dars allaqachon mavjud: ${existing.id} — yangilanmoqda`);
    await prisma.lesson.update({
      where: { id: existing.id },
      data: {
        description: spec.description,
        videoUrl: localPath,
        videoDurationSec: durationSec,
        videoSizeBytes: BigInt(stats.size),
        transcription: transcript,
        transcriptionJson: words as any,
        testQuestions: flash.questions as any,
        aiSystemPrompt: flash.aiSystemPrompt,
        aiKeyTopics: flash.aiKeyTopics as any,
        status: "ready",
        processingError: null,
      },
    });
    console.log(`  ✓ Yangilandi`);
    return;
  }

  // 6) Yangi dars yaratish
  const lesson = await prisma.lesson.create({
    data: {
      companyId: COMPANY_ID,
      moduleId,
      title: spec.title,
      description: spec.description,
      videoUrl: localPath,
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
  console.log(`  ✓ Dars yaratildi: ${lesson.id}`);
}

(async () => {
  const company = await prisma.company.findUnique({ where: { id: COMPANY_ID } });
  if (!company) {
    console.error(`✗ Kompaniya topilmadi: ${COMPANY_ID}`);
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name} (${company.id})`);

  const courseId = await ensureCourse();
  const moduleId = await ensureModule(courseId);

  const specs: SeedSpec[] = [
    {
      videoPath: path.join(ROOT, "1)  kurs darsli .mp4"),
      linesPath: path.join(TR, "kurs-darsli-lines.json"),
      wordsPath: path.join(TR, "kurs-darsli-words.json"),
      textPath: path.join(TR, "kurs-darsli.txt"),
      flashResultPath: path.join(TR, "kurs-darsli-flash-result.json"),
      title: "1-dars: Kirish",
      description: "Kursga kirish, sotuvchining ahamiyati, o'qituvchining falsafasi va kurs tuzilishi.",
      sortOrder: 0,
    },
    {
      videoPath: path.join(ROOT, "dars .mp4"),
      linesPath: path.join(TR, "dars-lines.json"),
      wordsPath: path.join(TR, "dars-words.json"),
      textPath: path.join(TR, "dars.txt"),
      title: "2-dars: Inson evolyusiyasi",
      description: "Inson evolyusiyasi, shaxsiy o'sish va kasbiy rivojlanish tamoyillari.",
      sortOrder: 1,
    },
  ];

  for (const spec of specs) {
    try {
      await seedLesson(moduleId, spec);
    } catch (err) {
      console.error(`✗ ${spec.title} xatolik:`, err instanceof Error ? err.message : err);
    }
  }

  // Hisobotni chiqarish
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        include: {
          lessons: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });
  console.log(`\n─── Yakuniy holat ───`);
  console.log(`Kurs: ${course?.title}`);
  for (const m of course?.modules || []) {
    console.log(`  Modul: ${m.title}`);
    for (const l of m.lessons) {
      console.log(`    • [${l.status}] ${l.title} (${l.id})`);
    }
  }

  await prisma.$disconnect();
  console.log(`\n✅ Tugadi`);
})();
