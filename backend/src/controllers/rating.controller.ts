import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

/**
 * Period stringini sana intervaliga aylantiradi.
 * Frontend yuboradi: today, yesterday, week, last_week, month, quarter, year, custom
 */
function resolvePeriod(
  period: string,
  dateFromStr?: string,
  dateToStr?: string,
): { from: Date; to: Date } {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const n = new Date(d);
    n.setHours(0, 0, 0, 0);
    return n;
  };
  const endOfDay = (d: Date) => {
    const n = new Date(d);
    n.setHours(23, 59, 59, 999);
    return n;
  };

  if (period === "custom" && dateFromStr) {
    return {
      from: startOfDay(new Date(dateFromStr)),
      to: dateToStr ? endOfDay(new Date(dateToStr)) : endOfDay(now),
    };
  }

  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "week": {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "last_week": {
      const from = new Date(now);
      from.setDate(from.getDate() - 13);
      const to = new Date(now);
      to.setDate(to.getDate() - 7);
      return { from: startOfDay(from), to: endOfDay(to) };
    }
    case "month": {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "quarter": {
      const from = new Date(now);
      from.setMonth(from.getMonth() - 3);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    case "year": {
      const from = new Date(now);
      from.setFullYear(from.getFullYear() - 1);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
    default: {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from), to: endOfDay(now) };
    }
  }
}

export const getRating = async (req: Request, res: Response): Promise<void> => {
  try {
    const period = (req.query.period as string) || "month";
    const dateFromStr = req.query.dateFrom as string | undefined;
    const dateToStr = req.query.dateTo as string | undefined;

    const { from: dateFrom, to: dateTo } = resolvePeriod(period, dateFromStr, dateToStr);

    const managers = await prisma.manager.findMany({
      where: {
        companyId: req.companyId,
        isActive: true,
        audioFiles: {
          some: { status: "done", createdAt: { gte: dateFrom, lte: dateTo } },
        },
      },
    });

    const ratings = [];

    for (const manager of managers) {
      const audioFiles = await prisma.audioFile.findMany({
        where: {
          managerId: manager.id,
          status: "done",
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        include: {
          analysis: {
            select: { overallScore: true, criteria: true, leadScore: true },
          },
        },
      });

      const analyses = audioFiles
        .map((f) => f.analysis)
        .filter((a): a is NonNullable<typeof a> => a !== null);

      if (analyses.length === 0) continue;

      // overallScore — analysis.overallScore o'rtachasi (bu allaqachon 0–100)
      const overallScoreSum = analyses.reduce(
        (sum, a) => sum + (a.overallScore || 0),
        0,
      );
      const overallScore = Math.round(overallScoreSum / analyses.length);

      // criteriaScore — har criteriyani maks baldan % ga normalizatsiya qilib o'rtacha
      // CriteriaResult { score: number, maxScore?: number, weight?: number }
      let criteriaPercentSum = 0;
      let criteriaValidCount = 0;
      for (const analysis of analyses) {
        const criteria =
          (analysis.criteria as Record<string, { score: number; maxScore?: number }>) || {};
        const values = Object.values(criteria);
        if (values.length === 0) continue;
        // Agar maxScore mavjud bo'lsa — foizga normalizatsiya
        // Yo'q bo'lsa — score'ning 0–100 oralig'ida deb faraz qilamiz
        const perCallPct = values.reduce((s, c) => {
          const max = typeof c.maxScore === "number" && c.maxScore > 0 ? c.maxScore : 100;
          return s + Math.min(100, (Number(c.score) / max) * 100);
        }, 0) / values.length;
        criteriaPercentSum += perCallPct;
        criteriaValidCount++;
      }
      const criteriaScore =
        criteriaValidCount > 0 ? Math.round(criteriaPercentSum / criteriaValidCount) : 0;

      // Real sales count — shu davr ichida yopilgan sotuvlar (isSale=true bo'lganlar)
      const sales = audioFiles.filter((f) => (f as any).isSale === true).length;

      ratings.push({
        manager,
        criteriaScore,
        overallScore,
        callsCount: audioFiles.length,
        sales,
      });
    }

    // Sort by overallScore descending
    ratings.sort((a, b) => b.overallScore - a.overallScore);

    success(res, ratings);
  } catch (err) {
    console.error("Rating error:", err);
    error(res, "Reytingni olishda xatolik");
  }
};

/* ==================== SOTUV LEADERBOARD (Reyting → Sotuv tab) ==================== */

// Filter davrini Tashkent UTC+5 ga moslab hisoblash
const TZ_OFFSET = 5;
const tashkentStartOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, -TZ_OFFSET, 0, 0));
const tashkentEndOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, 23 - TZ_OFFSET, 59, 59, 999));

const getSalesPeriodRange = (
  period: string,
  dateFrom?: string,
  dateTo?: string
): { gte: Date; lte: Date; planType: "daily" | "weekly" | "monthly" | null } => {
  const utcNow = new Date();
  const tNow = new Date(utcNow.getTime() + TZ_OFFSET * 3600 * 1000);
  const y = tNow.getUTCFullYear();
  const m = tNow.getUTCMonth() + 1;
  const d = tNow.getUTCDate();

  if (period === "custom" && dateFrom) {
    const [yy, mm, dd] = dateFrom.split("-").map(Number);
    const gte =
      yy && mm && dd
        ? tashkentStartOfDay(yy, mm, dd)
        : tashkentStartOfDay(y, m, 1);
    let lte = tashkentEndOfDay(y, m, d);
    if (dateTo) {
      const [yy2, mm2, dd2] = dateTo.split("-").map(Number);
      if (yy2 && mm2 && dd2) lte = tashkentEndOfDay(yy2, mm2, dd2);
    }
    // Bir kun tanlangan bo'lsa → daily plan, aks holda davr uzunligiga qarab
    const daysBetween = Math.round(
      (lte.getTime() - gte.getTime()) / (24 * 3600 * 1000)
    );
    const planType: "daily" | "weekly" | "monthly" =
      daysBetween <= 1 ? "daily" : daysBetween <= 7 ? "weekly" : "monthly";
    return { gte, lte, planType };
  }

  if (period === "today") {
    return {
      gte: tashkentStartOfDay(y, m, d),
      lte: tashkentEndOfDay(y, m, d),
      planType: "daily",
    };
  }
  if (period === "week") {
    const day = tNow.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const mon = new Date(Date.UTC(y, m - 1, d - diff));
    return {
      gte: tashkentStartOfDay(
        mon.getUTCFullYear(),
        mon.getUTCMonth() + 1,
        mon.getUTCDate()
      ),
      lte: tashkentEndOfDay(y, m, d),
      planType: "weekly",
    };
  }
  // default: month
  return {
    gte: tashkentStartOfDay(y, m, 1),
    lte: tashkentEndOfDay(y, m, d),
    planType: "monthly",
  };
};

// Plan rejimi (count | amount)
export const getSalesPlanMode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId! },
      select: { salesPlanMode: true },
    });
    success(res, { mode: company?.salesPlanMode || "count" });
  } catch (err) {
    error(res, "Plan rejimini olishda xatolik");
  }
};

export const setSalesPlanMode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const mode = String(req.body.mode || "").trim();
    if (mode !== "count" && mode !== "amount") {
      error(res, "Noto'g'ri rejim (count | amount)");
      return;
    }
    await prisma.company.update({
      where: { id: req.companyId! },
      data: { salesPlanMode: mode },
    });
    success(res, { mode });
  } catch (err) {
    error(res, "Plan rejimini saqlashda xatolik");
  }
};

// Bitta menejerning planini saqlash
export const setManagerSalesPlan = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { managerId } = req.params;
    const type = String(req.query.type || req.body.type || "monthly");
    const target = Number(req.body.target);
    if (!["daily", "weekly", "monthly"].includes(type)) {
      error(res, "Noto'g'ri type (daily|weekly|monthly)");
      return;
    }
    if (!Number.isFinite(target) || target < 0) {
      error(res, "Noto'g'ri target");
      return;
    }

    const manager = await prisma.manager.findFirst({
      where: { id: managerId, companyId: req.companyId! },
    });
    if (!manager) {
      error(res, "Menejer topilmadi");
      return;
    }

    await prisma.managerSalesPlan.upsert({
      where: { managerId_type: { managerId, type } },
      create: { managerId, type, target },
      update: { target },
    });
    success(res, { managerId, type, target });
  } catch (err) {
    console.error("Manager plan save error:", err);
    error(res, "Planni saqlashda xatolik");
  }
};

// Menejer KPI foizini saqlash (sotuv summasidan menejer oladigan ulush)
export const setManagerKpi = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { managerId } = req.params;
    const kpiPercent = Number(req.body.kpiPercent);
    if (!Number.isFinite(kpiPercent) || kpiPercent < 0 || kpiPercent > 100) {
      error(res, "Noto'g'ri kpiPercent (0..100 oraliqda)");
      return;
    }
    const manager = await prisma.manager.findFirst({
      where: { id: managerId, companyId: req.companyId! },
    });
    if (!manager) {
      error(res, "Menejer topilmadi");
      return;
    }
    await prisma.manager.update({
      where: { id: managerId },
      data: { kpiPercent },
    });
    success(res, { managerId, kpiPercent });
  } catch (err) {
    console.error("Manager KPI save error:", err);
    error(res, "KPI'ni saqlashda xatolik");
  }
};

// Bitrix'da ba'zi dealarda price noto'g'ri kiritilgan (3.6 mlrd UZS kabi — ortiqcha nol).
// Bu sotuv reytingini buzadi. Realistik sotuv summasi UZS'da:
//   - odatda 300K — 50M oraliq, istisno holatda 100M gacha.
// 100M UZS'dan ortiq dealarni outlier deb hisoblaymiz va "0" bilan birga sanaymiz:
//   salesCount ichida qolaveradi (sotuv haqiqatan bo'lgan), lekin revenue'ga qo'shilmaydi.
// Bu qaror to'g'ridan-to'g'ri Muslima Mahmudova'dagi 3.61 mlrd deal kabi data entry
// xatolari tufayli qo'shildi (D3 bug).
const MAX_REALISTIC_PRICE_UZS = 100_000_000;

function cleanPrice(p: number | null | undefined): number {
  const n = Number(p || 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > MAX_REALISTIC_PRICE_UZS) return 0; // outlier → revenue'dan chiqarib tashlanadi
  return n;
}

// Sotuv leaderboard — har menejer uchun plan, fakt, summa, konversiya, bugun
export const getSalesLeaderboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const range = getSalesPeriodRange(period, dateFrom, dateTo);
    const planType = range.planType || "monthly";

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { salesPlanMode: true },
    });
    const mode: "count" | "amount" =
      (company?.salesPlanMode as "count" | "amount") || "count";

    // Aktiv menejerlar
    const managers = await prisma.manager.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        photoUrl: true, customPhotoUrl: true,
        kpiPercent: true,
        salesPlans: { where: { type: planType } },
      },
    });

    // Davr bo'yicha sotuv = won (isSale) + qisman to'lov (isPartialPayment)
    // 1) Yopilgan dealar — closedAt davr ichida (S yoki F)
    const closedDealsRating = await prisma.salesLead.findMany({
      where: {
        companyId,
        semanticId: { in: ["S", "F"] },
        closedAt: { gte: range.gte, lte: range.lte },
      },
      select: { responsibleManagerId: true, isSale: true, isPartialPayment: true, price: true },
    });
    const closedSales = closedDealsRating
      .filter((d) => d.isSale || d.isPartialPayment)
      .map((d) => ({
        responsibleManagerId: d.responsibleManagerId,
        price: d.price,
      }));

    // 2) Ochiq qisman to'lovlar — closedAt yo'q (semantic P), lekin partial=true
    //    Davr filter leadCreatedAt bo'yicha
    const openPartials = await prisma.salesLead.findMany({
      where: {
        companyId,
        isPartialPayment: true,
        semanticId: { notIn: ["S", "F"] },
        leadCreatedAt: { gte: range.gte, lte: range.lte },
      },
      select: { responsibleManagerId: true, price: true },
    });

    const salesRows = [...closedSales, ...openPartials];

    // Bugungi sotuv
    const utcNow = new Date();
    const tNow = new Date(utcNow.getTime() + TZ_OFFSET * 3600 * 1000);
    const y = tNow.getUTCFullYear();
    const m = tNow.getUTCMonth() + 1;
    const d = tNow.getUTCDate();
    // Bugungi sotuv — won (closedAt bugun) + qisman to'lov (leadCreatedAt bugun)
    const [todayClosed, todayPartial] = await Promise.all([
      prisma.salesLead.findMany({
        where: {
          companyId,
          semanticId: { in: ["S", "F"] },
          closedAt: {
            gte: tashkentStartOfDay(y, m, d),
            lte: tashkentEndOfDay(y, m, d),
          },
        },
        select: { responsibleManagerId: true, isSale: true, isPartialPayment: true },
      }),
      prisma.salesLead.findMany({
        where: {
          companyId,
          isPartialPayment: true,
          semanticId: { notIn: ["S", "F"] },
          leadCreatedAt: {
            gte: tashkentStartOfDay(y, m, d),
            lte: tashkentEndOfDay(y, m, d),
          },
        },
        select: { responsibleManagerId: true },
      }),
    ]);
    const todaySales = [
      ...todayClosed.filter((d) => d.isSale || d.isPartialPayment).map((d) => ({ responsibleManagerId: d.responsibleManagerId })),
      ...todayPartial,
    ];

    const rows = managers.map((mgr) => {
      const salesFor = salesRows.filter((r) => r.responsibleManagerId === mgr.id);
      // Yangi logika: qual = bu davrda yakunlangan dealar (won + lost)
      const qualifiedCount = closedDealsRating.filter(
        (r) => r.responsibleManagerId === mgr.id
      ).length;
      const salesCount = salesFor.length;
      // Price outlier'larni 0 bilan almashtiramiz (100M+ — data entry xato)
      const revenue = salesFor.reduce((s, r) => s + cleanPrice(r.price), 0);
      const todayCount = todaySales.filter(
        (r) => r.responsibleManagerId === mgr.id
      ).length;
      // Konv = sotuv / yakunlangan deal, har doim 0-100%
      const conversion =
        qualifiedCount > 0
          ? Math.round((salesCount / qualifiedCount) * 1000) / 10
          : 0;
      const plan = mgr.salesPlans[0];
      const target = plan?.target || 0;
      const fakt = mode === "amount" ? revenue : salesCount;
      const percent = target > 0 ? Math.round((fakt / target) * 100) : 0;
      const kpiPercent = mgr.kpiPercent || 0;
      // KPI summa = sotuv summasi × foiz / 100
      const kpiAmount = Math.round((revenue * kpiPercent) / 100);

      return {
        managerId: mgr.id,
        managerName: mgr.name,
        role: mgr.role,
        photoUrl: mgr.customPhotoUrl || mgr.photoUrl,
        plan: target,
        fakt,
        salesCount,
        revenue,
        conversion,
        todayCount,
        percent,
        kpiPercent,
        kpiAmount,
      };
    });

    rows.sort((a, b) => b.fakt - a.fakt);

    success(res, {
      mode,
      period: { key: period, from: range.gte.toISOString(), to: range.lte.toISOString() },
      planType,
      rows,
    });
  } catch (err) {
    console.error("Sales leaderboard error:", err);
    error(res, "Sotuv reytingini olishda xatolik");
  }
};
