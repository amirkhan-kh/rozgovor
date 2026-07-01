import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

// Known pipelines that should always appear even without audio
const KNOWN_PIPELINES = ["Воронка", "VSL", "Retention", "Zebo", "Bexruz Test"];

// In-memory archive store (persists per process lifetime; replace with DB table if needed)
const archivedVoronkas: Map<string, Date> = new Map();

const getActiveManagerIds = async (companyId: string): Promise<string[]> => {
  const activeManagers = await prisma.manager.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
  });
  return activeManagers.map((m) => m.id);
};

const getDateRange = (period: string, dateFrom?: string, dateTo?: string): { gte?: Date; lte?: Date } | null => {
  const now = new Date();

  switch (period) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { gte: start };
    }
    case "yesterday": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { gte: start, lte: end };
    }
    case "week": {
      // "Bu hafta" = Bitrix "Последние 7 дней": today-7 dan bugungacha.
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      return { gte: start };
    }
    case "month": {
      // Joriy oy 1-sanasidan boshlanadi — har oy boshida nol dan boshlanadi
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { gte: start };
    }
    case "quarter": {
      const qStart = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qStart, 1);
      return { gte: start };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { gte: start };
    }
    case "custom": {
      const range: { gte?: Date; lte?: Date } = {};
      if (dateFrom) range.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.lte = end;
      }
      return Object.keys(range).length > 0 ? range : null;
    }
    default:
      return null;
  }
};

const buildWhere = async (req: Request, pipelineName?: string) => {
  const period = (req.query.period as string) || "month";
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const managerId = req.query.managerId as string;

  const activeIds = await getActiveManagerIds(req.companyId!);

  const where: Record<string, unknown> = {
    companyId: req.companyId,
    managerId: { in: activeIds },
  };

  const dateRange = getDateRange(period, dateFrom, dateTo);
  if (dateRange) where.createdAt = dateRange;
  if (managerId && managerId !== "all") where.managerId = managerId;

  const category = req.query.category as string;
  if (category) where.category = category;

  if (pipelineName) where.pipelineName = pipelineName;

  return where;
};

// GET /voronka — List all pipelines with stats
export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const showArchived = req.query.showArchived === "true";
    const activeIds = await getActiveManagerIds(req.companyId!);

    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const dateRange = getDateRange(period, dateFrom, dateTo);

    // (1) Qo'ng'iroqlar statistikasi — createdAt (sync vaqti) bo'yicha filtr
    const callsWhere: Record<string, unknown> = {
      companyId: req.companyId,
      managerId: { in: activeIds },
      pipelineName: { not: null },
    };
    if (dateRange) callsWhere.createdAt = dateRange;

    const audioFiles = await prisma.audioFile.findMany({
      where: callsWhere,
      include: { analysis: { select: { overallScore: true } } },
    });

    // (2) Sotuvlar — saleClosedAt (AmoCRM closed_at) bo'yicha filtr, distinct leadId
    // Bu AmoCRM bilan bir xil — "Дата платежа" filter
    // MUHIM: saleResponsibleManagerId ishlatiladi (faqat aktiv managerlar sotuvini sanash uchun)
    const salesWhere: Record<string, unknown> = {
      companyId: req.companyId,
      saleResponsibleManagerId: { in: activeIds },
      pipelineName: { not: null },
      isSale: true,
      leadId: { not: null },
    };
    if (dateRange) salesWhere.saleClosedAt = dateRange;

    const salesLeads = await prisma.audioFile.findMany({
      where: salesWhere,
      select: { leadId: true, pipelineName: true, saleAmount: true },
      distinct: ["leadId"],
    });

    // Sotuvlarni pipeline'lar bo'yicha guruhlash
    const salesByPipeline: Record<string, { count: number; amount: number }> = {};
    for (const s of salesLeads) {
      const name = s.pipelineName || "";
      if (!name) continue;
      if (!salesByPipeline[name]) salesByPipeline[name] = { count: 0, amount: 0 };
      salesByPipeline[name].count++;
      salesByPipeline[name].amount += s.saleAmount || 0;
    }

    // Pipeline'lar bo'yicha qo'ng'iroqlarni guruhlash
    const pipelineMap: Record<string, typeof audioFiles> = {};
    for (const file of audioFiles) {
      const name = (file as Record<string, unknown>).pipelineName as string;
      if (!name) continue;
      if (!pipelineMap[name]) pipelineMap[name] = [];
      pipelineMap[name].push(file);
    }

    // Known pipelines
    for (const knownName of KNOWN_PIPELINES) {
      if (!pipelineMap[knownName]) pipelineMap[knownName] = [];
    }
    // Sotuvdagi pipelines ham bo'lishi kerak (qo'ng'iroqsiz sotuvlar)
    for (const pname of Object.keys(salesByPipeline)) {
      if (!pipelineMap[pname]) pipelineMap[pname] = [];
    }

    const pipelines = Object.entries(pipelineMap).map(([name, files]) => {
      const totalCalls = files.length;
      const analyzedCalls = files.filter((f) => f.status === "done").length;
      const birinchiQongiroq = files.filter((f) => f.category === "sotuv").length;
      const qayta = files.filter((f) => f.category === "qayta").length;
      const boshqa = files.filter((f) => f.category === "boshqa").length;

      const scores = files
        .map((f) => f.analysis?.overallScore)
        .filter((s): s is number => s !== undefined);
      const avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

      const salesStats = salesByPipeline[name] || { count: 0, amount: 0 };
      const sotuv = salesStats.count;
      const saleAmount = salesStats.amount;

      const conversionRate = totalCalls > 0
        ? Math.round((sotuv / totalCalls) * 100 * 10) / 10
        : 0;

      const isArchived = archivedVoronkas.has(name);

      return {
        name,
        totalCalls,
        analyzedCalls,
        sotuv,
        birinchiQongiroq,
        qayta,
        boshqa,
        avgScore,
        conversionRate,
        saleAmount,
        isArchived,
      };
    });

    const filtered = showArchived ? pipelines : pipelines.filter((p) => !p.isArchived);
    filtered.sort((a, b) => b.totalCalls - a.totalCalls);

    success(res, filtered);
  } catch (err) {
    console.error("Voronka getAll error:", err);
    error(res, "Voronkalar ro'yxatini olishda xatolik");
  }
};

// PUT /voronka/:name/archive — Toggle archive status
export const toggleArchive = async (req: Request, res: Response): Promise<void> => {
  try {
    const pipelineName = decodeURIComponent(req.params.name);

    if (archivedVoronkas.has(pipelineName)) {
      archivedVoronkas.delete(pipelineName);
      success(res, { name: pipelineName, isArchived: false });
    } else {
      archivedVoronkas.set(pipelineName, new Date());
      success(res, { name: pipelineName, isArchived: true });
    }
  } catch (err) {
    console.error("Voronka archive toggle error:", err);
    error(res, "Voronka arxivlashda xatolik");
  }
};

// GET /voronka/:name — Pipeline detail stats
export const getDetail = async (req: Request, res: Response): Promise<void> => {
  try {
    const pipelineName = decodeURIComponent(req.params.name);
    const where = await buildWhere(req, pipelineName);

    // Jami (barcha status)
    const allFilesCount = await prisma.audioFile.count({ where });

    // Tahlil qilingan (done)
    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: {
        analysis: { select: { overallScore: true } },
        manager: { select: { id: true, name: true } },
      },
    });

    const totalCalls = allFilesCount;
    const analyzedCalls = audioFiles.length;
    const scores = audioFiles
      .map((f) => f.analysis?.overallScore)
      .filter((s): s is number => s !== undefined);

    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    const topIdx = scores.indexOf(Math.max(...scores, 0));
    const topScore = topIdx >= 0
      ? { score: scores[topIdx], date: audioFiles[topIdx].createdAt.toISOString() }
      : { score: 0, date: "" };

    // Growth rate (vs previous period)
    const period = (req.query.period as string) || "month";
    const dateRange = getDateRange(period, req.query.dateFrom as string, req.query.dateTo as string);
    let growthRate = 0;
    if (dateRange?.gte) {
      const currentStart = dateRange.gte.getTime();
      const periodLength = Date.now() - currentStart;
      const prevStart = new Date(currentStart - periodLength);

      const prevFiles = await prisma.audioFile.findMany({
        where: {
          companyId: req.companyId,
          pipelineName,
          status: "done",
          createdAt: { gte: prevStart, lt: dateRange.gte },
        },
        include: { analysis: { select: { overallScore: true } } },
      });
      const prevScores = prevFiles.map((f) => f.analysis?.overallScore).filter((s): s is number => s !== undefined);
      const prevAvg = prevScores.length > 0 ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length : 0;
      growthRate = prevAvg > 0 ? Math.round(((avgScore - prevAvg) / prevAvg) * 100) : 0;
    }

    // Category breakdown (done fayllar)
    const allFiles = await prisma.audioFile.findMany({
      where: { ...await buildWhere(req, pipelineName), status: "done" },
      select: { category: true, isSale: true },
    });

    // Sotuv — AmoCRM bilan bir xil, saleClosedAt filter + distinct leadId
    const salesDateRange = getDateRange(
      (req.query.period as string) || "month",
      req.query.dateFrom as string | undefined,
      req.query.dateTo as string | undefined,
    );
    const activeIdsForSales = await getActiveManagerIds(req.companyId!);
    const pipelineSalesWhere: Record<string, unknown> = {
      companyId: req.companyId,
      saleResponsibleManagerId: { in: activeIdsForSales },
      pipelineName,
      isSale: true,
      leadId: { not: null },
    };
    if (salesDateRange) pipelineSalesWhere.saleClosedAt = salesDateRange;
    const pipelineSales = await prisma.audioFile.findMany({
      where: pipelineSalesWhere,
      select: { leadId: true, saleAmount: true },
      distinct: ["leadId"],
    });
    const allSalesCount = pipelineSales.length;

    const categoryMap: Record<string, string> = {
      sotuv: "1-Qo'ng'iroq",
      qayta: "Qayta qo'ng'iroq",
      boshqa: "Boshqa",
    };
    const categoryCounts: Record<string, number> = {};
    let salesCount = 0;
    for (const file of allFiles) {
      const cat = file.category || "boshqa";
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      if (file.isSale) salesCount++;
    }
    const categories = Object.entries(categoryCounts).map(([key, count]) => ({
      name: categoryMap[key] || key,
      count,
    }));
    categories.push({ name: "Sotuv", count: allSalesCount });

    // Manager breakdown
    const managerMap: Record<string, { id: string; name: string; calls: number; sales: number; totalScore: number; scoreCount: number }> = {};
    for (const file of audioFiles) {
      const mId = file.manager?.id || "unknown";
      const mName = file.manager?.name || "Noma'lum";
      if (!managerMap[mId]) managerMap[mId] = { id: mId, name: mName, calls: 0, sales: 0, totalScore: 0, scoreCount: 0 };
      managerMap[mId].calls++;
      if (file.isSale) managerMap[mId].sales++;
      const score = file.analysis?.overallScore;
      if (score !== undefined) {
        managerMap[mId].totalScore += score;
        managerMap[mId].scoreCount++;
      }
    }
    const managers = Object.values(managerMap)
      .map((m) => ({
        id: m.id,
        name: m.name,
        calls: m.calls,
        sales: m.sales,
        salesPercent: m.calls > 0 ? Math.round((m.sales / m.calls) * 100) : 0,
        avgScore: m.scoreCount > 0 ? Math.round(m.totalScore / m.scoreCount) : 0,
      }))
      .sort((a, b) => b.calls - a.calls);

    // Sotuv summasi — distinct leadId bo'yicha (double-count oldini olish)
    const totalSaleAmount = pipelineSales.reduce((sum, f) => sum + (f.saleAmount || 0), 0);

    success(res, { totalCalls, analyzedCalls, avgScore, topScore, growthRate, categories, managers, totalSaleAmount });
  } catch (err) {
    console.error("Voronka detail error:", err);
    error(res, "Voronka tafsilotlarini olishda xatolik");
  }
};

// GET /voronka/:name/criteria — Pipeline criteria stats
export const getCriteria = async (req: Request, res: Response): Promise<void> => {
  try {
    const pipelineName = decodeURIComponent(req.params.name);
    const where = await buildWhere(req, pipelineName);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: {
        analysis: { select: { criteria: true } },
        manager: { select: { id: true, name: true } },
      },
    });

    const allCriteria: Record<string, number[]> = {};
    const managerCriteria: Record<string, Record<string, number[]>> = {};

    for (const file of audioFiles) {
      const criteria = file.analysis?.criteria as Record<string, { score: number }> | null;
      if (!criteria) continue;

      for (const [key, val] of Object.entries(criteria)) {
        if (!allCriteria[key]) allCriteria[key] = [];
        allCriteria[key].push(val.score);

        const mName = file.manager?.name || "Noma'lum";
        if (!managerCriteria[mName]) managerCriteria[mName] = {};
        if (!managerCriteria[mName][key]) managerCriteria[mName][key] = [];
        managerCriteria[mName][key].push(val.score);
      }
    }

    const teamAvg: Record<string, number> = {};
    for (const [key, scores] of Object.entries(allCriteria)) {
      teamAvg[key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }

    const managersAvg: Record<string, Record<string, number>> = {};
    for (const [mName, criteria] of Object.entries(managerCriteria)) {
      managersAvg[mName] = {};
      for (const [key, scores] of Object.entries(criteria)) {
        managersAvg[mName][key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    }

    success(res, { team: teamAvg, managers: managersAvg });
  } catch (err) {
    console.error("Voronka criteria error:", err);
    error(res, "Voronka mezon statistikasini olishda xatolik");
  }
};

// GET /voronka/:name/errors — Pipeline errors
export const getErrors = async (req: Request, res: Response): Promise<void> => {
  try {
    const pipelineName = decodeURIComponent(req.params.name);
    const where = await buildWhere(req, pipelineName);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: {
        analysis: { select: { errors: true } },
        manager: { select: { name: true } },
      },
    });

    const allErrors: Array<{
      type: string; description: string; timestamp: string;
      managerName: string; audioFileId: string;
    }> = [];

    for (const file of audioFiles) {
      const errors = file.analysis?.errors as Array<{ type: string; description: string; timestamp: string }> || [];
      for (const err of errors) {
        allErrors.push({
          type: err.type,
          description: err.description || "",
          timestamp: err.timestamp || "",
          managerName: file.manager?.name || "Noma'lum",
          audioFileId: file.id,
        });
      }
    }

    // Group by type
    const grouped: Record<string, typeof allErrors> = {};
    for (const err of allErrors) {
      if (!grouped[err.type]) grouped[err.type] = [];
      grouped[err.type].push(err);
    }

    const total = allErrors.length;
    const summary = Object.entries(grouped)
      .map(([type, items]) => ({
        type,
        count: items.length,
        percent: total > 0 ? Math.round((items.length / total) * 100) : 0,
        items,
      }))
      .sort((a, b) => b.count - a.count);

    // Group by manager
    const byManager: Record<string, typeof allErrors> = {};
    for (const err of allErrors) {
      if (!byManager[err.managerName]) byManager[err.managerName] = [];
      byManager[err.managerName].push(err);
    }

    const managerSummary = Object.entries(byManager)
      .map(([name, items]) => {
        const typeGroups: Record<string, typeof items> = {};
        for (const item of items) {
          if (!typeGroups[item.type]) typeGroups[item.type] = [];
          typeGroups[item.type].push(item);
        }
        return {
          managerName: name,
          total: items.length,
          types: Object.entries(typeGroups)
            .map(([type, typeItems]) => ({
              type,
              count: typeItems.length,
              percent: total > 0 ? Math.round((typeItems.length / total) * 100) : 0,
              items: typeItems,
            }))
            .sort((a, b) => b.count - a.count),
        };
      })
      .sort((a, b) => b.total - a.total);

    success(res, { total, summary, managerSummary });
  } catch (err) {
    console.error("Voronka errors error:", err);
    error(res, "Voronka xatoliklar statistikasini olishda xatolik");
  }
};

// GET /voronka/:name/audio — Audio files for pipeline
export const getAudio = async (req: Request, res: Response): Promise<void> => {
  try {
    const pipelineName = decodeURIComponent(req.params.name);
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const { managerId, status, search } = req.query;

    const activeIds = await getActiveManagerIds(req.companyId!);

    const where: Record<string, unknown> = {
      companyId: req.companyId,
      managerId: { in: activeIds },
      pipelineName,
    };

    if (managerId) where.managerId = managerId;
    if (status) {
      where.status = status;
    } else {
      where.status = { notIn: ["no_conversation", "disconnected", "transferred"] };
    }

    if (search) {
      where.OR = [
        { fileName: { contains: search as string, mode: "insensitive" } },
        { phoneNumber: { contains: search as string } },
        { manager: { name: { contains: search as string, mode: "insensitive" } } },
      ];
    }

    const [audioFiles, total] = await Promise.all([
      prisma.audioFile.findMany({
        where,
        include: {
          manager: { select: { id: true, name: true } },
          analysis: { select: { overallScore: true, leadQuality: true, leadScore: true, errors: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.audioFile.count({ where }),
    ]);

    success(res, {
      data: audioFiles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Voronka audio error:", err);
    error(res, "Voronka audio fayllarini olishda xatolik");
  }
};
