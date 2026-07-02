import { Request, Response } from "express";
import axios from "axios";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { BITRIX_WEBHOOK_URL as BITRIX_WEBHOOK } from "../utils/bitrix-config";

// Filter davrini Tashkent UTC+5 ga moslab hisoblash
const TZ_OFFSET = 5;
const tashkentStartOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, -TZ_OFFSET, 0, 0));
const tashkentEndOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, 23 - TZ_OFFSET, 59, 59, 999));

/**
 * Period stringini sana intervaliga aylantiradi.
 * Frontend yuboradi: today, yesterday, week, last_week, month, quarter, year, custom
 */
function resolvePeriod(
  period: string,
  dateFromStr?: string,
  dateToStr?: string,
): { from: Date; to: Date } {
  const range = getSalesPeriodRange(period, dateFromStr, dateToStr);
  return { from: range.gte, to: range.lte };
}

export const getRating = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const period = (req.query.period as string) || "month";
    const dateFromStr = req.query.dateFrom as string | undefined;
    const dateToStr = req.query.dateTo as string | undefined;

    const { from: dateFrom, to: dateTo } = resolvePeriod(period, dateFromStr, dateToStr);

    const managers = await prisma.manager.findMany({
      where: {
        companyId,
        isActive: true,
      },
    });
    const managerIds = managers.map((m) => m.id);
    const leadStatusMap = await getLeadStatusMap();
    // TEZLIK: jonli Bitrix lead paginatsiyasi (getBitrixLeadMetrics) olib tashlandi.
    // U davrdagi minglab leadni Bitrix'dan sahifama-sahifa tortib, endpointni 30-60s
    // "Pending"da ushlab turardi (skeleton uzoq turishining sababi). Lead jadvali
    // real-time sync (outbound webhook + 5 daq cron + reconcile) bilan Bitrix bilan
    // AYNAN mos (diag: farq=0), shuning uchun quyidagi DB fallback hisobi AYNAN shu
    // qiymatlarni beradi — lekin darhol, har qanday filterda.
    const callSourceIds = await getCallSourceIds(companyId);

    const [audioFiles, salesLeads, callCounts] = await Promise.all([
      prisma.audioFile.findMany({
        where: {
          companyId,
          managerId: { in: managerIds },
          status: "done",
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        include: {
          analysis: {
            select: { overallScore: true, criteria: true, leadScore: true },
          },
        },
      }),
      prisma.lead.findMany({
        where: {
          companyId,
          responsibleManagerId: { in: managerIds },
          dateCreate: { gte: dateFrom, lte: dateTo },
        },
        select: {
          responsibleManagerId: true,
          isConverted: true,
          statusId: true,
          statusName: true,
        },
      }),
      callSourceIds.length
        ? prisma.lead.groupBy({
            by: ["responsibleManagerId"],
            where: {
              companyId,
              responsibleManagerId: { in: managerIds },
              sourceId: { in: callSourceIds },
              dateCreate: { gte: dateFrom, lte: dateTo },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const audioByManager = new Map<string, typeof audioFiles>();
    for (const f of audioFiles) {
      if (!f.managerId) continue;
      const list = audioByManager.get(f.managerId) || [];
      list.push(f);
      audioByManager.set(f.managerId, list);
    }
    const salesByManager = new Map(
      managers.map((m) => [
        m.id,
        salesLeads.filter(
          (r) =>
            r.responsibleManagerId === m.id &&
            isFullPaymentLead(r, leadStatusMap),
        ).length,
      ]),
    );
    const callsByManager = new Map(
      callCounts
        .filter((r) => r.responsibleManagerId)
        .map((r) => [r.responsibleManagerId!, r._count._all]),
    );

    const ratings = [];

    for (const manager of managers) {
      const managerAudioFiles = audioByManager.get(manager.id) || [];

      const analyses = managerAudioFiles
        .map((f) => f.analysis)
        .filter((a): a is NonNullable<typeof a> => a !== null);

      // overallScore — analysis.overallScore o'rtachasi (bu allaqachon 0–100)
      const overallScoreSum = analyses.reduce(
        (sum, a) => sum + (a.overallScore || 0),
        0,
      );
      const overallScore = analyses.length > 0
        ? Math.round(overallScoreSum / analyses.length)
        : 0;

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

      ratings.push({
        manager,
        criteriaScore,
        overallScore,
        callsCount: callsByManager.get(manager.id) || 0,
        sales: salesByManager.get(manager.id) || 0,
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

let leadStatusMapCache: { map: Map<string, string>; expiresAt: number } | null = null;
async function getLeadStatusMap(): Promise<Map<string, string>> {
  if (leadStatusMapCache && leadStatusMapCache.expiresAt > Date.now()) {
    return leadStatusMapCache.map;
  }
  const map = new Map<string, string>();
  try {
    const resp = await axios.post(
      `${BITRIX_WEBHOOK}/crm.status.list.json`,
      { filter: { ENTITY_ID: "STATUS" } },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 },
    );
    for (const s of (resp.data?.result as Array<{ STATUS_ID: string; NAME: string }>) || []) {
      map.set(String(s.STATUS_ID), String(s.NAME));
    }
  } catch {
    // DB'dagi statusName/isConverted bilan davom etamiz.
  }
  leadStatusMapCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

let sourceMapCache: { map: Map<string, string>; expiresAt: number } | null = null;
async function getSourceMap(): Promise<Map<string, string>> {
  if (sourceMapCache && sourceMapCache.expiresAt > Date.now()) {
    return sourceMapCache.map;
  }
  const map = new Map<string, string>();
  try {
    const resp = await axios.post(
      `${BITRIX_WEBHOOK}/crm.status.list.json`,
      { filter: { ENTITY_ID: "SOURCE" } },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 },
    );
    for (const s of (resp.data?.result as Array<{ STATUS_ID: string; NAME: string }>) || []) {
      map.set(String(s.STATUS_ID), String(s.NAME));
    }
  } catch {
    // Fallback: Bitrix standart call source ID odatda CALL.
  }
  sourceMapCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

const normalize = (s: string): string =>
  s.toLowerCase().replace(/[‘’`ʻ']/g, "").replace(/\s+/g, " ").trim();

type LeadStatusLike = {
  isConverted?: boolean | null;
  statusId?: string | null;
  statusName?: string | null;
};

const isFullPaymentStatus = (statusId?: string | null, statusName?: string | null): boolean => {
  const id = normalize(statusId || "");
  const name = normalize(statusName || "");
  const paymentName =
    (name.includes("100") && (name.includes("tolov") || name.includes("to lov") || name.includes("оплат"))) ||
    name.includes("toliq tolov") ||
    name.includes("toliq to lov") ||
    name.includes("to liq tolov") ||
    name.includes("to liq to lov") ||
    name.includes("полная оплат");
  return id === "converted" || paymentName;
};

const isFullPaymentLead = (
  lead: LeadStatusLike,
  statusMap: Map<string, string>,
): boolean =>
  Boolean(lead.isConverted) ||
  isFullPaymentStatus(lead.statusId, lead.statusName || (lead.statusId ? statusMap.get(lead.statusId) : null));

const isCallSource = (sourceId: string, sourceName?: string): boolean => {
  const id = normalize(sourceId);
  const name = normalize(sourceName || "");
  if (id === "callback" || name.includes("qayta") || name.includes("callback")) {
    return false;
  }
  return (
    id === "call" ||
    id === "phone" ||
    name.includes("qongiroq") ||
    name.includes("qo ngiroq") ||
    name.includes("qo'ng'iroq") ||
    name.includes("zvon") ||
    name.includes("звон") ||
    name.includes("qo'ngiroq")
  );
};

async function getCallSourceIds(companyId: string): Promise<string[]> {
  const [sourceMap, rows] = await Promise.all([
    getSourceMap(),
    prisma.lead.groupBy({
      by: ["sourceId"],
      where: { companyId, sourceId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const ids = rows
    .map((r) => r.sourceId)
    .filter((id): id is string => Boolean(id));
  const callIds = ids.filter((id) => isCallSource(id, sourceMap.get(id)));
  return callIds.length ? callIds : ["CALL"];
}

type BitrixLeadRow = {
  ID?: string | number;
  ASSIGNED_BY_ID?: string | number | null;
  STATUS_ID?: string | null;
  SOURCE_ID?: string | null;
  OPPORTUNITY?: string | number | null;
};

type BitrixUserRow = {
  ID?: string | number;
  NAME?: string | null;
  LAST_NAME?: string | null;
  EMAIL?: string | null;
};

type BitrixListResponse<T> = {
  result?: T[];
  total?: number;
  next?: number;
  error?: string;
  error_description?: string;
};

type BitrixLeadMetric = {
  leadCount: number;
  qualifiedCount: number;
  salesCount: number;
  callSourceCount: number;
  revenue: number;
};

const emptyMetric = (): BitrixLeadMetric => ({
  leadCount: 0,
  qualifiedCount: 0,
  salesCount: 0,
  callSourceCount: 0,
  revenue: 0,
});

type BitrixManagerRef = {
  id: string;
  name?: string | null;
  email?: string | null;
};

const bitrixUserIdFromManagerId = (managerId: string): string | null =>
  managerId.startsWith("bitrix_") ? managerId.slice("bitrix_".length) : null;

const toBitrixDate = (date: Date): string =>
  date.toISOString().replace(/\.\d{3}Z$/, "+00:00");

async function bitrixListLeads(
  filter: Record<string, unknown>,
  select: string[],
): Promise<BitrixLeadRow[] | null> {
  const rows: BitrixLeadRow[] = [];
  let start = 0;

  try {
    for (;;) {
      const resp = await axios.post<BitrixListResponse<BitrixLeadRow>>(
        `${BITRIX_WEBHOOK}/crm.lead.list.json`,
        { filter, select, start },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
          validateStatus: () => true,
        },
      );
      const body = resp.data;
      if (body?.error) {
        throw new Error(body.error_description || body.error);
      }
      rows.push(...(body.result || []));
      if (body.next === undefined || body.next === null) break;
      start = body.next;
    }
    return rows;
  } catch (err) {
    console.error("Bitrix live lead metrics error:", err);
    return null;
  }
}

let bitrixUsersCache: { rows: BitrixUserRow[]; expiresAt: number } | null = null;
async function getBitrixUsers(): Promise<BitrixUserRow[] | null> {
  if (bitrixUsersCache && bitrixUsersCache.expiresAt > Date.now()) {
    return bitrixUsersCache.rows;
  }

  const rows: BitrixUserRow[] = [];
  let start = 0;
  try {
    for (;;) {
      const resp = await axios.post<BitrixListResponse<BitrixUserRow>>(
        `${BITRIX_WEBHOOK}/user.get.json`,
        {
          FILTER: { ACTIVE: true },
          SELECT: ["ID", "NAME", "LAST_NAME", "EMAIL"],
          start,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
          validateStatus: () => true,
        },
      );
      const body = resp.data;
      if (body?.error) {
        throw new Error(body.error_description || body.error);
      }
      rows.push(...(body.result || []));
      if (body.next === undefined || body.next === null) break;
      start = body.next;
    }
    bitrixUsersCache = { rows, expiresAt: Date.now() + 10 * 60 * 1000 };
    return rows;
  } catch (err) {
    console.error("Bitrix user mapping error:", err);
    return null;
  }
}

const bitrixUserFullName = (user: BitrixUserRow): string =>
  [user.NAME, user.LAST_NAME].filter(Boolean).join(" ").trim();

async function buildBitrixUserManagerMap(
  managers: BitrixManagerRef[],
): Promise<Map<string, string>> {
  const userToManager = new Map<string, string>();
  const unresolvedManagers: BitrixManagerRef[] = [];

  for (const manager of managers) {
    const bitrixUserId = bitrixUserIdFromManagerId(manager.id);
    if (bitrixUserId) {
      userToManager.set(bitrixUserId, manager.id);
    } else {
      unresolvedManagers.push(manager);
    }
  }
  if (unresolvedManagers.length === 0) return userToManager;

  const users = await getBitrixUsers();
  if (!users) return userToManager;

  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const user of users) {
    if (!user.ID) continue;
    const id = String(user.ID);
    const email = normalize(user.EMAIL || "");
    if (email) byEmail.set(email, id);
    const firstLast = normalize(bitrixUserFullName(user));
    if (firstLast) byName.set(firstLast, id);
    const lastFirst = normalize([user.LAST_NAME, user.NAME].filter(Boolean).join(" ").trim());
    if (lastFirst) byName.set(lastFirst, id);
  }

  for (const manager of unresolvedManagers) {
    const byEmailId = manager.email ? byEmail.get(normalize(manager.email)) : undefined;
    const byNameId = manager.name ? byName.get(normalize(manager.name)) : undefined;
    const bitrixUserId = byEmailId || byNameId;
    if (bitrixUserId && !userToManager.has(bitrixUserId)) {
      userToManager.set(bitrixUserId, manager.id);
    }
  }

  return userToManager;
}

function fullPaymentStatusIds(statusMap: Map<string, string>): string[] {
  const ids = Array.from(statusMap.entries())
    .filter(([id, name]) => isFullPaymentStatus(id, name))
    .map(([id]) => id);
  return ids.length ? ids : ["CONVERTED"];
}

async function getBitrixLeadMetrics(
  range: { gte: Date; lte: Date },
  managers: BitrixManagerRef[],
  statusMap?: Map<string, string>,
): Promise<Map<string, BitrixLeadMetric> | null> {
  const userToManager = await buildBitrixUserManagerMap(managers);
  const bitrixUserIds = Array.from(userToManager.keys());
  if (bitrixUserIds.length === 0) return null;

  const [leadStatusMap, sourceMap] = await Promise.all([
    statusMap ? Promise.resolve(statusMap) : getLeadStatusMap(),
    getSourceMap(),
  ]);
  const saleStatusIds = new Set(fullPaymentStatusIds(leadStatusMap));
  const callSourceIds = new Set(
    Array.from(sourceMap.entries())
      .filter(([id, name]) => isCallSource(id, name))
      .map(([id]) => id),
  );
  if (callSourceIds.size === 0) callSourceIds.add("CALL");

  const rows = await bitrixListLeads(
    {
      ASSIGNED_BY_ID: bitrixUserIds,
      ">=DATE_CREATE": toBitrixDate(range.gte),
      "<=DATE_CREATE": toBitrixDate(range.lte),
    },
    ["ID", "ASSIGNED_BY_ID", "STATUS_ID", "SOURCE_ID", "OPPORTUNITY"],
  );
  if (!rows) return null;

  const metrics = new Map<string, BitrixLeadMetric>();
  for (const managerId of userToManager.values()) {
    metrics.set(managerId, emptyMetric());
  }

  for (const row of rows) {
    const bitrixUserId = row.ASSIGNED_BY_ID ? String(row.ASSIGNED_BY_ID) : null;
    if (!bitrixUserId) continue;
    const managerId = userToManager.get(bitrixUserId);
    if (!managerId) continue;
    const metric = metrics.get(managerId);
    if (!metric) continue;

    const statusId = row.STATUS_ID ? String(row.STATUS_ID) : "";
    const sourceId = row.SOURCE_ID ? String(row.SOURCE_ID) : "";
    const isSale =
      saleStatusIds.has(statusId) ||
      isFullPaymentStatus(statusId, leadStatusMap.get(statusId) || null);

    metric.leadCount += 1;
    if (statusId !== "JUNK") metric.qualifiedCount += 1;
    if (callSourceIds.has(sourceId)) metric.callSourceCount += 1;
    if (isSale) {
      metric.salesCount += 1;
      metric.revenue += Number(row.OPPORTUNITY || 0) || 0;
    }
  }

  return metrics;
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
      select: { salesPlanMode: true, leadKpiSource: true },
    });
    const mode: "count" | "amount" =
      (company?.salesPlanMode as "count" | "amount") || "count";

    // Aktiv menejerlar
    const managers = await prisma.manager.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        photoUrl: true, customPhotoUrl: true,
        kpiPercent: true,
        salesPlans: { where: { type: planType } },
      },
    });

    const leadStatusMap = await getLeadStatusMap();
    const utcNow = new Date();
    const tNow = new Date(utcNow.getTime() + TZ_OFFSET * 3600 * 1000);
    const y = tNow.getUTCFullYear();
    const m = tNow.getUTCMonth() + 1;
    const d = tNow.getUTCDate();
    // TEZLIK: 2× jonli Bitrix lead paginatsiyasi (davr + bugun) olib tashlandi — bu
    // Sotuv tabini ~1 daqiqagacha "Pending"da ushlab turardi. Lead/SalesLead DB
    // real-time sync bilan Bitrix bilan AYNAN mos (diag: farq=0), shuning uchun
    // quyidagi DB hisobi (leadKpiSource=leads → useLeadMetrics) bir xil qiymat beradi.
    const [leadRows, closedDealsRating] = await Promise.all([
      prisma.lead.findMany({
        where: {
          companyId,
          dateCreate: { gte: range.gte, lte: range.lte },
        },
        select: {
          responsibleManagerId: true,
          isConverted: true,
          statusId: true,
          statusName: true,
          opportunity: true,
        },
      }),
      // Davr bo'yicha deal sotuv = won (isSale) + qisman to'lov (isPartialPayment)
      // 1) Yopilgan dealar — closedAt davr ichida (S yoki F)
      prisma.salesLead.findMany({
        where: {
          companyId,
          semanticId: { in: ["S", "F"] },
          closedAt: { gte: range.gte, lte: range.lte },
        },
        select: { responsibleManagerId: true, isSale: true, isPartialPayment: true, price: true },
      }),
    ]);
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
    const convertedLeads = leadRows.filter((l) => isFullPaymentLead(l, leadStatusMap));
    const useLeadMetrics =
      company?.leadKpiSource === "leads" ||
      (salesRows.length === 0 && convertedLeads.length > 0);

    // Bugungi sotuv
    // Bugungi sotuv — won (closedAt bugun) + qisman to'lov (leadCreatedAt bugun)
    const [todayConvertedLeads, todayClosed, todayPartial] = await Promise.all([
      prisma.lead.findMany({
        where: {
          companyId,
          dateCreate: {
            gte: tashkentStartOfDay(y, m, d),
            lte: tashkentEndOfDay(y, m, d),
          },
        },
        select: { responsibleManagerId: true, isConverted: true, statusId: true, statusName: true },
      }),
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
      let salesCount: number;
      let qualifiedCount: number;
      let revenue: number;
      let todayCount: number;
      if (useLeadMetrics) {
        const leadsFor = leadRows.filter((r) => r.responsibleManagerId === mgr.id);
        const salesFor = leadsFor.filter((r) => isFullPaymentLead(r, leadStatusMap));
        qualifiedCount = leadsFor.filter((r) => r.statusId !== "JUNK").length;
        salesCount = salesFor.length;
        revenue = salesFor.reduce((s, r) => s + (Number(r.opportunity) || 0), 0);
        todayCount = todayConvertedLeads.filter(
          (r) => r.responsibleManagerId === mgr.id && isFullPaymentLead(r, leadStatusMap)
        ).length;
      } else {
        const salesFor = salesRows.filter((r) => r.responsibleManagerId === mgr.id);
        // Yangi logika: qual = bu davrda yakunlangan dealar (won + lost)
        qualifiedCount = closedDealsRating.filter(
          (r) => r.responsibleManagerId === mgr.id
        ).length;
        salesCount = salesFor.length;
        // Price outlier'larni 0 bilan almashtiramiz (100M+ — data entry xato)
        revenue = salesFor.reduce((s, r) => s + cleanPrice(r.price), 0);
        todayCount = todaySales.filter(
          (r) => r.responsibleManagerId === mgr.id
        ).length;
      }
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
