/**
 * Exam grader + coach — suhbat tugagach Gemini Pro bilan baholash.
 *
 * Har bir mezonni baholaydi, xatolar/g'alaba nuqtalarini ajratadi, va KITOBDAN havola bilan
 * coaching beradi (Bo'ri yo'li).
 */
import { VertexAI } from "@google-cloud/vertexai";
import { prisma } from "../../utils/prisma";
import { getCriteriaPrompt } from "../call-analyzer";
import { knowledgeBase } from "./conversation";
import type { ExamMessage } from "./conversation";

const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-central1";
const MODEL = "gemini-2.5-flash";

export interface GradingResult {
  overallScore: number;
  criteria: Record<string, { score: number; comment: string }>;
  errors: Array<{ type: string; description: string; bookRef?: string }>;
  winPoints: Array<{ description: string; bookRef?: string }>;
  coaching: Array<{
    mistake: string;
    advice: string;
    bookChapter: string;
    bookQuote: string;
  }>;
  summary: string;
}

function formatTranscript(messages: ExamMessage[]): string {
  return messages
    .map((m) => (m.role === "salesperson" ? `SOTUVCHI: ${m.text}` : `MIJOZ: ${m.text}`))
    .join("\n");
}

/**
 * Brace-balanced JSON extraction — birinchi to'liq {…} blokni qaytaradi,
 * string ichidagi qavslarni hisobga olmaydi.
 *
 * Agar javob TRUNCATED bo'lsa (maxOutputTokens oshib ketsa), ochiq stackni
 * yopib, eng so'nggi xavfsiz nuqtadan kesib qabul qilinadigan JSON tuzadi.
 */
function extractJsonBlock(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  const stack: Array<"{" | "["> = [];
  let inStr = false;
  let esc = false;
  // "Xavfsiz joy" — oxirgi `}` yoki `]` yoki `,` pozitsiyasi (tashqi scope'da)
  // Agar truncation yuz bersa, mana shu joygacha kesamiz
  let safeEnd = -1;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; if (!inStr) safeEnd = i; continue; }
    if (inStr) continue;
    if (ch === "{") stack.push("{");
    else if (ch === "[") stack.push("[");
    else if (ch === "}") {
      stack.pop();
      if (stack.length === 0) return text.slice(start, i + 1);
      safeEnd = i;
    }
    else if (ch === "]") { stack.pop(); safeEnd = i; }
    else if (ch === ",") safeEnd = i - 1; // vergul oldingi qiymat yopilganini bildiradi
  }

  // TRUNCATION recovery — full JSON topilmadi, lekin ochiq struktura bor.
  if (stack.length === 0) return null;
  console.warn(
    `[grader] Truncated JSON detected (open stack=${stack.length}, len=${text.length}) — recovering`,
  );
  let recovered = safeEnd > start
    ? text.slice(start, safeEnd + 1)
    : text.slice(start);

  // safeEnd oldidan boshlab qolgan stackni qayta hisoblaymiz
  const recStack: Array<"{" | "["> = [];
  let inStr2 = false;
  let esc2 = false;
  for (let i = 0; i < recovered.length; i++) {
    const ch = recovered[i];
    if (esc2) { esc2 = false; continue; }
    if (ch === "\\") { esc2 = true; continue; }
    if (ch === '"') { inStr2 = !inStr2; continue; }
    if (inStr2) continue;
    if (ch === "{") recStack.push("{");
    else if (ch === "[") recStack.push("[");
    else if (ch === "}") recStack.pop();
    else if (ch === "]") recStack.pop();
  }
  // Agar oxiri yarim kalitni (`"name":`) qoldirgan bo'lsa, oxirgi vergulgacha kesamiz
  recovered = recovered.replace(/,\s*"[^"]*"\s*:\s*[^,{}[\]]*$/s, "");
  recovered = recovered.replace(/,\s*$/, "");
  // Stackni yopamiz
  while (recStack.length > 0) {
    const open = recStack.pop();
    recovered += open === "{" ? "}" : "]";
  }
  return recovered;
}

/**
 * Gemini ba'zan noto'g'ri JSON chiqaradi (trailing vergullar, ochiq stringlar).
 * Parse qila olmasa ba'zi umumiy xatolarni tuzatib qayta urinadi.
 */
function safeJsonParse(raw: string): any {
  try {
    return JSON.parse(raw);
  } catch (_) {
    // 1. Trailing vergullarni olib tashlash: ,] yoki ,} → ] yoki }
    let fixed = raw.replace(/,\s*([\]}])/g, "$1");
    // 2. Ochiq string oxiri uchun: agar JSON qavsi ochiq qolsa, ba'zan oxirgi string "..." bilan tugamaydi.
    //    Bu holatda oxirgi ochiq stringni yopishga harakat qilamiz.
    try {
      return JSON.parse(fixed);
    } catch (_e2) {
      // 3. String ichidagi escape qilinmagan " belgilarini tuzatish — heuristik:
      //    Faqat string qiymat ichida (": "xxx"xxx" holati) ikkinchi " ni \" ga o'zgartirmiz.
      //    Bu risk tug'dirmasligi uchun faqat regex orqali eng ko'p uchraydigan holatni quvib olamiz.
      fixed = fixed.replace(
        /: "([^"\\]*(?:\\.[^"\\]*)*)"([^",}\]\n]+?)"/g,
        (_m, a, b) => `: "${a} ${b.replace(/"/g, '\\"')}"`,
      );
      return JSON.parse(fixed);
    }
  }
}

export async function gradeExam(params: {
  companyId: string;
  messages: ExamMessage[];
  scenarioName: string;
  scenarioDescription: string;
  difficulty: string;
}): Promise<GradingResult> {
  const { text: criteriaText, criteriaNames } = await getCriteriaPrompt(params.companyId, "sotuv");
  const transcript = formatTranscript(params.messages);

  // Kompaniyaning rasmiy kurs ma'lumoti — fact-check uchun
  const company = await prisma.company.findUnique({
    where: { id: params.companyId },
    select: { courseInfo: true, name: true },
  });
  const courseInfo = (company?.courseInfo || "").trim();
  const companyName = company?.name || "";

  const criteriaSchema =
    criteriaNames.length > 0
      ? `{\n${criteriaNames
          .map((n) => `    "${n}": {"score": 0-100, "comment": "..."}`)
          .join(",\n")}\n  }`
      : `{
    "Salomlashish": {"score": 0-100, "comment": "..."},
    "Ehtiyojni aniqlash": {"score": 0-100, "comment": "..."},
    "Taqdimot": {"score": 0-100, "comment": "..."},
    "E'tiroz bilan ishlash": {"score": 0-100, "comment": "..."},
    "Bosim o'tkazish": {"score": 0-100, "comment": "..."},
    "Kayfiyati": {"score": 0-100, "comment": "..."},
    "Aktiv tinglash": {"score": 0-100, "comment": "..."}
  }`;

  const courseContextBlock = courseInfo
    ? `
============== ${companyName.toUpperCase()} KURS MA'LUMOTLARI (AUTHORITATIVE) ==============
Quyida kompaniyaning RASMIY kurs ma'lumotlari keltirilgan.
Sotuvchi mijozga bergan ma'lumotlarni shu manba bilan solishtir.

${courseInfo}
============== KURS MA'LUMOTLARI TUGADI ==============

FACT-CHECK QOIDASI (barcha mezonlarga ta'sir qiladi):
- Agar sotuvchi KURS NARXINI noto'g'ri aytsa → jiddiy minus, "Taqdimot" yoki mos mezon 30% yoki kamroq
- Agar sotuvchi KURS DAVOMIYLIGINI noto'g'ri aytsa → minus
- Agar sotuvchi MODULLAR/BONUSLAR/TARIFLAR (Nazoratli/Nazoratsiz kabi)ni noto'g'ri yoki chalkash aytsa → minus
- Agar sotuvchi BO'LIB TO'LASH yoki CHEGIRMA haqida ma'lumot bermasa (va savol berilsa ham) → kichik minus
- Aksincha, sotuvchi rasmiy ma'lumotlarni aniq, ishonchli, to'liq aytsa → plus, mos mezonlarga 85+ ball
- Sotuvchi rasmiy hujjatga zid ma'lumot aytsa — "errors" ga type: "Noto'g'ri ma'lumot" deb kiritilsin
`
    : "";

  const systemPrompt = `Sen professional sotuvchi trener va imtihon baholovchisan.

BILIM ASOSI — Jordan Belfort "Bo'ri yo'li" (Straight Line Selling). Quyida kitobning to'liq matni:
${knowledgeBase}
${courseContextBlock}
VAZIFA: Quyidagi IMTIHON SUHBATINI tahlil qilib, sotuvchini mezonlar bo'yicha baholab ber va kitobdan aniq havolalar bilan coaching yoz.

STSENARIY: ${params.scenarioName} (${params.difficulty})
${params.scenarioDescription}

MEZONLAR:
${criteriaText || "(kompaniya mezonlari yo'q — umumiy sotuv mezonlarini ishlat)"}

MUHIM — STT (nutq-dan-matnga) CHEKLOVLARI:
Quyidagi transkripsiya avtomatik STT bilan yozilgan va XATOLARNI O'Z ICHIGA OLADI:
- "bizning" → "bizani" ga aylanishi mumkin
- "VisionSchool" → "vishin skul" / "beshin skul" ga aylanishi mumkin
- "IELTS" → "ays" / "als" / "ayilts" ga aylanishi mumkin
- "Writing, Speaking, Reading, Listening" → "rating/spiking/riding/lisnin" ga aylanishi mumkin
- Ismlar buzib yozilishi mumkin
Bu xatolarni SOTUVCHIGA aybga solma — kontekstdan tushunib, mazmunga qarab baho qo'y.
Faqat sotuvchi HAQIQATAN xato gapirsa minus qo'y. "bizani" deb yozilishi STT xatolik, lekin "bizani Vishin skul" → "bizning VisionSchool" sifatida qabul qil.

BAHOLASH RUBRIKASI (aniq — har bir mezon uchun shu shkalani qo'lla):
- 0-20: umuman ishlamagan yoki o'ta yomon (2 jumla ham gapirmagan, mezon bajarilmagan)
- 20-40: yomon — urinishi bor lekin texnika yo'q, samara kam
- 40-60: o'rtacha — ba'zi elementlarni bajardi lekin tizim yo'q
- 60-80: yaxshi — texnikani ishlatgan, lekin sayoz yoki ba'zi yutqaziqlar bor
- 80-100: ajoyib — kitobdagi texnikani aniq va samarali qo'llagan

HAR BIR MEZON uchun "comment" da DALIL ko'rsat:
- Sotuvchining AYNAN qaysi jumlasi (iqtibos bilan) shu ballni asoslaydi
- Format: "Sotuvchi aytdi: '...aynan jumlasi...' — bu [nimasi yaxshi/yomon]"

ERRORS — sotuvchining HAMMA muhim xatolarini yoz (nafaqat 3 tasini):
- type: qisqa kategoriya (masalan "Salomlashish", "Ehtiyojni aniqlamaslik", "Narx berish", "Kontekstga bog'lamaslik", "Noto'g'ri ma'lumot")
- description: xato aniqlangani, qanday bo'lishi kerak edi (1-2 jumla)
- bookRef: Bo'ri yo'li kitobidagi mos bob/texnika

WIN POINTS — sotuvchi nimani yaxshi qildi (ham muhim, motivatsion):
- description: yaxshi bajarilgan narsa (misol bilan)
- bookRef: kitobdan mos havola

COACHING — har bir ASOSIY xato uchun batafsil tuzatish:
- mistake: xato (iqtibos bilan, sotuvchi aytgan so'zlar)
- advice: to'g'ri javob qanday bo'lishi kerak edi (aniq jumla, "masalan shunday deysiz: '...'" formatida)
- bookChapter: kitob bobi (Uchta O'nlik / Looping / To'g'ri chiziq / 3-soniya qoidasi / va h.k.)
- bookQuote: kitobdan 1-2 jumla qisqa iqtibos

SUMMARY: 2-3 jumla — umumiy holat + eng muhim 1 ta tavsiya

FAQAT VALID JSON qaytar, boshqa matn yo'q. String ichidagi " ni \\" qilib escape qil:
{
  "overallScore": 0-100,
  "criteria": ${criteriaSchema},
  "errors": [
    {"type": "...", "description": "...", "bookRef": "..."}
  ],
  "winPoints": [
    {"description": "...", "bookRef": "..."}
  ],
  "coaching": [
    {
      "mistake": "Sotuvchi aytdi: '...'",
      "advice": "To'g'risi: '...'",
      "bookChapter": "...",
      "bookQuote": "..."
    }
  ],
  "summary": "2-3 jumla umumiy xulosa + asosiy tavsiya"
}`;

  const userMessage = `SUHBAT TRANSKRIPSIYASI:

${transcript}

Yuqoridagi suhbatni yuqoridagi mezonlar bo'yicha baholab JSON qaytar.`;

  const vertexAi = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
  const model = vertexAi.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 32768,
      responseMimeType: "application/json",
    },
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
  });

  // Retry for rate limits
  let text = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
      });
      text = response.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
      break;
    } catch (e: any) {
      if ((e?.status === 429 || String(e?.message).includes("RESOURCE_EXHAUSTED")) && attempt < 2) {
        console.log(`[grader] Rate limited, retry in ${(attempt + 1) * 10}s...`);
        await new Promise((r) => setTimeout(r, (attempt + 1) * 10000));
        continue;
      }
      throw e;
    }
  }

  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) {
    console.error("[grader] JSON topilmadi, raw (first 500):", text.slice(0, 500));
    throw new Error("Baholash natijasini olishda xatolik — JSON topilmadi");
  }

  let parsed: GradingResult;
  try {
    parsed = safeJsonParse(jsonBlock) as GradingResult;
  } catch (parseErr: any) {
    console.error(
      "[grader] JSON parse error:",
      parseErr?.message,
      "near:",
      jsonBlock.slice(Math.max(0, 7100), 7300),
    );
    // Retry — Gemini bir marta boshqa javob berishi mumkin
    try {
      const retryResp = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              {
                text:
                  userMessage +
                  "\n\nMUHIM: javobing ehtimol noto'g'ri JSON bo'ldi. QATIY VALID JSON qaytar. String ichida \" ni \\\" qilib escape qil. Trailing vergullarni ishlatma.",
              },
            ],
          },
        ],
      });
      const retryText = retryResp.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const retryBlock = extractJsonBlock(retryText);
      if (!retryBlock) throw new Error("Retry ham JSON qaytarmadi");
      parsed = safeJsonParse(retryBlock) as GradingResult;
    } catch (retryErr: any) {
      console.error("[grader] Retry parse error:", retryErr?.message);
      throw new Error("Baholash natijasini o'qib bo'lmadi — AI noto'g'ri javob berdi");
    }
  }

  // Sanity
  if (typeof parsed.overallScore !== "number") parsed.overallScore = 0;
  parsed.overallScore = Math.max(0, Math.min(100, parsed.overallScore));
  parsed.criteria = parsed.criteria || {};
  parsed.errors = parsed.errors || [];
  parsed.winPoints = parsed.winPoints || [];
  parsed.coaching = parsed.coaching || [];
  parsed.summary = parsed.summary || "";

  return parsed;
}

/**
 * Sotuvchi statistikasini baholash natijalaridan yangilaydi.
 */
export async function updateSalespersonStats(params: {
  salespersonId: string;
  companyId: string;
  score: number;
  criteria: GradingResult["criteria"];
  scenarioCode: string;
}): Promise<void> {
  const existing = await prisma.salespersonStats.findUnique({
    where: { salespersonId: params.salespersonId },
  });

  const nowIso = new Date();
  const weekKey = getIsoWeekKey(nowIso);

  // Zaif / kuchli mezonlar
  const sorted = Object.entries(params.criteria)
    .map(([name, v]) => ({ name, score: v.score }))
    .sort((a, b) => a.score - b.score);
  const weakCriteria = sorted.slice(0, 3);
  const strongCriteria = sorted.slice(-3).reverse();

  if (!existing) {
    await prisma.salespersonStats.create({
      data: {
        salespersonId: params.salespersonId,
        companyId: params.companyId,
        totalExams: 1,
        completedExams: 1,
        averageScore: params.score,
        bestScore: params.score,
        streak: 1,
        lastExamAt: nowIso,
        weakCriteria: weakCriteria as any,
        strongCriteria: strongCriteria as any,
        weeklyScores: [{ week: weekKey, avg: params.score, count: 1 }] as any,
        scenarioStats: { [params.scenarioCode]: { count: 1, avg: params.score } } as any,
      },
    });
    return;
  }

  // Running average
  const newCount = existing.completedExams + 1;
  const newAvg = (existing.averageScore * existing.completedExams + params.score) / newCount;
  const newBest = Math.max(existing.bestScore, params.score);

  // Streak (kecha yoki bugun imtihon topshirgan bo'lsa +1)
  const daysSince = existing.lastExamAt
    ? Math.floor((nowIso.getTime() - existing.lastExamAt.getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const newStreak = daysSince <= 1 ? existing.streak + 1 : 1;

  // Weekly
  const weekly: Array<{ week: string; avg: number; count: number }> =
    (existing.weeklyScores as any) || [];
  const weekIdx = weekly.findIndex((w) => w.week === weekKey);
  if (weekIdx >= 0) {
    const w = weekly[weekIdx];
    const c = w.count + 1;
    weekly[weekIdx] = { week: weekKey, avg: (w.avg * w.count + params.score) / c, count: c };
  } else {
    weekly.push({ week: weekKey, avg: params.score, count: 1 });
  }
  // Faqat oxirgi 12 hafta
  const recentWeekly = weekly.slice(-12);

  // Scenario stats
  const scStats: Record<string, { count: number; avg: number }> =
    (existing.scenarioStats as any) || {};
  const cur = scStats[params.scenarioCode];
  if (cur) {
    const c = cur.count + 1;
    scStats[params.scenarioCode] = { count: c, avg: (cur.avg * cur.count + params.score) / c };
  } else {
    scStats[params.scenarioCode] = { count: 1, avg: params.score };
  }

  await prisma.salespersonStats.update({
    where: { salespersonId: params.salespersonId },
    data: {
      totalExams: existing.totalExams + 1,
      completedExams: newCount,
      averageScore: newAvg,
      bestScore: newBest,
      streak: newStreak,
      lastExamAt: nowIso,
      weakCriteria: weakCriteria as any,
      strongCriteria: strongCriteria as any,
      weeklyScores: recentWeekly as any,
      scenarioStats: scStats as any,
    },
  });
}

function getIsoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
