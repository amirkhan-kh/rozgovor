/**
 * Conversation Search / AI Q&A (B3-8)
 *
 * Manager tabiiy tilda savol beradi, tizim:
 *  1) Keyword'larni chiqaradi (Flash)
 *  2) Transkripsiyada qidiradi (PostgreSQL ILIKE)
 *  3) Topilgan har qo'ng'iroq uchun aniq kontekst + mijoz iborasi +
 *     menejer javobi + tavsiya yechimni Gemini Pro'dan JSON struktura olib qaytaradi.
 *  4) Dinamik statistika (umumiy soni, unique mijozlar, top iboralar).
 */

import { prisma } from "../utils/prisma";
import { GoogleGenAI } from "@google/genai";
import { safeParseJson } from "../utils/json-repair";

const FLASH_MODEL = "gemini-2.5-flash";
const PRO_MODEL = "gemini-2.5-pro";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

export interface ConversationSearchSource {
  audioFileId: string;
  callDate: string | null;
  managerName: string | null;
  clientPhone: string | null;
  clientName: string | null;
  context: string;
  clientQuote: string | null;
  managerResponse: string | null;
  suggestedSolution: string;
  timestamp: string | null; // "MM:SS" — savolga mos moment
  matchedRef: number; // 1-based
}

export interface ConversationSearchStats {
  totalCalls: number;
  uniqueClients: number;
  uniqueManagers: number;
  topPhrases: Array<{ phrase: string; count: number }>;
}

export interface ConversationSearchResult {
  question: string;
  answer: string;
  sourceCount: number;
  stats: ConversationSearchStats;
  sources: ConversationSearchSource[];
}

/** Savoldan qidiruv keyword'larini chiqarish (o'zbek + rus sinonim). */
async function extractKeywords(question: string): Promise<string[]> {
  try {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: `Quyidagi savoldan qo'ng'iroq transkripsiyasida qidirish uchun 3-5 ta asosiy keyword chiqar.
Faqat mazmunli so'zlar — "qaysi", "nima", "kim" kabi so'roq so'zlarini tashlab yubor.
O'zbek va rus tilidagi sinonimlarni ham qo'sh.

SAVOL: ${question}

JSON: {"keywords": ["so'z1", "so'z2", ...]}`,
      config: {
        temperature: 0,
        maxOutputTokens: 200,
        responseMimeType: "application/json",
      },
    });

    const text = result.text || "";
    const parsed = safeParseJson<{ keywords?: unknown }>(text);
    if (!parsed || !Array.isArray(parsed.keywords)) {
      return question.split(/\s+/).filter((w) => w.length > 3);
    }
    return parsed.keywords
      .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      .slice(0, 5);
  } catch (err) {
    console.error("[ConversationSearch] extractKeywords error:", (err as Error).message?.substring(0, 200));
    return question.split(/\s+/).filter((w) => w.length > 3);
  }
}

/** Keyword bo'yicha transkripsiyalarni qidirish. */
async function findCalls(
  companyId: string,
  keywords: string[],
  gte: Date | undefined,
  lte: Date | undefined,
  limit: number
): Promise<
  Array<{
    id: string;
    callDate: Date | null;
    phoneNumber: string | null;
    transcription: string | null;
    managerName: string | null;
  }>
> {
  if (keywords.length === 0) return [];

  const createdAtFilter: { gte?: Date; lte?: Date } = {};
  if (gte) createdAtFilter.gte = gte;
  if (lte) createdAtFilter.lte = lte;

  const orConditions = keywords.map((kw) => ({
    transcription: { contains: kw, mode: "insensitive" as const },
  }));

  const rows = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      ...(Object.keys(createdAtFilter).length > 0
        ? { createdAt: createdAtFilter }
        : {}),
      transcription: { not: null },
      OR: orConditions,
    },
    orderBy: { callDate: "desc" },
    take: limit,
    select: {
      id: true,
      callDate: true,
      phoneNumber: true,
      transcription: true,
      manager: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    callDate: r.callDate,
    phoneNumber: r.phoneNumber,
    transcription: r.transcription,
    managerName: r.manager?.name || null,
  }));
}

interface PerCallJson {
  ref: number;
  context: string;
  clientQuote?: string | null;
  managerResponse?: string | null;
  suggestedSolution: string;
  clientName?: string | null;
  timestamp?: string | null;
}

interface StructuredJson {
  answer: string;
  topPhrases?: Array<{ phrase: string; count: number }>;
  perCall: PerCallJson[];
}

/**
 * Gemini Pro'ga bir marta chaqiriq: umumiy javob + per-call tahlil + top iboralar.
 */
async function generateStructured(
  question: string,
  calls: Array<{
    id: string;
    transcription: string | null;
    managerName: string | null;
    callDate: Date | null;
  }>
): Promise<StructuredJson> {
  if (calls.length === 0) {
    return {
      answer: "Topilmadi — savol bo'yicha qo'ng'iroqlar bazada yo'q yoki keyword mos kelmadi.",
      topPhrases: [],
      perCall: [],
    };
  }

  const digest = calls
    .slice(0, 10)
    .map((c, i) => {
      const date = c.callDate?.toISOString().slice(0, 10) || "—";
      return `[QONGIROQ ${i + 1}] sana: ${date} — menejer: ${c.managerName || "—"}
TRANSKRIPT:
${(c.transcription || "").slice(0, 3500)}`;
    })
    .join("\n\n===\n\n");

  const prompt = `Sen sotuv analitigisan — Google AI Mode uslubida javob bergan holda ishlaysan.
Menejer savol berdi va quyida ${Math.min(calls.length, 10)} ta real qo'ng'iroq transkripti bor.

SAVOL: ${question}

QO'NG'IROQLAR:
${digest}

VAZIFA — faqat JSON qaytar (boshqa hech narsa emas). Struktura:

{
  "answer": "Markdown formatda batafsil javob. Quyida tasvirlangan QOIDALARga qat'iy amal qil.",
  "topPhrases": [
    {"phrase": "eng ko'p uchragan ibora", "count": 3}
  ],
  "perCall": [
    {
      "ref": 1,
      "clientName": "transkriptda ismi aytilgan bo'lsa (yoki null)",
      "context": "BU qo'ng'iroqda aniq NIMA bo'ldi. 2-3 jumla, aniq, raqamlar bilan.",
      "clientQuote": "mijoz iborasi so'zma-so'z (1-2 gap)",
      "managerResponse": "menejer javobi so'zma-so'z (1-2 gap)",
      "suggestedSolution": "MENEJER NIMA QILISH KERAK EDI. Amaliy 1-2 jumla. Texnika nomi: Price Reframing, GPS Texnikasi, Ha-ha ketma-ketligi va h.k.",
      "timestamp": "MM:SS — savolga aynan mos keluvchi moment (mijoz iborasi tushgan vaqt). Transkriptdagi [MM:SS] markerdan olinadi."
    }
  ]
}

"ANSWER" MAYDONI UCHUN MARKDOWN QOIDALARI (Google AI Mode uslubida):

1. Birinchi paragraf — QISQA umumiy rezyume (2-3 jumla), aniq raqamlar bilan.
2. So'ngra **bold heading** ko'rinishida bo'limlar:
   - "**Asosiy sabablar:**" yoki "**Topilgan holatlar:**" kabi
3. Har bo'limda bullet list ishlatish:
   - "- **Mavzu:** tushuntirish [1]" formatida
   - Har bulletda kamida bitta qo'ng'iroq ref ([1], [2] kabi) bo'lsin
4. Misollar uchun \`inline code\` yoki **bold** ishlat.
5. Oxirgi paragraf — xulosa yoki tavsiya (ixtiyoriy, 1-2 jumla).
6. Agar mijoz/menejer aniq iboralarni aytgan bo'lsa — "> Menejer: «..." ko'rinishida quote.
7. Ref [N] — N bu qo'ng'iroq raqami (1-${Math.min(calls.length, 10)}).

MUHIM QOIDALAR:
- Mavhum iboralar TAQIQLANGAN ("umuman", "odatda", "ko'pincha" ishlatma).
- Faqat transkriptda ko'rinadigan ma'lumotlardan foydalan.
- clientQuote va managerResponse so'zma-so'z (o'zgartirma, o'ylab chiqarma).
- context — SAVOLGA aynan nima bog'liq ekanini aniq aytib ber. Salomlashish/ringing'ni TASHLAB YUBOR.
- Agar qo'ng'iroqda savolga aloqa YO'Q bo'lsa — perCall ga QO'SHMA (bo'sh kartalar kerak emas).
- Agar savol ma'nosi tushunarsiz yoki juda umumiy bo'lsa (masalan "salom") — perCall bo'sh qoldir va answer'da "Savolga aniq javob berish uchun ko'proq kontekst kerak" deb yoz.
- suggestedSolution — HECH QACHON "—" yoki bo'sh qoldirma; har doim amaliy 1-2 jumla.
- **timestamp MAJBURIY** — transkriptdagi [MM:SS] markerdan eng yaqinini tanla (mijoz savolga oid iborani aytgan moment). Agar marker bo'lmasa "00:00" qo'y.
- O'zbek tilida javob (markdown'da).
- Faqat JSON qaytar, prefiks yoki tushuntirish qo'shma.

MISOL "answer" FORMATI:
"So'nggi haftada **4 ta qo'ng'iroqda** narx e'tirozi aniqlandi. Eng ko'p takrorlangan sabab — \`yillik to'lov\` va kurs davomiyligi bilan bog'liq.

**Asosiy sabablar:**
- **Yillik to'lov qimmat:** 3 mijoz oylik to'lov variantini so'radi, menejerlar \`0.9 mln\` chegirma taklif qildi [1] [3]
- **Boshqa kurslar bilan taqqoslash:** mijoz Alif Academy narxini eslatdi, menejer USP berishga urinmadi [2]

**Tavsiya:** Narx e'tirozi kelganda avval \`value reframe\` qilish — kursning qaytarilish muddati (ROI) ni misol bilan ko'rsatish."`;

  try {
    const ai = getAI();
    const result = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: prompt,
      // 10 ta call × 3500 belgi → kontekst katta. 4K output limiti truncate qilardi
      // (JSON parse fail). 16K kengaytirildi — to'liq tahlil sig'adi.
      config: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    });
    const text = result.text || "{}";
    // safeParseJson o'zi: fence strip + repair-truncated + greedy { ... } extract
    const parsed = safeParseJson<StructuredJson>(text);
    if (!parsed) {
      console.error(
        "[ConversationSearch] JSON parse fail. len=" + text.length + " head=" + text.slice(0, 400)
      );
      return {
        answer: "Javob generatsiyada JSON noto'g'ri formatda. Qayta urinib ko'ring.",
        topPhrases: [],
        perCall: [],
      };
    }
    return {
      answer: parsed.answer || "Javob topilmadi.",
      topPhrases: Array.isArray(parsed.topPhrases)
        ? parsed.topPhrases.slice(0, 5)
        : [],
      perCall: Array.isArray(parsed.perCall) ? parsed.perCall : [],
    };
  } catch (err) {
    console.error("[ConversationSearch] AI error:", (err as Error).message?.substring(0, 300));
    return {
      answer: "Javob generatsiyada xatolik yuz berdi.",
      topPhrases: [],
      perCall: [],
    };
  }
}

export async function searchConversations(
  companyId: string,
  question: string,
  opts: {
    dateFrom?: Date;
    dateTo?: Date;
    daysWindow?: number;
    limit?: number;
  } = {}
): Promise<ConversationSearchResult> {
  const limit = opts.limit ?? 20;
  let gte = opts.dateFrom;
  let lte = opts.dateTo;
  // Fallback: dateFrom/dateTo bo'lmasa daysWindow (kunlar oxirgi davr)
  if (!gte && !lte && opts.daysWindow && opts.daysWindow > 0) {
    gte = new Date();
    gte.setDate(gte.getDate() - opts.daysWindow);
  }

  const keywords = await extractKeywords(question);
  const calls = await findCalls(companyId, keywords, gte, lte, limit);

  const structured = await generateStructured(question, calls);

  // perCall ni call indexiga qayta bog'lash
  const callList = calls.slice(0, 10);
  const perCallByRef = new Map<number, PerCallJson>();
  for (const p of structured.perCall || []) {
    if (typeof p.ref === "number") perCallByRef.set(p.ref, p);
  }

  // Faqat Gemini tahlil qilgan qo'ng'iroqlar (perCall ichida bor) qaytarilsin.
  // Shunda "salom" kabi bo'sh savollarda bo'sh kartalar ko'rinmaydi.
  const sources: ConversationSearchSource[] = callList
    .map((c, i) => {
      const ref = i + 1;
      const pc = perCallByRef.get(ref);
      if (!pc) return null;
      return {
        audioFileId: c.id,
        callDate: c.callDate?.toISOString() || null,
        managerName: c.managerName,
        clientPhone: c.phoneNumber,
        clientName: pc.clientName || null,
        context: pc.context || "",
        clientQuote: pc.clientQuote || null,
        managerResponse: pc.managerResponse || null,
        suggestedSolution: pc.suggestedSolution || "",
        timestamp: pc.timestamp || null,
        matchedRef: ref,
      };
    })
    .filter((s): s is ConversationSearchSource => s !== null);

  // Statistikalar
  const uniqueClients = new Set(
    sources.map((s) => s.clientPhone).filter((p) => p)
  ).size;
  const uniqueManagers = new Set(
    sources.map((s) => s.managerName).filter((m) => m)
  ).size;

  return {
    question,
    answer: structured.answer,
    sourceCount: calls.length,
    stats: {
      totalCalls: calls.length,
      uniqueClients,
      uniqueManagers,
      topPhrases: structured.topPhrases || [],
    },
    sources,
  };
}

function findSnippet(transcript: string, keywords: string[]): string {
  const lower = transcript.toLowerCase();
  for (const kw of keywords) {
    const idx = lower.indexOf(kw.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(transcript.length, idx + 120);
      return (
        (start > 0 ? "..." : "") +
        transcript.slice(start, end) +
        (end < transcript.length ? "..." : "")
      );
    }
  }
  return transcript.slice(0, 200);
}
