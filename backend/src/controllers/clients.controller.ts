import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

interface TopItem {
  value: string;
  count: number;
}

// ── Canonical label grouping — sinonimlarni bitta guruhga jamlash ──────
// AI qaytargan qo'rquv/qiziqish/viloyat nomlarini normallashtirib, bir xil
// ma'no (harf kattaligidagi farq, so'z shakli, sinonim) bo'lgan qiymatlarni
// bir guruhga to'playdi.
const normalizeAscii = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[ʻʼ'`"]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// Sinonim qoidalari — har biri {test: RegExp yoki keyword[], canonical: string}
// Birinchi mos keladigan qoida qo'llaniladi.
// Maxsus sentinel — bu canonical'ga to'g'ri kelgan qiymatlar
// hisob-kitobdan butunlay chiqarib tashlanadi (Uzbekistan, country va h.k.).
export const SKIP_CANONICAL = "__SKIP__";

// O'zbekiston'ning 14 ta hududi (12 viloyat + Toshkent shahri + Qoraqalpog'iston).
// canonicalRegion() faqat shu ro'yxatdagilarni qaytaradi; aks holda SKIP.
const ALLOWED_REGIONS = new Set([
  "Toshkent",
  "Samarqand",
  "Farg'ona",
  "Andijon",
  "Buxoro",
  "Xorazm",
  "Surxondaryo",
  "Namangan",
  "Qashqadaryo",
  "Jizzax",
  "Navoiy",
  "Sirdaryo",
  "Qoraqalpog'iston",
]);

const LABEL_RULES: Array<{
  patterns: (string | RegExp)[];
  canonical: string;
}> = [
  // ── Davlat (viloyat emas) — chiqarib tashlanadi ─────────
  { patterns: [/uzbekistan|o?zbekiston/], canonical: SKIP_CANONICAL },
  // ── Regions (boundary'siz, har joyda uchrasa ham mos kelsin) ──
  { patterns: [/toshkent|tashkent/], canonical: "Toshkent" },
  { patterns: [/samarqand/], canonical: "Samarqand" },
  { patterns: [/farg?ona|fergana/], canonical: "Farg'ona" },
  { patterns: [/andijon/], canonical: "Andijon" },
  { patterns: [/buxoro|gijduvon/], canonical: "Buxoro" },
  { patterns: [/xorazm|urganch|qoshkopir/], canonical: "Xorazm" },
  { patterns: [/surxondaryo|termiz/], canonical: "Surxondaryo" },
  { patterns: [/namangan/], canonical: "Namangan" },
  { patterns: [/qashqadaryo|qarshi/], canonical: "Qashqadaryo" },
  { patterns: [/jizzax/], canonical: "Jizzax" },
  { patterns: [/navoiy/], canonical: "Navoiy" },
  { patterns: [/sirdaryo/], canonical: "Sirdaryo" },
  { patterns: [/qoraqalpog?iston|nukus/], canonical: "Qoraqalpog'iston" },
  // ── Fears ─────────────────────────────────────────────
  {
    patterns: [/vaqt/, /wasting.time/, /behuda/, /bekor/],
    canonical: "Vaqt yo'qligi",
  },
  {
    patterns: [/narx/, /qimmat/, /yuqori.narx/, /high.price/],
    canonical: "Narx qimmat",
  },
  {
    patterns: [/pul yo?qot/, /investitsiya/, /mablag yo?qot/, /foydasiz kurs/],
    canonical: "Pul yo'qotish",
  },
  {
    patterns: [/natija/, /samarasiz/, /samara yo/, /effekt berm/, /foyda yo/, /konversiya/],
    canonical: "Natija kafolati yo'q",
  },
  // ── Rus tili — kompaniya AYNAN rus tili kursi sotadi, shuning uchun shunchaki
  //    "Rus tili" qiziqish/qo'rquv sifatida TRIVIAL shovqin (deyarli har mijozda
  //    bor) → ikkala chartdan ham CHIQARILADI (SKIP). Faqat DIFFERENTIATING
  //    variantlar qoladi: "Rus tili (ish uchun)" + "Rus tili kurslari".
  //    Tartim MUHIM: avval maxsus variantlar, keyin umumiy "rus til" → SKIP.
  { patterns: [/rus.*ish uchun/, /ish uchun.*rus/], canonical: "Rus tili (ish uchun)" },
  { patterns: [/rus til.*kurs/, /kurs.*rus til/], canonical: "Rus tili kurslari" },
  { patterns: [/rus til/], canonical: SKIP_CANONICAL },
  {
    patterns: [/spam/, /bezovta/],
    canonical: "Spam qo'ng'iroqlar",
  },
  {
    patterns: [/firibgar/, /aldan/, /aldash/],
    canonical: "Firibgarlik",
  },
  {
    patterns: [/ishonch/, /shubha/],
    canonical: "Ishonchsizlik",
  },
  {
    patterns: [/tizimsiz/],
    canonical: "Tizimsizlik",
  },
  {
    patterns: [/yashirin/, /noaniq to?lov/],
    canonical: "Yashirin to'lovlar",
  },
  {
    patterns: [/yosh/],
    canonical: "Yosh cheklovi",
  },
  {
    patterns: [/operator.+(sifat|tajriba)|operator yomon/],
    canonical: "Operatorlar sifatsizligi",
  },
  {
    patterns: [/shaxsiy ma?lumot/, /maxfiylik/, /data/],
    canonical: "Shaxsiy ma'lumot maxfiyligi",
  },
  {
    patterns: [/texnik/],
    canonical: "Texnik muammolar",
  },
  {
    patterns: [/moliya/, /budjet/, /byudjet/],
    canonical: "Moliyaviy cheklov",
  },
  // ── Interests ─────────────────────────────────────────
  {
    patterns: [/sotuvni (rivoj|osh|kuchay|tizimlashtir|takomil)/, /sotuv tizim/, /sotuv bo?lim/, /sotuv rivojlan/],
    canonical: "Sotuvni rivojlantirish",
  },
  {
    patterns: [/sotuv menejer/, /sotuvchi/, /sales manager/, /^sotuv$/, /sotuvlar/, /sotuv kurs/],
    canonical: "Sotuv",
  },
  {
    patterns: [/\bcrm\b/, /\berp\b/, /biznes.(tizim|sistemalashtir)/],
    canonical: "CRM / ERP",
  },
  {
    patterns: [/\bielts\b/, /ingliz til/, /english/],
    canonical: "IELTS / Ingliz tili",
  },
  {
    patterns: [/onlayn.(ta?lim|savdo|sotish|learning)/, /online.(learning|ta?lim|course)/, /onlayn sotish/],
    canonical: "Onlayn ta'lim/savdo",
  },
  {
    patterns: [/\blead\b/, /lid/, /mijozlar oqim/, /mijozlar bazasi/],
    canonical: "Lead generatsiya",
  },
  {
    patterns: [/call.?center/, /call centr/],
    canonical: "Call-center",
  },
  {
    patterns: [/xodim.(yoll|nazorat|boshqar|tanlash)/, /kadr/],
    canonical: "Xodim boshqaruvi",
  },
  {
    patterns: [/konsultatsiya/, /konsalting/],
    canonical: "Konsultatsiya",
  },
  {
    patterns: [/reklama/, /marketing/, /smm/],
    canonical: "Marketing",
  },
  {
    patterns: [/turizm/],
    canonical: "Turizm",
  },
];

// Matn uchun canonical label tanlaydi; mos kelsa — mapping'dan, aks holda
// — asl matnning title case'li varianti (bir xil kichik/katta harfda
// yozilganlarni bitta guruhga birlashtirish uchun).
const canonicalize = (raw: string): string => {
  if (!raw) return raw;
  const norm = normalizeAscii(raw);
  if (!norm) return raw.trim();
  for (const rule of LABEL_RULES) {
    for (const p of rule.patterns) {
      const re = typeof p === "string" ? new RegExp(`\\b${p}\\b`, "i") : p;
      if (re.test(norm)) return rule.canonical;
    }
  }
  // Fallback — asl qiymatni lowercase (grouping key) qilib ishlatamiz
  // lekin display uchun title-case versiyasini saqlaymiz.
  return norm;
};

// ROZGOVOR (rus tili kurslari) uchun mos kelmaydigan, ProSales B2B shablonidan
// qolgan / AI gallyutsinatsiya qilgan "qiziqish" kategoriyalari — chartda
// ko'rsatilmasin (SKIP). Mijozlar ind. til o'rganuvchilar; CRM/Lead/IELTS/Sotuv
// kabilar ularning qiziqishi emas.
const IRRELEVANT_INTEREST_CANONICALS = new Set([
  "Sotuvni rivojlantirish",
  "Sotuv",
  "CRM / ERP",
  "IELTS / Ingliz tili",
  "Onlayn ta'lim/savdo",
  "Lead generatsiya",
  "Call-center",
  "Xodim boshqaruvi",
  "Konsultatsiya",
  "Marketing",
]);
// Mijozning KASBI/SOHASI yoki to'lov-xulqi — bular "nega rus tili o'rganmoqchi"
// emas, AI ortiqcha ekstraktsiya qilgan shovqin. normalizeAscii formatida
// (lowercase, apostrofsiz) tekshiriladi. Rus tili motivlari (ish, sayohat,
// muloqot, farzand, karyera, Rossiyada ishlash, yuridik rus tili...) SAQLANADI.
const SKIP_INTEREST_PATTERNS: RegExp[] = [
  /tibbiyot|meditsina|farmatsevt/, // tibbiyot/farmatsevtika
  /pedagog|oqituvchi|dars berish|rus maktabida/, // pedagogika/o'qituvchilik
  /\bbank\b|bankomat/, // bank ishi/sohasi
  /iqtisod/, // iqtisodiyot
  /\byurist/, // yuristlik ("yuridik rus tili" — saqlanadi)
  /\bhr\b/, // HR menejerlik
  /arxitektura/,
  /aviatsiya/,
  /tikuvchilik/,
  /texnologiya/,
  /ozbek filologiya/, // o'zbek filologiyasi (rus emas)
  /bolib tolash/, // bo'lib to'lash — to'lov sharti, qiziqish emas
  /oila bilan maslahat/, // qaror xulqi, qiziqish emas
];
const canonicalizeInterest = (raw: string): string => {
  const norm = normalizeAscii(raw);
  if (SKIP_INTEREST_PATTERNS.some((re) => re.test(norm))) return SKIP_CANONICAL;
  const c = canonicalize(raw);
  if (IRRELEVANT_INTEREST_CANONICALS.has(c)) return SKIP_CANONICAL;
  return c;
};

// Region uchun strict canonicalize — faqat ALLOWED_REGIONS ro'yxatidagilar
// qaytariladi. Aks holda SKIP (chunki AI noto'g'ri ekstraktsiya qilishi mumkin:
// "viloyatga ketmoqchi", "toshkentdan tashqarida", "unknown" — bularning hech
// biri haqiqiy viloyat emas).
const canonicalizeRegion = (raw: string): string => {
  if (!raw) return SKIP_CANONICAL;
  const c = canonicalize(raw);
  if (c === SKIP_CANONICAL) return SKIP_CANONICAL;
  if (ALLOWED_REGIONS.has(c)) return c;
  return SKIP_CANONICAL;
};

// Display-ready titlecase — fallback guruhlar uchun
const toDisplay = (canonical: string, original: string): string => {
  // Agar canonical mappingdan kelgan bo'lsa — as-is (u allaqachon to'g'ri formatda)
  if (LABEL_RULES.some((r) => r.canonical === canonical)) return canonical;
  // Aks holda — birinchi uchragan asl qiymatni ishlatamiz
  return original.trim();
};

// Har bir card uchun strukturali natija:
//   summary — mijozning aynan nima xohlashi / qaysi muammoni ko'rishi (1-2 jumla)
//   recommendation — menejerga aniq taklif / javob (1-2 jumla)
export interface SectionInsight {
  summary: string;
  recommendation: string;
}

interface AiNarrative {
  interests: SectionInsight;
  fears: SectionInsight;
  questions: SectionInsight;
  objections: SectionInsight;
  decisionTime: SectionInsight;
}

// Filter kombinatsiyasi bo'yicha insights cache (24 soat TTL)
// Qayta generatsiya shartlari (OR):
//   1. 24 soatdan ko'p vaqt o'tgan
//   2. Yangi mijozlar soni cache'dagidan >= MIN_NEW_CLIENTS_FOR_REFRESH
const INSIGHTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MIN_NEW_CLIENTS_FOR_REFRESH = 20;

interface CachedNarrative {
  at: number;
  narrative: AiNarrative;
  clientCount: number; // Narrative generatsiya qilinganda qancha mijoz bo'lgan
}
const insightsCache = new Map<string, CachedNarrative>();

// Hozirda background'da hisoblanayotgan keylar — qaytariq chaqiruvlarni bloklamaslik uchun
const inFlightNarratives = new Map<string, Promise<AiNarrative>>();

// Cache key builder — `total` ni kiritmaydi (chunki cache delta tekshiradi)
function buildInsightsCacheKey(params: {
  companyId: string;
  region?: string;
  gender?: string;
  pipelineId?: number;
  sourceId?: string;
  search?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
}): string {
  return JSON.stringify(params);
}

// Cache foydalanishga yaroqli bo'lsa qaytaradi, aks holda null
function getFreshCache(key: string, currentClientCount: number): CachedNarrative | null {
  const cached = insightsCache.get(key);
  if (!cached) return null;
  const ageMs = Date.now() - cached.at;
  if (ageMs >= INSIGHTS_CACHE_TTL_MS) return null;
  const newClients = currentClientCount - cached.clientCount;
  if (newClients >= MIN_NEW_CLIENTS_FOR_REFRESH) return null;
  return cached;
}

// Foydasiz savollar (mijoz portretida ko'rsatishga arzimaydi)
const USELESS_QUESTION_PATTERNS = [
  /ism(ing|lari|ini|i)?\s*(ni)?\s*(ayt|so|nima)/i,
  /ismingiz\s*nima/i,
  /ism\s*nima/i,
  /nom(ing|ingiz|ini|im)/i,
  /qanday\s+yordam/i,
  /hol(?:ingiz)?\s*(ahvol|qalay)/i,
  /assalomu?\s*alaykum/i,
  /alaykum/i,
  /kim\s+bilan\s+gaplash/i,
  /qanday\s+qil(ay|aman)/i,
  /rasmingiz/i,
  /eshit(yap|a|ilay)/i,
];

function isUsefulQuestion(q: string): boolean {
  if (!q || q.trim().length < 8) return false;
  for (const pat of USELESS_QUESTION_PATTERNS) {
    if (pat.test(q)) return false;
  }
  return true;
}

// Pre-warm — startup va har 6 soatda asosiy filter (hech narsa tanlanmagan)
// uchun AI narrative'ni oldindan generate qilib cache'ga yozadi.
// Shunda frontend birinchi marta kirganda darhol tayyor ma'lumot oladi.
export async function prewarmClientInsights(): Promise<void> {
  try {
    const companies = await prisma.company.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    for (const company of companies) {
      const clients = await prisma.client.findMany({
        where: { companyId: company.id },
        select: {
          topQuestions: true,
          topObjections: true,
          interests: true,
          fears: true,
          decisionTimeDays: true,
        },
      });
      if (clients.length === 0) continue;

      const total = clients.length;
      const cacheKey = buildInsightsCacheKey({ companyId: company.id });
      const fresh = getFreshCache(cacheKey, total);
      if (fresh) {
        const delta = total - fresh.clientCount;
        console.log(`[prewarm] ${company.name}: cache taze (${delta} yangi, < ${MIN_NEW_CLIENTS_FOR_REFRESH}) — o'tkazib yuboriladi`);
        continue;
      }

      const flat = (arrs: string[][]) => {
        const m = new Map<string, number>();
        for (const arr of arrs) for (const x of arr || []) {
          if (x?.trim()) m.set(x.trim(), (m.get(x.trim()) || 0) + 1);
        }
        return Array.from(m.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      };
      const fromJson = (arrs: (TopItem[] | null | undefined)[], key: string) => {
        const m = new Map<string, number>();
        for (const arr of arrs) {
          if (!Array.isArray(arr)) continue;
          for (const it of arr) {
            const raw = (it as unknown as Record<string, unknown>)[key] ||
              (it as unknown as Record<string, unknown>).value;
            if (!raw) continue;
            const n = Number((it as unknown as { count?: number }).count ?? 1);
            m.set(String(raw), (m.get(String(raw)) || 0) + (Number.isFinite(n) ? n : 1));
          }
        }
        return Array.from(m.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      };

      const topInterests = flat(clients.map((c) => c.interests));
      const topFears = flat(clients.map((c) => c.fears));
      const topQuestionsRaw = fromJson(
        clients.map((c) => c.topQuestions as unknown as TopItem[]), "q"
      );
      const topQuestions = topQuestionsRaw.filter((x) => isUsefulQuestion(x.value)).slice(0, 10);
      const topObjections = fromJson(
        clients.map((c) => c.topObjections as unknown as TopItem[]), "obj"
      );
      const decisionTimes = clients.map((c) => c.decisionTimeDays).filter((v): v is number => v != null);
      const avgDecisionTimeDays = decisionTimes.length > 0
        ? Math.round(decisionTimes.reduce((a, b) => a + b, 0) / decisionTimes.length)
        : null;

      console.log(`[prewarm] ${company.name}: AI narrative generatsiya (${total} mijoz)...`);
      const narrative = await generateClientNarrative(
        company.name, total, topInterests, topFears, topQuestions, topObjections, avgDecisionTimeDays
      );
      insightsCache.set(cacheKey, { at: Date.now(), narrative, clientCount: total });
      console.log(`[prewarm] ${company.name}: tayyor ✓`);
    }
  } catch (err) {
    console.error("[prewarm] error:", err);
  }
}

function getGemini(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "global",
  });
}

async function generateClientNarrative(
  companyName: string,
  total: number,
  topInterests: { value: string; count: number }[],
  topFears: { value: string; count: number }[],
  topQuestions: { value: string; count: number }[],
  topObjections: { value: string; count: number }[],
  avgDecisionTimeDays: number | null
): Promise<AiNarrative> {
  const fmt = (arr: { value: string; count: number }[]) =>
    arr.length === 0
      ? "—"
      : arr.map((x) => `"${x.value}" (${x.count})`).join(", ");

  const prompt = `Siz sotuv analitika eksperti. Quyida ${companyName} kompaniyasining ${total} ta mijozi bo'yicha AI qo'ng'iroq tahlillaridan yig'ilgan real ma'lumot:

QIZIQISHLARI (eng ko'p takrorlangan): ${fmt(topInterests)}
QO'RQUVLARI / SHUBHALARI: ${fmt(topFears)}
KO'P BERADIGAN SAVOLLAR: ${fmt(topQuestions)}
ASOSIY E'TIROZLARI: ${fmt(topObjections)}
O'RTACHA QAROR QABUL QILISH VAQTI: ${avgDecisionTimeDays != null ? `${avgDecisionTimeDays} kun` : "ma'lum emas"}

Vazifa: har bir maydon uchun STRUKTURALI TAHLIL yoz — uzbek tilida, aniq va amaliy:
  • "summary" — mijozning nima xohlayotgani / qanday xavotiri borligi / qanday muammo sezilishi (1-2 qisqa jumla, "Mijoz ..." deb boshla).
  • "recommendation" — menejerga aniq TAKLIF: nimani aytish, qanday argumentlash, qanday yechim taklif qilish (1-2 jumla, "Menejer ...", "Taklif: ..." deb boshla, ko'rsatmali fe'llar — "aytib o'ting", "keys ko'rsating", "tarif taqdim qiling" va h.k.).

MAXSUS QOIDALAR:
  • "questions" bo'limi: summary — mijoz ko'p bergan savollar orqali aniqlangan MUAMMO (masalan, "Narx va jarayon noaniq ko'rinadi"), recommendation — AYNAN YECHIM (masalan, "Narxlar ro'yxatini avval yuboring, so'ng anaqalarni tushuntiring").
  • "objections" bo'limi: summary — mijozning asosiy e'tiroziga sabab, recommendation — e'tirozga to'g'ri javob texnikasi.

Sonlarni emas INSIGHT yoz. "Mijoz" sifatida umumlashtir, "mijozlarimiz" emas. "Ma'lumot yetarli emas" deb bo'sh qoldirma — berilgan kichik ma'lumotdan tahlil ajrat.

STRICTLY return valid JSON, no markdown:
{
  "interests": { "summary": "...", "recommendation": "..." },
  "fears": { "summary": "...", "recommendation": "..." },
  "questions": { "summary": "...", "recommendation": "..." },
  "objections": { "summary": "...", "recommendation": "..." },
  "decisionTime": { "summary": "...", "recommendation": "..." }
}`;

  const emptyInsight = (s: string, r: string): SectionInsight => ({
    summary: s,
    recommendation: r,
  });

  const normalizeSection = (
    raw: unknown,
    fallbackSummary: string,
    fallbackRec: string,
  ): SectionInsight => {
    if (raw && typeof raw === "object") {
      const obj = raw as { summary?: unknown; recommendation?: unknown };
      return {
        summary: typeof obj.summary === "string" ? obj.summary : fallbackSummary,
        recommendation:
          typeof obj.recommendation === "string"
            ? obj.recommendation
            : fallbackRec,
      };
    }
    // Eski format — string
    if (typeof raw === "string" && raw.trim()) {
      return { summary: raw, recommendation: fallbackRec };
    }
    return emptyInsight(fallbackSummary, fallbackRec);
  };

  try {
    const ai = getGemini();
    const resp = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.4, responseMimeType: "application/json" },
    });
    const text = resp.text?.trim() || "{}";
    const parsed = JSON.parse(text);
    return {
      interests: normalizeSection(
        parsed.interests,
        topInterests.slice(0, 3).map((x) => x.value).join(", ") || "Ma'lumot yetarli emas",
        "Qiziqish yo'nalishlari bo'yicha alohida keys/taklif tayyorlang.",
      ),
      fears: normalizeSection(
        parsed.fears,
        topFears.slice(0, 3).map((x) => x.value).join(", ") || "Ma'lumot yetarli emas",
        "Mijozga aniq kafolat va real natija misollarini ko'rsating.",
      ),
      questions: normalizeSection(
        parsed.questions,
        topQuestions.slice(0, 3).map((x) => x.value).join("; ") || "Ma'lumot yetarli emas",
        "Savollarga tayyor javoblar ro'yxatini menejerlarga yetkazing.",
      ),
      objections: normalizeSection(
        parsed.objections,
        topObjections.slice(0, 3).map((x) => x.value).join("; ") || "Ma'lumot yetarli emas",
        "E'tirozlar bazasidagi skriptlarni ishlatib javob tayyorlang.",
      ),
      decisionTime: normalizeSection(
        parsed.decisionTime,
        avgDecisionTimeDays != null
          ? `O'rtacha ${avgDecisionTimeDays} kunda qaror qabul qilishadi.`
          : "Ma'lumot yetarli emas",
        "Qaror muddatiga muvofiq follow-up jadvalini rejalashtiring.",
      ),
    };
  } catch (err) {
    console.error("AI narrative error:", err);
    return {
      interests: emptyInsight(
        topInterests.slice(0, 3).map((x) => x.value).join(", ") || "Ma'lumot yetarli emas",
        "Qiziqish yo'nalishi bo'yicha alohida keys/taklif tayyorlang.",
      ),
      fears: emptyInsight(
        topFears.slice(0, 3).map((x) => x.value).join(", ") || "Ma'lumot yetarli emas",
        "Mijozga aniq kafolat va real natija misollarini ko'rsating.",
      ),
      questions: emptyInsight(
        topQuestions.slice(0, 3).map((x) => x.value).join("; ") || "Ma'lumot yetarli emas",
        "Savollarga tayyor javoblar ro'yxatini menejerlarga yetkazing.",
      ),
      objections: emptyInsight(
        topObjections.slice(0, 3).map((x) => x.value).join("; ") || "Ma'lumot yetarli emas",
        "E'tirozlar bazasidagi skriptlarni ishlatib javob tayyorlang.",
      ),
      decisionTime: emptyInsight(
        avgDecisionTimeDays != null
          ? `O'rtacha ${avgDecisionTimeDays} kunda qaror qabul qilishadi.`
          : "Ma'lumot yetarli emas",
        "Qaror muddatiga muvofiq follow-up jadvalini rejalashtiring.",
      ),
    };
  }
}

// Filter select optionlari uchun: mavjud viloyatlar, pipelinelar, manbalar
export const getClientFilters = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;

    const [regions, pipelines, sources] = await Promise.all([
      prisma.client.groupBy({
        by: ["region"],
        where: { companyId, region: { not: null } },
        _count: { id: true },
      }),
      prisma.client.groupBy({
        by: ["pipelineId", "pipelineName"],
        where: { companyId, pipelineId: { not: null } },
        _count: { id: true },
      }),
      prisma.client.groupBy({
        by: ["sourceId", "sourceName"],
        where: { companyId, sourceId: { not: null } },
        _count: { id: true },
      }),
    ]);

    // Viloyatlarni canonical guruhga jamlaymiz — faqat 14 ta O'zbekiston hududi
    // (Toshkent, Samarqand va h.k.). AI noto'g'ri ekstraktsiya qilgan qiymatlar
    // ("unknown", "viloyatga ketmoqchi", "toshkentga qatnaydi" va h.k.) chiqib ketsin.
    const regionMap = new Map<string, number>();
    for (const r of regions) {
      if (!r.region) continue;
      const c = canonicalizeRegion(r.region.trim());
      if (c === SKIP_CANONICAL) continue;
      regionMap.set(c, (regionMap.get(c) || 0) + r._count.id);
    }

    success(res, {
      regions: Array.from(regionMap.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count),
      pipelines: pipelines
        .filter((p) => p.pipelineId != null)
        .map((p) => ({
          id: p.pipelineId!,
          name: p.pipelineName || `Pipeline ${p.pipelineId}`,
          count: p._count.id,
        }))
        .sort((a, b) => b.count - a.count),
      sources: sources
        .filter((s) => s.sourceId)
        .map((s) => ({
          id: s.sourceId!,
          name: s.sourceName || s.sourceId!,
          count: s._count.id,
        }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (err) {
    console.error("clients/filters error:", err);
    error(res, "Filterlarni olishda xatolik");
  }
};

// Mijozlar ro'yxati
export const listClients = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const search = (req.query.search as string | undefined)?.trim();
    const parseList = (raw: unknown): string[] =>
      typeof raw === "string"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const regions = parseList(req.query.region);
    const genders = parseList(req.query.gender);
    const pipelineIds = parseList(req.query.pipelineId)
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n));
    const sourceIds = parseList(req.query.sourceId);
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(5, Number(req.query.perPage) || 20));

    const where: Record<string, unknown> = { companyId };
    if (regions.length === 1) where.region = regions[0];
    else if (regions.length > 1) where.region = { in: regions };
    if (genders.length === 1) where.gender = genders[0];
    else if (genders.length > 1) where.gender = { in: genders };
    if (pipelineIds.length === 1) where.pipelineId = pipelineIds[0];
    else if (pipelineIds.length > 1) where.pipelineId = { in: pipelineIds };
    if (sourceIds.length === 1) where.sourceId = sourceIds[0];
    else if (sourceIds.length > 1) where.sourceId = { in: sourceIds };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search.replace(/\D/g, ""), mode: "insensitive" } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        orderBy: [{ lastCallAt: "desc" }, { updatedAt: "desc" }],
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          phoneNumber: true,
          name: true,
          age: true,
          gender: true,
          region: true,
          pipelineId: true,
          pipelineName: true,
          sourceId: true,
          sourceName: true,
          callsAnalyzed: true,
          lastCallAt: true,
          interests: true,
          fears: true,
          decisionTimeDays: true,
        },
      }),
    ]);

    success(res, {
      total,
      page,
      perPage,
      rows,
    });
  } catch (err) {
    console.error("clients list error:", err);
    error(res, "Mijozlar ro'yxatini olishda xatolik");
  }
};

// O'rtacha mijoz portreti — filter bo'yicha aggregatsiya + AI narrative
export const getClientInsights = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    // Multi-value: param comma-separated kelishi mumkin
    const parseList = (raw: unknown): string[] =>
      typeof raw === "string"
        ? raw.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const regions = parseList(req.query.region);
    const genders = parseList(req.query.gender);
    const pipelineIds = parseList(req.query.pipelineId)
      .map((s) => Number(s))
      .filter((n) => !Number.isNaN(n));
    const sourceIds = parseList(req.query.sourceId);
    const search = (req.query.search as string | undefined)?.trim();
    const period = req.query.period as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    const where: Record<string, unknown> = { companyId };
    if (regions.length === 1) where.region = regions[0];
    else if (regions.length > 1) where.region = { in: regions };
    if (genders.length === 1) where.gender = genders[0];
    else if (genders.length > 1) where.gender = { in: genders };
    if (pipelineIds.length === 1) where.pipelineId = pipelineIds[0];
    else if (pipelineIds.length > 1) where.pipelineId = { in: pipelineIds };
    if (sourceIds.length === 1) where.sourceId = sourceIds[0];
    else if (sourceIds.length > 1) where.sourceId = { in: sourceIds };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search.replace(/\D/g, "") } },
      ];
    }
    // Davr filter — lastCallAt bo'yicha
    const now = new Date();
    const toTashkent = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, -5, 0, 0));
    if (period === "today") {
      const d = now;
      where.lastCallAt = {
        gte: toTashkent(d.getFullYear(), d.getMonth() + 1, d.getDate()),
        lt: toTashkent(d.getFullYear(), d.getMonth() + 1, d.getDate() + 1),
      };
    } else if (period === "week") {
      const d = new Date(now);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      where.lastCallAt = {
        gte: toTashkent(d.getFullYear(), d.getMonth() + 1, d.getDate()),
      };
    } else if (period === "month") {
      where.lastCallAt = {
        gte: toTashkent(now.getFullYear(), now.getMonth() + 1, 1),
      };
    } else if (period === "custom" && dateFrom) {
      const [y, m, d] = dateFrom.split("-").map(Number);
      const from = toTashkent(y, m, d);
      if (dateTo) {
        const [y2, m2, d2] = dateTo.split("-").map(Number);
        where.lastCallAt = { gte: from, lt: toTashkent(y2, m2, d2 + 1) };
      } else {
        where.lastCallAt = { gte: from };
      }
    }

    const clients = await prisma.client.findMany({
      where,
      select: {
        id: true,
        age: true,
        gender: true,
        region: true,
        pipelineName: true,
        sourceName: true,
        interests: true,
        fears: true,
        topQuestions: true,
        topObjections: true,
        decisionTimeDays: true,
        callsAnalyzed: true,
      },
    });

    const total = clients.length;
    if (total === 0) {
      success(res, {
        total: 0,
        gender: { male: 0, female: 0, unknown: 0 },
        ageDistribution: [],
        avgAge: null,
        avgDecisionTimeDays: null,
        avgCallsPerClient: 0,
        topRegions: [],
        topPipelines: [],
        topSources: [],
        topInterests: [],
        topFears: [],
        topQuestions: [],
        topObjections: [],
      });
      return;
    }

    // Gender
    let male = 0, female = 0, unknown = 0;
    for (const c of clients) {
      if (c.gender === "male") male++;
      else if (c.gender === "female") female++;
      else unknown++;
    }

    // Age buckets
    const ageBuckets: Record<string, number> = {
      "18-24": 0,
      "25-34": 0,
      "35-44": 0,
      "45-54": 0,
      "55+": 0,
      "Noma'lum": 0,
    };
    let ageSum = 0, ageCount = 0;
    for (const c of clients) {
      if (c.age == null) {
        ageBuckets["Noma'lum"]++;
      } else {
        ageSum += c.age;
        ageCount++;
        if (c.age < 25) ageBuckets["18-24"]++;
        else if (c.age < 35) ageBuckets["25-34"]++;
        else if (c.age < 45) ageBuckets["35-44"]++;
        else if (c.age < 55) ageBuckets["45-54"]++;
        else ageBuckets["55+"]++;
      }
    }
    const ageDistribution = Object.entries(ageBuckets)
      .filter(([, n]) => n > 0)
      .map(([label, count]) => ({ label, count, percent: Math.round((count / total) * 100) }));

    // Decision time
    const decisionTimes = clients.map((c) => c.decisionTimeDays).filter((v): v is number => v != null);
    const avgDecisionTimeDays = decisionTimes.length > 0
      ? Math.round(decisionTimes.reduce((a, b) => a + b, 0) / decisionTimes.length)
      : null;

    // Avg calls
    const totalCalls = clients.reduce((a, c) => a + (c.callsAnalyzed || 0), 0);
    const avgCallsPerClient = total > 0 ? Number((totalCalls / total).toFixed(1)) : 0;

    // Group-by helpers — canonical grouping bilan.
    // Har canonical key uchun count yig'amiz, display sifatida eng ko'p
    // uchragan asl variant (original count'i eng katta) ishlatiladi.
    const countByCanonical = (
      vals: (string | null | undefined)[],
      limit = 5,
      withPercent = true,
      canon: (s: string) => string = canonicalize,
    ) => {
      // canonical -> { total, sources: Map<original, count> }
      const m = new Map<string, { total: number; sources: Map<string, number> }>();
      for (const v of vals) {
        if (!v) continue;
        const trimmed = v.trim();
        if (!trimmed) continue;
        const c = canon(trimmed);
        if (c === SKIP_CANONICAL) continue; // Uzbekistan / country — viloyat emas
        if (!m.has(c)) m.set(c, { total: 0, sources: new Map() });
        const entry = m.get(c)!;
        entry.total += 1;
        entry.sources.set(trimmed, (entry.sources.get(trimmed) || 0) + 1);
      }
      return Array.from(m.entries())
        .map(([key, { total: cnt, sources }]) => {
          const mostUsed = Array.from(sources.entries()).sort(
            (a, b) => b[1] - a[1]
          )[0]?.[0];
          return {
            value: toDisplay(key, mostUsed || key),
            count: cnt,
            ...(withPercent ? { percent: Math.round((cnt / total) * 100) } : {}),
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    };

    // Viloyat uchun strict canonicalize — faqat 14 ta O'zbekiston hududi
    const topRegions = countByCanonical(
      clients.map((c) => c.region),
      14,
      true,
      canonicalizeRegion,
    );
    const topPipelines = countByCanonical(clients.map((c) => c.pipelineName));
    const topSources = countByCanonical(clients.map((c) => c.sourceName));

    // String[] arrays — flatten + canonical count
    const flatCountByCanonical = (
      arrs: string[][],
      limit = 10,
      canon: (s: string) => string = canonicalize,
    ) => {
      const flat: string[] = [];
      for (const arr of arrs) {
        for (const item of arr) {
          if (item?.trim()) flat.push(item.trim());
        }
      }
      return countByCanonical(flat, limit, false, canon);
    };

    const topInterests = flatCountByCanonical(
      clients.map((c) => c.interests),
      10,
      canonicalizeInterest,
    );
    const topFears = flatCountByCanonical(clients.map((c) => c.fears));

    // Json[] arrays — topQuestions / topObjections: [{q/obj, count}]
    const jsonCountBy = (
      arrs: (TopItem[] | null | undefined)[],
      key: "value" | "q" | "obj",
      limit = 10
    ) => {
      const m = new Map<string, number>();
      for (const arr of arrs) {
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          if (!item) continue;
          const raw = ((item as unknown as Record<string, unknown>)[key] ??
            (item as unknown as Record<string, unknown>).value) as string | undefined;
          const n = Number((item as unknown as { count?: number }).count ?? 1);
          if (!raw) continue;
          m.set(raw, (m.get(raw) || 0) + (Number.isFinite(n) ? n : 1));
        }
      }
      return Array.from(m.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    };

    const topQuestionsRaw = jsonCountBy(
      clients.map((c) => c.topQuestions as unknown as TopItem[]),
      "q",
      30
    );
    const topQuestions = topQuestionsRaw.filter((x) => isUsefulQuestion(x.value)).slice(0, 10);
    const topObjections = jsonCountBy(
      clients.map((c) => c.topObjections as unknown as TopItem[]),
      "obj"
    );

    // AI narrative — faqat cache'dan oladi. Yo'q bo'lsa null qaytaradi.
    // AI generatsiyasi alohida /clients/insights/ai endpointida (frontend uni parallel chaqiradi).
    const cacheKey = buildInsightsCacheKey({
      companyId,
      region: regions.length > 0 ? regions.sort().join(",") : undefined,
      gender: genders.length > 0 ? genders.sort().join(",") : undefined,
      pipelineId: pipelineIds.length === 1 ? pipelineIds[0] : undefined,
      sourceId: sourceIds.length > 0 ? sourceIds.sort().join(",") : undefined,
      search,
      period,
      dateFrom,
      dateTo,
    });
    const freshCache = getFreshCache(cacheKey, total);
    const aiNarrative = freshCache ? freshCache.narrative : null;

    success(res, {
      total,
      gender: (() => {
        const knownGender = male + female;
        const malePercent = knownGender > 0 ? Math.round((male / knownGender) * 100) : 0;
        return {
          male,
          female,
          unknown,
          malePercent,
          femalePercent: knownGender > 0 ? 100 - malePercent : 0,
        };
      })(),
      ageDistribution,
      avgAge: ageCount > 0 ? Math.round(ageSum / ageCount) : null,
      avgDecisionTimeDays,
      avgCallsPerClient,
      topRegions,
      topPipelines,
      topSources,
      topInterests,
      topFears,
      topQuestions,
      topObjections,
      aiNarrative,
    });
  } catch (err) {
    console.error("clients/insights error:", err);
    error(res, "Mijoz portretini hisoblashda xatolik");
  }
};

// AI narrative — sekin ishlaydi. Frontend uni alohida parallel chaqiradi.
// Cache bo'lsa darhol qaytaradi. Yo'q bo'lsa Gemini Flash ni chaqirib yozadi.
export const getClientAiNarrative = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const region = req.query.region as string | undefined;
    const gender = req.query.gender as string | undefined;
    const pipelineId = req.query.pipelineId ? Number(req.query.pipelineId) : undefined;
    const sourceId = req.query.sourceId as string | undefined;
    const search = (req.query.search as string | undefined)?.trim();
    const period = req.query.period as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;

    // Bir xil WHERE va aggregation (getClientInsights'dagi bilan)
    const where: Record<string, unknown> = { companyId };
    if (region) where.region = region;
    if (gender) where.gender = gender;
    if (pipelineId != null && !Number.isNaN(pipelineId)) where.pipelineId = pipelineId;
    if (sourceId) where.sourceId = sourceId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search.replace(/\D/g, "") } },
      ];
    }
    const now = new Date();
    const toTashkent = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m - 1, d, -5, 0, 0));
    if (period === "today") {
      const d = now;
      where.lastCallAt = {
        gte: toTashkent(d.getFullYear(), d.getMonth() + 1, d.getDate()),
        lt: toTashkent(d.getFullYear(), d.getMonth() + 1, d.getDate() + 1),
      };
    } else if (period === "week") {
      const d = new Date(now);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      where.lastCallAt = { gte: toTashkent(d.getFullYear(), d.getMonth() + 1, d.getDate()) };
    } else if (period === "month") {
      where.lastCallAt = { gte: toTashkent(now.getFullYear(), now.getMonth() + 1, 1) };
    } else if (period === "custom" && dateFrom) {
      const [y, m, d] = dateFrom.split("-").map(Number);
      const from = toTashkent(y, m, d);
      if (dateTo) {
        const [y2, m2, d2] = dateTo.split("-").map(Number);
        where.lastCallAt = { gte: from, lt: toTashkent(y2, m2, d2 + 1) };
      } else {
        where.lastCallAt = { gte: from };
      }
    }

    const clients = await prisma.client.findMany({
      where,
      select: {
        topQuestions: true,
        topObjections: true,
        interests: true,
        fears: true,
        decisionTimeDays: true,
      },
    });
    const total = clients.length;

    const cacheKey = buildInsightsCacheKey({
      companyId, region, gender, pipelineId, sourceId, search, period, dateFrom, dateTo,
    });

    // Cache hit + delta < 20 → darhol qaytaradi (AI chaqirilmaydi)
    const fresh = getFreshCache(cacheKey, total);
    if (fresh) {
      success(res, { aiNarrative: fresh.narrative, cached: true });
      return;
    }

    if (total === 0) {
      success(res, { aiNarrative: null, cached: false });
      return;
    }

    // In-flight'dan foydalanish — bir xil generate'ni 2 marta chaqirmaslik
    let promise = inFlightNarratives.get(cacheKey);
    if (!promise) {
      // Aggregation qisqacha
      const flat = (arrs: string[][]) => {
        const m = new Map<string, number>();
        for (const arr of arrs) for (const x of arr || []) {
          if (x?.trim()) m.set(x.trim(), (m.get(x.trim()) || 0) + 1);
        }
        return Array.from(m.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      };
      const fromJson = (arrs: (TopItem[] | null | undefined)[], key: string) => {
        const m = new Map<string, number>();
        for (const arr of arrs) {
          if (!Array.isArray(arr)) continue;
          for (const it of arr) {
            const raw = (it as unknown as Record<string, unknown>)[key] ||
              (it as unknown as Record<string, unknown>).value;
            if (!raw) continue;
            const n = Number((it as unknown as { count?: number }).count ?? 1);
            m.set(String(raw), (m.get(String(raw)) || 0) + (Number.isFinite(n) ? n : 1));
          }
        }
        return Array.from(m.entries())
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
      };

      const topInterests = flat(clients.map((c) => c.interests));
      const topFears = flat(clients.map((c) => c.fears));
      const topQuestionsRaw = fromJson(
        clients.map((c) => c.topQuestions as unknown as TopItem[]),
        "q"
      );
      const topQuestions = topQuestionsRaw.filter((x) => isUsefulQuestion(x.value)).slice(0, 10);
      const topObjections = fromJson(
        clients.map((c) => c.topObjections as unknown as TopItem[]),
        "obj"
      );
      const decisionTimes = clients.map((c) => c.decisionTimeDays).filter((v): v is number => v != null);
      const avgDecisionTimeDays = decisionTimes.length > 0
        ? Math.round(decisionTimes.reduce((a, b) => a + b, 0) / decisionTimes.length)
        : null;

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });

      promise = generateClientNarrative(
        company?.name || "Kompaniya",
        total,
        topInterests,
        topFears,
        topQuestions,
        topObjections,
        avgDecisionTimeDays
      ).then((narrative) => {
        insightsCache.set(cacheKey, { at: Date.now(), narrative, clientCount: total });
        inFlightNarratives.delete(cacheKey);
        return narrative;
      }).catch((err) => {
        inFlightNarratives.delete(cacheKey);
        throw err;
      });
      inFlightNarratives.set(cacheKey, promise);
    }

    const narrative = await promise;
    success(res, { aiNarrative: narrative, cached: false });
  } catch (err) {
    console.error("clients/insights/ai error:", err);
    error(res, "AI xulosasini olishda xatolik");
  }
};

// Bitta mijozning to'liq profili + qo'ng'iroqlar tarixi
export const getClientDetail = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: { id, companyId },
    });
    if (!client) {
      error(res, "Mijoz topilmadi", 404);
      return;
    }

    // Bu mijoz telefonidan kelgan qo'ng'iroqlar (oxirgi 20)
    const calls = await prisma.audioFile.findMany({
      where: {
        companyId,
        phoneNumber: { contains: client.phoneNumber.slice(-9) }, // 9 raqamli qism bilan moslaymiz
        status: "done",
      },
      orderBy: { callDate: "desc" },
      take: 20,
      select: {
        id: true,
        callDate: true,
        duration: true,
        manager: { select: { name: true } },
        analysis: {
          select: {
            summary: true,
            overallScore: true,
          },
        },
      },
    });

    success(res, {
      client: {
        ...client,
        topQuestions: (client.topQuestions as unknown as TopItem[]) || [],
        topObjections: (client.topObjections as unknown as TopItem[]) || [],
      },
      calls: calls.map((c) => ({
        id: c.id,
        callDate: c.callDate,
        duration: c.duration,
        managerName: c.manager?.name || null,
        summary: c.analysis?.summary || null,
        overallScore: c.analysis?.overallScore || null,
      })),
    });
  } catch (err) {
    console.error("client detail error:", err);
    error(res, "Mijoz ma'lumotlarini olishda xatolik");
  }
};
