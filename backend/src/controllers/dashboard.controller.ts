import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

const getDateRange = (period: string, dateFrom?: string, dateTo?: string): { gte?: Date; lte?: Date } | null => {
  const now = new Date();

  switch (period) {
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { gte: start };
    }
    case "yesterday": {
      const start = new Date();
      start.setDate(now.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(0, 0, 0, 0);
      return { gte: start, lte: end };
    }
    case "week": {
      const start = new Date();
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1; // Dushanba = hafta boshi
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      return { gte: start };
    }
    case "month": {
      // Joriy oy 1-sanasidan — har oy boshida noldan
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
    case "all":
      return null;
    default:
      return null;
  }
};

const buildWhere = async (req: Request) => {
  const period = (req.query.period as string) || "month";
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const managerId = req.query.managerId as string;

  // Faqat faol menejerlar IDlarini olish
  const activeManagers = await prisma.manager.findMany({
    where: { companyId: req.companyId, isActive: true },
    select: { id: true },
  });
  const activeIds = activeManagers.map((m) => m.id);

  const where: Record<string, unknown> = {
    companyId: req.companyId,
    managerId: { in: activeIds },
  };
  const dateRange = getDateRange(period, dateFrom, dateTo);
  if (dateRange) where.createdAt = dateRange;

  const parseCsv = (v: unknown): string[] =>
    typeof v === "string" && v.trim().length > 0
      ? v.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const managerIds = parseCsv(req.query.managerIds);
  const pipelines = parseCsv(req.query.pipelines);
  const sourceIds = parseCsv(req.query.sourceIds);

  if (managerId && managerId !== "all") where.managerId = managerId;
  else if (managerIds.length > 0) where.managerId = { in: managerIds };

  const category = req.query.category as string;
  if (category) where.category = category;

  const pipeline = req.query.pipeline as string;
  if (pipeline) where.pipelineName = pipeline;
  else if (pipelines.length > 0) where.pipelineName = { in: pipelines };

  if (sourceIds.length > 0) where.sourceId = { in: sourceIds };

  // Mahsulot filter (productIds=id1,id2)
  const productIds = parseCsv(req.query.productIds);
  if (productIds.length > 0) where.productId = { in: productIds };

  const minDurationSecRaw = req.query.minDurationSec as string | undefined;
  const minDurationSec =
    minDurationSecRaw && !Number.isNaN(Number(minDurationSecRaw))
      ? Math.max(0, Math.floor(Number(minDurationSecRaw)))
      : 0;
  if (minDurationSec > 0) where.duration = { gte: minDurationSec };

  return where;
};

export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: { analysis: { select: { overallScore: true } } },
    });

    const totalCalls = audioFiles.length;
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

    const durations = audioFiles.map((f) => f.duration || 0);
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

    // Growth rate (vs previous period)
    const prevWhere: Record<string, unknown> = { companyId: req.companyId };
    const period = (req.query.period as string) || "month";
    const dateRange = getDateRange(period, req.query.dateFrom as string, req.query.dateTo as string);
    if (dateRange?.gte) {
      const currentStart = dateRange.gte.getTime();
      const periodLength = Date.now() - currentStart;
      const prevStart = new Date(currentStart - periodLength);
      prevWhere.createdAt = { gte: prevStart, lt: dateRange.gte };
    }
    const prevFiles = await prisma.audioFile.findMany({
      where: { ...prevWhere, status: "done" },
      include: { analysis: { select: { overallScore: true } } },
    });
    const prevScores = prevFiles.map((f) => f.analysis?.overallScore).filter((s): s is number => s !== undefined);
    const prevAvg = prevScores.length > 0 ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length : 0;
    const growthRate = prevAvg > 0 ? Math.round(((avgScore - prevAvg) / prevAvg) * 100) : 0;

    // Jami sinxron qilingan qo'ng'iroqlar — faqat haqiqiy audio fayllar
    // (no_audio = sotuv-only placeholder record, qo'ng'iroq emas)
    const totalSynced = await prisma.audioFile.count({
      where: { ...where, status: { not: "no_audio" } },
    });

    // Sotuv summasi — AmoCRM bilan bir xil: saleClosedAt filter + distinct leadId
    // Excluded pipelines ham hisobga olinadi (company.excludedPipelines orqali isSale=false qilingan)
    const queryManagerId = req.query.managerId as string;
    const activeMgrIds = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: { id: true },
    }).then(ms => ms.map(m => m.id));
    const salesWhere: Record<string, unknown> = {
      companyId: req.companyId,
      // Bitta menejer tanlangan bo'lsa — faqat uning sotuvlari; aks holda — hamma aktiv
      saleResponsibleManagerId:
        queryManagerId && queryManagerId !== "all"
          ? queryManagerId
          : { in: activeMgrIds },
      isSale: true,
      leadId: { not: null },
    };
    const salesDateRange = getDateRange(
      (req.query.period as string) || "month",
      req.query.dateFrom as string | undefined,
      req.query.dateTo as string | undefined,
    );
    if (salesDateRange) salesWhere.saleClosedAt = salesDateRange;
    const salesLeads = await prisma.audioFile.findMany({
      where: salesWhere,
      select: { leadId: true, saleAmount: true },
      distinct: ["leadId"],
    });
    const totalSaleAmount = salesLeads.reduce((sum, f) => sum + (f.saleAmount || 0), 0);
    const totalSales = salesLeads.length;

    success(res, { totalCalls, totalSynced, avgScore, topScore, growthRate, avgDuration, totalDuration, totalSaleAmount, totalSales });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    error(res, "Statistika olishda xatolik");
  }
};

// Canonical mezon nomi — turli AI prompt versiyalarining sinonimlari (SOPRANO/SPIN,
// "Mahsulot taqdimoti"/"Mahsulotni tushuntirish", legacy "Ochilish"/"Yakunlash" va h.k.)
// bitta kanonik nomga birlashtiriladi. Whitelist faqat kanonik nomlar bilan ishlaydi —
// shu sabab "qayta" tabida sotuv mezonlari va aksincha ko'rinmaydi.
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
  "Malakalash": "Malakalash",
  "Kvalifikatsiya": "Malakalash",
  // Qayta
  "Kontekstni eslatish": "Kontekstni eslatish",
  "Kontekstni eslatish — oldingi suhbatga bog'lash": "Kontekstni eslatish",
  "Kontekstni eslatish — oldingi suhbatga bog‘lash": "Kontekstni eslatish",
  "Oldingi to‘siqni tekshirish": "Oldingi to'siqni tekshirish",
  "Oldingi to'siqni tekshirish": "Oldingi to'siqni tekshirish",
  "Yangi sabab bilan chiqish": "Yangi sabab bilan chiqish",
  "Yechim taqdim etish": "Yangi sabab bilan chiqish",
  "Qaror holatini aniqlash": "Qaror holatini aniqlash",
  "Closing va keyingi qadamni kelishish": "Closing va keyingi qadamni kelishish",
};

const canonicalCriterion = (name: string): string =>
  CANONICAL_CRITERION[name] ?? name;

// Har bir kategoriya uchun mezon whitelist'i — canonical nomlar.
// 7 mezonli docs/mezonlar.md strukturasi (Sotuv & Qayta — 2-mezon farqi bilan teng).
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
  // ProSales — Qayta qo'ng'iroq uchun 5 mezon (Salomlashish va Mahsulotni
  // tushuntirish bu kategoriyada qo'llanilmaydi — DB'da ham 5 ta sozlangan).
  qayta: new Set([
    "Kontekstni eslatish",
    "E'tirozlar bilan ishlash",
    "Bosim o'tkazish",
    "Kayfiyati",
    "Aktiv tinglash",
  ]),
};

// Cycle tartibi (radar/bar chartda soat yo'nalishi).
const SOTUV_ORDER = [
  "Salomlashish",
  "Ehtiyojni aniqlash",
  "Mahsulotni tushuntirish",
  "E'tirozlar bilan ishlash",
  "Bosim o'tkazish",
  "Kayfiyati",
  "Aktiv tinglash",
];
const QAYTA_ORDER = [
  "Kontekstni eslatish",
  "E'tirozlar bilan ishlash",
  "Bosim o'tkazish",
  "Kayfiyati",
  "Aktiv tinglash",
];

export const getCriteria = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: {
        analysis: { select: { criteria: true } },
        manager: { select: { id: true, name: true } },
      },
    });

    // Sotuv va qayta bo'yicha alohida aggregatsiya — har bir
    // mezon canonical nom orqali dedup qilinadi va kategoriya whitelist
    // bilan strict filter qilinadi (sotuv mezoni qayta tabga tushmaydi).
    const buildGroup = (files: typeof audioFiles, allowSet: Set<string>, order: string[]) => {
      const allCriteria: Record<string, number[]> = {};
      const managerCriteria: Record<string, Record<string, number[]>> = {};

      for (const file of files) {
        const criteria = file.analysis?.criteria as Record<string, { score?: unknown }> | null;
        if (!criteria || typeof criteria !== "object") continue;

        for (const [rawKey, val] of Object.entries(criteria)) {
          if (!val || typeof val !== "object" || typeof (val as { score?: unknown }).score !== "number") continue;
          const canonical = canonicalCriterion(rawKey);
          if (!allowSet.has(canonical)) continue;
          const score = (val as { score: number }).score;

          if (!allCriteria[canonical]) allCriteria[canonical] = [];
          allCriteria[canonical].push(score);

          const mName = file.manager?.name || "Noma'lum";
          if (!managerCriteria[mName]) managerCriteria[mName] = {};
          if (!managerCriteria[mName][canonical]) managerCriteria[mName][canonical] = [];
          managerCriteria[mName][canonical].push(score);
        }
      }

      // Cycle tartibi — faqat data bor mezonlar
      const orderedKeys = order.filter((k) => allCriteria[k]);

      const teamAvg: Record<string, number> = {};
      for (const key of orderedKeys) {
        const scores = allCriteria[key];
        if (scores) teamAvg[key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      }

      const managersAvg: Record<string, Record<string, number>> = {};
      for (const [mName, criteria] of Object.entries(managerCriteria)) {
        managersAvg[mName] = {};
        for (const key of orderedKeys) {
          const scores = criteria[key];
          if (scores) managersAvg[mName][key] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        }
      }

      return { team: teamAvg, managers: managersAvg };
    };

    const sotuvFiles = audioFiles.filter((f) => f.category === "sotuv" || f.category === "1-qo'ng'iroq");
    const qaytaFiles = audioFiles.filter((f) => f.category === "qayta");

    const sotuv = buildGroup(sotuvFiles, CATEGORY_CRITERIA.sotuv, SOTUV_ORDER);
    const qayta = buildGroup(qaytaFiles, CATEGORY_CRITERIA.qayta, QAYTA_ORDER);

    success(res, { sotuv, qayta });
  } catch (err) {
    console.error("Dashboard criteria error:", err);
    error(res, "Mezon statistikasini olishda xatolik");
  }
};

export const getErrors = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: {
        analysis: { select: { errors: true } },
        manager: { select: { name: true } },
      },
    });

    // Batafsil xatoliklar ro'yxati
    const allErrors: Array<{
      type: string; description: string; timestamp: string;
      managerName: string; audioFileId: string;
    }> = [];

    for (const file of audioFiles) {
      const errors = file.analysis?.errors as Array<{ type: string; description: string; timestamp: string }> || [];
      for (const err of errors) {
        allErrors.push({
          type: normalizeErrorType(err.type),
          description: err.description || "",
          timestamp: err.timestamp || "",
          managerName: file.manager?.name || "Noma'lum",
          audioFileId: file.id,
        });
      }
    }

    // Turi bo'yicha guruhlash
    const grouped: Record<string, typeof allErrors> = {};
    for (const err of allErrors) {
      if (!grouped[err.type]) grouped[err.type] = [];
      grouped[err.type].push(err);
    }

    const total = allErrors.length;
    const MAX_ITEMS_PER_TYPE = 10;
    const summary = Object.entries(grouped)
      .map(([type, items]) => ({
        type,
        count: items.length,
        percent: total > 0 ? Math.round((items.length / total) * 100) : 0,
        items: items.slice(0, MAX_ITEMS_PER_TYPE),
      }))
      .sort((a, b) => b.count - a.count);

    // Menejer bo'yicha guruhlash
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
              items: typeItems.slice(0, MAX_ITEMS_PER_TYPE),
            }))
            .sort((a, b) => b.count - a.count),
        };
      })
      .sort((a, b) => b.total - a.total);

    success(res, { total, summary, managerSummary });
  } catch (err) {
    console.error("Dashboard errors error:", err);
    error(res, "Xatoliklar statistikasini olishda xatolik");
  }
};

// E'tiroz turlarini normalizatsiya qilish — AI generatsiya qilgan 500+ variantlarni 7 ta guruhga
const OBJECTION_NORMALIZE: Array<{ canonical: string; keywords: string[] }> = [
  { canonical: "Narx", keywords: ["narx", "qimmat", "byudjet", "pul", "moliya", "arzon", "chegirma", "to'lov", "summa", "baho", "price", "mablag'", "limit", "to'lay", "bepul", "tekin"] },
  { canonical: "Vaqt", keywords: ["vaqt", "band", "keyinroq", "hozir emas", "time", "later", "jadval", "timing", "shoshil", "hozir band", "noqulay"] },
  { canonical: "Ishonch", keywords: ["ishon", "kafolat", "natija", "shubha", "guvoh", "trust", "result", "isbot", "sifat", "sinov dars", "probniy", "doubt", "samaradorlik", "onlayn formatga", "tajriba", "xavotir", "qo'rquv"] },
  { canonical: "Raqobat", keywords: ["raqobat", "boshqa kurs", "boshqa joyda", "o'qiyap", "tanla", "competitor", "alternativ", "mavjud yechim", "offlayn", "oflayn", "hozirgi yechim", "format", "boshqa variant", "boshqa taklif"] },
  { canonical: "Kerak emas", keywords: ["kerak emas", "qiziqma", "ehtiyoj", "zarurat", "not need", "reject", "rad et", "qiziqish yo'q", "o'zim udda", "o'zim o'rgan", "o'zim hal", "ariza qoldir", "noto'g'ri shaxs", "noto'g'ri odam", "noto'g'ri raqam", "xato ariza", "zayavka"] },
  { canonical: "Kechiktirish", keywords: ["kechik", "keyinga", "sur", "kutib", "postpone", "defer", "delay", "o'ylab", "maslahatlash", "stall", "cho'z", "bahona", "brush", "uydagi", "ota-ona", "dadasi", "oila", "uchinchi shaxs", "xo'jayin", "rahbar", "qaror qabul", "so'ray", "so'rash", "gaplash"] },
];

// Xatolik turlarini normalizatsiya qilish — AI generatsiya qilgan 670+ variantlarni 8 ta guruhga
const ERROR_NORMALIZE: Array<{ canonical: string; keywords: string[] }> = [
  { canonical: "Salomlashish xatosi", keywords: ["salomlash", "tanishtir", "ochilish", "opening", "boshlash", "call open", "kirish", "rapport", "aloqa o'rnat", "ismini so'ra", "ism so'ral", "shaxsiylashtir", "personal", "ism bilan", "ismi"] },
  { canonical: "Ehtiyoj aniqlanmadi", keywords: ["ehtiyoj", "needs", "soprano", "savol ber", "savollar", "qualif", "malakalas"] },
  { canonical: "Taqdimot zaif", keywords: ["taqdimot", "presentation", "mahsulot", "product", "tushuntir", "feature", "qiymat", "value", "narx"] },
  { canonical: "E'tirozga javob berilmadi", keywords: ["e'tiroz", "objection", "himoya", "bahslash", "taslim", "defensive", "argument", "konfrontat"] },
  { canonical: "Yakunlash zaif", keywords: ["yakunla", "yopish", "closing", "keyingi qadam", "next step", "yop", "sotuvni yop", "kelishuv", "cta", "chaqiriq", "sotuvni boy", "sotuv boy", "voz kech", "imkoniyat", "sotuv jarayon"] },
  { canonical: "Mijozni tinglash", keywords: ["tinglash", "monolog", "eshit", "bosim", "so'zini bo'l", "haddan tashqari", "ko'p gapir", "tingla", "overload", "muloqot", "kommunikats", "empatiya"] },
  { canonical: "Kontekst eslatilmadi", keywords: ["kontekst", "eslatil", "oldingi suhbat"] },
  { canonical: "To'siq tekshirilmadi", keywords: ["to'siq", "qulay vaqt", "ruxsat"] },
  { canonical: "Suhbatni boshqarish", keywords: ["nazorat", "boshqar", "control", "struktur", "bosqich", "ketma-ket", "jarayon", "professio", "etik", "nopro", "g'ayripro", "texnik", "skript", "chalkash", "tartib", "tuzilma", "o'tkazib yubor"] },
];

const normalizeType = (raw: string, rules: Array<{ canonical: string; keywords: string[] }>, fallback: string): string => {
  const lower = raw.toLowerCase().trim();
  for (const rule of rules) {
    if (rule.canonical.toLowerCase() === lower) return rule.canonical;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) return rule.canonical;
    }
  }
  return fallback;
};

const normalizeObjectionType = (raw: string): string =>
  normalizeType(raw, OBJECTION_NORMALIZE, "Boshqa");

const normalizeErrorType = (raw: string): string =>
  normalizeType(raw, ERROR_NORMALIZE, "Boshqa xatolik");

export const getObjections = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const analyses = await prisma.analysis.findMany({
      where: { audioFile: where },
      select: { objections: true },
    });

    const objCounts: Record<string, number> = {};
    for (const a of analyses) {
      const objs = a.objections as Array<{ type: string; count: number }>;
      for (const obj of objs) {
        const normalized = normalizeObjectionType(obj.type);
        objCounts[normalized] = (objCounts[normalized] || 0) + obj.count;
      }
    }

    const total = Object.values(objCounts).reduce((a, b) => a + b, 0);
    const result = Object.entries(objCounts)
      .map(([type, count]) => ({
        type,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    success(res, result);
  } catch (err) {
    console.error("Dashboard objections error:", err);
    error(res, "E'tirozlar statistikasini olishda xatolik");
  }
};

export const getWinLoss = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: {
        analysis: { select: { winPoints: true, lossPoints: true } },
        manager: { select: { name: true } },
      },
    });

    const wins: Record<string, Array<{ description: string; timestamp: string; audioFileId: string }>> = {};
    const losses: Record<string, Array<{ description: string; timestamp: string; audioFileId: string }>> = {};

    for (const file of audioFiles) {
      const mName = file.manager?.name || "Noma'lum";
      const wp = file.analysis?.winPoints as Array<{ description: string; timestamp: string }> || [];
      const lp = file.analysis?.lossPoints as Array<{ description: string; timestamp: string }> || [];
      if (!wins[mName]) wins[mName] = [];
      if (!losses[mName]) losses[mName] = [];
      wins[mName].push(...wp.map((w) => ({ ...w, audioFileId: file.id })));
      losses[mName].push(...lp.map((l) => ({ ...l, audioFileId: file.id })));
    }

    // Har bir menejer uchun maks 10 ta
    const MAX_POINTS = 10;
    const limitedWins: typeof wins = {};
    const limitedLosses: typeof losses = {};
    for (const [name, pts] of Object.entries(wins)) {
      limitedWins[name] = pts.slice(0, MAX_POINTS);
    }
    for (const [name, pts] of Object.entries(losses)) {
      limitedLosses[name] = pts.slice(0, MAX_POINTS);
    }

    const totalWins = Object.values(wins).reduce((s, pts) => s + pts.length, 0);
    const totalLosses = Object.values(losses).reduce((s, pts) => s + pts.length, 0);

    success(res, { wins: limitedWins, losses: limitedLosses, totalWins, totalLosses });
  } catch (err) {
    console.error("Dashboard win/loss error:", err);
    error(res, "G'alaba/yo'qotish statistikasini olishda xatolik");
  }
};

export const getCallsTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    // Tahlil qilinganlar (done) — callDate bo'yicha
    const doneFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      select: { callDate: true, createdAt: true },
      orderBy: { callDate: "asc" },
    });

    // Sinxron qilinganlar — faqat haqiqiy audio fayllar (no_audio placeholder'lar chiqarib tashlanadi)
    const allFiles = await prisma.audioFile.findMany({
      where: { ...where, status: { not: "no_audio" } },
      select: { callDate: true, createdAt: true },
      orderBy: { callDate: "asc" },
    });

    const doneCounts: Record<string, number> = {};
    for (const file of doneFiles) {
      const day = (file.callDate || file.createdAt).toISOString().split("T")[0];
      doneCounts[day] = (doneCounts[day] || 0) + 1;
    }

    const syncCounts: Record<string, number> = {};
    for (const file of allFiles) {
      const day = (file.callDate || file.createdAt).toISOString().split("T")[0];
      syncCounts[day] = (syncCounts[day] || 0) + 1;
    }

    // Barcha kunlarni birlashtirish
    const allDays = new Set([...Object.keys(doneCounts), ...Object.keys(syncCounts)]);
    const result = Array.from(allDays)
      .sort()
      .map((date) => ({
        date,
        analyzed: doneCounts[date] || 0,
        synced: syncCounts[date] || 0,
      }));

    success(res, result);
  } catch (err) {
    console.error("Dashboard calls trend error:", err);
    error(res, "Qo'ng'iroqlar trendi olishda xatolik");
  }
};

export const getSpeechRatio = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      include: {
        analysis: { select: { managerSpeech: true, clientSpeech: true } },
        manager: { select: { name: true } },
      },
    });

    let totalManager = 0;
    let totalClient = 0;
    const managerRatios: Record<string, { manager: number; client: number; count: number }> = {};

    for (const file of audioFiles) {
      if (!file.analysis) continue;
      totalManager += file.analysis.managerSpeech;
      totalClient += file.analysis.clientSpeech;
      const mName = file.manager?.name || "Noma'lum";
      if (!managerRatios[mName]) managerRatios[mName] = { manager: 0, client: 0, count: 0 };
      managerRatios[mName].manager += file.analysis.managerSpeech;
      managerRatios[mName].client += file.analysis.clientSpeech;
      managerRatios[mName].count += 1;
    }

    const count = audioFiles.filter((f) => f.analysis).length;
    const team = {
      manager: count > 0 ? Math.round(totalManager / count) : 50,
      client: count > 0 ? Math.round(totalClient / count) : 50,
    };

    const managers = Object.entries(managerRatios).map(([name, r]) => ({
      name,
      manager: Math.round(r.manager / r.count),
      client: Math.round(r.client / r.count),
    }));

    success(res, { team, managers });
  } catch (err) {
    console.error("Dashboard speech ratio error:", err);
    error(res, "Nutq nisbati olishda xatolik");
  }
};

export const getManagerDurations = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      select: {
        duration: true,
        manager: { select: { name: true } },
      },
    });

    const managerDurations: Record<string, { total: number; count: number }> = {};

    for (const file of audioFiles) {
      const mName = file.manager?.name || "Noma'lum";
      if (!managerDurations[mName]) managerDurations[mName] = { total: 0, count: 0 };
      managerDurations[mName].total += file.duration || 0;
      managerDurations[mName].count += 1;
    }

    const managers = Object.entries(managerDurations).map(([name, d]) => ({
      name,
      avgDuration: d.count > 0 ? Math.round(d.total / d.count) : 0,
      totalDuration: d.total,
      callsCount: d.count,
    }));

    success(res, managers);
  } catch (err) {
    console.error("Dashboard manager durations error:", err);
    error(res, "Menejer davomiyligi olishda xatolik");
  }
};

export const getSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await getStatsData(req);
    success(res, stats);
  } catch (err) {
    console.error("Dashboard summary error:", err);
    error(res, "Summary olishda xatolik");
  }
};

export const getCategoryStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const where = await buildWhere(req);

    const audioFiles = await prisma.audioFile.findMany({
      where: { ...where, status: "done" },
      select: { category: true, isSale: true },
    });

    const categoryMap: Record<string, string> = {
      sotuv: "1-Qo'ng'iroq",
      qayta: "Qayta qo'ng'iroq",
      boshqa: "Boshqa",
    };

    const counts: Record<string, number> = {};
    for (const file of audioFiles) {
      const cat = file.category || "boshqa";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    // Sotuv — unique leadId bo'yicha
    const salesLeads = await prisma.audioFile.findMany({
      where: { ...where, isSale: true, leadId: { not: null } },
      select: { leadId: true },
      distinct: ["leadId"],
    });
    const salesCount = salesLeads.length;

    const categories = Object.entries(counts).map(([key, count]) => ({
      name: categoryMap[key] || key,
      count,
    }));

    // Sotuv (won lidlar) qo'shish
    categories.push({ name: "Sotuv", count: salesCount });

    success(res, { total: audioFiles.length, categories });
  } catch (err) {
    console.error("Dashboard category stats error:", err);
    error(res, "Kategoriya statistikasini olishda xatolik");
  }
};

export const getSalesStats = async (req: Request, res: Response): Promise<void> => {
  try {
    // Aktiv menejerlar
    const activeMgrs = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: { id: true, name: true },
    });
    const activeIds = activeMgrs.map(m => m.id);
    const mgrNameMap = new Map(activeMgrs.map(m => [m.id, m.name]));

    // Sana oralig'i — voronka/dashboard bilan bir xil
    const salesDateRange = getDateRange(
      (req.query.period as string) || "month",
      req.query.dateFrom as string | undefined,
      req.query.dateTo as string | undefined,
    );

    // Sotuvlar — saleClosedAt + saleResponsibleManagerId (AmoCRM bilan bir xil)
    const salesWhere: Record<string, unknown> = {
      companyId: req.companyId,
      saleResponsibleManagerId: { in: activeIds },
      isSale: true,
      leadId: { not: null },
    };
    if (salesDateRange) salesWhere.saleClosedAt = salesDateRange;

    const salesLeads = await prisma.audioFile.findMany({
      where: salesWhere,
      select: { leadId: true, saleResponsibleManagerId: true },
      distinct: ["leadId"],
    });

    const total = salesLeads.length;
    const managerCounts: Record<string, number> = {};
    for (const s of salesLeads) {
      const name = mgrNameMap.get(s.saleResponsibleManagerId || "") || "Noma'lum";
      managerCounts[name] = (managerCounts[name] || 0) + 1;
    }

    const managers = Object.entries(managerCounts)
      .map(([name, count]) => ({
        name,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    success(res, { total, managers });
  } catch (err) {
    console.error("Dashboard sales stats error:", err);
    error(res, "Savdo statistikasini olishda xatolik");
  }
};

export const getSalesTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const activeIds = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: { id: true },
    }).then(ms => ms.map(m => m.id));

    const dateRange = getDateRange(
      (req.query.period as string) || "month",
      req.query.dateFrom as string | undefined,
      req.query.dateTo as string | undefined,
    );

    const salesWhere: Record<string, unknown> = {
      companyId: req.companyId,
      saleResponsibleManagerId: { in: activeIds },
      isSale: true,
      leadId: { not: null },
    };
    if (dateRange) salesWhere.saleClosedAt = dateRange;

    // Sotuvlar — saleClosedAt bo'yicha (AmoCRM bilan bir xil trend)
    const salesFiles = await prisma.audioFile.findMany({
      where: salesWhere,
      select: { saleClosedAt: true, leadId: true },
      distinct: ["leadId"],
      orderBy: { saleClosedAt: "asc" },
    });

    const dailyCounts: Record<string, number> = {};
    for (const file of salesFiles) {
      if (!file.saleClosedAt) continue;
      const day = file.saleClosedAt.toISOString().split("T")[0];
      dailyCounts[day] = (dailyCounts[day] || 0) + 1;
    }

    // Kunlik yig'indi (cumulative) ham qo'shamiz
    let cumulative = 0;
    const result = Object.entries(dailyCounts).map(([date, count]) => {
      cumulative += count;
      return { date, count, cumulative };
    });

    success(res, result);
  } catch (err) {
    console.error("Dashboard sales trend error:", err);
    error(res, "Savdo trendi olishda xatolik");
  }
};

// Helper for summary (reuse stats logic)
const getStatsData = async (req: Request) => {
  const where = await buildWhere(req);
  const audioFiles = await prisma.audioFile.findMany({
    where: { ...where, status: "done" },
    include: { analysis: true, manager: { select: { name: true } } },
  });
  return { totalCalls: audioFiles.length, files: audioFiles };
};
