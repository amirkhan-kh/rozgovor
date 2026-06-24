import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { syncBitrixManagers } from "../services/bitrix-managers-sync";

export const syncFromBitrix = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      error(res, "Company kerak", 400);
      return;
    }
    const result = await syncBitrixManagers(companyId);
    success(res, result);
  } catch (err) {
    console.error("Bitrix managers sync error:", err);
    error(res, "Sinxronlash xatosi: " + ((err as Error).message || "noma'lum"));
  }
};

// Radar chartlar uchun yagona sotuv sikli tartibi (soat yonalishida).
// Sotuv: Salom → Ehtiyoj → Mahsulot → E'tiroz → Bosim → Yakun → Kayfiyat → Aktiv
// Qayta: Kontekst → To'siq → Sabab → Qaror → Bosim → Closing → Kayfiyat → Aktiv
// docs/mezonlar.md (7 mezon, soat yo'nalishi 1..7):
// Sotuv:  Salom → Ehtiyoj(SOPRANO) → Taqdimot → E'tiroz → Bosim → Kayfiyat → Aktiv
// Qayta:  Salom → Kontekst eslatish → Taqdimot → E'tiroz → Bosim → Kayfiyat → Aktiv
const SALES_CYCLE_ORDER: Record<string, number> = {
  "Salomlashish va suhbatni boshlash": 1,
  "Salomlashish": 1,
  "Ehtiyojni aniqlash — SOPRANO texnikasi": 2,
  "Ehtiyojni aniqlash — SPIN texnikasi": 2,
  "Ehtiyojni aniqlash": 2,
  "Kontekstni eslatish": 2,
  "Kontekstni eslatish — oldingi suhbatga bog'lash": 2,
  "Kontekstni eslatish — oldingi suhbatga bog‘lash": 2,
  "Mahsulotni tushuntirish": 3,
  "Mahsulot taqdimoti": 3,
  "Taqdimot": 3,
  "Taqdimot — mahsulotni tushuntirish": 3,
  "E'tirozlar bilan ishlash": 4,
  "E'tiroz bilan ishlash": 4,
  "Bosim o'tkazish": 5,
  "Bosim — closing va keyingi qadamga olib kelish": 5,
  "Keyingi qadamga yo'naltirish": 5,
  "Yakunlash": 5,
  "Closing va keyingi qadamni kelishish": 5,
  "Kayfiyati": 6,
  "Kayfiyat": 6,
  "Kayfiyat — ovoz tonusi va energiya": 6,
  "Aktiv tinglash": 7,
};

// AI har xil prompt versiyalarida bir xil mezonga turli nom beradi —
// dublikatlarni birlashtirish uchun canonical nomga o'tkazamiz.
// Legacy nomlar (Ochilish, Yakunlash, Ehtiyojlarni aniqlash, Ochib berish va h.k.)
// kanonik 8-mezonlik to'plamga mapping qilinadi — qayta'da sotuv mezoni ko'rinmaydi.
const CANONICAL_CRITERION: Record<string, string> = {
  // Sotuv
  "Salomlashish va suhbatni boshlash": "Salomlashish",
  "Salomlashish": "Salomlashish",
  "Ochilish": "Salomlashish",
  "Ehtiyojni aniqlash — SOPRANO texnikasi": "Ehtiyojni aniqlash",
  "Ehtiyojni aniqlash — SPIN texnikasi": "Ehtiyojni aniqlash",
  "Ehtiyojni aniqlash": "Ehtiyojni aniqlash",
  "Ehtiyojlarni aniqlash": "Ehtiyojni aniqlash",
  "Qo‘shimcha ehtiyoj aniqlash": "Ehtiyojni aniqlash",
  "Qo'shimcha ehtiyoj aniqlash": "Ehtiyojni aniqlash",
  "Mahsulotni tushuntirish": "Mahsulotni tushuntirish",
  "Mahsulot taqdimoti": "Mahsulotni tushuntirish",
  "Mahsulot tanishtirish": "Mahsulotni tushuntirish",
  "Mahsulot to'liq tanishtirish": "Mahsulotni tushuntirish",
  "Taqdimot": "Mahsulotni tushuntirish",
  "Taqdimot — mahsulotni tushuntirish": "Mahsulotni tushuntirish",
  "Ochib berish": "Mahsulotni tushuntirish",
  "E'tirozlar bilan ishlash": "E'tirozlar bilan ishlash",
  "E'tiroz bilan ishlash": "E'tirozlar bilan ishlash",
  "Bosim o'tkazish": "Bosim o'tkazish",
  "Bosim — closing va keyingi qadamga olib kelish": "Bosim o'tkazish",
  "Keyingi qadamga yo'naltirish": "Bosim o'tkazish",
  "Keyingi qadamni belgilash": "Bosim o'tkazish",
  "Yakunlash": "Bosim o'tkazish",
  "Yakunlash va keyingi qadam": "Bosim o'tkazish",
  "Kayfiyati": "Kayfiyati",
  "Kayfiyat": "Kayfiyati",
  "Kayfiyat — ovoz tonusi va energiya": "Kayfiyati",
  "Aktiv tinglash": "Aktiv tinglash",
  // Qayta
  "Kontekstni eslatish": "Kontekstni eslatish",
  "Kontekstni eslatish — oldingi suhbatga bog'lash": "Kontekstni eslatish",
  "Kontekstni eslatish — oldingi suhbatga bog‘lash": "Kontekstni eslatish",
  "Oldingi to‘siqni tekshirish": "Oldingi to'siqni tekshirish",
  "Oldingi to'siqni tekshirish": "Oldingi to'siqni tekshirish",
  "Yangi sabab bilan chiqish": "Yangi sabab bilan chiqish",
  "Yechim taqdim etish": "Yangi sabab bilan chiqish",
  "Qaror holatini aniqlash": "Qaror holatini aniqlash",
  "Closing va keyingi qadamni kelishish": "Bosim o'tkazish",
};

const canonicalCriterion = (name: string): string =>
  CANONICAL_CRITERION[name] ?? name;

// Har bir kategoriya uchun mezon whitelist'i — boshqa kategoriyaning
// mezonlari (AI noto'g'ri qaytargan paytda) ko'rinmasin.
// 7 mezonli docs/mezonlar.md strukturasi.
const CATEGORY_CRITERIA: Record<string, Set<string>> = {
  sotuv: new Set([
    "Salomlashish",
    "Ehtiyojni aniqlash",
    "Mahsulotni tushuntirish",
    "E'tirozlar bilan ishlash",
    "Bosim o'tkazish",
    "Kayfiyati",
    "Aktiv tinglash",
  ]),
  // ProSales — Qayta uchun 5 mezon (DB sozlamasi bilan moslashtirilgan)
  qayta: new Set([
    "Kontekstni eslatish",
    "E'tirozlar bilan ishlash",
    "Bosim o'tkazish",
    "Kayfiyati",
    "Aktiv tinglash",
  ]),
};

const filterByCategory = (
  category: string,
  criteria: Array<{ name: string; score: number }>
): Array<{ name: string; score: number }> => {
  const allow = CATEGORY_CRITERIA[category];
  if (!allow) return criteria;
  return criteria.filter((c) => allow.has(c.name));
};

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    // Sana filtri — period=month bo'lsa joriy oy 1-sanasidan
    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const now = new Date();
    let dateRange: { gte?: Date; lte?: Date } | null = null;
    if (period === "today") {
      dateRange = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
    } else if (period === "week") {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      dateRange = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff) };
    } else if (period === "month") {
      dateRange = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    } else if (period === "quarter") {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      dateRange = { gte: new Date(now.getFullYear(), qStart, 1) };
    } else if (period === "year") {
      dateRange = { gte: new Date(now.getFullYear(), 0, 1) };
    } else if (period === "custom") {
      const range: { gte?: Date; lte?: Date } = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) { const e = new Date(dateTo); e.setHours(23,59,59,999); range.lte = e; }
      dateRange = Object.keys(range).length > 0 ? range : null;
    }

    const managers = await prisma.manager.findMany({
      where: {
        companyId: req.companyId,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: {
        _count: { select: { audioFiles: true } },
      },
    });

    // Enrich each manager with stats
    const enriched = await Promise.all(
      managers.map(async (manager) => {
        // Qo'ng'iroqlar — createdAt bo'yicha
        const callsWhere: Record<string, unknown> = { managerId: manager.id };
        if (dateRange) callsWhere.createdAt = dateRange;
        const totalCalls = await prisma.audioFile.count({ where: callsWhere });

        const doneFiles = await prisma.audioFile.findMany({
          where: { ...callsWhere, status: "done" },
          include: { analysis: { select: { overallScore: true, judgeSkipped: true } } },
        });
        const analyzedCalls = doneFiles.length;

        // ⭐ Konversiya to'g'ri hisoblanishi uchun: unique leads called vs unique leads sold
        // Ikkalasi ham shu menejer qo'ng'iroq qilgan lead'lar to'plamidan — 100% dan oshmaydi
        const calledLeads = await prisma.audioFile.findMany({
          where: { ...callsWhere, leadId: { not: null } },
          select: { leadId: true },
          distinct: ["leadId"],
        });
        const uniqueLeadsCount = calledLeads.length;

        // Sotuvlar — saleResponsibleManagerId bo'yicha (kim mas'ul), date range saleClosedAt
        // Bu yondashuv kompaniya jami sotuvini takrorlamasdan taqsimlaydi
        const saleAggregations = await prisma.audioFile.findMany({
          where: {
            companyId: req.companyId,
            saleResponsibleManagerId: manager.id,
            leadId: { not: null },
            ...(dateRange ? { saleClosedAt: dateRange } : {}),
          },
          select: { leadId: true, saleAmount: true },
          distinct: ["leadId"],
        });
        const sales = saleAggregations.length;
        const saleAmount = saleAggregations.reduce(
          (sum, f) => sum + (f.saleAmount || 0),
          0,
        );

        const scores = doneFiles.filter((f) => f.analysis && !(f.analysis as any).judgeSkipped).map((f) => f.analysis!.overallScore);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
        // Konversiya = sotilgan unique lead'lar / qo'ng'iroq qilingan unique lead'lar
        const conversionRate =
          uniqueLeadsCount > 0
            ? Math.round((sales / uniqueLeadsCount) * 100 * 10) / 10
            : 0;

        // Kategoriyalar — xuddi qo'ng'iroqlar kabi sana filtrida
        const allFiles = await prisma.audioFile.findMany({
          where: callsWhere,
          select: { category: true },
        });
        const birinchiQongiroq = allFiles.filter(f => f.category === "sotuv").length;
        const qayta = allFiles.filter(f => f.category === "qayta").length;
        const boshqa = allFiles.filter(f => f.category === "boshqa").length;

        return {
          ...manager,
          totalCalls,
          analyzedCalls,
          sales,
          saleAmount,
          avgScore,
          conversionRate,
          birinchiQongiroq,
          qayta,
          boshqa,
        };
      })
    );

    success(res, enriched);
  } catch (err) {
    console.error("Get managers error:", err);
    error(res, "Menejerlarni olishda xatolik");
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password, role, canViewDashboard, canViewAll, canViewRating } = req.body;

    if (!name || !email) {
      error(res, "Ism va email kiritilishi shart", 400);
      return;
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

    const manager = await prisma.manager.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || "manager",
        canViewDashboard: canViewDashboard ?? false,
        canViewAll: canViewAll ?? false,
        canViewRating: canViewRating ?? false,
        companyId: req.companyId!,
      },
    });

    success(res, manager, 201);
  } catch (err) {
    console.error("Create manager error:", err);
    error(res, "Menejer yaratishda xatolik");
  }
};

export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, email, password, role, canViewDashboard, canViewAll, canViewRating } = req.body;

    const manager = await prisma.manager.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!manager) {
      error(res, "Menejer topilmadi", 404);
      return;
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined;

    const updated = await prisma.manager.update({
      where: { id },
      data: {
        name,
        email,
        ...(hashedPassword && { password: hashedPassword }),
        ...(role !== undefined && { role }),
        ...(canViewDashboard !== undefined && { canViewDashboard }),
        ...(canViewAll !== undefined && { canViewAll }),
        ...(canViewRating !== undefined && { canViewRating }),
      },
    });

    success(res, updated);
  } catch (err) {
    console.error("Update manager error:", err);
    error(res, "Menejerni yangilashda xatolik");
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const manager = await prisma.manager.findFirst({
      where: { id, companyId: req.companyId },
      include: { _count: { select: { audioFiles: true } } },
    });

    if (!manager) {
      error(res, "Menejer topilmadi", 404);
      return;
    }

    if (manager._count.audioFiles > 0) {
      error(res, "Bu menejerga audio fayllar biriktirilgan, o'chirib bo'lmaydi", 400);
      return;
    }

    await prisma.manager.delete({ where: { id } });

    success(res, { message: "Menejer o'chirildi" });
  } catch (err) {
    console.error("Delete manager error:", err);
    error(res, "Menejerni o'chirishda xatolik");
  }
};

export const getManagerDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Period filter — getAll'dagi bilan bir xil
    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const now = new Date();
    let dateRange: { gte?: Date; lte?: Date } | null = null;
    if (period === "today") {
      dateRange = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) };
    } else if (period === "week") {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      dateRange = { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff) };
    } else if (period === "month") {
      dateRange = { gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    } else if (period === "quarter") {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      dateRange = { gte: new Date(now.getFullYear(), qStart, 1) };
    } else if (period === "year") {
      dateRange = { gte: new Date(now.getFullYear(), 0, 1) };
    } else if (period === "custom") {
      const range: { gte?: Date; lte?: Date } = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) { const e = new Date(dateTo); e.setHours(23,59,59,999); range.lte = e; }
      dateRange = Object.keys(range).length > 0 ? range : null;
    } else if (period === "all") {
      dateRange = null;
    }

    const manager = await prisma.manager.findFirst({
      where: { id, companyId: req.companyId },
      include: { _count: { select: { audioFiles: true } } },
    });

    if (!manager) {
      error(res, "Menejer topilmadi", 404);
      return;
    }

    // Qo'ng'iroqlar — createdAt bo'yicha filterlash
    const callsWhere: Record<string, unknown> = { managerId: id };
    if (dateRange) callsWhere.createdAt = dateRange;

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...callsWhere, status: "done" },
      include: { analysis: { select: { overallScore: true, leadQuality: true, leadScore: true, criteria: true, judgeSkipped: true } } },
    });

    const totalCalls = await prisma.audioFile.count({ where: callsWhere });
    const analyzedCalls = audioFiles.length;

    // Unique leads — shu menejer qo'ng'iroq qilganlari (period ichida)
    const calledLeads = await prisma.audioFile.findMany({
      where: { ...callsWhere, leadId: { not: null } },
      select: { leadId: true },
      distinct: ["leadId"],
    });
    const uniqueLeadsCount = calledLeads.length;

    // Sotuvlar — saleResponsibleManagerId bo'yicha (kim mas'ul) + saleClosedAt period
    const salesFiles = await prisma.audioFile.findMany({
      where: {
        companyId: req.companyId,
        saleResponsibleManagerId: id,
        leadId: { not: null },
        ...(dateRange ? { saleClosedAt: dateRange } : {}),
      },
      select: { leadId: true, saleAmount: true },
      distinct: ["leadId"],
    });
    const sales = salesFiles.length;
    const saleAmount = salesFiles.reduce((sum, f) => sum + (f.saleAmount || 0), 0);

    const scores = audioFiles.filter((f) => f.analysis && !(f.analysis as any).judgeSkipped).map((f) => f.analysis!.overallScore);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    // Konversiya — unique leads bo'yicha (100% dan oshmaydi)
    const conversionRate =
      uniqueLeadsCount > 0
        ? Math.round((sales / uniqueLeadsCount) * 100 * 10) / 10
        : 0;

    // Category breakdown — period ichida
    const allManagerFiles = await prisma.audioFile.findMany({
      where: callsWhere,
      select: { category: true, status: true },
    });
    const birinchiQongiroq = allManagerFiles.filter(f => f.category === "sotuv").length;
    const qayta = allManagerFiles.filter(f => f.category === "qayta").length;
    const boshqa = allManagerFiles.filter(f => f.category === "boshqa").length;

    success(res, {
      ...manager,
      totalCalls,
      analyzedCalls,
      sales,
      saleAmount,
      avgScore,
      conversionRate,
      birinchiQongiroq,
      qayta,
      boshqa,
      audioCount: manager._count.audioFiles,
    });
  } catch (err) {
    console.error("Get manager detail error:", err);
    error(res, "Menejer tafsilotlarini olishda xatolik");
  }
};

export const archive = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const manager = await prisma.manager.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!manager) {
      error(res, "Menejer topilmadi", 404);
      return;
    }

    const updated = await prisma.manager.update({
      where: { id },
      data: { isActive: !manager.isActive },
    });

    success(res, updated);
  } catch (err) {
    console.error("Archive manager error:", err);
    error(res, "Menejerni arxivlashda xatolik");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Manager Growth Card — QA vs Konversiya + Top Performer Gap
// ─────────────────────────────────────────────────────────────────────────────
export const getGrowthCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId;
    const { id: managerId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Manager ma'lumotlari
    const manager = await prisma.manager.findFirst({
      where: { id: managerId, companyId },
      select: { id: true, name: true },
    });
    if (!manager) {
      error(res, "Menejer topilmadi", 404);
      return;
    }

    // Shu menejerning qo'ng'iroqlari
    const files = await prisma.audioFile.findMany({
      where: { companyId, managerId, status: "done", createdAt: { gte: since } },
      select: {
        isSale: true,
        createdAt: true,
        analysis: {
          select: {
            overallScore: true,
            criteria: true,
            errors: true,
            managerSpeech: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const totalCalls = files.length;
    // Unique leads — avvalgi bug'ni (calls vs distinct leads) oldini oladi
    const calledLeads = await prisma.audioFile.findMany({
      where: { companyId, managerId, createdAt: { gte: since }, leadId: { not: null } },
      select: { leadId: true },
      distinct: ["leadId"],
    });
    const uniqueLeads = calledLeads.length;
    const soldLeads = await prisma.audioFile.findMany({
      where: {
        companyId,
        managerId,
        isSale: true,
        leadId: { not: null },
        createdAt: { gte: since },
      },
      select: { leadId: true },
      distinct: ["leadId"],
    });
    const salesCount = soldLeads.length;
    const conversionRate =
      uniqueLeads > 0 ? Math.round((salesCount / uniqueLeads) * 100 * 10) / 10 : 0;
    const avgQaScore = totalCalls > 0
      ? Math.round(files.reduce((s, f) => s + (f.analysis?.overallScore || 0), 0) / totalCalls)
      : 0;

    // Mezonlar bo'yicha o'rtacha
    const critAcc: Record<string, { sum: number; count: number }> = {};
    for (const f of files) {
      const crit = (f.analysis?.criteria as Record<string, { score: number }>) || {};
      for (const [name, val] of Object.entries(crit)) {
        if (!critAcc[name]) critAcc[name] = { sum: 0, count: 0 };
        critAcc[name].sum += val.score || 0;
        critAcc[name].count += 1;
      }
    }
    const criteriaAvgs = Object.entries(critAcc)
      .map(([name, v]) => ({ name, avg: Math.round(v.sum / v.count) }))
      .sort((a, b) => a.avg - b.avg);

    const weakAreas = criteriaAvgs.slice(0, 3).map((c) => c.name);
    const strengthAreas = criteriaAvgs.slice(-3).reverse().map((c) => c.name);

    // Haftalik progress (oxirgi 7 hafta)
    const weeklyProgress: Array<{ week: string; avgScore: number; conversion: number }> = [];
    const weekMap: Record<string, { scores: number[]; sales: number; total: number }> = {};
    for (const f of files) {
      const d = new Date(f.createdAt);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay() + 1);
      const key = weekStart.toISOString().split("T")[0];
      if (!weekMap[key]) weekMap[key] = { scores: [], sales: 0, total: 0 };
      weekMap[key].scores.push(f.analysis?.overallScore || 0);
      weekMap[key].total += 1;
      if (f.isSale) weekMap[key].sales += 1;
    }
    const sortedWeeks = Object.entries(weekMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8);
    for (const [week, data] of sortedWeeks) {
      weeklyProgress.push({
        week,
        avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
        conversion: Math.round((data.sales / data.total) * 100),
      });
    }

    // Top performer playbook
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { topPerformerPlaybook: true },
    });
    const playbook = company?.topPerformerPlaybook as Record<string, any> | null;

    // Elite gap — TUSHUNARLI va FOYDALI taqqoslash
    let eliteGap = null;
    let topLearning = null;
    // Eski format va yangi byConversion format'ni qo'llab-quvvatlash
    const topPlaybook = (playbook?.byConversion || playbook) as Record<string, any> | null;
    if (topPlaybook && topPlaybook.managerId !== managerId) {
      const topConversion = topPlaybook.conversionRate || 0;
      const myAvgSpeech = totalCalls > 0
        ? Math.round(files.reduce((s, f) => s + (f.analysis?.managerSpeech || 0), 0) / totalCalls)
        : 50;
      const topAvgSpeech = topPlaybook.avgManagerSpeech || 50;
      const speechDiff = myAvgSpeech - topAvgSpeech;

      // Real fark hisoblash
      const conversionGap = Math.round((topConversion - conversionRate) * 10) / 10;
      const lostDealsEstimate = totalCalls > 0
        ? Math.round((conversionGap / 100) * totalCalls)
        : 0;

      // Tushunarli, aniq farq xulosasi
      const differences: string[] = [];
      if (speechDiff > 5) {
        differences.push(`Siz mijozdan ${speechDiff}% ko'p gapiryapsiz — ${topPlaybook.managerName} esa mijozni gapirtiradi`);
      } else if (speechDiff < -5) {
        differences.push(`${topPlaybook.managerName} sizdan ko'proq gapiradi — lekin sifatli savol bilan, monolog qilib emas`);
      }

      const topTechCount = (topPlaybook.techniques || []).length;
      if (topTechCount > 0) {
        differences.push(`${topPlaybook.managerName} har qo'ng'iroqda ${topTechCount} ta aniq texnika qo'llaydi (sizda hozir struktura yo'q)`);
      }

      const topObjCount = (topPlaybook.objectionHandling || []).length;
      if (topObjCount > 0) {
        differences.push(`${topPlaybook.managerName} ${topObjCount} xil e'tirozga tayyorlangan javoblari bor — siz e'tirozda taslim bo'lyapsiz`);
      }

      // Eng muhim 3 ta texnika nusxalanishi uchun
      const topTechniques = (topPlaybook.techniques || []).slice(0, 3).map((t: any) => ({
        name: t.name || "",
        example: t.example || "",
        frequency: t.frequency || "",
      }));

      // Top performer'ning real iboralari
      const keyPhrases = (topPlaybook.keyPhrases || []).slice(0, 5);

      // E'tirozlar javoblari
      const objectionResponses = (topPlaybook.objectionHandling || []).slice(0, 3).map((o: any) => ({
        objectionType: o.objectionType || "",
        response: o.response || "",
      }));

      // "Bu hafta nusxa olsangiz bo'ladi" — eng muhim 3 ta amaliy harakat
      const actionableSteps: string[] = [];
      if (speechDiff > 5) {
        actionableSteps.push(`Har qo'ng'iroqda kamida 3 ta ochiq savol bering — mijoz gapirsin (${topPlaybook.managerName} 50/50 nisbatda gapiradi)`);
      }
      if (topTechniques[0]) {
        actionableSteps.push(`"${topTechniques[0].name}" texnikasini sinab ko'ring: ${topTechniques[0].example}`);
      }
      if (objectionResponses[0]) {
        actionableSteps.push(`"${objectionResponses[0].objectionType}" e'tirozi kelsa, ${topPlaybook.managerName} bunday javob beradi: "${objectionResponses[0].response}"`);
      }
      if (actionableSteps.length === 0 && keyPhrases.length > 0) {
        actionableSteps.push(`Mana shu iborani ishlab ko'ring: "${keyPhrases[0]}"`);
      }

      eliteGap = {
        topPerformerName: topPlaybook.managerName,
        topPerformerConversion: topConversion,
        topPerformerSales: topPlaybook.salesCount || 0,
        topPerformerCalls: topPlaybook.totalCalls || 0,
        myConversion: conversionRate,
        gap: conversionGap,
        lostDealsEstimate,
        myAvgSpeech,
        topPerformerAvgSpeech: topAvgSpeech,
        differences,
        topTechniques,
        keyPhrases,
        objectionResponses,
        actionableSteps,
        closingStyle: topPlaybook.closingStyle || "",
        // Backward compat
        mainDifference: differences[0] || `${topPlaybook.managerName} qo'ng'iroqlarini ko'rib chiqing va texnikalarini o'rganing.`,
      };

      // Top learning — eng zaif mezon + top performer shunday qiladi
      const weakestCriteria = criteriaAvgs[0];
      if (weakestCriteria) {
        const relatedTechnique = (topPlaybook.techniques || []).find((t: any) =>
          t.name.toLowerCase().includes(weakestCriteria.name.toLowerCase().slice(0, 5))
        ) || (topPlaybook.techniques || [])[0];

        topLearning = {
          skill: weakestCriteria.name,
          currentScore: weakestCriteria.avg,
          practiceScript: relatedTechnique?.example || keyPhrases[0] || "",
          technique: relatedTechnique?.name || "",
        };
      }
    }

    // Asosiy muammo va quickFix
    const avgMgrSpeech = totalCalls > 0
      ? Math.round(files.reduce((s, f) => s + (f.analysis?.managerSpeech || 0), 0) / totalCalls)
      : 50;
    const surrenderCount = files.filter((f) =>
      ((f.analysis?.errors as any[]) || []).some((e: any) => e.type === "E'tirozga javob berilmadi")
    ).length;
    const openEndingCount = files.filter((f) =>
      ((f.analysis?.errors as any[]) || []).some((e: any) => e.type === "Yakunlash zaif")
    ).length;

    let mainIssue = "";
    let quickFix = "";
    if (avgMgrSpeech > 70) {
      mainIssue = `Siz haddan ko'p gapirmoqdasiz (${avgMgrSpeech}%). Mijoz eshitilmayapti.`;
      quickFix = "Har qo'ng'iroqda 3 ta savol bering va mijozni kamida 2 daqiqa gapirtiring.";
    } else if (surrenderCount > totalCalls * 0.4) {
      mainIssue = `E'tirozlarda ${Math.round((surrenderCount / totalCalls) * 100)}% taslim bo'lyapsiz.`;
      quickFix = "E'tiroz kelganda 'Tushunaman' deyin, keyin darhol yechim taklif qiling.";
    } else if (openEndingCount > totalCalls * 0.2) {
      mainIssue = `${Math.round((openEndingCount / totalCalls) * 100)}% qo'ng'iroq keyingi qadamsiz tugamoqda.`;
      quickFix = "Har qo'ng'iroq 'Xo'sh, ertaga soat 15:00da bo'sh bo'lasizmi?' bilan tugasin.";
    } else if (weakAreas.length > 0) {
      mainIssue = `${weakAreas[0]} ko'nikmasi zaif (${criteriaAvgs[0]?.avg || 0}%).`;
      quickFix = topLearning?.practiceScript
        ? `Bu iborani ishlab ko'ring: "${topLearning.practiceScript}"`
        : `${weakAreas[0]} bo'yicha mashq qiling.`;
    }

    success(res, {
      managerId,
      managerName: manager.name,
      period: `${days} kun`,
      totalCalls,
      salesCount,
      qaScore: avgQaScore,
      conversionRate,
      avgManagerSpeech: avgMgrSpeech,
      strengthAreas,
      weakAreas,
      mainIssue,
      quickFix,
      eliteGap,
      topLearning,
      weeklyProgress,
    });
  } catch (err) {
    console.error("Growth card error:", err);
    error(res, "Growth card yuklashda xatolik");
  }
};

// ─── Menejerlar Audit paneli (FIFA-style cards) ────────────────────────
// Har menejer uchun: umumiy ball, umumiy/o'rtacha gaplashish vaqti,
// sotuv soni (sdelka), mezon bo'yicha radar chart ma'lumotlari.
// Filter: period (today/week/month/custom) + category (sotuv/qayta/all)
export const getManagersAudit = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const category = (req.query.category as string) || "all"; // sotuv | qayta | all

    // Tashkent TZ + dateRange (o'xshash getAll helperi yo'qligidan inline)
    const TZ_OFFSET = 5;
    const tashkentStartOfDay = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m - 1, d, -TZ_OFFSET, 0, 0));
    const tashkentEndOfDay = (y: number, m: number, d: number) =>
      new Date(Date.UTC(y, m - 1, d, 23 - TZ_OFFSET, 59, 59, 999));
    const now = new Date(Date.now() + TZ_OFFSET * 3600 * 1000);
    const y = now.getUTCFullYear(), mm = now.getUTCMonth() + 1, dd = now.getUTCDate();
    let dateRange: { gte: Date; lte: Date } | null = null;
    if (period === "today") {
      dateRange = { gte: tashkentStartOfDay(y, mm, dd), lte: tashkentEndOfDay(y, mm, dd) };
    } else if (period === "week") {
      const day = now.getUTCDay();
      const diff = day === 0 ? 6 : day - 1;
      const mon = new Date(Date.UTC(y, mm - 1, dd - diff));
      dateRange = {
        gte: tashkentStartOfDay(mon.getUTCFullYear(), mon.getUTCMonth() + 1, mon.getUTCDate()),
        lte: tashkentEndOfDay(y, mm, dd),
      };
    } else if (period === "month") {
      dateRange = { gte: tashkentStartOfDay(y, mm, 1), lte: tashkentEndOfDay(y, mm, dd) };
    } else if (period === "custom" && dateFrom) {
      const [yy, mmonth, dday] = dateFrom.split("-").map(Number);
      const gte = yy && mmonth && dday ? tashkentStartOfDay(yy, mmonth, dday) : tashkentStartOfDay(y, mm, 1);
      let lte = tashkentEndOfDay(y, mm, dd);
      if (dateTo) {
        const [y2, m2, d2] = dateTo.split("-").map(Number);
        if (y2 && m2 && d2) lte = tashkentEndOfDay(y2, m2, d2);
      }
      dateRange = { gte, lte };
    }

    // Filter qo'shimcha parametrlar
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const pipelineIdsRaw = req.query.pipelineIds;
    const sourceIdsRaw = req.query.sourceIds;
    const pipelineIds = (() => {
      if (!pipelineIdsRaw || typeof pipelineIdsRaw !== "string") return null;
      const arr = pipelineIdsRaw
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n));
      return arr.length > 0 ? arr : null;
    })();
    const sourceIds = (() => {
      if (!sourceIdsRaw || typeof sourceIdsRaw !== "string") return null;
      const arr = sourceIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return arr.length > 0 ? arr : null;
    })();

    // Pipeline va source bo'yicha audio'ga bog'liq menejer ID'larini topamiz —
    // shu menejerlar SalesLead ichida tegishli pipeline/sourceda ish qilgan.
    let allowedManagerIds: string[] | null = null;
    if (pipelineIds || sourceIds) {
      // Source filter — bitrixLeadId to'plami orqali deal'larni cheklaymiz
      let bitrixLeadIds: number[] | null = null;
      if (sourceIds) {
        const leads = await prisma.lead.findMany({
          where: { companyId, sourceId: { in: sourceIds } },
          select: { bitrixLeadId: true },
          distinct: ["bitrixLeadId"],
        });
        bitrixLeadIds = leads
          .map((l) => l.bitrixLeadId)
          .filter((v): v is number => v !== null);
      }
      const slWhere: Record<string, unknown> = { companyId };
      if (pipelineIds) slWhere.pipelineId = { in: pipelineIds };
      if (bitrixLeadIds) {
        slWhere.originalLeadId =
          bitrixLeadIds.length > 0 ? { in: bitrixLeadIds } : { in: [-1] };
      }
      const sl = await prisma.salesLead.findMany({
        where: slWhere,
        select: { responsibleManagerId: true },
        distinct: ["responsibleManagerId"],
      });
      allowedManagerIds = sl
        .map((r) => r.responsibleManagerId)
        .filter((v): v is string => v !== null);
    }

    const managers = await prisma.manager.findMany({
      where: {
        companyId,
        isActive: true,
        ...(allowedManagerIds ? { id: { in: allowedManagerIds } } : {}),
        ...(search
          ? { name: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true },
    });

    const audioWhere: Record<string, unknown> = { companyId, status: "done" };
    if (dateRange) audioWhere.createdAt = dateRange;
    if (category !== "all") audioWhere.category = category;
    if (allowedManagerIds)
      audioWhere.managerId = { in: allowedManagerIds };

    const audios = await prisma.audioFile.findMany({
      where: audioWhere,
      select: {
        managerId: true,
        duration: true,
        isSale: true,
        analysis: { select: { overallScore: true, criteria: true } },
      },
    });

    const rows = managers.map((m) => {
      const own = audios.filter((a) => a.managerId === m.id);
      const withAnalysis = own.filter((a) => a.analysis);
      const callCount = own.length;
      const dealCount = own.filter((a) => a.isSale).length;
      const totalTalkTime = own.reduce((s, a) => s + (a.duration || 0), 0);
      const avgTalkTime = callCount > 0 ? Math.round(totalTalkTime / callCount) : 0;
      const overallScore =
        withAnalysis.length > 0
          ? Math.round(
              withAnalysis.reduce((s, a) => s + (a.analysis?.overallScore || 0), 0) /
                withAnalysis.length
            )
          : 0;

      // Radar chart uchun mezon bo'yicha o'rtacha — canonical nom bilan dublikatlar birlashtirildi
      const criteriaMap = new Map<string, { sum: number; count: number }>();
      for (const a of withAnalysis) {
        const crit = a.analysis?.criteria as Record<string, { score?: number }> | null;
        if (!crit || typeof crit !== "object") continue;
        for (const [name, val] of Object.entries(crit)) {
          if (!val || typeof val.score !== "number") continue;
          const canonical = canonicalCriterion(name);
          const cur = criteriaMap.get(canonical) || { sum: 0, count: 0 };
          cur.sum += val.score;
          cur.count += 1;
          criteriaMap.set(canonical, cur);
        }
      }
      const criteriaScoresAll = [...criteriaMap.entries()]
        .map(([name, v]) => ({ name, score: Math.round(v.sum / v.count) }))
        .sort(
          (a, b) =>
            (SALES_CYCLE_ORDER[a.name] ?? 99) - (SALES_CYCLE_ORDER[b.name] ?? 99)
        );
      // Faqat shu kategoriyaga tegishli mezonlar (kross-kategoriya filtrlanadi)
      const criteriaScores = filterByCategory(category, criteriaScoresAll);

      return {
        managerId: m.id,
        managerName: m.name,
        role: m.role,
        photoUrl: m.photoUrl,
        callCount,
        dealCount,
        totalTalkTime,
        avgTalkTime,
        overallScore,
        criteriaScores,
      };
    })
      .filter((r) => r.callCount > 0)
      .sort((a, b) => b.overallScore - a.overallScore);

    success(res, {
      period: { key: period, from: dateRange?.gte.toISOString() || null, to: dateRange?.lte.toISOString() || null },
      category,
      managers: rows,
    });
  } catch (err) {
    console.error("Managers audit error:", err);
    error(res, "Menejerlar audit ma'lumotlarini olishda xatolik");
  }
};
