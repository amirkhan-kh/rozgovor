import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { GoogleGenAI } from "@google/genai";

const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "global";

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const summaries = await prisma.summary.findMany({
      where: { companyId: req.companyId },
      orderBy: { createdAt: "desc" },
    });
    success(res, summaries);
  } catch (err) {
    console.error("Get summaries error:", err);
    error(res, "Xulosalarni olishda xatolik");
  }
};

export const generate = async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, periodFrom, periodTo } = req.body;

    if (!type || !periodFrom || !periodTo) {
      error(res, "Barcha maydonlar to'ldirilishi shart", 400);
      return;
    }

    const summary = await prisma.summary.create({
      data: {
        id: `sum_${Date.now()}`,
        companyId: req.companyId!,
        type,
        periodFrom,
        periodTo,
        status: "pending",
      },
    });

    success(res, summary, 201);

    // Background generation
    generateSummary(summary.id, req.companyId!, periodFrom, periodTo).catch(
      (err) => console.error("Summary generation error:", err)
    );
  } catch (err) {
    console.error("Generate summary error:", err);
    error(res, "Xulosa yaratishda xatolik");
  }
};

const generateSummary = async (
  summaryId: string,
  companyId: string,
  periodFrom: string,
  periodTo: string
): Promise<void> => {
  try {
    const startDate = new Date(periodFrom);
    const endDate = new Date(periodTo + "T23:59:59");

    // ── Data yig'ish — chuqur tahlil uchun
    const [audioFiles, salesLeads, leads] = await Promise.all([
      prisma.audioFile.findMany({
        where: {
          companyId,
          status: "done",
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          analysis: true,
          manager: { select: { name: true } },
        },
      }),
      prisma.salesLead.findMany({
        where: {
          companyId,
          OR: [
            { leadCreatedAt: { gte: startDate, lte: endDate } },
            { closedAt: { gte: startDate, lte: endDate } },
          ],
        },
        select: {
          isSale: true,
          price: true,
          semanticId: true,
          statusName: true,
          pipelineName: true,
          closedAt: true,
          leadCreatedAt: true,
        },
      }),
      prisma.lead.count({
        where: { companyId, dateCreate: { gte: startDate, lte: endDate } },
      }),
    ]);

    // ── KPI hisob-kitoblari
    const totalCalls = audioFiles.length;
    const scores = audioFiles.map((f) => f.analysis?.overallScore || 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const scoreDist = {
      alo: scores.filter((s) => s >= 80).length,
      yaxshi: scores.filter((s) => s >= 60 && s < 80).length,
      ortacha: scores.filter((s) => s >= 40 && s < 60).length,
      past: scores.filter((s) => s < 40).length,
    };

    // Sotuv KPI
    const wonSales = salesLeads.filter((s) => s.isSale && s.closedAt);
    const failedDeals = salesLeads.filter((s) => s.semanticId === "F");
    const totalRevenue = wonSales.reduce((sum, s) => sum + (s.price || 0), 0);
    const avgCheck = wonSales.length > 0 ? Math.round(totalRevenue / wonSales.length) : 0;
    const conversion = leads > 0 ? Math.round((wonSales.length / leads) * 100) : 0;

    // Rad etish sabablari (top 5)
    const rejectionMap: Record<string, number> = {};
    for (const d of failedDeals) {
      const name = d.statusName || "Noma'lum";
      rejectionMap[name] = (rejectionMap[name] || 0) + 1;
    }
    const topRejections = Object.entries(rejectionMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // E'tiroz turlari (top 5)
    const objectionMap: Record<string, number> = {};
    for (const f of audioFiles) {
      const objs = (f.analysis?.objections as Array<{ type: string; count: number }>) || [];
      for (const o of objs) objectionMap[o.type] = (objectionMap[o.type] || 0) + o.count;
    }
    const topObjections = Object.entries(objectionMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Xatolik turlari (top 5)
    const errorMap: Record<string, number> = {};
    for (const f of audioFiles) {
      const errs = (f.analysis?.errors as Array<{ type: string }>) || [];
      for (const e of errs) errorMap[e.type] = (errorMap[e.type] || 0) + 1;
    }
    const topErrors = Object.entries(errorMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Lid sifati
    const leadQualityMap: Record<string, number> = { issiq: 0, iliq: 0, sovuq: 0 };
    for (const f of audioFiles) {
      const q = f.analysis?.leadQuality;
      if (q && leadQualityMap[q] !== undefined) leadQualityMap[q]++;
    }

    // Coaching signals
    let speechAlertCount = 0;
    let openEndingCount = 0;
    let surrenderedTotal = 0;
    for (const f of audioFiles) {
      const ci = f.analysis?.coachingInsights as { speechRatioAlert?: boolean; openEnding?: boolean; surrenderedObjections?: number } | null;
      if (ci?.speechRatioAlert) speechAlertCount++;
      if (ci?.openEnding) openEndingCount++;
      if (ci?.surrenderedObjections) surrenderedTotal += ci.surrenderedObjections;
    }

    // Pipeline taqsimot
    const pipelineMap: Record<string, number> = {};
    for (const s of salesLeads) {
      const name = s.pipelineName || "Noma'lum";
      pipelineMap[name] = (pipelineMap[name] || 0) + 1;
    }
    const topPipelines = Object.entries(pipelineMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Manejerlar bo'yicha batafsil
    const managerStats: Record<string, { calls: number; avgScore: number; scores: number[]; errors: number; objections: number }> = {};
    for (const f of audioFiles) {
      const name = f.manager?.name || "Noma'lum";
      if (!managerStats[name]) managerStats[name] = { calls: 0, avgScore: 0, scores: [], errors: 0, objections: 0 };
      managerStats[name].calls++;
      managerStats[name].scores.push(f.analysis?.overallScore || 0);
      managerStats[name].errors += ((f.analysis?.errors as Array<unknown>) || []).length;
      managerStats[name].objections += ((f.analysis?.objections as Array<{ count: number }>) || []).reduce((s, o) => s + o.count, 0);
    }
    for (const name of Object.keys(managerStats)) {
      const s = managerStats[name];
      s.avgScore = Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length);
    }
    const mgrSorted = Object.entries(managerStats).sort((a, b) => b[1].avgScore - a[1].avgScore);
    const top3 = mgrSorted.slice(0, 3);
    const bottom3 = mgrSorted.slice(-3).reverse();

    const formatMoney = (n: number): string => {
      if (n >= 1e9) return `${(n / 1e9).toFixed(2)} mlrd so'm`;
      if (n >= 1e6) return `${(n / 1e6).toFixed(1)} mln so'm`;
      if (n >= 1e3) return `${(n / 1e3).toFixed(0)} ming so'm`;
      return `${n} so'm`;
    };

    // ── Prompt ga uzatiladigan batafsil statistika
    const statsText = `
# SOTUV BO'LIMI — DAVRIY TAHLIL MATERIALI
Davr: ${periodFrom} — ${periodTo}

## 1. QO'NG'IROQLAR
- Jami tahlil qilingan: ${totalCalls} ta
- O'rtacha ball: ${avgScore}/100
- Sifat taqsimoti:
  • A'lo (80+): ${scoreDist.alo} ta (${Math.round((scoreDist.alo / totalCalls) * 100) || 0}%)
  • Yaxshi (60-79): ${scoreDist.yaxshi} ta (${Math.round((scoreDist.yaxshi / totalCalls) * 100) || 0}%)
  • O'rtacha (40-59): ${scoreDist.ortacha} ta (${Math.round((scoreDist.ortacha / totalCalls) * 100) || 0}%)
  • Past (<40): ${scoreDist.past} ta (${Math.round((scoreDist.past / totalCalls) * 100) || 0}%)

## 2. SOTUV KO'RSATKICHLARI
- Yangi lidlar (Bitrix): ${leads} ta
- Sotuv yopildi: ${wonSales.length} ta
- Muvaffaqiyatsiz dealllar: ${failedDeals.length} ta
- Konversiya (sotuv/lid): ${conversion}%
- Umumiy tushum: ${formatMoney(totalRevenue)}
- O'rtacha chek: ${formatMoney(avgCheck)}

## 3. LID SIFATI (tahlil asosida)
- Issiq: ${leadQualityMap.issiq} ta
- Iliq: ${leadQualityMap.iliq} ta
- Sovuq: ${leadQualityMap.sovuq} ta

## 4. VORONKALAR BO'YICHA (deallar soni)
${topPipelines.map(([n, c]) => `- ${n}: ${c} ta`).join("\n") || "- Ma'lumot yo'q"}

## 5. RAD ETISH SABABLARI (top 5)
${topRejections.map(([name, count]) => `- ${name}: ${count} ta`).join("\n") || "- Ma'lumot yo'q"}

## 6. E'TIROZLAR (top 5) — mijoz qarshi argumentlari
${topObjections.map(([type, count]) => `- ${type}: ${count} marta`).join("\n") || "- Ma'lumot yo'q"}

## 7. XATOLIK TURLARI (top 5) — menejerlar qaysi xatolarga yo'l qo'yadi
${topErrors.map(([type, count]) => `- ${type}: ${count} marta`).join("\n") || "- Ma'lumot yo'q"}

## 8. COACHING SIGNALS (muammoli qo'ng'iroqlar)
- Menejer haddan ko'p gapirgan: ${speechAlertCount} ta qo'ng'iroq
- Keyingi qadam belgilanmagan: ${openEndingCount} ta qo'ng'iroq (lid sovib qolish xavfi)
- E'tirozga taslim bo'lish: ${surrenderedTotal} marta (javob bermasdan o'tkazib yuborildi)

## 9. MENEJERLAR — ENG YAXSHI 3
${top3.map(([n, s]) => `- ${n}: ${s.calls} qo'ng'iroq · ball ${s.avgScore} · xato ${s.errors} · e'tiroz ${s.objections}`).join("\n")}

## 10. MENEJERLAR — ENG YOMON 3
${bottom3.map(([n, s]) => `- ${n}: ${s.calls} qo'ng'iroq · ball ${s.avgScore} · xato ${s.errors} · e'tiroz ${s.objections}`).join("\n")}

## 11. BARCHA MENEJERLAR (sortirovka: ball bo'yicha)
${mgrSorted.map(([n, s]) => `- ${n}: ${s.calls} q · ${s.avgScore} ball · xato:${s.errors} · e'tiroz:${s.objections}`).join("\n")}
    `.trim();

    const prompt = `Sen sotuv bo'limi rahbari uchun ishlaydigan AI-analitiksan. Pastdagi batafsil real ma'lumot asosida **chuqur, aniq va amaliy** haftalik xulosa yoz. Mavhum gaplar, umumlashtirishlar, takroriy bayonot yo'q — faqat **raqamlar, faktlar, aniq harakatlar**.

## FORMAT (majburiy tuzilma):

### 1. YIRIK XULOSA (3-4 gap)
Davr statistikasi raqamlar bilan: jami qo'ng'iroq, sotuv, konversiya, asosiy muammo. Oddiy til, aniq raqamlar.

### 2. ASOSIY MUAMMOLAR (Top 3, har biri 1 paragraf)
Har muammo uchun:
- **Muammo nomi** — qancha qo'ng'iroq/hol ta'sir qilgan (raqam bilan)
- **Sabab** (data'ga asoslangan): masalan, "E'tirozlarda 'Narx' 45 marta takrorlandi, lekin Narx xato'si 32 marta qayd etildi — menejerlar narx e'tirozida to'g'ri javob bermayapti"
- **Ta'siri**: masalan, "Bu 15 ta potentsial sotuvni yo'qotdi"

### 3. YUTUQLAR (2-3 aniq misol)
- Qaysi menejer qaysi sohada ajralib turdi (raqam bilan)
- Nima qildi (data'dan xulosa)
- Boshqalar nimani o'rganishi kerak

### 4. MENEJERLARGA SHAXSIY TAVSIYALAR
Har past ball'li menejer uchun (bottom 3):
- **Ismi** (joriy holat: N ta qo'ng'iroq, ball X)
- **Aniq muammosi** (masalan: "X xatosi 8 marta, Y e'tirozida 5 marta taslim bo'ldi")
- **Aniq harakat**: qanday trening, qaysi texnika ("Feel-Felt-Found texnikasi Narx e'tirozi uchun", "Mikro-majburiyat yakunlashda")
- **Kutilayotgan natija**: 2 haftada X% ball oshishi

### 5. JAMOAVIY HARAKAT REJASI
Markdown jadval formatida (5-7 qator). Ustunlar:
| KIM | NIMA QILADI | QACHON | KUTILAYOTGAN NATIJA |

### 5b. TAVSIYA ETILGAN TRENING MAVZULARI (alohida ro'yxat)
Har mavzu uchun:
- **Mavzu nomi** (aniq, masalan: "Narx e'tirozida Feel-Felt-Found texnikasi")
- **Kim uchun**: (ism + ism yoki "barcha menejerlar")
- **Trener / Manba**: (masalan "Aziz Yashinov (ichki)", "Tashqi kouch", "Online kurs: X")
- **Davomiyligi**: (60 daq, 2 soat, va h.k.)
- **Qaysi muammoni yechadi**: (raqam bilan: "32 ta Narx e'tirozi xatosi")
- **Kutilayotgan natija**: (raqamli: "Narx e'tirozi 45% yechiladi")

Kamida 4 ta trening mavzusi bo'lsin — har biri yuqoridagi ma'lumotdan ENG KO'P uchraydigan e'tiroz/xato turi bo'yicha.

### 6. KEYINGI HAFTADA KUTILAYOTGAN
Raqamli prognoz: agar tavsiyalar bajarilsa qancha o'zgaradi, qanday KPI kuzatiladi.

## MUHIM QOIDALAR:
- Har jumla **raqam yoki fakt** bilan tasdiqlansin. "Ball past" o'rniga "Ball 31, o'rtacha me'yor 60 — 48% farq"
- Markdown: **bold**, ro'yxatlar, sarlavhalar
- Umumiy gaplar **YO'Q**: "bu jamoa faoliyatini ko'rsatadi", "muhim e'tibor talab etadi" — bunday gaplar topilmasin
- Menejerlar **ismi bilan** aniq aytilsin
- Har tavsiya **aniq harakat** (kim + nima + qachon), "treninglar o'tkazilsin" emas
- Rad etish sabablari va e'tirozlar — aniq raqamlar bilan
- Konversiya, tushum, o'rtacha chek — albatta kiritilsin

## REAL MA'LUMOT:

${statsText}
`;

    // Gemini 3 Flash preview faqat global region'da mavjud
    const ai = new GoogleGenAI({
      vertexai: true,
      project: VERTEX_PROJECT,
      location: "global",
    });
    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.2 },
    });

    const content = result.text || "";

    await prisma.summary.update({
      where: { id: summaryId },
      data: { status: "done", content },
    });
  } catch (err) {
    console.error("Generate summary error:", err);
    await prisma.summary.update({
      where: { id: summaryId },
      data: { status: "error" },
    }).catch(() => {});
  }
};

export const getOne = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const summary = await prisma.summary.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!summary) {
      error(res, "Xulosa topilmadi", 404);
      return;
    }

    success(res, summary);
  } catch (err) {
    console.error("Get summary error:", err);
    error(res, "Xulosani olishda xatolik");
  }
};

export const deleteSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const summary = await prisma.summary.findFirst({
      where: { id, companyId: req.companyId },
    });
    if (!summary) {
      error(res, "Xulosa topilmadi", 404);
      return;
    }
    await prisma.summary.delete({ where: { id } });
    success(res, { deleted: true });
  } catch (err) {
    console.error("Delete summary error:", err);
    error(res, "Xulosani o'chirishda xatolik");
  }
};
