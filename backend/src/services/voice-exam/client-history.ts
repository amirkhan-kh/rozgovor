/**
 * Kompaniyaning mavjud suhbat tahlillaridan real mijoz naqshlarini oladi:
 *   - Eng ko'p uchraydigan e'tirozlar
 *   - Real mijoz iboralari (objection phrases, voice of customer)
 *   - Xarid kriteriyalari va umidlar
 *   - Tez-tez eshitiladigan muammolar (pain points)
 *
 * Imtihon stsenariysi bu patternlar bilan boyitiladi — AI mijoz real
 * mijozlarga o'xshab gaplashadi.
 *
 * Cache: har company uchun 10 daqiqa.
 */
import { prisma } from "../../utils/prisma";

interface ClientPatterns {
  objectionPhrases: string[];   // real mijoz iboralari
  topObjectionTypes: { type: string; count: number }[]; // Narx 45%, Vaqt 20%...
  mainPains: string[];          // voice of customer mainPain
  expectations: string[];       // umidlar
  buyingCriteria: string[];     // mezonlar
  sampleSnippets: string[];     // real mijoz repliklaridan qisqa parchalar
}

interface CachedPatterns {
  patterns: ClientPatterns;
  expiresAt: number;
}

const cache = new Map<string, CachedPatterns>();
const CACHE_TTL_MS = 10 * 60 * 1000;

export async function getClientPatterns(companyId: string): Promise<ClientPatterns> {
  const cached = cache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.patterns;

  // Oxirgi 100 tahlilni olamiz — yetarli variant
  const analyses = await prisma.analysis.findMany({
    where: { audioFile: { companyId } },
    select: {
      objections: true,
      voiceOfCustomer: true,
      lossPoints: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const objectionPhrases = new Set<string>();
  const objectionTypeCount = new Map<string, number>();
  const pains = new Set<string>();
  const expectations = new Set<string>();
  const criteria = new Set<string>();
  const snippets = new Set<string>();

  for (const a of analyses) {
    // Objections
    const objs = (a.objections as Array<{ type?: string; phrase?: string; clientQuote?: string }>) || [];
    for (const o of objs) {
      if (o.type) {
        objectionTypeCount.set(o.type, (objectionTypeCount.get(o.type) || 0) + 1);
      }
      const phrase = o.phrase || o.clientQuote;
      if (phrase && phrase.length > 5 && phrase.length < 200) {
        objectionPhrases.add(phrase.trim());
      }
    }

    // Voice of Customer
    const voc = a.voiceOfCustomer as {
      mainPain?: string;
      expectations?: string[];
      buyingCriteria?: string[];
    } | null;
    if (voc) {
      if (voc.mainPain && voc.mainPain.length > 5) pains.add(voc.mainPain.trim());
      for (const e of voc.expectations || []) {
        if (e && e.length > 3) expectations.add(e.trim());
      }
      for (const c of voc.buyingCriteria || []) {
        if (c && c.length > 3) criteria.add(c.trim());
      }
    }

    // Loss points (often contain client quotes)
    const losses = (a.lossPoints as Array<{ description?: string; clientQuote?: string }>) || [];
    for (const l of losses) {
      const q = l.clientQuote;
      if (q && q.length > 10 && q.length < 160) snippets.add(q.trim());
    }
  }

  const topObjectionTypes = [...objectionTypeCount.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const patterns: ClientPatterns = {
    objectionPhrases: [...objectionPhrases].slice(0, 15),
    topObjectionTypes,
    mainPains: [...pains].slice(0, 8),
    expectations: [...expectations].slice(0, 10),
    buyingCriteria: [...criteria].slice(0, 10),
    sampleSnippets: [...snippets].slice(0, 10),
  };

  cache.set(companyId, { patterns, expiresAt: Date.now() + CACHE_TTL_MS });
  return patterns;
}

/**
 * Scenario system prompt'ga qo'shiladigan "real mijoz xulq" bloki.
 * Agar ma'lumot yo'q bo'lsa — bo'sh string qaytadi (scenario buzilmaydi).
 */
export async function buildClientBehaviorBlock(companyId: string): Promise<string> {
  try {
    const p = await getClientPatterns(companyId);
    const hasData =
      p.objectionPhrases.length > 0 ||
      p.mainPains.length > 0 ||
      p.topObjectionTypes.length > 0;
    if (!hasData) return "";

    const parts: string[] = [
      "",
      "REAL MIJOZLAR HAQIDA — bu kompaniyaning oldingi telefon suhbatlaridan to'plangan haqiqiy naqshlar:",
    ];

    if (p.topObjectionTypes.length > 0) {
      const tops = p.topObjectionTypes
        .map((t) => `${t.type} (${t.count}x)`)
        .join(", ");
      parts.push(`- Eng tez-tez uchraydigan e'tiroz turlari: ${tops}`);
    }
    if (p.mainPains.length > 0) {
      parts.push(`- Mijozlarning asosiy muammolari: ${p.mainPains.slice(0, 5).join("; ")}`);
    }
    if (p.expectations.length > 0) {
      parts.push(`- Mijozlarning umidlari: ${p.expectations.slice(0, 5).join("; ")}`);
    }
    if (p.buyingCriteria.length > 0) {
      parts.push(`- Mijoz qanday kriteriyalarga qaraydi: ${p.buyingCriteria.slice(0, 5).join("; ")}`);
    }
    if (p.objectionPhrases.length > 0) {
      const sample = p.objectionPhrases.slice(0, 6).map((s) => `"${s}"`).join("; ");
      parts.push(`- Real mijoz e'tiroz iboralari (namuna): ${sample}`);
    }
    if (p.sampleSnippets.length > 0) {
      const sample = p.sampleSnippets.slice(0, 4).map((s) => `"${s}"`).join("; ");
      parts.push(`- Real mijoz replikalari: ${sample}`);
    }

    parts.push("");
    parts.push("MUHIM: Shu naqshlarga asoslangan holda gaplash — yuqoridagi iboralar va e'tirozlarni tabiiy shaklda aralashtir, haqiqiy mijozdek tuyulsin.");
    return parts.join("\n");
  } catch (err) {
    console.error("[client-history]", (err as Error).message);
    return "";
  }
}
