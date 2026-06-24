/**
 * Top Performer Intelligence Engine
 *
 * Kompaniyadagi eng yaxshi sotuvchini (sotuv konversiyasi bo'yicha) avtomatik
 * topib, uning muvaffaqiyatli qo'ng'iroqlaridan playbook chiqaradi.
 *
 * "Elyor Paradoksi": eng past QA balli lekin eng ko'p sotuv —
 * tizim endi QA ballni emas, REAL konversiyani o'lchaydi va shu asosda o'rgatadi.
 */

import { prisma } from "../utils/prisma";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3-flash-preview";
const MIN_CALLS_FOR_RANKING = 10; // Kamida shu qo'ng'iroq bo'lsa hisobga olinadi

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "global",
  });
}

export interface TopPerformerPlaybook {
  managerName: string;
  managerId: string;
  conversionRate: number;          // % isSale/totalCalls
  totalCalls: number;
  salesCount: number;
  avgQaScore: number;              // QA balli (konversiyadan farqli)
  techniques: Array<{
    name: string;                  // Texnika nomi
    example: string;               // Real ibora transkripiyadan
    frequency: string;             // "Har doim" | "Ko'pincha" | "Ba'zan"
    whyItWorks?: string;           // Nima uchun bu ishlaydi (1 jumla)
  }>;
  objectionHandling: Array<{
    objectionType: string;         // "Narx" | "Vaqt" | "Ishonch" | ...
    response: string;              // Real javob iborasi
    successRate?: string;          // "Yuqori" | "O'rta"
    whyItWorks?: string;           // Nima uchun ishlaydi
  }>;
  closingStyle: string;            // Yakunlash uslubi tavsifi
  avgManagerSpeech: number;        // O'rtacha nutq nisbati
  avgClientSpeech: number;
  keyPhrases: string[];            // Eng ko'p ishlatgan foydali iboralar
  generatedAt: string;             // ISO string
}

// ─────────────────────────────────────────────────────────────────────────────
// Top performer detection
// ─────────────────────────────────────────────────────────────────────────────

export interface TopPerformerCandidate {
  managerId: string;
  managerName: string;
  conversionRate: number;
  totalCalls: number;
  salesCount: number;
  avgScore: number;
}

export async function detectTopPerformer(
  companyId: string,
  daysPeriod = 30
): Promise<TopPerformerCandidate | null> {
  const result = await detectTopPerformers(companyId, daysPeriod);
  return result?.byConversion || null;
}

/**
 * Top performer'larni topadi:
 *  - byConversion: konversiya foizi eng yuqori (sifat ustasi)
 *  - byVolume:     sotuv soni eng ko'p (miqdor ustasi)
 *  - balanced:     ham konversiya, ham hajmda ikkinchi yoki uchinchi o'rin (umumiy yaxshi)
 *
 * Bu uchchalasi BIR XIL odam emasligini ta'minlaydi.
 * Misol: Muhammadqodir (sifat) + Davron (miqdor) + Elyor (balansli, 2-o'rinda ikkalasida)
 */
export async function detectTopPerformers(
  companyId: string,
  daysPeriod = 30
): Promise<{
  byConversion: TopPerformerCandidate;
  byVolume: TopPerformerCandidate | null;
  balanced: TopPerformerCandidate | null;
} | null> {
  const since = new Date();
  since.setDate(since.getDate() - daysPeriod);

  const files = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      managerId: { not: null },
      createdAt: { gte: since },
    },
    select: {
      managerId: true,
      isSale: true,
      analysis: { select: { overallScore: true } },
      manager: { select: { name: true, isActive: true } },
    },
  });

  const active = files.filter((f) => f.manager?.isActive);

  const stats: Record<string, { name: string; total: number; sales: number; scoreSum: number }> = {};
  for (const f of active) {
    const mid = f.managerId!;
    if (!stats[mid]) stats[mid] = { name: f.manager!.name, total: 0, sales: 0, scoreSum: 0 };
    stats[mid].total += 1;
    if (f.isSale) stats[mid].sales += 1;
    stats[mid].scoreSum += f.analysis?.overallScore || 0;
  }

  const candidates: TopPerformerCandidate[] = Object.entries(stats)
    .filter(([, s]) => s.total >= MIN_CALLS_FOR_RANKING)
    .map(([id, s]) => ({
      managerId: id,
      managerName: s.name,
      conversionRate: Math.round((s.sales / s.total) * 100 * 10) / 10,
      totalCalls: s.total,
      salesCount: s.sales,
      avgScore: s.total > 0 ? Math.round(s.scoreSum / s.total) : 0,
    }));

  if (candidates.length === 0) return null;

  const byConversionSorted = [...candidates].sort((a, b) => b.conversionRate - a.conversionRate);
  const byVolumeSorted = [...candidates].sort((a, b) => b.salesCount - a.salesCount);

  const byConversion = byConversionSorted[0];
  if (byConversion.salesCount === 0) {
    console.log(`[TopPerformer] ${companyId}: isSale field to'ldirilmagan, playbook yaratilmadi`);
    return null;
  }

  // Sotuv soni bo'yicha — "Elyor paradoksi" (boshqa odam bo'lishi shart)
  const byVolume = byVolumeSorted.find((c) => c.managerId !== byConversion.managerId) || null;

  // BALANSLI ustoz — ikkalasida ham yaxshi, lekin yuqorida olinmaganlardan
  // Score = convRank + volRank. Tie-breaker: yuqori konversiya g'olib.
  const usedIds = new Set([byConversion.managerId, byVolume?.managerId].filter(Boolean));
  const balancedRanked = candidates
    .filter((c) => !usedIds.has(c.managerId))
    .map((c) => {
      const convRank = byConversionSorted.findIndex((x) => x.managerId === c.managerId);
      const volRank = byVolumeSorted.findIndex((x) => x.managerId === c.managerId);
      return { ...c, balancedScore: convRank + volRank, convRank, volRank };
    })
    .sort((a, b) => {
      // Asosiy: balanced score (kichik = yaxshi)
      if (a.balancedScore !== b.balancedScore) return a.balancedScore - b.balancedScore;
      // Tie-break 1: yuqori konversiya g'olib
      if (a.conversionRate !== b.conversionRate) return b.conversionRate - a.conversionRate;
      // Tie-break 2: ko'p sotuv
      return b.salesCount - a.salesCount;
    });

  // Balansli ustoz: faqat ikkala metrikada 1-3 o'rinda bo'lsa kiritiladi
  let balanced: TopPerformerCandidate | null = null;
  if (balancedRanked[0]) {
    const top = balancedRanked[0];
    if (top.convRank <= 2 && top.volRank <= 2) {
      balanced = {
        managerId: top.managerId,
        managerName: top.managerName,
        conversionRate: top.conversionRate,
        totalCalls: top.totalCalls,
        salesCount: top.salesCount,
        avgScore: top.avgScore,
      };
    }
  }

  console.log(
    `[TopPerformer] ${companyId}: ` +
      `sifat = ${byConversion.managerName} (${byConversion.conversionRate}%), ` +
      `miqdor = ${byVolume?.managerName || "—"} (${byVolume?.salesCount || 0} sotuv), ` +
      `balansli = ${balanced?.managerName || "—"} (${balanced?.conversionRate || 0}% / ${balanced?.salesCount || 0})`
  );
  return { byConversion, byVolume, balanced };
}

// ─────────────────────────────────────────────────────────────────────────────
// Playbook generation from successful calls
// ─────────────────────────────────────────────────────────────────────────────

export async function extractPlaybook(
  companyId: string,
  managerId: string,
  managerName: string,
  conversionRate: number,
  totalCalls: number,
  salesCount: number,
  avgQaScore: number
): Promise<TopPerformerPlaybook | null> {
  // So'nggi 25 ta muvaffaqiyatli qo'ng'iroq transkriptsiyasi
  const successfulCalls = await prisma.audioFile.findMany({
    where: {
      companyId,
      managerId,
      status: "done",
      isSale: true,
      transcription: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      transcription: true,
      analysis: { select: { overallScore: true, managerSpeech: true, clientSpeech: true } },
    },
  });

  // Agar muvaffaqiyatli qo'ng'iroq kam bo'lsa — barcha qo'ng'iroqlarni ol
  const callsForAnalysis = successfulCalls.length >= 5
    ? successfulCalls
    : await prisma.audioFile.findMany({
        where: {
          companyId,
          managerId,
          status: "done",
          transcription: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          transcription: true,
          analysis: { select: { overallScore: true, managerSpeech: true, clientSpeech: true } },
        },
      });

  if (callsForAnalysis.length === 0) {
    console.log(`[TopPerformer] ${managerName}: transkriptsiya topilmadi`);
    return null;
  }

  // Nutq nisbati o'rtachasi
  const speechData = callsForAnalysis.filter((c) => c.analysis?.managerSpeech);
  const avgManagerSpeech = speechData.length > 0
    ? Math.round(speechData.reduce((s, c) => s + (c.analysis?.managerSpeech || 0), 0) / speechData.length)
    : 50;

  // Transkriptsiyalarni birlashtirish (token limit uchun qisqartirish)
  const transcripts = callsForAnalysis
    .map((c, i) => `--- QONGIROQ ${i + 1} ---\n${(c.transcription || "").substring(0, 2000)}`)
    .join("\n\n");

  const prompt = `Sen Vision School sotuv tahlilchisi va o'qituvchisan. Quyida kompaniyaning ENG YAXSHI sotuvchisi ${managerName} ning ${callsForAnalysis.length} ta qo'ng'irog'i keltirilgan.

Bu shaxs ${conversionRate}% sotuv konversiyasiga ega — boshqa sotuvchilar uning uslubidan o'rganishi kerak.

VAZIFANG: Uning MUVAFFAQIYAT FORMULASINI chiqar — lekin FAQAT YAXSHI, TUSHUNARLI VA O'RGATISH UCHUN ARZIYDIGAN narsalar.

TRANSKRIPTSIYALAR:
${transcripts}

═══════════════════════════════════════════════════
🛑 QAT'IY SIFAT FILTRI — har element TANLAB OLINISHI kerak
═══════════════════════════════════════════════════

Har bir ibora yoki texnikani qo'shishdan oldin SHU 5 ta savolga "HA" deb javob berish kerak:

1. ✅ **Sotuv qiymati bormi?** Bu ibora rapport / qualifying / objection handling / closing / pacing kabi haqiqiy sotuv mahoratiga tegishlimi?
2. ✅ **Tushunarli va to'liq jumla?** Boshlanmagan, tugamagan, bog'lanishsiz fragmentlar EMAS, balki o'qigan sotuvchi darhol tushunadigan to'liq jumla
3. ✅ **Boshqa menejer nusxa olishi mumkinmi?** Shu kontekst-spetsifik tabiatda emas — universal qo'llaniladigan
4. ✅ **Texnika nomi haqiqiy sotuv texnikasi?** "PayLater yordami" yoki "to'lov yo'l-yo'riqi" SOTUV TEXNIKASI EMAS — bu shunchaki mijozga texnik yordam
5. ✅ **Ibora natija berdi?** Mijoz aynan shu javobdan keyin yumshadi, qo'shildi yoki kelishuvga keldi degan dalil bormi?

❌ AGAR BIRORTASIGA "YO'Q" bo'lsa — qo'shma! Bo'sh ro'yxat berish 5 ta noaniq element berishdan yaxshiroq.

═══════════════════════════════════════════════════
❌ TAQIQLANGAN MISOLLAR (bunday narsalarni KIRITMA)
═══════════════════════════════════════════════════

❌ Tushunarsiz fragment:
   "Yo'q, kamida to'rt-besh oy bo'lishi kerakda. Aha. Shuning uchun to'rt-besh oy bo'lishi kerak. Keyin kartangiz yaxshi oborot bo'lgan bo'lishi kerak. A-a, boshqa tanishlaringiz bormi..."
   → REJECT: bog'lanishsiz, gap o'rtasidan olingan, mantig'i yo'q

❌ Texnik yordam (sotuv emas):
   "PlayMarketga kiring-da, PayLater yozing"
   → REJECT: bu mijozga apkani o'rnatishda yordam, sotuv texnikasi emas

❌ Bo'sh ibora:
   "Aha, ha, mayli, tushundim, davom eting"
   → REJECT: hech narsa o'rgatmaydi

❌ O'ylab topilgan texnika:
   "GPS Texnikasi" yoki "Quantum Closing"
   → REJECT: agar transkriptda real ko'rinmasa, ism o'ylab topma

═══════════════════════════════════════════════════
✅ YAXSHI MISOL FORMATI
═══════════════════════════════════════════════════

✅ Yaxshi texnika:
{
  "name": "Ehtiyojni aniqlash savoli",
  "example": "O'zi nima maqsadda ingliz tilini o'rganmoqchi edingiz, bilsam bo'ladimi?",
  "frequency": "Har doim",
  "whyItWorks": "Mijozni gapirishga jalb qiladi, to'g'ri kursni tavsiya qilish uchun ma'lumot beradi"
}

✅ Yaxshi e'tiroz javobi:
{
  "objectionType": "Narx",
  "response": "Tushunaman, narx muhim. Lekin hozir 30% chegirma bor — keyinchalik bunday imkoniyat bo'lmaydi. Sizga 1 oylik to'lovga bo'lib berishimiz mumkin — qulaymi?",
  "whyItWorks": "Empati + qiymatni eslatish + alternativa bilan bo'lib to'lash — taslim bo'lmasdan yopish"
}

═══════════════════════════════════════════════════

JSON formatda javob ber (har elementga "whyItWorks" qo'shing — bu nima uchun ishlashini 1 jumlada):

{
  "techniques": [
    {
      "name": "Aniq sotuv texnikasi nomi",
      "example": "To'liq, mantiqli, tushunarli ibora — transkripsiyadan",
      "frequency": "Har doim | Ko'pincha | Ba'zan",
      "whyItWorks": "Nima uchun bu ishlaydi (1 jumla)"
    }
  ],
  "objectionHandling": [
    {
      "objectionType": "Narx | Vaqt | Ishonch | Raqobat | Kerak emas",
      "response": "To'liq, mantiqli javob iborasi",
      "whyItWorks": "Nima uchun bu javob ishlaydi (1 jumla)"
    }
  ],
  "closingStyle": "Yopish uslubi 1-2 jumla tavsif + bitta yaxshi REAL ibora",
  "keyPhrases": ["faqat to'liq, tushunarli, takrorlanadigan iboralar"]
}

═══════════════════════════════════════════════════
QO'SHIMCHA QOIDALAR
═══════════════════════════════════════════════════

- techniques: 3-5 ta YAXSHI element. Kam bo'lsin, lekin har biri ARZIYDIGAN
- objectionHandling: faqat transkriptda haqiqiy javob ko'rsatilgan e'tirozlar uchun. Yo'q bo'lsa — qo'shma
- keyPhrases: 3-5 ta to'liq, mantiqli iboralar (3 so'zli fragmentlar emas)
- techniques nomi haqiqiy sotuv texnikasi bo'lishi kerak: "Ehtiyojni aniqlash", "Empati ko'rsatish", "Qiymatni asoslash", "Alternativa taklifi", "Bo'lib to'lashga yo'naltirish", "Aniq keyingi qadam", "Mijozni hurmat", "Looping (qaytarish)", "Tonality"
- AGAR transkriptda biror element uchun yaxshi misol topa olmasangiz — uni QO'SHMA. Sifat > miqdor.`;

  try {
    const ai = getAI();

    // Pro → Flash fallback with retries
    const tryGenerate = async (model: string): Promise<string> => {
      const r = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.1 },
      });
      return r.text || "";
    };

    let text = "";
    let lastErr: any = null;
    const attempts: Array<{ model: string; waits: number[] }> = [
      { model: MODEL, waits: [0, 5000, 15000] },                  // Pro: 3 urinish
      { model: "gemini-3-flash-preview", waits: [0, 3000] },            // Flash fallback: 2 urinish
    ];

    outer: for (const { model, waits } of attempts) {
      for (const wait of waits) {
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        try {
          text = await tryGenerate(model);
          if (text) {
            console.log(`[TopPerformer] ${managerName} playbook ${model} bilan generatsiya qilindi`);
            break outer;
          }
        } catch (e: any) {
          lastErr = e;
          const msg = e?.message || "";
          // 429 yoki Resource exhausted bo'lmasa, qayta urinish kerak emas
          if (!msg.includes("429") && !msg.includes("RESOURCE_EXHAUSTED") && !msg.includes("Resource exhausted")) {
            break;
          }
        }
      }
    }

    if (!text) {
      throw lastErr || new Error("Empty response from all models");
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("[TopPerformer] JSON parse xato");
      return null;
    }

    const extracted = JSON.parse(match[0]);

    // ─── SIFAT FILTRI: noaniq, qisqa yoki tushunarsiz elementlarni rad et ──
    const isQualityPhrase = (text: string): boolean => {
      if (!text || typeof text !== "string") return false;
      const t = text.trim();
      if (t.length < 25) return false; // juda qisqa fragmentlar
      const wordCount = t.split(/\s+/).length;
      if (wordCount < 5) return false; // 5 dan kam so'z

      // Mantig'iy bo'lmagan signallar
      const lower = t.toLowerCase();
      const noiseFragments = ["aha aha", "ha ha", "xo'p xo'p", "playmarket", "playstore", "appstore", "play marketga", "paylater"];
      if (noiseFragments.some((n) => lower.includes(n))) return false;

      // To'liq jumla bo'lishi (kichik harflar bilan o'rta qatordan boshlanishi shartli emas)
      // Lekin "yo'q, kamida..." kabi qiziq fragmentlar — qabul qilinadi agar uzun va mantiqli bo'lsa
      return true;
    };

    const isQualityTechniqueName = (name: string): boolean => {
      if (!name || typeof name !== "string") return false;
      const t = name.trim().toLowerCase();
      if (t.length < 5) return false;
      // Texnik yordamga oid nomlarni rad et
      const banned = ["texnik yordam", "to'lov yordami", "paylater", "play market", "app store", "vpn", "telefon raqami"];
      if (banned.some((b) => t.includes(b))) return false;
      return true;
    };

    const filteredTechniques = ((extracted.techniques as any[]) || [])
      .filter((t) => t && isQualityTechniqueName(t.name) && isQualityPhrase(t.example))
      .map((t) => ({
        name: t.name,
        example: t.example,
        frequency: t.frequency || "Ba'zan",
        whyItWorks: t.whyItWorks || undefined,
      }));

    const filteredObjections = ((extracted.objectionHandling as any[]) || [])
      .filter((o) => o && o.objectionType && isQualityPhrase(o.response))
      .map((o) => ({
        objectionType: o.objectionType,
        response: o.response,
        successRate: o.successRate || undefined,
        whyItWorks: o.whyItWorks || undefined,
      }));

    const filteredKeyPhrases = ((extracted.keyPhrases as string[]) || [])
      .filter(isQualityPhrase)
      .slice(0, 5);

    const playbook: TopPerformerPlaybook = {
      managerName,
      managerId,
      conversionRate,
      totalCalls,
      salesCount,
      avgQaScore,
      techniques: filteredTechniques,
      objectionHandling: filteredObjections,
      closingStyle: extracted.closingStyle || "",
      avgManagerSpeech,
      avgClientSpeech: 100 - avgManagerSpeech,
      keyPhrases: filteredKeyPhrases,
      generatedAt: new Date().toISOString(),
    };

    const rejectedTech = ((extracted.techniques as any[]) || []).length - filteredTechniques.length;
    const rejectedObj = ((extracted.objectionHandling as any[]) || []).length - filteredObjections.length;
    console.log(
      `[TopPerformer] ${managerName} playbook: ${playbook.techniques.length} texnika ` +
        `(${rejectedTech} rad etildi), ${playbook.objectionHandling.length} e'tiroz javobi (${rejectedObj} rad etildi)`
    );
    return playbook;
  } catch (err: any) {
    console.error("[TopPerformer] extractPlaybook xato:", err?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main: refresh top performer for a company
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshTopPerformerPlaybook(
  companyId: string,
  daysPeriod = 30,
): Promise<boolean> {
  try {
    const tops = await detectTopPerformers(companyId, daysPeriod);
    if (!tops) {
      console.log(`[TopPerformer] ${companyId}: top performer aniqlanmadi (${daysPeriod} kun)`);
      return false;
    }

    // 1. Konversiya ustasi (Davron) — har doim
    const byConversionPlaybook = await extractPlaybook(
      companyId,
      tops.byConversion.managerId,
      tops.byConversion.managerName,
      tops.byConversion.conversionRate,
      tops.byConversion.totalCalls,
      tops.byConversion.salesCount,
      tops.byConversion.avgScore
    );

    if (!byConversionPlaybook) return false;

    // 2. Miqdor ustasi (masalan Davron)
    let byVolumePlaybook: TopPerformerPlaybook | null = null;
    if (tops.byVolume) {
      byVolumePlaybook = await extractPlaybook(
        companyId,
        tops.byVolume.managerId,
        tops.byVolume.managerName,
        tops.byVolume.conversionRate,
        tops.byVolume.totalCalls,
        tops.byVolume.salesCount,
        tops.byVolume.avgScore
      );
    }

    // 3. Balansli ustoz (masalan Elyor — ikkalasida ham 2-o'rinda)
    let balancedPlaybook: TopPerformerPlaybook | null = null;
    if (tops.balanced) {
      balancedPlaybook = await extractPlaybook(
        companyId,
        tops.balanced.managerId,
        tops.balanced.managerName,
        tops.balanced.conversionRate,
        tops.balanced.totalCalls,
        tops.balanced.salesCount,
        tops.balanced.avgScore
      );
    }

    // Yangi format: 3 ta o'ringa ega bo'lgan obyekt + backward compat
    const wrapped: any = {
      ...byConversionPlaybook,
      byConversion: byConversionPlaybook,
      byVolume: byVolumePlaybook,
      balanced: balancedPlaybook,
    };

    await prisma.company.update({
      where: { id: companyId },
      data: {
        topPerformerPlaybook: wrapped,
        topPerformerUpdatedAt: new Date(),
      },
    });

    console.log(
      `[TopPerformer] ${companyId}: saqlandi — sifat: ${tops.byConversion.managerName}` +
        (tops.byVolume ? `, miqdor: ${tops.byVolume.managerName}` : "") +
        (tops.balanced ? `, balansli: ${tops.balanced.managerName}` : "")
    );
    return true;
  } catch (err: any) {
    console.error(`[TopPerformer] refreshPlaybook xato (${companyId}):`, err?.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Refresh all active companies
// ─────────────────────────────────────────────────────────────────────────────

export async function refreshAllCompanyPlaybooks(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  console.log(`[TopPerformer] ${companies.length} ta kompaniya uchun playbook yangilanmoqda...`);

  for (const company of companies) {
    try {
      await refreshTopPerformerPlaybook(company.id);
      // Rate limit uchun
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err: any) {
      console.error(`[TopPerformer] ${company.name} xato:`, err?.message);
    }
  }

  console.log("[TopPerformer] Barcha playbook yangilandi");
}
