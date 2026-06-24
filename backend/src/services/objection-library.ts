/**
 * Objection Library (B2-4)
 *
 * Avtomatik ravishda kompaniyaning barcha qo'ng'iroqlaridan e'tirozlarni yig'adi,
 * turga bo'ladi va har tur uchun ENG YAXSHI javoblarni (muvaffaqiyatli sotuvlardan) topadi.
 *
 * Oylik cron orqali yangilanadi.
 */

import { prisma } from "../utils/prisma";
import { GoogleGenAI } from "@google/genai";

// USE_FLASH_3=1 bo'lsa Gemini 3 Flash Preview (global region) — pul tejaydi va
// rate limit kam. Aks holda Gemini 2.5 Pro (regional).
const USE_FLASH_3 = process.env.USE_FLASH_3 === "1";
const MODEL = USE_FLASH_3 ? "gemini-3-flash-preview" : "gemini-2.5-pro";
// Flash 3 faqat "global" region — VERTEX_LOCATION dan qat'iy nazar.
const AI_LOCATION = USE_FLASH_3 ? "global" : (process.env.VERTEX_LOCATION || "us-central1");

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: AI_LOCATION,
  });
}

export interface ObjectionLibraryEntry {
  type: string;                       // "Narx", "Vaqt", "Ishonch" ...
  count: number;                      // shu turdagi e'tirozlar soni (umumiy)
  frequency: number;                  // % — jami qo'ng'iroqlarning shunchasi
  description: string;                // qanday ifodalanadi odatda
  bestResponses: Array<{
    managerName: string;               // kim javob bergan
    quote: string;                     // real ibora
    callId: string;                    // qaysi qo'ng'iroqdan
    worked: boolean;                   // isSale=true bo'lgan qo'ng'iroqmi
  }>;
  avoidResponses: Array<{
    quote: string;                     // noto'g'ri javob misoli
    why: string;                       // nima uchun yomon
  }>;
  technique: string;                   // tavsiya etilgan texnika
  aiSuggestions: string[];             // AI tomonidan 3 ta universal maslahat (real javob bo'lsa ham, bo'lmasa ham)
}

export interface ObjectionLibrary {
  generatedAt: string;
  totalCallsAnalyzed: number;
  entries: ObjectionLibraryEntry[];
}

/**
 * Bitta kompaniya uchun objection library yaratish.
 */
export async function buildObjectionLibrary(
  companyId: string,
  daysPeriod = 60
): Promise<ObjectionLibrary | null> {
  const since = new Date();
  since.setDate(since.getDate() - daysPeriod);

  // Barcha analiz qilingan qo'ng'iroqlar (transkripsiya bor + analysis bor)
  const files = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      createdAt: { gte: since },
      transcription: { not: null },
      analysis: { isNot: null },
    },
    select: {
      id: true,
      isSale: true,
      transcription: true,
      manager: { select: { name: true } },
      analysis: {
        select: {
          objections: true,
          errors: true,
          overallScore: true,
        },
      },
    },
  });

  if (files.length < 10) {
    console.log(`[ObjectionLib] ${companyId}: ${files.length} ta qo'ng'iroq — yetarli emas`);
    return null;
  }

  // 1. Objection turlarini yig'ish
  // Muvaffaqiyatli qo'ng'iroq = isSale=true YOKI overallScore >= 70 (yaxshi tahlillangan)
  // Bu sotuv yopilmagan lekin menejer e'tirozga yaxshi javob bergan holatlarni ham hisobga oladi
  const objectionAcc: Record<string, {
    count: number;
    successCalls: typeof files;
    failedCalls: typeof files;
  }> = {};

  const SUCCESS_SCORE_THRESHOLD = 70;
  const isCallSuccessful = (f: typeof files[number]): boolean => {
    if (f.isSale) return true;
    const score = f.analysis?.overallScore ?? 0;
    return score >= SUCCESS_SCORE_THRESHOLD;
  };

  for (const f of files) {
    const objs = (f.analysis?.objections as Array<{ type: string; count: number }>) || [];
    for (const o of objs) {
      if (!objectionAcc[o.type]) {
        objectionAcc[o.type] = { count: 0, successCalls: [], failedCalls: [] };
      }
      objectionAcc[o.type].count += o.count;
      if (isCallSuccessful(f)) objectionAcc[o.type].successCalls.push(f);
      else objectionAcc[o.type].failedCalls.push(f);
    }
  }

  const sortedTypes = Object.entries(objectionAcc)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 7); // eng ko'p 7 ta

  if (sortedTypes.length === 0) {
    console.log(`[ObjectionLib] ${companyId}: e'tiroz topilmadi`);
    return null;
  }

  // 2. Har tur uchun Gemini Pro'ga namunaviy successful va failed callarni beramiz,
  //    u eng yaxshi javoblarni extract qiladi
  const entries: ObjectionLibraryEntry[] = [];

  for (const [type, data] of sortedTypes) {
    try {
      const entry = await extractBestResponses(type, data.successCalls, data.failedCalls, files.length);
      if (entry) entries.push(entry);
      await new Promise((r) => setTimeout(r, 5000)); // rate limit (Gemini 429 oldini olish)
    } catch (err) {
      console.error(`[ObjectionLib] ${type} extractBestResponses xato:`, (err as Error).message);
    }
  }

  if (entries.length === 0) return null;

  return {
    generatedAt: new Date().toISOString(),
    totalCallsAnalyzed: files.length,
    entries,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function extractBestResponses(
  objectionType: string,
  successCalls: Array<{ id: string; transcription: string | null; manager: { name: string } | null }>,
  failedCalls: Array<{ id: string; transcription: string | null; manager: { name: string } | null }>,
  totalCalls: number
): Promise<ObjectionLibraryEntry | null> {
  // Eng ko'pi bilan 8 ta muvaffaqiyatli + 4 ta muvaffaqiyatsiz
  const successSample = successCalls.slice(0, 8);
  const failedSample = failedCalls.slice(0, 4);

  if (successSample.length === 0) {
    // Muvaffaqiyatli javob topilmasa — AI'dan 3 ta universal maslahat olamiz
    const fallbackSuggestions = await generateUniversalAdvice(objectionType, failedSample);
    return {
      type: objectionType,
      count: successCalls.length + failedCalls.length,
      frequency: Math.round(((successCalls.length + failedCalls.length) / totalCalls) * 100),
      description: `"${objectionType}" e'tirozi — real muvaffaqiyatli javob namunalari kam, AI tavsiyasi`,
      bestResponses: [],
      avoidResponses: [],
      technique: "Ushbu e'tirozga real muvaffaqiyatli javoblar topilmadi — quyidagi AI maslahatlardan foydalaning",
      aiSuggestions: fallbackSuggestions,
    };
  }

  const successText = successSample
    .map((c, i) => `[SUCCESS ${i + 1}] ${c.manager?.name}: ${(c.transcription || "").slice(0, 2500)}`)
    .join("\n\n");

  const failedText = failedSample
    .map((c, i) => `[FAILED ${i + 1}] ${c.manager?.name}: ${(c.transcription || "").slice(0, 1500)}`)
    .join("\n\n");

  const prompt = `Sen sotuvchi-trenersan. Quyida "${objectionType}" e'tirozi haqida ikki turdagi qo'ng'iroqlar keltirilgan:
muvaffaqiyatli (sotuv yopilgan) va muvaffaqiyatsiz (yopilmagan).

MAQSAD: "${objectionType}" e'tirozida ishlaydigan 3 ta ENG YAXSHI real javobni topish.

MUVAFFAQIYATLI QONG'IROQLAR:
${successText}

${failedText ? `\nMUVAFFAQIYATSIZ QONG'IROQLAR (nimani qilmaslik kerak):\n${failedText}` : ""}

JSON javob:
{
  "description": "Bu e'tiroz odatda qanday ifodalanadi (bir jumla)",
  "bestResponses": [
    {"managerName": "ism (yoki SUCCESS raqam)", "quote": "real ibora muvaffaqiyatli qo'ng'iroqdan — ko'chirma", "worked": true}
  ],
  "avoidResponses": [
    {"quote": "yomon javob misoli muvaffaqiyatsiz qo'ng'iroqdan", "why": "nima uchun bu ishlamadi"}
  ],
  "technique": "Qanday texnika ishlatilgan (masalan: Feel-Felt-Found, Price Reframing, Micro-commitment)",
  "aiSuggestions": [
    "1-maslahat: aniq, qisqa, amaliy iboralar (real javoblar bilan birga ishlaydigan)",
    "2-maslahat: ...",
    "3-maslahat: ..."
  ]
}

QOIDALAR:
- bestResponses: 2-3 ta, faqat REAL iboralar — ko'chirmalar
- avoidResponses: 1-2 ta, muvaffaqiyatsiz qo'ng'iroqlardan
- technique: aniq nom, bir jumla tushuntirish
- aiSuggestions: AYNAN 3 ta universal maslahat — har biri qisqa amaliy ibora yoki yondashuv (real javoblardan tashqari, AI tavsiyasi sifatida menejer ishlatishi mumkin)`;

  try {
    const ai = getAI();
    let result: any;
    let attempt = 0;
    while (attempt < 3) {
      try {
        result = await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: { temperature: 0.1 },
        });
        break;
      } catch (rateErr: any) {
        const msg = rateErr?.message || "";
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          attempt += 1;
          const wait = 15000 * attempt;
          console.log(`[ObjectionLib] ${objectionType}: 429, ${wait}ms kutib qayta urinish (${attempt}/3)`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw rateErr;
      }
    }
    if (!result) return null;

    const text = result.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    return {
      type: objectionType,
      count: successCalls.length + failedCalls.length,
      frequency: Math.round(((successCalls.length + failedCalls.length) / totalCalls) * 100),
      description: parsed.description || "",
      bestResponses: (parsed.bestResponses || []).slice(0, 3).map((r: any, i: number) => ({
        managerName: r.managerName || successSample[i]?.manager?.name || "Noma'lum",
        quote: r.quote || "",
        callId: successSample[i]?.id || "",
        worked: true,
      })),
      avoidResponses: (parsed.avoidResponses || []).slice(0, 2).map((r: any) => ({
        quote: r.quote || "",
        why: r.why || "",
      })),
      technique: parsed.technique || "",
      aiSuggestions: Array.isArray(parsed.aiSuggestions)
        ? parsed.aiSuggestions.slice(0, 3).map((s: any) => String(s))
        : [],
    };
  } catch (err) {
    console.error(`[ObjectionLib] ${objectionType} AI xato:`, (err as Error).message);
    return null;
  }
}

/**
 * Real javob namunalari yo'q bo'lganda — AI'dan 3 ta universal maslahat olish.
 * Failed misollardan ham foydalanib (agar bor bo'lsa) e'tirozga umumiy yondashuv yozadi.
 */
async function generateUniversalAdvice(
  objectionType: string,
  failedSample: Array<{ id: string; transcription: string | null; manager: { name: string } | null }>
): Promise<string[]> {
  const failedText = failedSample.length > 0
    ? failedSample
        .map((c, i) => `[FAILED ${i + 1}] ${c.manager?.name}: ${(c.transcription || "").slice(0, 1000)}`)
        .join("\n\n")
    : "";

  const prompt = `Sen O'zbekiston sotuv-trenerisan. "${objectionType}" e'tirozi haqida 3 ta UNIVERSAL maslahat yoz.

${failedText ? `Quyida shu e'tirozda muvaffaqiyatsiz tugagan qo'ng'iroqlar bor — ulardan saboq ol:\n${failedText}\n` : "Bu e'tiroz uchun real qo'ng'iroq namunalari hali yo'q."}

Vazifa: menejer "${objectionType}" e'tirozini eshitganda ishlatishi mumkin bo'lgan 3 ta aniq, amaliy maslahat (yoki ibora) yoz.

JSON javob:
{
  "advice": [
    "1-maslahat — qisqa amaliy taklif yoki ibora (1-2 jumla)",
    "2-maslahat — ...",
    "3-maslahat — ..."
  ]
}

QOIDA: O'zbek tilida, qisqa, sotuvchi darrov ishlatishi mumkin bo'lgan tarzda.`;

  try {
    const ai = getAI();
    let result: any;
    let attempt = 0;
    while (attempt < 3) {
      try {
        result = await ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: { temperature: 0.3 },
        });
        break;
      } catch (rateErr: any) {
        const msg = rateErr?.message || "";
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 15000 * attempt));
          continue;
        }
        throw rateErr;
      }
    }
    if (!result) return [];

    const text = result.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed.advice)) {
      return parsed.advice.slice(0, 3).map((s: any) => String(s));
    }
    return [];
  } catch (err) {
    console.error(`[ObjectionLib] ${objectionType} universal advice xato:`, (err as Error).message);
    return [];
  }
}

/**
 * Bitta kompaniya uchun library'ni yangilab DB ga saqlash.
 */
export async function refreshObjectionLibrary(companyId: string): Promise<boolean> {
  try {
    const library = await buildObjectionLibrary(companyId);
    if (!library) return false;

    await prisma.company.update({
      where: { id: companyId },
      data: {
        objectionLibrary: library as any,
        objectionLibraryUpdatedAt: new Date(),
      },
    });

    console.log(`[ObjectionLib] ${companyId}: saqlandi — ${library.entries.length} ta tur`);
    return true;
  } catch (err) {
    console.error(`[ObjectionLib] ${companyId} xato:`, (err as Error).message);
    return false;
  }
}

/**
 * Barcha aktiv kompaniyalar uchun refresh.
 */
export async function refreshAllObjectionLibraries(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  console.log(`[ObjectionLib] ${companies.length} ta kompaniya uchun yangilanmoqda...`);

  for (const c of companies) {
    try {
      await refreshObjectionLibrary(c.id);
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err) {
      console.error(`[ObjectionLib] ${c.name} xato:`, (err as Error).message);
    }
  }

  console.log("[ObjectionLib] Barcha kompaniyalar tugadi");
}
