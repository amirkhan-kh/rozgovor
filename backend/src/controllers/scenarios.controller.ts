import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import {
  PROSALES_PRESALE_EXAMPLE,
  PROSALES_SALES_EXAMPLE,
  PROSALES_AFTERSALE_EXAMPLE,
} from "../services/scenario-example";
import { getRAGContext } from "../services/document-rag";

type ScenarioCategory = "presale" | "qayta" | "sotuv" | "aftersale";

interface ScenarioBranch {
  clientResponse: string;
  managerReply: string;
}

interface ScenarioSection {
  id: string;
  title: string;
  managerScript: string;
  branches?: ScenarioBranch[];
  note?: string;
}

interface GeneratedScenario {
  title: string;
  sections: ScenarioSection[];
}

const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  presale: "Pre Sale (1-qo'ng'iroq)",
  qayta: "Qayta qo'ng'iroq",
  sotuv: "Sotuv (uchrashuvdagi taqdimot)",
  aftersale: "After Sale (g'amxo'rlik qo'ng'irog'i)",
};

const CATEGORY_AUDIO_FILTER: Record<ScenarioCategory, { category: { in: string[] } } | null> = {
  presale: { category: { in: ["1-qo'ng'iroq", "sotuv"] } },
  qayta: { category: { in: ["qayta"] } },
  sotuv: { category: { in: ["sotuv"] } },
  aftersale: null, // after sale uchun audio filter yo'q
};

function getGemini(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: "global",
  });
}

async function getTopTranscripts(
  companyId: string,
  category: ScenarioCategory,
  limit = 10
): Promise<{ transcript: string; score: number }[]> {
  const categoryFilter = CATEGORY_AUDIO_FILTER[category];
  if (!categoryFilter) return [];

  const audios = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      ...categoryFilter,
      analysis: { overallScore: { gte: 70 } },
    },
    orderBy: { analysis: { overallScore: "desc" } },
    take: limit,
    include: { analysis: { select: { overallScore: true } } },
  });

  return audios
    .filter((a) => a.transcription && a.transcription.length > 200)
    .map((a) => ({
      transcript: a.transcription!.slice(0, 2500),
      score: a.analysis?.overallScore || 0,
    }));
}

function getEtalonFor(category: ScenarioCategory): string {
  switch (category) {
    case "presale":
      return PROSALES_PRESALE_EXAMPLE;
    case "sotuv":
      return PROSALES_SALES_EXAMPLE;
    case "aftersale":
      return PROSALES_AFTERSALE_EXAMPLE;
    case "qayta":
      return PROSALES_PRESALE_EXAMPLE;
  }
}

function buildPrompt(
  category: ScenarioCategory,
  companyName: string,
  courseInfo: string | null,
  transcripts: { transcript: string; score: number }[]
): string {
  const label = CATEGORY_LABELS[category];
  const etalon = getEtalonFor(category);

  const transcriptsBlock =
    transcripts.length === 0
      ? "(Real qo'ng'iroq yo'q — etalon namunadan ilhom olib yozing)"
      : transcripts
          .map(
            (t, i) =>
              `=== QO'NG'IROQ ${i + 1} (ball: ${t.score}) ===\n${t.transcript}`
          )
          .join("\n\n");

  const categoryInstruction =
    category === "qayta"
      ? `Bu QAYTA QO'NG'IROQ senariysi — mijoz oldin 1-qo'ng'iroqni olgan, lekin uchrashuvga kelmagan yoki o'ylab ko'raman deb qolgan holatda. Bosqichlar:
1. Tanishuv va kontekst eslatish (oldingi suhbat haqida)
2. Mijoz holati so'rov (o'yladim/o'ylab ko'rmadim/bandman)
3. Qo'shimcha ehtiyoj aniqlash
4. Yangi taklif yoki chegirma
5. Etirozlar bilan ishlash
6. Yopish — uchrashuvga qayta jalb qilish yoki yangi vaqt belgilash
7. Yakuniy eslatma`
      : category === "aftersale"
      ? `Bu AFTER SALE senariysi — xizmat ko'rsatilgandan keyin g'amxo'rlik qo'ng'irog'i. Qisqa va samimiy bo'lsin.`
      : category === "sotuv"
      ? `Bu SOTUV senariysi — uchrashuv/taqdimotda to'liq prezentatsiya va kelishuv. Bosqichlar: Tanishuv → Small talk → Vaqt eslatish → Icebreaker → SOPRANO (ehtiyoj aniqlash) → Tasdiqlash → XAF (taqdimot) → Narx → E'tirozlar → ODC → Kelishuv → Xayrlashuv.`
      : `Bu PRE SALE (1-qo'ng'iroq) senariysi — mijoz birinchi marta kompaniya bilan aloqaga kiradi. Bosqichlar: Tanishuv → Small talk → Programmalashtirish → Kvalifikatsiya savollari → Mini Taqdimot → Uchrashuv belgilash → Dojim (yakuniy eslatma).`;

  return `Siz sotuv senariysi eksperti. Kompaniya: ${companyName}.

=== ETALON SENARIY (ProSales seminar namunasi — ${label} uchun) ===
${etalon}

=== REAL QO'NG'IROQLAR (top ${transcripts.length} ta) ===
${transcriptsBlock}

${
  courseInfo
    ? `=== KOMPANIYA MAHSULOTI/XIZMATI ===\n${courseInfo.slice(0, 1500)}\n`
    : ""
}

=== VAZIFA ===
${categoryInstruction}

Yuqoridagi etalon strukturaga va real qo'ng'iroqlarga asoslanib, ${companyName} uchun **${label}** senariysini yarating.

TALABLAR:
1. Har bosqich BATAFSIL bo'lsin — "nima desa nima deysan" aniq yozilsin.
2. Har bosqichda mijoz javobining 2-3 ta asosiy variantiga qarab menejer javobi jadval shaklida (branches) bo'lsin.
3. Real transkriptlardan haqiqiy iboralar olinsin — quruq shablon emas.
4. Tilda: o'zbekcha (lotin yozuvi), kompaniya mijozlariga tushunarli.
5. Kompaniya mahsuloti/xizmatiga moslangan — umumiy nomlar emas, konkret.

STRICTLY valid JSON qaytaring (markdown emas):
{
  "title": "${label}",
  "sections": [
    {
      "id": "tanishuv",
      "title": "Tanishuv",
      "managerScript": "Assalomu alaykum ... 2 daqiqa vaqtingiz bormi?",
      "branches": [
        { "clientResponse": "Ha", "managerReply": "Suhbatni davom ettiramiz..." },
        { "clientResponse": "Yo'q", "managerReply": "Keyingi qo'ng'iroq vaqtini..." }
      ]
    },
    {
      "id": "small-talk",
      "title": "Small talk",
      "managerScript": "Siz qayerdansiz?"
    }
    ...
  ]
}

Bosqich soni: 7-14 ta. Har bosqichda managerScript bo'lishi shart. branches faqat shart bo'lganda (mijoz javob variantlariga qarab turli javoblar bor bo'lsa).`;
}

async function generateScenarioFor(
  companyId: string,
  category: ScenarioCategory,
  attempt: number = 1
): Promise<GeneratedScenario> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, courseInfo: true },
  });

  const transcripts = await getTopTranscripts(companyId, category);
  const prompt = buildPrompt(
    category,
    company?.name || "Kompaniya",
    company?.courseInfo || null,
    transcripts
  );

  try {
    const ai = getGemini();
    const resp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.6, responseMimeType: "application/json" },
    });
    const text = resp.text?.trim() || "{}";
    const parsed = JSON.parse(text) as GeneratedScenario;

    if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
      throw new Error("AI returned invalid scenario structure");
    }
    return parsed;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if ((msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) && attempt <= 3) {
      const wait = 30000 * attempt;
      console.warn(`[Scenarios] ${category}: rate limit, ${wait / 1000}s kutib retry (${attempt}/3)`);
      await new Promise((r) => setTimeout(r, wait));
      return generateScenarioFor(companyId, category, attempt + 1);
    }
    throw err;
  }
}

// GET /api/scenarios — 4 ta senariyni olish
export const listScenarios = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const scenarios = await prisma.scenario.findMany({
      where: { companyId },
      orderBy: { category: "asc" },
    });
    success(res, scenarios);
  } catch (err) {
    console.error("scenarios list error:", err);
    error(res, "Senariylarni olishda xatolik");
  }
};

// POST /api/scenarios/generate — 4 ta senariyni AI yaratadi (overwrite)
export const generateAllScenarios = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const categories: ScenarioCategory[] = ["presale", "qayta", "sotuv", "aftersale"];

    const successes: string[] = [];
    const failures: string[] = [];
    for (const category of categories) {
      try {
        const scenario = await generateScenarioFor(companyId, category);
        await prisma.scenario.upsert({
          where: { companyId_category: { companyId, category } },
          create: {
            companyId,
            category,
            title: scenario.title,
            sections: scenario.sections as unknown as object,
            isEdited: false,
          },
          update: {
            title: scenario.title,
            sections: scenario.sections as unknown as object,
            isEdited: false,
            generatedAt: new Date(),
          },
        });
        successes.push(category);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Scenarios] ${category} failed:`, msg.substring(0, 200));
        failures.push(`${category}: ${msg.substring(0, 200)}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    success(res, {
      generated: successes.length,
      failed: failures.length,
      errors: failures,
      succeededCategories: successes,
    });
  } catch (err: unknown) {
    console.error("scenarios generate error:", err);
    const msg =
      err instanceof Error ? err.message : "Senariylarni yaratishda xatolik";
    error(res, msg);
  }
};

// PUT /api/scenarios/:id — user edited sections ni saqlash
export const updateScenario = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const { id } = req.params;
    const { title, sections } = req.body;

    const existing = await prisma.scenario.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      error(res, "Senariy topilmadi", 404);
      return;
    }

    const updated = await prisma.scenario.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(sections !== undefined && { sections }),
        isEdited: true,
      },
    });

    success(res, updated);
  } catch (err) {
    console.error("scenarios update error:", err);
    error(res, "Saqlashda xatolik");
  }
};

// POST /api/scenarios/from-course — RAG context asosida sotuv skripti generatsiya
export const generateFromCourse = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId;
    if (!companyId) { error(res, "Kompaniya aniqlanmadi", 401); return; }

    const { category = "presale", pipelineName } = req.body as {
      category?: string;
      pipelineName?: string;
    };

    // voronkaCourseMap va documents schema'da yo'q — any cast bilan ishlaymiz
    const company = await (prisma as any).company.findUnique({
      where: { id: companyId },
      select: {
        courseInfo: true,
        voronkaCourseMap: true,
        documents: {
          select: { content: true, filename: true },
          take: 3,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!company) { error(res, "Kompaniya topilmadi", 404); return; }

    const courseParts: string[] = [];

    if (pipelineName && company.voronkaCourseMap) {
      const map = company.voronkaCourseMap as Record<string, string>;
      if (map[pipelineName]) courseParts.push(map[pipelineName]);
    }
    if (company.courseInfo) courseParts.push(company.courseInfo);
    for (const doc of (company.documents || [])) {
      if (doc.content) courseParts.push(`[${doc.filename}]: ${doc.content.slice(0, 1000)}`);
    }

    const courseContext = courseParts.join("\n\n").slice(0, 3000);
    if (!courseContext.trim()) {
      error(res, "Kurs ma'lumoti topilmadi. Avval profildan kurs haqida ma'lumot kiriting.", 400);
      return;
    }

    const categoryLabel = CATEGORY_LABELS[category as ScenarioCategory] || category;

    const prompt = `Sen O'zbekiston sotuv bo'yicha ekspertisan.

Quyidagi kurs/mahsulot haqidagi ma'lumot asosida "${categoryLabel}" uchun professional sotuv skripti yozib ber.

=== KURS MA'LUMOTI ===
${courseContext}

=== TOPSHIRIQ ===
${categoryLabel} uchun sotish skripti yoz. Skript:
1. Salomlashish va o'zini tanishtirish
2. Mijoz ehtiyojlarini aniqlash (SOPRANO/SPIN savollari)
3. Kursni taqdim qilish (aniq faktlar bilan)
4. Eng keng tarqalgan 3 ta e'tirozga javoblar
5. Buyurtmaga yetaklash (closing)

Har bo'limda menejer aniq nima deyishi kerakligini ko'rsat.
JSON formatda qaytarma — oddiy matn, bo'limlar bilan.`;

    const ai = getGemini();
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.7, maxOutputTokens: 2000 },
    });
    const script = result.text || "";
    success(res, { script, category, pipelineName });
  } catch (err) {
    console.error("generateFromCourse error:", err);
    error(res, "Script generatsiyada xatolik");
  }
};
