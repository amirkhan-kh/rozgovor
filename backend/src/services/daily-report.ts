/**
 * Kunlik hisobot — 20:00 da ROP va Admin (boshliq) telegramiga yuboriladi.
 *
 * ROP olishi kerak:
 *   - Jamoa bugungi sotuv + tahlil qilingan qo'ng'iroqlar
 *   - Eng zaif ko'nikma (eng past ball bergan mezon jamoa bo'yicha)
 *   - Shu ko'nikmani qanday oshirish — Bo'ri yo'li kitobidan maslahat
 *   - Ingliz va o'zbek tilidagi YouTube video / resurslar
 *
 * Admin (boshliq) olishi kerak:
 *   - Jamoa umumiy ishlashi + sotuvlar
 *   - Top / pastki menejerlar
 *   - Umumiy jamoa zaif ko'nikmalari
 */
import { prisma } from "../utils/prisma";
import { VertexAI } from "@google-cloud/vertexai";
import { readFileSync } from "fs";
import { join } from "path";

const MODEL = "gemini-3-flash-preview";
const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "global";

// Knowledge base (lazy load)
let cachedKnowledge = "";
function getKnowledge(): string {
  if (cachedKnowledge) return cachedKnowledge;
  try {
    cachedKnowledge = readFileSync(
      join(__dirname, "../../knowledge_base/way_of_the_wolf_uz.md"),
      "utf-8",
    );
  } catch {
    cachedKnowledge = "";
  }
  return cachedKnowledge;
}

// ───────────────────────── Types ─────────────────────────

export interface ManagerStats {
  id: string;
  name: string;
  role: string;
  totalCalls: number;
  sales: number;
  avgScore: number;
}

export interface TeamStats {
  companyId: string;
  companyName: string;
  date: string; // YYYY-MM-DD
  totalCalls: number;
  totalSales: number;
  totalSalesAmount: number;
  avgScore: number;
  yesterdayAvgScore: number;
  growthPercent: number;
  managers: ManagerStats[];
  topPerformers: ManagerStats[];
  bottomPerformers: ManagerStats[];
  criteriaAverages: Array<{ name: string; avgScore: number; count: number }>;
  weakestSkills: Array<{ name: string; avgScore: number }>; // top-3 zaif
}

export interface RopReport {
  team: TeamStats;
  weakestSkill: { name: string; avgScore: number };
  strugglingManagers: string[]; // shu ko'nikmada past bo'lganlar
  advice: {
    text: string; // Gemini Flash tomonidan yaratilgan 3-4 jumlalik maslahat
    bookChapter: string;
    bookQuote: string;
  };
  resources: {
    youtubeEn: string;
    youtubeUz: string;
    searchEn: string;
    searchUz: string;
  };
}

// ───────────────────────── Team stats ─────────────────────────

export async function computeTeamStats(
  companyId: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<TeamStats | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return null;

  // Bugungi tahlil qilingan audio fayllar
  const files = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      createdAt: { gte: dateFrom, lt: dateTo },
    },
    include: {
      analysis: { select: { overallScore: true, criteria: true } },
      manager: { select: { id: true, name: true, role: true } },
    },
  });

  if (files.length === 0) {
    return {
      companyId,
      companyName: company.name,
      date: dateFrom.toISOString().split("T")[0],
      totalCalls: 0,
      totalSales: 0,
      totalSalesAmount: 0,
      avgScore: 0,
      yesterdayAvgScore: 0,
      growthPercent: 0,
      managers: [],
      topPerformers: [],
      bottomPerformers: [],
      criteriaAverages: [],
      weakestSkills: [],
    };
  }

  // Jami ball
  const scores = files.map((f) => f.analysis?.overallScore || 0);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  // Sotuvlar (category "sotuv" yoki sale_closed fieldi bor)
  const saleFiles = files.filter((f) => (f as any).saleClosedAt);
  const totalSales = saleFiles.length;
  const totalSalesAmount = 0; // narx alohida joyda — hozircha 0

  // Menejerlar bo'yicha agregatsiya
  const mgrMap = new Map<string, ManagerStats>();
  for (const f of files) {
    const m = f.manager;
    if (!m) continue;
    const cur = mgrMap.get(m.id) || {
      id: m.id,
      name: m.name,
      role: m.role || "sotuvchi",
      totalCalls: 0,
      sales: 0,
      avgScore: 0,
    };
    cur.totalCalls += 1;
    if ((f as any).saleClosedAt) cur.sales += 1;
    cur.avgScore += f.analysis?.overallScore || 0;
    mgrMap.set(m.id, cur);
  }
  const managers = Array.from(mgrMap.values()).map((m) => ({
    ...m,
    avgScore: m.totalCalls > 0 ? Math.round(m.avgScore / m.totalCalls) : 0,
  }));

  const sorted = [...managers].sort((a, b) => b.avgScore - a.avgScore);
  const topPerformers = sorted.slice(0, 3);
  const bottomPerformers = sorted.slice(-3).reverse();

  // Kechagi o'rtacha — o'sish foizi uchun
  const yesterdayStart = new Date(dateFrom);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayFiles = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      createdAt: { gte: yesterdayStart, lt: dateFrom },
    },
    select: { analysis: { select: { overallScore: true } } },
  });
  const ySc = yesterdayFiles.map((f) => f.analysis?.overallScore || 0);
  const yesterdayAvgScore = ySc.length > 0
    ? Math.round(ySc.reduce((a, b) => a + b, 0) / ySc.length)
    : 0;
  const growthPercent = yesterdayAvgScore > 0
    ? Math.round(((avgScore - yesterdayAvgScore) / yesterdayAvgScore) * 100)
    : 0;

  // Mezonlar bo'yicha jamoa o'rtacha
  const critAccum: Record<string, { sum: number; count: number }> = {};
  for (const f of files) {
    const crit = (f.analysis?.criteria as any) || {};
    for (const [name, val] of Object.entries(crit)) {
      const score = (val as any)?.score;
      if (typeof score !== "number") continue;
      if (!critAccum[name]) critAccum[name] = { sum: 0, count: 0 };
      critAccum[name].sum += score;
      critAccum[name].count += 1;
    }
  }
  const criteriaAverages = Object.entries(critAccum)
    .map(([name, v]) => ({
      name,
      avgScore: Math.round(v.sum / v.count),
      count: v.count,
    }))
    .sort((a, b) => a.avgScore - b.avgScore);

  // Eng zaif 3 ko'nikma
  const weakestSkills = criteriaAverages.slice(0, 3);

  return {
    companyId,
    companyName: company.name,
    date: dateFrom.toISOString().split("T")[0],
    totalCalls: files.length,
    totalSales,
    totalSalesAmount,
    avgScore,
    yesterdayAvgScore,
    growthPercent,
    managers,
    topPerformers,
    bottomPerformers,
    criteriaAverages,
    weakestSkills,
  };
}

// ───────────────────────── Skill resources map ─────────────────────────

interface SkillResource {
  chapter: string;
  enQuery: string;
  uzQuery: string;
}

// Jamoa ko'nikmalari (name key'lar case-insensitive, substring match)
const SKILL_RESOURCES: Record<string, SkillResource> = {
  salomlash: {
    chapter: "Dastlabki 4 soniya qoidasi",
    enQuery: "jordan belfort first 4 seconds sales",
    uzQuery: "sotuvda birinchi taassurot qoldirish",
  },
  tanishu: {
    chapter: "Dastlabki 4 soniya qoidasi",
    enQuery: "cold call introduction script",
    uzQuery: "sovuq qongiroq boshlash",
  },
  ehtiyoj: {
    chapter: "Intelligence gathering (ma'lumot yig'ish)",
    enQuery: "sales discovery questions technique",
    uzQuery: "mijoz ehtiyojini aniqlash",
  },
  "maqsad aniq": {
    chapter: "Intelligence gathering (ma'lumot yig'ish)",
    enQuery: "open ended questions sales discovery",
    uzQuery: "mijozga togri savollar berish",
  },
  mahsulot: {
    chapter: "To'g'ri chiziq — Presentation",
    enQuery: "jordan belfort straight line presentation",
    uzQuery: "mahsulot prezentatsiyasi sotuv",
  },
  taqdimot: {
    chapter: "To'g'ri chiziq — Presentation",
    enQuery: "sales pitch technique storytelling",
    uzQuery: "sotuvchi taqdimot qilish",
  },
  etiroz: {
    chapter: "Looping texnikasi",
    enQuery: "jordan belfort looping objection handling",
    uzQuery: "etiroz bilan ishlash sotuv",
  },
  "e'tiroz": {
    chapter: "Looping texnikasi",
    enQuery: "jordan belfort looping objection handling",
    uzQuery: "etiroz bilan ishlash sotuv",
  },
  qarshili: {
    chapter: "Looping texnikasi",
    enQuery: "jordan belfort looping objection handling",
    uzQuery: "etirozga javob berish",
  },
  narx: {
    chapter: "Narx e'tirozi — Looping",
    enQuery: "price objection handling sales technique",
    uzQuery: "narx etiroziga javob berish",
  },
  yopish: {
    chapter: "To'g'ri chiziq — Closing",
    enQuery: "jordan belfort closing sales straight line",
    uzQuery: "sotuvni yakunlash texnikasi",
  },
  yakunla: {
    chapter: "To'g'ri chiziq — Closing",
    enQuery: "ABC always be closing sales",
    uzQuery: "sotuvni yakunlashga olib borish",
  },
  "keyingi qadam": {
    chapter: "Commitment — Next step",
    enQuery: "sales next step commitment technique",
    uzQuery: "sotuvda keyingi qadam belgilash",
  },
  kontek: {
    chapter: "Rapport — ishonchni qurish",
    enQuery: "jordan belfort tonality rapport",
    uzQuery: "mijoz bilan ishonch ornatish",
  },
  tingla: {
    chapter: "Active listening — faol tinglash",
    enQuery: "active listening sales technique",
    uzQuery: "mijozni faol tinglash",
  },
};

export function getSkillResources(skillName: string): RopReport["resources"] & { chapter: string } {
  const lower = skillName.toLowerCase();
  let match: SkillResource | null = null;
  for (const [key, val] of Object.entries(SKILL_RESOURCES)) {
    if (lower.includes(key)) {
      match = val;
      break;
    }
  }
  // Agar mos kelmasa — umumiy sotuv texnikasi
  if (!match) {
    match = {
      chapter: "To'g'ri chiziq usuli — umumiy",
      enQuery: "jordan belfort straight line selling",
      uzQuery: "sotuv texnikasi uzbek",
    };
  }

  const ytEn = `https://www.youtube.com/results?search_query=${encodeURIComponent(match.enQuery)}`;
  const ytUz = `https://www.youtube.com/results?search_query=${encodeURIComponent(match.uzQuery)}`;
  const gEn = `https://www.google.com/search?q=${encodeURIComponent(match.enQuery)}`;
  const gUz = `https://www.google.com/search?q=${encodeURIComponent(match.uzQuery)}`;

  return {
    chapter: match.chapter,
    youtubeEn: ytEn,
    youtubeUz: ytUz,
    searchEn: gEn,
    searchUz: gUz,
  };
}

// ───────────────────────── Gemini advice ─────────────────────────

export async function generateSkillAdvice(skillName: string, avgScore: number): Promise<{
  text: string;
  bookChapter: string;
  bookQuote: string;
}> {
  const knowledge = getKnowledge();

  const fallback = {
    text: `Jamoangiz "${skillName}" ko'nikmasida o'rtacha ${avgScore}/100 ball olyapti. Bu ko'nikmani oshirish uchun Bo'ri yo'li kitobidagi mos bobni o'qib chiqing va har kuni 2-3 qo'ng'iroqda amaliyot qiling.`,
    bookChapter: "Bo'ri yo'li",
    bookQuote: "",
  };

  if (!knowledge) return fallback;

  try {
    const vertexAi = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
    const model = vertexAi.getGenerativeModel({
      model: MODEL,
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: `Sen sotuvchi trenerisan. Jordan Belfort "Bo'ri yo'li" kitobidan yordam berasan.

KITOB KONTEKSTI:
${knowledge.slice(0, 20000)}

Vazifang: Jamoa menejerlarining qaysi ko'nikmasi zaif ekanligi beriladi. Sen o'zbek tilida 3-4 jumlalik aniq, amaliy maslahat ber. Kitobdan mos bob nomini ko'rsat va 1-2 jumlalik iqtibos bilan asoslab ber.`,
          },
        ],
      },
    });

    const userPrompt = `Jamoa bugun "${skillName}" ko'nikmasida o'rtacha ${avgScore}/100 ball olgan. Bu ko'nikmani oshirish uchun aniq, amaliy maslahat ber. Kitobdagi mos bobni va qisqa iqtibosni keltir.

FAQAT valid JSON qaytar:
{
  "text": "3-4 jumlalik o'zbek tilida aniq maslahat — ROP yoki jamoa yetakchisiga moslangan, amaliy harakatlar",
  "bookChapter": "Bo'ri yo'li kitobidagi bob nomi (o'zbek tilida)",
  "bookQuote": "Kitobdan 1-2 jumlalik qisqa iqtibos"
}`;

    const resp = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    });
    const text = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]);
    return {
      text: parsed.text || fallback.text,
      bookChapter: parsed.bookChapter || fallback.bookChapter,
      bookQuote: parsed.bookQuote || "",
    };
  } catch (err: any) {
    console.error("[daily-report] generateSkillAdvice error:", err?.message || err);
    return fallback;
  }
}

// ───────────────────────── Full reports ─────────────────────────

export async function buildRopReport(companyId: string): Promise<RopReport | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const team = await computeTeamStats(companyId, today, tomorrow);
  if (!team || team.totalCalls === 0) return null;

  const weakest = team.weakestSkills[0];
  if (!weakest) return null;

  // Qiynalayotgan menejerlar — shu ko'nikmada 60 dan past bo'lganlar
  const strugglingManagers: string[] = [];
  const files = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      createdAt: { gte: today, lt: tomorrow },
    },
    include: {
      analysis: { select: { criteria: true } },
      manager: { select: { id: true, name: true } },
    },
  });
  const mgrCritSum: Record<string, { sum: number; count: number; name: string }> = {};
  for (const f of files) {
    const crit = (f.analysis?.criteria as any) || {};
    const score = crit?.[weakest.name]?.score;
    if (typeof score !== "number" || !f.manager) continue;
    const cur = mgrCritSum[f.manager.id] || { sum: 0, count: 0, name: f.manager.name };
    cur.sum += score;
    cur.count += 1;
    mgrCritSum[f.manager.id] = cur;
  }
  for (const v of Object.values(mgrCritSum)) {
    const avg = v.count > 0 ? v.sum / v.count : 0;
    if (avg < 60) strugglingManagers.push(v.name);
  }

  const advice = await generateSkillAdvice(weakest.name, weakest.avgScore);
  const resources = getSkillResources(weakest.name);

  return {
    team,
    weakestSkill: { name: weakest.name, avgScore: weakest.avgScore },
    strugglingManagers,
    advice: {
      text: advice.text,
      bookChapter: advice.bookChapter || resources.chapter,
      bookQuote: advice.bookQuote,
    },
    resources,
  };
}

export async function buildAdminReport(companyId: string): Promise<TeamStats | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return computeTeamStats(companyId, today, tomorrow);
}
