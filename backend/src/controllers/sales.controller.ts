import { Request, Response } from "express";
import axios from "axios";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { cache } from "../utils/cache";
import { BITRIX_WEBHOOK_URL as BITRIX_WEBHOOK } from "../utils/bitrix-config";
import { businessHoursBetween, parseHmToMinutes } from "../utils/business-hours";

// "Sifatli lid" — faqat shu 5 stage'da hisoblanadi (boshqa won/lost stagelar emas).
// Ochiq stagelar (lead hali yopilmagan):
const QUALIFYING_OPEN_STAGES = [
  "Ma'lumot berildi",
  "To'lov sanasi kelishildi",
  "Qisman to'lov qildi",
];
// Yopilgan stagelar (won + lost — faqat shu ikkitasi):
const QUALIFYING_CLOSED_STAGES = [
  "To'liq to'lov",
  "Сделка провалена",
];
const QUALIFYING_ALL_STAGES = [...QUALIFYING_OPEN_STAGES, ...QUALIFYING_CLOSED_STAGES];


async function bitrixCall(
  method: string,
  payload: Record<string, unknown> = {}
): Promise<{ result?: unknown; total?: number; next?: number }> {
  const resp = await axios.post(
    `${BITRIX_WEBHOOK}/${method}.json`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
      validateStatus: (s) => s < 500,
      timeout: 30000,
    }
  );
  return resp.data;
}

async function bitrixFetchAll<T>(
  method: string,
  payload: Record<string, unknown>
): Promise<T[]> {
  const items: T[] = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall(method, { ...payload, start });
    const batch = (resp.result as T[]) || [];
    items.push(...batch);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
  }
  return items;
}

// Bitrix SOURCE (Lead istovchnik) map cache — crm.status.list ENTITY_ID=SOURCE
// 10 daqiqa cache qilinadi
let sourceMapCache: { map: Map<string, string>; expiresAt: number } | null = null;
async function getSourceMap(): Promise<Map<string, string>> {
  if (sourceMapCache && sourceMapCache.expiresAt > Date.now()) {
    return sourceMapCache.map;
  }
  const resp = await bitrixCall("crm.status.list", {
    filter: { ENTITY_ID: "SOURCE" },
  });
  const map = new Map<string, string>();
  for (const s of (resp.result as Array<{ STATUS_ID: string; NAME: string }>) || []) {
    map.set(s.STATUS_ID, s.NAME);
  }
  sourceMapCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

// Frontenddan kelgan sourceIds parametrni parse qilish
const parseSourceIds = (raw: unknown): string[] | null => {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(",");
  const clean = arr.map((s) => String(s).trim()).filter(Boolean);
  return clean.length > 0 ? clean : null;
};

// Source filter aktiv bo'lganda tegishli Lead.bitrixLeadId to'plamini qaytaradi.
// SalesLead.originalLeadId shu to'plamda bo'lgan deallar filterlanadi.
const resolveBitrixLeadIdsForSources = async (
  companyId: string,
  sourceIds: string[]
): Promise<number[]> => {
  const rows = await prisma.lead.findMany({
    where: { companyId, sourceId: { in: sourceIds } },
    select: { bitrixLeadId: true },
  });
  return rows.map((r) => r.bitrixLeadId);
};

// Outlier price guard — Bitrix'da ba'zida mijozlar narxni noto'g'ri kiritishadi
// (ortiqcha nollar bilan). 100 mln UZS dan yuqori qiymatlar revenue hisob-
// kitoblarida CHIQARIB TASHLANADI, lekin sale count saqlanadi.
const MAX_REALISTIC_PRICE_UZS = 100_000_000;
const cleanPrice = (p: number | null | undefined): number => {
  const n = Number(p) || 0;
  if (n < 0) return 0;
  if (n > MAX_REALISTIC_PRICE_UZS) return 0;
  return n;
};

// Barcha hisob-kitoblar Tashkent timezone (UTC+5) bo'yicha bir xil bo'lishi uchun
// markazlashtirilgan helper'lar.
const TASHKENT_OFFSET_HOURS = 5;

// Tashkent vaqtiga moslangan "hozir" — server timezone'dan qat'iy nazar.
const nowInTashkent = (): Date => {
  const utcNow = Date.now();
  return new Date(utcNow + TASHKENT_OFFSET_HOURS * 3600 * 1000);
};

// Tashkent sanasining 00:00 UTC ko'rinishini qaytaradi.
// Masalan tashkentStartOfDay(2026, 4, 1) → UTC 2026-03-31 19:00:00
const tashkentStartOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, -TASHKENT_OFFSET_HOURS, 0, 0));

// Tashkent sanasining 23:59:59.999 UTC ko'rinishini qaytaradi.
const tashkentEndOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, 23 - TASHKENT_OFFSET_HOURS, 59, 59, 999));

const getDateRange = (
  period: string,
  dateFrom?: string,
  dateTo?: string
): { gte?: Date; lte?: Date } | null => {
  const tNow = nowInTashkent();
  const y = tNow.getUTCFullYear();
  const m = tNow.getUTCMonth() + 1; // 1..12
  const d = tNow.getUTCDate();

  switch (period) {
    case "today": {
      return { gte: tashkentStartOfDay(y, m, d), lte: tashkentEndOfDay(y, m, d) };
    }
    case "yesterday": {
      // Kecha = bugun - 1
      const yest = new Date(Date.UTC(y, m - 1, d - 1));
      return {
        gte: tashkentStartOfDay(yest.getUTCFullYear(), yest.getUTCMonth() + 1, yest.getUTCDate()),
        lte: tashkentEndOfDay(yest.getUTCFullYear(), yest.getUTCMonth() + 1, yest.getUTCDate()),
      };
    }
    case "week": {
      // "Bu hafta" = Bitrix "Последние 7 дней" bilan bir xil: today-7 dan bugungacha.
      // Bitrix presetning boshi = bugundan 7 kun oldingi kun (bugun ham kiradi).
      const sevenDaysAgo = new Date(Date.UTC(y, m - 1, d - 7));
      return {
        gte: tashkentStartOfDay(
          sevenDaysAgo.getUTCFullYear(),
          sevenDaysAgo.getUTCMonth() + 1,
          sevenDaysAgo.getUTCDate()
        ),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "month": {
      return {
        gte: tashkentStartOfDay(y, m, 1),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "last3months": {
      const start = new Date(Date.UTC(y, m - 1 - 3, d));
      return {
        gte: tashkentStartOfDay(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "last6months": {
      const start = new Date(Date.UTC(y, m - 1 - 6, d));
      return {
        gte: tashkentStartOfDay(start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "quarter": {
      const qStart = Math.floor((m - 1) / 3) * 3 + 1;
      return {
        gte: tashkentStartOfDay(y, qStart, 1),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "year": {
      return {
        gte: tashkentStartOfDay(y, 1, 1),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "custom": {
      // dateFrom/dateTo format: 'YYYY-MM-DD' Tashkent local kun.
      const range: { gte?: Date; lte?: Date } = {};
      if (dateFrom) {
        const [yy, mm, dd] = dateFrom.split("-").map(Number);
        if (yy && mm && dd) range.gte = tashkentStartOfDay(yy, mm, dd);
      }
      if (dateTo) {
        const [yy, mm, dd] = dateTo.split("-").map(Number);
        if (yy && mm && dd) range.lte = tashkentEndOfDay(yy, mm, dd);
      }
      return Object.keys(range).length > 0 ? range : null;
    }
    case "all":
      return null;
    default:
      return null;
  }
};

// Joriy davr uchun ekvivalent "oldingi davr"ni hisoblash
const getPreviousRange = (
  period: string,
  current: { gte?: Date; lte?: Date } | null
): { gte?: Date; lte?: Date } | null => {
  if (!current?.gte) return null;
  const gte = current.gte;
  const lte = current.lte || new Date();
  const now = new Date();

  switch (period) {
    case "today": {
      // Kecha
      const start = new Date(gte);
      start.setDate(start.getDate() - 1);
      const end = new Date(gte);
      return { gte: start, lte: end };
    }
    case "yesterday": {
      const start = new Date(gte);
      start.setDate(start.getDate() - 1);
      return { gte: start, lte: gte };
    }
    case "week": {
      const start = new Date(gte);
      start.setDate(start.getDate() - 7);
      return { gte: start, lte: gte };
    }
    case "month": {
      // O'tgan oyning shu oraliq (1–bugun)
      const start = new Date(gte);
      start.setMonth(start.getMonth() - 1);
      const end = new Date(now);
      end.setMonth(end.getMonth() - 1);
      return { gte: start, lte: end };
    }
    case "last3months": {
      // Oldingi 3 oy
      const start = new Date(gte);
      start.setMonth(start.getMonth() - 3);
      return { gte: start, lte: gte };
    }
    case "last6months": {
      const start = new Date(gte);
      start.setMonth(start.getMonth() - 6);
      return { gte: start, lte: gte };
    }
    case "quarter": {
      const start = new Date(gte);
      start.setMonth(start.getMonth() - 3);
      return { gte: start, lte: gte };
    }
    case "year": {
      const start = new Date(gte);
      start.setFullYear(start.getFullYear() - 1);
      return { gte: start, lte: gte };
    }
    case "custom": {
      const length = lte.getTime() - gte.getTime();
      const end = new Date(gte.getTime() - 1);
      const start = new Date(gte.getTime() - length);
      return { gte: start, lte: end };
    }
    default:
      return null;
  }
};

// Bitrix'da Kval lid = Lead.isConverted (STATUS_ID === 'CONVERTED' → deal'ga o'tgan)
// Konversiya = sotuv / kval lid × 100

interface ManagerStats {
  leadCount: number;           // Lead — barcha
  qualifiedLeadCount: number;  // Lead.isConverted = true (kval)
  salesCount: number;          // SalesLead (deal) isSale = true
  revenue: number;             // tushum
  conversionRate: number;      // sotuv / kval × 100
}

// ─── ROZGOVOR (leadKpiSource="leads") — funnel ta'rifi ──────────────────────
// Recruitment/training funnel (Bitrix LEAD statuslari):
//   LID SONI     = davrda yaratilgan barcha Lead
//   SIFATLI LID  = LID − JUNK ("Sifatsiz lid", statusId="JUNK")
//   SOTUV        = "100% To'lov" (CONVERTED, isConverted=true) — to'liq to'lagan
//   TUSHUM       = sotuv (100% To'lov) lidlarining deal narxlari yig'indisi
//   KONVERSIYA   = sotuv / sifatli lid (100% dan oshmaydi)
// "Kelishilgan to'lov" = ALOHIDA karta (getKelishilganTolov): deal "Xarid qilingan
//   kuni" (agreedPaymentDate) to'ldirilganlar — rejalashtirilgan/qisman ham kiradi.
const LEADS_JUNK_STATUS_ID = "JUNK"; // "Sifatsiz lid"
// KELISHILGAN TO'LOV (leads-mode) — to'lovga kelishgan lid statuslari:
//   UC_GBGONA = "3 kun ichida to'lov qiladi", UC_4H12NY = "Kitob sotib olganlar"
const LEADS_AGREED_STATUS_IDS = ["UC_GBGONA", "UC_4H12NY"];
const computeLeadsModeKpi = async (
  leadWhere: Record<string, unknown>,
  dealFilter: { companyId: string; pipelineIds?: number[] | null }
): Promise<{
  leadCount: number;
  qualifiedLeadCount: number;
  salesCount: number;
  totalRevenue: number;
  conversionRate: number;
  avgCheck: number;
}> => {
  const leadCount = await prisma.lead.count({ where: leadWhere });
  const junkCount = await prisma.lead.count({
    where: { ...leadWhere, statusId: LEADS_JUNK_STATUS_ID },
  });
  const qualifiedLeadCount = leadCount - junkCount;

  // SOTUV = 100% To'lov (CONVERTED) lidlar.
  // TUSHUM = shu lidlarning OPPORTUNITY yig'indisi — Bitrix "100% To'lov" kanban
  // summasi bilan AYNAN mos. (Avvalgi deal-narx usuli deal'i yo'q lidlarni
  // o'tkazib yuborardi → tushum kam chiqardi: 260mln vs Bitrix 307mln.)
  const convLeads = await prisma.lead.findMany({
    where: { ...leadWhere, isConverted: true },
    select: { opportunity: true },
  });
  const salesCount = convLeads.length;
  const totalRevenue = convLeads.reduce((s, l) => s + (l.opportunity || 0), 0);

  const conversionRate =
    qualifiedLeadCount > 0
      ? Math.min(100, (salesCount / qualifiedLeadCount) * 100)
      : 0;
  const avgCheck = salesCount > 0 ? totalRevenue / salesCount : 0;
  return {
    leadCount,
    qualifiedLeadCount,
    salesCount,
    totalRevenue,
    conversionRate,
    avgCheck,
  };
};

const computeByManagerMap = async (
  companyId: string,
  dateRange: { gte?: Date; lte?: Date } | null,
  pipelineIds: number[] | null = null,
  managerIds: string[] | null = null,
  sourceIds: string[] | null = null,
  bitrixLeadIdsFromSources: number[] | null = null,
  kpiFromLeads = false
): Promise<Map<string, ManagerStats>> => {
  const map = new Map<string, ManagerStats>();
  const ensure = (mId: string): ManagerStats => {
    if (!map.has(mId)) {
      map.set(mId, {
        leadCount: 0,
        qualifiedLeadCount: 0,
        salesCount: 0,
        revenue: 0,
        conversionRate: 0,
      });
    }
    return map.get(mId)!;
  };

  // 1) Leadlar (Lead jadvalidan)
  const leadWhere: Record<string, unknown> = { companyId };
  if (dateRange) leadWhere.dateCreate = dateRange;
  if (managerIds) leadWhere.responsibleManagerId = { in: managerIds };
  if (sourceIds) leadWhere.sourceId = { in: sourceIds };
  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: {
      responsibleManagerId: true,
      isConverted: true,
      statusId: true,
      bitrixLeadId: true,
      opportunity: true,
    },
  });
  // leads-mode: converted (100% To'lov) lid → menejeri (tushum atributsiyasi)
  const convLeadManager = new Map<number, string>();
  const junkByMgr = new Map<string, number>();
  for (const l of leads) {
    const mId = l.responsibleManagerId;
    if (!mId) continue;
    const cur = ensure(mId);
    cur.leadCount += 1;
    if (kpiFromLeads) {
      if (l.statusId === LEADS_JUNK_STATUS_ID) {
        junkByMgr.set(mId, (junkByMgr.get(mId) || 0) + 1);
      }
      if (l.isConverted) {
        cur.salesCount += 1; // SOTUV = 100% To'lov
        cur.revenue += l.opportunity || 0; // TUSHUM = lid OPPORTUNITY (Bitrix bilan mos)
        if (l.bitrixLeadId != null) convLeadManager.set(l.bitrixLeadId, mId);
      }
    }
  }

  if (kpiFromLeads) {
    // SIFATLI LID = lid − junk (har menejer). TUSHUM yuqorida loop'da
    // converted lid OPPORTUNITY'sidan yig'ilgan (Bitrix "100% To'lov" bilan mos).
    for (const [mId, cur] of map) {
      cur.qualifiedLeadCount = cur.leadCount - (junkByMgr.get(mId) || 0);
    }
  } else {
    // "deals" modeli (ProSales) — kval + sotuv yopilgan/ochiq qualifying stagelardan
    // 2) Qual lid = bu davrda yopilgan deallar — faqat QUALIFYING_CLOSED_STAGES dagi statusName
    const closedWhere: Record<string, unknown> = {
      companyId,
      semanticId: { in: ["S", "F"] },
      statusName: { in: QUALIFYING_CLOSED_STAGES },
    };
    if (dateRange) closedWhere.closedAt = dateRange;
    if (pipelineIds) closedWhere.pipelineId = { in: pipelineIds };
    if (managerIds) closedWhere.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      closedWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    const closedDeals = await prisma.salesLead.findMany({
      where: closedWhere,
      select: {
        responsibleManagerId: true,
        isSale: true,
        isPartialPayment: true,
        price: true,
      },
    });
    for (const d of closedDeals) {
      const mId = d.responsibleManagerId;
      if (!mId) continue;
      const cur = ensure(mId);
      cur.qualifiedLeadCount += 1;
      // Sotuv = won (S) YOKI qisman to'lov (stage NAME match)
      if (d.isSale || d.isPartialPayment) {
        cur.salesCount += 1;
        cur.revenue += cleanPrice(d.price);
      }
    }

    // Qisman to'lov dealari ochiq holatda ham bo'lishi mumkin (semantic P/not closed).
    const partialWhere: Record<string, unknown> = {
      companyId,
      isPartialPayment: true,
      semanticId: { notIn: ["S", "F"] },
    };
    if (dateRange) partialWhere.leadCreatedAt = dateRange;
    if (pipelineIds) partialWhere.pipelineId = { in: pipelineIds };
    if (managerIds) partialWhere.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      partialWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    const openPartials = await prisma.salesLead.findMany({
      where: partialWhere,
      select: { responsibleManagerId: true, price: true },
    });
    for (const d of openPartials) {
      const mId = d.responsibleManagerId;
      if (!mId) continue;
      const cur = ensure(mId);
      cur.qualifiedLeadCount += 1;
      cur.salesCount += 1;
      cur.revenue += d.price || 0;
    }

    // Ochiq qualifying stages — sifatli sanaladi (isPartialPayment != true, dublikatsiz)
    const openQualNonPartialWhere: Record<string, unknown> = {
      companyId,
      statusName: { in: QUALIFYING_OPEN_STAGES },
      semanticId: { notIn: ["S", "F"] },
      isPartialPayment: { not: true },
    };
    if (dateRange) openQualNonPartialWhere.leadCreatedAt = dateRange;
    if (pipelineIds) openQualNonPartialWhere.pipelineId = { in: pipelineIds };
    if (managerIds) openQualNonPartialWhere.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      openQualNonPartialWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    const openQualNonPartial = await prisma.salesLead.findMany({
      where: openQualNonPartialWhere,
      select: { responsibleManagerId: true },
    });
    for (const d of openQualNonPartial) {
      const mId = d.responsibleManagerId;
      if (!mId) continue;
      const cur = ensure(mId);
      cur.qualifiedLeadCount += 1;
    }
  }

  // 3) Konversiya = sotuv / qual lid × 100 (100% dan oshmaydi — to'lov modeli'da
  //    deal-menejer va lid-menejer reassignment tufayli farq qilishi mumkin).
  for (const [, v] of map) {
    v.conversionRate =
      v.qualifiedLeadCount > 0
        ? Math.min(100, (v.salesCount / v.qualifiedLeadCount) * 100)
        : 0;
    v.conversionRate = Math.round(v.conversionRate * 10) / 10;
  }

  return map;
};

// Bitrix-based KPI hisoblash:
//   Lid soni         — Lead jadvalidagi barcha leadlar (davrda yaratilgan)
//   Kval lid soni    — isConverted = true (deal'ga o'tgan)
//   Kval lid foizi   — qualified / total * 100
//   Sotuv soni       — SalesLead (deal) isSale = true, davrda yopilgan
//   Konversiya       — sotuv / kval lid × 100
//   Umumiy tushum    — deal price yig'indisi
//   O'rtacha chek    — tushum / sotuv
const computePeriodKpis = async (
  companyId: string,
  dateRange: { gte?: Date; lte?: Date } | null,
  pipelineIds: number[] | null = null,
  managerIds: string[] | null = null,
  leadIdsFromPipelines: number[] | null = null,
  sourceIds: string[] | null = null,
  bitrixLeadIdsFromSources: number[] | null = null,
  kpiFromLeads = false
) => {
  // ROZGOVOR leads-mode — yangi funnel (sifatli=lid−junk, sotuv=100%To'lov)
  if (kpiFromLeads) {
    const leadW: Record<string, unknown> = { companyId };
    if (dateRange) leadW.dateCreate = dateRange;
    if (managerIds) leadW.responsibleManagerId = { in: managerIds };
    if (sourceIds) leadW.sourceId = { in: sourceIds };
    if (leadIdsFromPipelines) leadW.bitrixLeadId = { in: leadIdsFromPipelines };
    const k = await computeLeadsModeKpi(leadW, { companyId, pipelineIds });
    const qRate = k.leadCount > 0 ? (k.qualifiedLeadCount / k.leadCount) * 100 : 0;
    return {
      leadCount: k.leadCount,
      qualifiedLeadCount: k.qualifiedLeadCount,
      qualifiedLeadRate: Math.round(qRate * 10) / 10,
      salesCount: k.salesCount,
      totalRevenue: k.totalRevenue,
      avgCheck: Math.round(k.avgCheck),
      conversionRate: Math.round(k.conversionRate * 10) / 10,
      partialPaymentCount: 0,
      partialPaymentRevenue: 0,
    };
  }

  let leadCount: number;
  let qualifiedLeadCount: number;
  {
    // "deals" modeli — Lid = davrda yaratilgan barcha SalesLead (har qanday stage)
    const allLeadsW: Record<string, unknown> = { companyId };
    if (dateRange) allLeadsW.leadCreatedAt = dateRange;
    if (pipelineIds) allLeadsW.pipelineId = { in: pipelineIds };
    if (managerIds) allLeadsW.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      allLeadsW.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    leadCount = await prisma.salesLead.count({ where: allLeadsW });
    // Qual lid = bu davrda yakunlangan deallar — faqat QUALIFYING_CLOSED_STAGES dagi statusName.
    const closedW: Record<string, unknown> = {
      companyId,
      semanticId: { in: ["S", "F"] },
      statusName: { in: QUALIFYING_CLOSED_STAGES },
    };
    if (dateRange) closedW.closedAt = dateRange;
    if (pipelineIds) closedW.pipelineId = { in: pipelineIds };
    if (managerIds) closedW.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      closedW.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    qualifiedLeadCount = await prisma.salesLead.count({ where: closedW });
    // Sifatli lid: ochiq holatdagi maxsus stagelar (Malumot, Tolov sanasi, Qisman)
    const openQualW: Record<string, unknown> = {
      companyId,
      statusName: { in: QUALIFYING_OPEN_STAGES },
      semanticId: { notIn: ["S", "F"] },
    };
    if (dateRange) openQualW.leadCreatedAt = dateRange;
    if (pipelineIds) openQualW.pipelineId = { in: pipelineIds };
    if (managerIds) openQualW.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      openQualW.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    qualifiedLeadCount += await prisma.salesLead.count({ where: openQualW });
  }
  const qualifiedLeadRate =
    leadCount > 0 ? (qualifiedLeadCount / leadCount) * 100 : 0;

  let salesCount: number;
  let totalRevenue: number;
  let conversionRate: number;
  {
    // Sotuvlar (davrda yopilgan won deallar + isPartialPayment true bo'lganlari)
    // Won — closedAt davr ichida
    const wonWhere: Record<string, unknown> = { companyId, isSale: true };
    if (dateRange) wonWhere.closedAt = dateRange;
    if (pipelineIds) wonWhere.pipelineId = { in: pipelineIds };
    if (managerIds) wonWhere.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      wonWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    const wonRows = await prisma.salesLead.findMany({
      where: wonWhere,
      select: { price: true, leadId: true },
    });
    // Partial payment — faqat ochiq/ketayotgan (won va lost allaqachon sanalgan)
    // closedAt bo'lmasa leadCreatedAt bo'yicha davr
    const partialWhere: Record<string, unknown> = {
      companyId,
      isPartialPayment: true,
      semanticId: { notIn: ["S", "F"] },
    };
    if (dateRange) partialWhere.leadCreatedAt = dateRange;
    if (pipelineIds) partialWhere.pipelineId = { in: pipelineIds };
    if (managerIds) partialWhere.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      partialWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    const partialRows = await prisma.salesLead.findMany({
      where: partialWhere,
      select: { price: true, leadId: true },
    });
    // Dedup (id set)
    const ids = new Set<number>();
    const combined: Array<{ price: number }> = [];
    for (const r of [...wonRows, ...partialRows]) {
      if (ids.has(r.leadId)) continue;
      ids.add(r.leadId);
      combined.push({ price: cleanPrice(r.price) });
    }
    salesCount = combined.length;
    totalRevenue = combined.reduce((s, r) => s + r.price, 0);
    conversionRate =
      qualifiedLeadCount > 0 ? (salesCount / qualifiedLeadCount) * 100 : 0;
  }
  const avgCheck = salesCount > 0 ? totalRevenue / salesCount : 0;

  // Qisman to'lov — closed + open, leadId bo'yicha dedup
  const partialClosedWhere: Record<string, unknown> = {
    companyId,
    isPartialPayment: true,
    semanticId: { in: ["S", "F"] },
  };
  if (dateRange) partialClosedWhere.closedAt = dateRange;
  if (pipelineIds) partialClosedWhere.pipelineId = { in: pipelineIds };
  if (managerIds) partialClosedWhere.responsibleManagerId = { in: managerIds };
  if (bitrixLeadIdsFromSources) {
    partialClosedWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
  }
  const partialClosedRows = await prisma.salesLead.findMany({
    where: partialClosedWhere,
    select: { leadId: true, price: true },
  });

  const partialOpenWhere: Record<string, unknown> = {
    companyId,
    isPartialPayment: true,
    semanticId: { notIn: ["S", "F"] },
  };
  if (dateRange) partialOpenWhere.leadCreatedAt = dateRange;
  if (pipelineIds) partialOpenWhere.pipelineId = { in: pipelineIds };
  if (managerIds) partialOpenWhere.responsibleManagerId = { in: managerIds };
  if (bitrixLeadIdsFromSources) {
    partialOpenWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
  }
  const partialOpenRows = await prisma.salesLead.findMany({
    where: partialOpenWhere,
    select: { leadId: true, price: true },
  });

  const partialIds = new Set<number>();
  let partialPaymentCount = 0;
  let partialPaymentRevenue = 0;
  for (const r of [...partialClosedRows, ...partialOpenRows]) {
    if (partialIds.has(r.leadId)) continue;
    partialIds.add(r.leadId);
    partialPaymentCount += 1;
    partialPaymentRevenue += cleanPrice(r.price);
  }

  return {
    leadCount,
    qualifiedLeadCount,
    qualifiedLeadRate: Math.round(qualifiedLeadRate * 10) / 10,
    salesCount,
    totalRevenue,
    avgCheck: Math.round(avgCheck),
    conversionRate: Math.round(conversionRate * 10) / 10,
    partialPaymentCount,
    partialPaymentRevenue,
  };
};

// Query paramdagi pipelineIds ni parseqilib beradi ("0,50,64" → [0,50,64])
const parsePipelineIds = (raw: unknown): number[] | null => {
  if (!raw || typeof raw !== "string") return null;
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  return ids.length > 0 ? ids : null;
};

const parseManagerIds = (raw: unknown): string[] | null => {
  if (!raw || typeof raw !== "string") return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
};

// Pipeline filter aktiv bo'lganda Lead jadvalida qaysi bitrixLeadId larga
// filter qo'yilishi kerakligini SalesLead.originalLeadId orqali aniqlaydi.
const resolveLeadIdsForPipelines = async (
  companyId: string,
  pipelineIds: number[]
): Promise<number[]> => {
  const rows = await prisma.salesLead.findMany({
    where: {
      companyId,
      pipelineId: { in: pipelineIds },
      originalLeadId: { not: null },
    },
    select: { originalLeadId: true },
    distinct: ["originalLeadId"],
  });
  return rows
    .map((r) => r.originalLeadId)
    .filter((v): v is number => v !== null);
};

export const getSalesOverview = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const pipelineIds = parsePipelineIds(req.query.pipelineIds);
    const managerIds = parseManagerIds(req.query.managerIds);
    const sourceIds = parseSourceIds(req.query.sourceIds);

    const dateRange = getDateRange(period, dateFrom, dateTo);

    // Pipeline filter aktiv bo'lsa, Lead jadvalida filter qilish uchun
    // shu pipeline(lar)dagi dealarning bitrixLeadId to'plamini olamiz.
    const leadBitrixIdsFromPipelines = pipelineIds
      ? await resolveLeadIdsForPipelines(companyId, pipelineIds)
      : null;

    // Source filter aktiv bo'lsa, deal queries uchun originalLeadId filter
    const bitrixLeadIdsFromSources = sourceIds
      ? await resolveBitrixLeadIdsForSources(companyId, sourceIds)
      : null;

    // Menejerlar ro'yxati (nom, rol uchun)
    const allManagers = await prisma.manager.findMany({
      where: { companyId },
      select: { id: true, name: true, role: true, isActive: true },
    });

    // Kval lid manbasi: "leads" → Lead.isConverted; aks holda deal stagelaridan.
    const companyKpi = await prisma.company.findUnique({
      where: { id: companyId },
      select: { leadKpiSource: true, adminWorkStart: true, adminWorkEnd: true },
    });
    const kpiFromLeads = companyKpi?.leadKpiSource === "leads";

    // ─── 1) LEADS: davrda yaratilgan lidlar ───
    // LEADS — Lead jadvalidan (Bitrix leads)
    const leadWhere: Record<string, unknown> = { companyId };
    if (dateRange) leadWhere.dateCreate = dateRange;
    if (managerIds) leadWhere.responsibleManagerId = { in: managerIds };
    if (sourceIds) leadWhere.sourceId = { in: sourceIds };
    // Pipeline filter: shu pipelinelardagi dealarning bitrixLeadId to'plami
    if (leadBitrixIdsFromPipelines) {
      leadWhere.bitrixLeadId = { in: leadBitrixIdsFromPipelines };
    }

    const leadRows = await prisma.lead.findMany({
      where: leadWhere,
      select: {
        bitrixLeadId: true,
        isConverted: true,
        dateCreate: true,
        responsibleManagerId: true,
        statusId: true,
        opportunity: true,
      },
    });
    // ─── Lid soni + Sifatli lid ───────────────────────────────────────
    let leadCount: number;
    let qualifiedLeadCount: number;
    if (kpiFromLeads) {
      // LID = barcha Lead; SIFATLI LID = LID − JUNK ("Sifatsiz lid")
      leadCount = await prisma.lead.count({ where: leadWhere });
      const junkCount = await prisma.lead.count({
        where: { ...leadWhere, statusId: LEADS_JUNK_STATUS_ID },
      });
      qualifiedLeadCount = leadCount - junkCount;
    } else {
      // "deals" modeli — Lid = davrda yaratilgan barcha SalesLead (har qanday stage)
      const allLeadsWOv: Record<string, unknown> = { companyId };
      if (dateRange) allLeadsWOv.leadCreatedAt = dateRange;
      if (pipelineIds) allLeadsWOv.pipelineId = { in: pipelineIds };
      if (managerIds) allLeadsWOv.responsibleManagerId = { in: managerIds };
      if (bitrixLeadIdsFromSources) {
        allLeadsWOv.originalLeadId = { in: bitrixLeadIdsFromSources };
      }
      leadCount = await prisma.salesLead.count({ where: allLeadsWOv });

      // QUAL LID = bu davrda yakunlangan barcha deallar (won + lost).
      const closedWhereOv: Record<string, unknown> = {
        companyId,
        semanticId: { in: ["S", "F"] },
        statusName: { in: QUALIFYING_CLOSED_STAGES },
      };
      if (dateRange) closedWhereOv.closedAt = dateRange;
      if (pipelineIds) closedWhereOv.pipelineId = { in: pipelineIds };
      if (managerIds) closedWhereOv.responsibleManagerId = { in: managerIds };
      if (bitrixLeadIdsFromSources) {
        closedWhereOv.originalLeadId = { in: bitrixLeadIdsFromSources };
      }
      qualifiedLeadCount = await prisma.salesLead.count({ where: closedWhereOv });
      // Sifatli lid: ochiq holatdagi maxsus stagelar
      const openQualWhereOv: Record<string, unknown> = {
        companyId,
        statusName: { in: QUALIFYING_OPEN_STAGES },
        semanticId: { notIn: ["S", "F"] },
      };
      if (dateRange) openQualWhereOv.leadCreatedAt = dateRange;
      if (pipelineIds) openQualWhereOv.pipelineId = { in: pipelineIds };
      if (managerIds) openQualWhereOv.responsibleManagerId = { in: managerIds };
      if (bitrixLeadIdsFromSources) {
        openQualWhereOv.originalLeadId = { in: bitrixLeadIdsFromSources };
      }
      qualifiedLeadCount += await prisma.salesLead.count({ where: openQualWhereOv });
    }
    const qualifiedLeadRate =
      leadCount > 0 ? (qualifiedLeadCount / leadCount) * 100 : 0;

    // SALES — to'lov modeli (ROZGOVOR: agreedPaymentDate) yoki won+partial (ProSales)
    const saleSelect = {
      leadId: true,
      price: true,
      closedAt: true,
      leadCreatedAt: true,
      originalLeadId: true,
      responsibleManagerId: true,
    } as const;
    let saleRows: Array<{
      leadId: number;
      price: number | null;
      closedAt: Date | null;
      leadCreatedAt: Date | null;
      originalLeadId: number | null;
      responsibleManagerId: string | null;
    }>;
    let salesCount: number;
    let totalRevenue: number;
    let conversionRate: number;

    if (kpiFromLeads) {
      // SOTUV = 100% To'lov (CONVERTED) lidlar
      const convBitrixIds = leadRows
        .filter((r) => r.isConverted)
        .map((r) => r.bitrixLeadId)
        .filter((n): n is number => n != null);
      salesCount = convBitrixIds.length;
      // TUSHUM + saleRows = sotuv lidlarining deallari (lead bo'yicha dedup)
      saleRows = [];
      if (convBitrixIds.length > 0) {
        const dealW: Record<string, unknown> = {
          companyId,
          originalLeadId: { in: convBitrixIds },
        };
        if (pipelineIds) dealW.pipelineId = { in: pipelineIds };
        const convDeals = await prisma.salesLead.findMany({
          where: dealW,
          select: saleSelect,
        });
        const seen = new Set<number>();
        for (const d of convDeals) {
          if (d.originalLeadId == null || seen.has(d.originalLeadId)) continue;
          seen.add(d.originalLeadId);
          saleRows.push(d);
        }
      }
      // TUSHUM = converted lidlarning OPPORTUNITY yig'indisi — Bitrix "100% To'lov"
      // kanban summasi bilan AYNAN mos. (Deal-narx usuli deal-yo'q lidlarni
      // o'tkazib yuborardi → kam chiqardi: 252mln vs Bitrix 320mln.)
      totalRevenue = leadRows
        .filter((r) => r.isConverted)
        .reduce((sum, r) => sum + (r.opportunity || 0), 0);
      conversionRate =
        qualifiedLeadCount > 0
          ? Math.min(100, (salesCount / qualifiedLeadCount) * 100)
          : 0;
    } else {
      const salesWhere: Record<string, unknown> = { companyId, isSale: true };
      if (dateRange) salesWhere.closedAt = dateRange;
      if (pipelineIds) salesWhere.pipelineId = { in: pipelineIds };
      if (managerIds) salesWhere.responsibleManagerId = { in: managerIds };
      if (bitrixLeadIdsFromSources) {
        salesWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
      }
      const wonSaleRows = await prisma.salesLead.findMany({
        where: salesWhere,
        select: saleSelect,
      });
      // Qisman to'lov — ochiq (notIn S/F) va davr ichida yaratilgan
      const partialSaleWhere: Record<string, unknown> = {
        companyId,
        isPartialPayment: true,
        semanticId: { notIn: ["S", "F"] },
      };
      if (dateRange) partialSaleWhere.leadCreatedAt = dateRange;
      if (pipelineIds) partialSaleWhere.pipelineId = { in: pipelineIds };
      if (managerIds) partialSaleWhere.responsibleManagerId = { in: managerIds };
      if (bitrixLeadIdsFromSources) {
        partialSaleWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
      }
      const partialSaleRows = await prisma.salesLead.findMany({
        where: partialSaleWhere,
        select: saleSelect,
      });
      // Dedup won + partial
      const saleIds = new Set<number>();
      saleRows = [];
      for (const r of [...wonSaleRows, ...partialSaleRows]) {
        if (saleIds.has(r.leadId)) continue;
        saleIds.add(r.leadId);
        saleRows.push(r);
      }
      salesCount = saleRows.length;
      totalRevenue = saleRows.reduce((sum, r) => sum + cleanPrice(r.price), 0);
      // Konversiya = sotuv / qual lid × 100 (yakunlangan dealar ichida won foizi)
      conversionRate =
        qualifiedLeadCount > 0 ? (salesCount / qualifiedLeadCount) * 100 : 0;
    }
    // O'rtacha chek
    const avgCheck = salesCount > 0 ? totalRevenue / salesCount : 0;

    // ─── Qisman to'lov KPI: davr ichida isPartialPayment=true bo'lgan dealar ───
    // Closed (won/lost) va open holatlarini birga sanaymiz (dedup leadId bo'yicha).
    // Closed: closedAt davrda. Open: leadCreatedAt davrda.
    const partialClosedWhere: Record<string, unknown> = {
      companyId,
      isPartialPayment: true,
      semanticId: { in: ["S", "F"] },
    };
    if (dateRange) partialClosedWhere.closedAt = dateRange;
    if (pipelineIds) partialClosedWhere.pipelineId = { in: pipelineIds };
    if (managerIds)
      partialClosedWhere.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      partialClosedWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    const partialClosedRows = await prisma.salesLead.findMany({
      where: partialClosedWhere,
      select: { leadId: true, price: true },
    });

    const partialOpenWhere: Record<string, unknown> = {
      companyId,
      isPartialPayment: true,
      semanticId: { notIn: ["S", "F"] },
    };
    if (dateRange) partialOpenWhere.leadCreatedAt = dateRange;
    if (pipelineIds) partialOpenWhere.pipelineId = { in: pipelineIds };
    if (managerIds)
      partialOpenWhere.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      partialOpenWhere.originalLeadId = { in: bitrixLeadIdsFromSources };
    }
    const partialOpenRows = await prisma.salesLead.findMany({
      where: partialOpenWhere,
      select: { leadId: true, price: true },
    });

    const partialIds = new Set<number>();
    let partialPaymentCount = 0;
    let partialPaymentRevenue = 0;
    for (const r of [...partialClosedRows, ...partialOpenRows]) {
      if (partialIds.has(r.leadId)) continue;
      partialIds.add(r.leadId);
      partialPaymentCount += 1;
      partialPaymentRevenue += r.price || 0;
    }

    // ─── PROGNOZ: davr oxirigacha kunlik tempga asoslangan proyeksiya ───
    let forecast: {
      projectedSales: number;
      projectedRevenue: number;
      planTarget: number | null;
      fulfillmentPct: number | null;
      daysElapsed: number;
      totalDays: number;
      remainingDays: number;
      avgDailySales: number;
      avgDailyRevenue: number;
      planType: "daily" | "weekly" | "monthly" | null;
    } | null = null;
    if (dateRange?.gte && dateRange?.lte) {
      const DAY = 1000 * 60 * 60 * 24;
      // Davr oxiri — period turiga qarab (hisobotli emas, REAL oxir)
      let periodEnd = dateRange.lte;
      let planType: "daily" | "weekly" | "monthly" | null = null;
      if (period === "month") {
        const gy = dateRange.gte.getUTCFullYear();
        const gm = dateRange.gte.getUTCMonth();
        const lastDay = new Date(Date.UTC(gy, gm + 1, 0)).getUTCDate();
        periodEnd = tashkentEndOfDay(gy, gm + 1, lastDay);
        planType = "monthly";
      } else if (period === "week") {
        const start = dateRange.gte;
        const sunday = new Date(start.getTime() + 6 * DAY);
        periodEnd = tashkentEndOfDay(
          sunday.getUTCFullYear(),
          sunday.getUTCMonth() + 1,
          sunday.getUTCDate()
        );
        planType = "weekly";
      } else if (period === "today") {
        planType = "daily";
      }

      const tNowMs = nowInTashkent().getTime();
      const elapsedMs = Math.max(1, tNowMs - dateRange.gte.getTime());
      const totalMs = Math.max(elapsedMs, periodEnd.getTime() - dateRange.gte.getTime());
      const daysElapsed = Math.max(1, Math.ceil(elapsedMs / DAY));
      const totalDays = Math.max(daysElapsed, Math.ceil(totalMs / DAY));
      const remainingDays = Math.max(0, totalDays - daysElapsed);

      const avgDailySales = salesCount / daysElapsed;
      const avgDailyRevenue = totalRevenue / daysElapsed;
      const projectedSales = Math.round(avgDailySales * totalDays);
      const projectedRevenue = Math.round(avgDailyRevenue * totalDays);

      let planTarget: number | null = null;
      if (planType) {
        const plan = await prisma.salesPlan.findUnique({
          where: { companyId_type: { companyId, type: planType } },
        }).catch(() => null);
        planTarget = plan?.target ?? null;
      }
      const fulfillmentPct =
        planTarget && planTarget > 0
          ? Math.round((projectedSales / planTarget) * 1000) / 10
          : null;

      forecast = {
        projectedSales,
        projectedRevenue,
        planTarget,
        fulfillmentPct,
        daysElapsed,
        totalDays,
        remainingDays,
        avgDailySales: Math.round(avgDailySales * 10) / 10,
        avgDailyRevenue: Math.round(avgDailyRevenue),
        planType,
      };
    }

    // ─── 3) SALES CYCLE: lid yaratilgan vaqt → sotuv yopilgan vaqt ───
    // Boshlanish nuqtasi = original Lead.dateCreate (lid tushgan vaqt), deal DATE_CREATE emas.
    // Deal DATE_CREATE kech qo'yiladi (kvaldan keyin) va CLOSEDATE date-only (00:00) bo'lib,
    // deal create → close ko'pincha manfiy chiqadi → 0 ga clamp bo'lib "0 soat" ko'rinardi.
    const cycleOrigLeadIds = Array.from(
      new Set(
        saleRows
          .map((s) => s.originalLeadId)
          .filter((id): id is number => id != null)
      )
    );
    const cycleLeadDates = cycleOrigLeadIds.length > 0
      ? await prisma.lead.findMany({
          where: { companyId, bitrixLeadId: { in: cycleOrigLeadIds } },
          select: { bitrixLeadId: true, dateCreate: true },
        })
      : [];
    const leadDateByBitrixId = new Map<number, Date>();
    for (const l of cycleLeadDates) leadDateByBitrixId.set(l.bitrixLeadId, l.dateCreate);

    const cycleDays: number[] = [];
    const DAY_MS = 1000 * 60 * 60 * 24;
    for (const s of saleRows) {
      if (!s.closedAt) continue;
      // Lid tushgan vaqt: original Lead.dateCreate, topilmasa deal leadCreatedAt'ga qaytamiz
      const startAt =
        (s.originalLeadId != null && leadDateByBitrixId.get(s.originalLeadId)) ||
        s.leadCreatedAt;
      if (!startAt) continue;
      const diffMs = s.closedAt.getTime() - startAt.getTime();
      cycleDays.push(Math.max(diffMs / DAY_MS, 0));
    }
    const cycle = {
      avgDays: cycleDays.length > 0
        ? Math.round((cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) * 10) / 10
        : 0,
      minDays: cycleDays.length > 0 ? Math.round(Math.min(...cycleDays) * 10) / 10 : 0,
      maxDays: cycleDays.length > 0 ? Math.round(Math.max(...cycleDays) * 10) / 10 : 0,
      sampleCount: cycleDays.length,
    };

    // ─── TIME TO CONTACT: lid yaratilgandan birinchi aloqagacha ─
    // avgHours      — umumiy (xom, wall-clock) o'rtacha soat
    // avgWorkHours  — faqat ish vaqti (company adminWorkStart/End + mas'ul
    //                 menejer davomatidagi dam kunlari, Tashkent TZ) bo'yicha
    let timeToContact: {
      avgHours: number;
      avgWorkHours: number;
      totalLeadsCount: number;
      contactedLeadsCount: number;
    };
    // Ish oynasi — company default (bo'sh bo'lsa 09:00–18:00).
    const workStartMin = parseHmToMinutes(companyKpi?.adminWorkStart, 9 * 60);
    const workEndMin = parseHmToMinutes(companyKpi?.adminWorkEnd, 18 * 60);
    // Davomatdagi dam kunlari (status 1=dam, 2=ishlamagan — bayramlar ham shu
    // yerda) — mas'ul menejer bo'yicha. Lidda menejer yo'q bo'lsa faqat tungi
    // oyna qo'llanadi (dam kuni o'tkazilmaydi).
    const dayOffRows = await prisma.managerSchedule.findMany({
      where: { manager: { companyId }, status: { in: [1, 2] } },
      select: { managerId: true, date: true },
    });
    const daysOffByManager = new Map<string, Set<string>>();
    for (const r of dayOffRows) {
      let set = daysOffByManager.get(r.managerId);
      if (!set) {
        set = new Set<string>();
        daysOffByManager.set(r.managerId, set);
      }
      set.add(r.date);
    }
    const daysOffFor = (managerId: string | null | undefined): Set<string> | undefined =>
      managerId ? daysOffByManager.get(managerId) : undefined;
    const avgRounded = (arr: number[]): number =>
      arr.length > 0
        ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
        : 0;
    if (kpiFromLeads) {
      // ROZGOVOR — Lead.clientPhone ↔ AudioFile.phoneNumber bo'yicha birinchi qo'ng'iroq
      const normPhone = (s: string | null) =>
        (s || "").replace(/\D/g, "").replace(/^998/, "").slice(-9);
      const leadsForContact = await prisma.lead.findMany({
        where: dateRange ? { companyId, dateCreate: dateRange } : { companyId },
        select: { clientPhone: true, dateCreate: true, responsibleManagerId: true },
      });
      const leadCreatedByPhone = new Map<
        string,
        { date: Date; managerId: string | null }
      >();
      for (const l of leadsForContact) {
        const k = normPhone(l.clientPhone);
        if (k.length >= 7) {
          const prev = leadCreatedByPhone.get(k);
          if (!prev || l.dateCreate < prev.date)
            leadCreatedByPhone.set(k, {
              date: l.dateCreate,
              managerId: l.responsibleManagerId,
            });
        }
      }
      const contactAudiosLm = await prisma.audioFile.findMany({
        where: { companyId, callDate: { not: null } },
        select: { phoneNumber: true, callDate: true },
      });
      const firstCallByPhone = new Map<string, Date>();
      for (const a of contactAudiosLm) {
        const k = normPhone(a.phoneNumber);
        if (!k || !a.callDate || !leadCreatedByPhone.has(k)) continue;
        const prev = firstCallByPhone.get(k);
        if (!prev || a.callDate < prev) firstCallByPhone.set(k, a.callDate);
      }
      const gapsLm: number[] = [];
      const workGapsLm: number[] = [];
      for (const [k, call] of firstCallByPhone) {
        const lead = leadCreatedByPhone.get(k)!;
        const diff = call.getTime() - lead.date.getTime();
        if (diff >= 0) {
          gapsLm.push(diff / 3_600_000);
          workGapsLm.push(
            businessHoursBetween(lead.date, call, {
              workStartMin,
              workEndMin,
              daysOff: daysOffFor(lead.managerId),
            })
          );
        }
      }
      timeToContact = {
        avgHours: avgRounded(gapsLm),
        avgWorkHours: avgRounded(workGapsLm),
        totalLeadsCount: leadCount,
        contactedLeadsCount: gapsLm.length,
      };
    } else {
    // SalesLead'dan olamiz — UI'dagi "Lid soni" shu jadvalga mos
    const salesLeadsForContactWhere: any = { companyId };
    if (dateRange) salesLeadsForContactWhere.leadCreatedAt = dateRange;
    const salesLeadsForContact = await prisma.salesLead.findMany({
      where: salesLeadsForContactWhere,
      select: { leadId: true, leadCreatedAt: true, responsibleManagerId: true },
    });
    const leadIdsInRange = salesLeadsForContact.map((sl) => sl.leadId);
    // Lid → mas'ul menejer (davomatdagi dam kunlarini ulash uchun)
    const leadManagerMap = new Map<number, string | null>();
    for (const sl of salesLeadsForContact) leadManagerMap.set(sl.leadId, sl.responsibleManagerId);
    const contactAudios = leadIdsInRange.length > 0
      ? await prisma.audioFile.findMany({
          where: {
            companyId,
            leadId: { in: leadIdsInRange },
            firstContactAt: { not: null },
            leadCreatedAt: { not: null },
          },
          select: { leadId: true, leadCreatedAt: true, firstContactAt: true },
        })
      : [];

    // Har lid uchun eng erta aloqa (AudioFile bo'yicha)
    const firstContactByLead = new Map<number, { created: Date; first: Date }>();
    for (const a of contactAudios) {
      if (a.leadId == null || !a.firstContactAt || !a.leadCreatedAt) continue;
      const prev = firstContactByLead.get(a.leadId);
      if (!prev || a.firstContactAt < prev.first) {
        firstContactByLead.set(a.leadId, {
          created: a.leadCreatedAt,
          first: a.firstContactAt,
        });
      }
    }

    // Activity (Bitrix calls) fallback — AudioFile yo'q lidlar uchun
    if (leadIdsInRange.length > 0) {
      const leadCreatedMap = new Map<number, Date>();
      for (const sl of salesLeadsForContact) leadCreatedMap.set(sl.leadId, sl.leadCreatedAt);

      const callActivities = await prisma.activity.findMany({
        where: {
          companyId,
          typeId: 2, // Call
          dealId: { in: leadIdsInRange },
          startTime: { not: null },
        },
        select: { dealId: true, startTime: true },
        orderBy: { startTime: "asc" },
      });

      for (const a of callActivities) {
        if (a.dealId == null || !a.startTime) continue;
        const created = leadCreatedMap.get(a.dealId);
        if (!created) continue;
        // AudioFile'da bo'lsa, eng ertasini olamiz
        const prev = firstContactByLead.get(a.dealId);
        if (!prev || a.startTime < prev.first) {
          firstContactByLead.set(a.dealId, { created, first: a.startTime });
        }
      }
    }
    const contactGapsHrs: number[] = [];
    const contactWorkHrs: number[] = [];
    for (const [leadId, v] of firstContactByLead) {
      const diffMs = v.first.getTime() - v.created.getTime();
      if (diffMs >= 0) {
        contactGapsHrs.push(diffMs / 3_600_000);
        contactWorkHrs.push(
          businessHoursBetween(v.created, v.first, {
            workStartMin,
            workEndMin,
            daysOff: daysOffFor(leadManagerMap.get(leadId)),
          })
        );
      }
    }
    timeToContact = {
      avgHours: avgRounded(contactGapsHrs),
      avgWorkHours: avgRounded(contactWorkHrs),
      totalLeadsCount: leadCount,
      contactedLeadsCount: firstContactByLead.size,
    };
    }

    // ─── 4) MENEJERLAR BO'YICHA — joriy va oldingi davr ───
    const prevRange = getPreviousRange(period, dateRange);
    const [currentMgrMap, prevMgrMap] = await Promise.all([
      computeByManagerMap(
        companyId,
        dateRange,
        pipelineIds,
        managerIds,
        sourceIds,
        bitrixLeadIdsFromSources,
        kpiFromLeads
      ),
      prevRange
        ? computeByManagerMap(
            companyId,
            prevRange,
            pipelineIds,
            managerIds,
            sourceIds,
            bitrixLeadIdsFromSources,
            kpiFromLeads
          )
        : Promise.resolve(new Map<string, ManagerStats>()),
    ]);

    const involvedManagerIds = new Set<string>([...currentMgrMap.keys()]);
    const byManager = [...involvedManagerIds]
      .map((mId) => {
        const mgr = allManagers.find((m) => m.id === mId);
        const cur = currentMgrMap.get(mId)!;
        const prev = prevMgrMap.get(mId);
        const salesShare = salesCount > 0 ? (cur.salesCount / salesCount) * 100 : 0;
        return {
          managerId: mId,
          managerName: mgr?.name || "Noma'lum",
          role: mgr?.role || null,
          leadCount: cur.leadCount,
          qualifiedLeadCount: cur.qualifiedLeadCount,
          salesCount: cur.salesCount,
          revenue: cur.revenue,
          conversionRate: cur.conversionRate,
          salesSharePercent: Math.round(salesShare * 10) / 10,
          previous: prev
            ? {
                leadCount: prev.leadCount,
                qualifiedLeadCount: prev.qualifiedLeadCount,
                salesCount: prev.salesCount,
                revenue: prev.revenue,
                conversionRate: prev.conversionRate,
              }
            : null,
        };
      })
      .sort((a, b) => b.salesCount - a.salesCount);

    // ─── 5) OLDINGI DAVR KPI — trader-style delta ─────────────────────
    const prevLeadIdsFromPipelines = pipelineIds
      ? leadBitrixIdsFromPipelines
      : null;
    const previousKpis = prevRange
      ? await computePeriodKpis(
          companyId,
          prevRange,
          pipelineIds,
          managerIds,
          prevLeadIdsFromPipelines,
          sourceIds,
          bitrixLeadIdsFromSources,
          kpiFromLeads
        )
      : null;

    // ─── 6) LID holati breakdown (Lead statusi bo'yicha) ──────────────
    const leadStatusRows = await prisma.lead.groupBy({
      by: ["statusName"],
      where: (() => {
        const w: Record<string, unknown> = { companyId };
        if (dateRange) w.dateCreate = dateRange;
        if (managerIds) w.responsibleManagerId = { in: managerIds };
        if (sourceIds) w.sourceId = { in: sourceIds };
        if (leadBitrixIdsFromPipelines)
          w.bitrixLeadId = { in: leadBitrixIdsFromPipelines };
        return w;
      })(),
      _count: { bitrixLeadId: true },
      orderBy: { _count: { bitrixLeadId: "desc" } },
    });
    const leadBreakdown = leadStatusRows.map((r) => ({
      name: r.statusName || "Noma'lum",
      count: r._count.bitrixLeadId,
    }));

    // ─── 7) Rad etish sabablari ("Sifatsiz lid" — UF_CRM_69CFC6BD9EFCB) ──
    // A usul: sabab belgilangan HAR QANDAY deal (semanticId filtrisiz). Bu
    // portalda sabab F-deal'ga emas, NEW/P (jarayonda) deal'ga belgilanadi,
    // shuning uchun semanticId:"F" filtri bo'lmaydi. Davr filtri leadCreatedAt
    // (closedAt EMAS — sabab yopilmagan deal'da, closedAt reja sanasi bo'lib aldaydi).
    const dealRejectRows = await prisma.salesLead.groupBy({
      by: ["closeReasonName"],
      where: (() => {
        const w: Record<string, unknown> = {
          companyId,
          closeReasonName: { not: null },
        };
        if (dateRange) w.leadCreatedAt = dateRange;
        if (pipelineIds) w.pipelineId = { in: pipelineIds };
        if (managerIds) w.responsibleManagerId = { in: managerIds };
        if (bitrixLeadIdsFromSources)
          w.originalLeadId =
            bitrixLeadIdsFromSources.length > 0
              ? { in: bitrixLeadIdsFromSources }
              : { in: [-1] };
        return w;
      })(),
      _count: { leadId: true },
      orderBy: { _count: { leadId: "desc" } },
    });

    const rejectionBreakdown = dealRejectRows
      .filter((r) => r.closeReasonName && r._count.leadId > 0)
      .map((r) => ({
        name: r.closeReasonName as string,
        count: r._count.leadId,
      }));

    success(res, {
      period: {
        key: period,
        from: dateRange?.gte?.toISOString() || null,
        to: dateRange?.lte?.toISOString() || null,
      },
      // ROZGOVOR: sotuv = to'lov qilgan deal, konversiya cohort-based (frontend label uchun)
      kpiFromLeads,
      kpis: {
        leadCount,
        qualifiedLeadCount,
        qualifiedLeadRate: Math.round(qualifiedLeadRate * 10) / 10,
        salesCount,
        conversionRate: Math.round(conversionRate * 10) / 10,
        totalRevenue,
        avgCheck: Math.round(avgCheck),
        partialPaymentCount,
        partialPaymentRevenue,
      },
      forecast,
      previousKpis,
      previousPeriod: prevRange
        ? {
            from: prevRange.gte?.toISOString() || null,
            to: prevRange.lte?.toISOString() || null,
          }
        : null,
      cycle,
      timeToContact,
      byManager,
      leadBreakdown,
      rejectionBreakdown,
    });
  } catch (err) {
    console.error("Sales overview error:", err);
    error(res, "Sotuv statistikasini olishda xatolik");
  }
};

// ── Источник (Lead sources) ro'yxati — Sales filter uchun ─────────────
export const getSalesSources = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const sourceMap = await getSourceMap();
    const rows = await prisma.lead.groupBy({
      by: ["sourceId"],
      where: { companyId },
      _count: { bitrixLeadId: true },
      orderBy: { _count: { bitrixLeadId: "desc" } },
    });
    const sources = rows
      .filter((r) => r.sourceId)
      .map((r) => ({
        id: r.sourceId!,
        name: sourceMap.get(r.sourceId!) || r.sourceId!,
        leadCount: r._count.bitrixLeadId,
      }));
    success(res, { sources });
  } catch (err) {
    console.error("Sales sources error:", err);
    error(res, "Manbalarni olishda xatolik");
  }
};

// ── Pipelines (voronkalar) ro'yxati — Sales filter uchun ──────────────
export const getPipelines = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const rows = await prisma.salesLead.groupBy({
      by: ["pipelineId", "pipelineName"],
      where: { companyId },
      _count: { leadId: true },
      orderBy: { _count: { leadId: "desc" } },
    });
    const pipelines = rows
      .filter((r) => r.pipelineId !== null)
      .map((r) => ({
        id: r.pipelineId!,
        name: r.pipelineName || `Pipeline ${r.pipelineId}`,
        dealCount: r._count.leadId,
      }));
    success(res, { pipelines });
  } catch (err) {
    console.error("Pipelines error:", err);
    error(res, "Voronkalarni olishda xatolik");
  }
};

// ── Menejerlar Sotuv paneli uchun ma'lumotlar ──────────────────────────
// Har menejer uchun: sifatli lid, konversiya, sotuv, tushum, overall score,
// sparkline (kunlik sotuv), funnel (lid → sifatli → sotuv).
export const getManagersSales = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const pipelineIds = parsePipelineIds(req.query.pipelineIds);
    const managerFilterIds = parseManagerIds(req.query.managerIds);
    const sourceIds = parseSourceIds(req.query.sourceIds);
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";
    const dateRange = getDateRange(period, dateFrom, dateTo);

    // Source filter — tegishli Lead.bitrixLeadId to'plami orqali deal'larni cheklaymiz
    const bitrixLeadIdsFromSources = sourceIds
      ? await resolveBitrixLeadIdsForSources(companyId, sourceIds)
      : null;

    // KPI modeli — overview/detal bilan bir xil bo'lishi uchun (ROZGOVOR = "leads")
    const companyKpi = await prisma.company.findUnique({
      where: { id: companyId },
      select: { leadKpiSource: true },
    });
    const kpiFromLeads = companyKpi?.leadKpiSource === "leads";

    const managers = await prisma.manager.findMany({
      where: {
        companyId,
        isActive: true,
        ...(managerFilterIds ? { id: { in: managerFilterIds } } : {}),
        ...(search
          ? { name: { contains: search, mode: "insensitive" as const } }
          : {}),
      },
      select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true },
    });

    // Leadlar
    const leadWhere: Record<string, unknown> = { companyId };
    if (dateRange) leadWhere.dateCreate = dateRange;
    if (managerFilterIds) leadWhere.responsibleManagerId = { in: managerFilterIds };
    if (sourceIds) leadWhere.sourceId = { in: sourceIds };
    const leads = await prisma.lead.findMany({
      where: leadWhere,
      select: {
        responsibleManagerId: true,
        isConverted: true,
        statusId: true,
        bitrixLeadId: true,
        opportunity: true,
      },
    });

    // Sotuvlar — leads-mode: 100% To'lov lidlarning deallari; ProSales: won+partial
    const sales: Array<{
      responsibleManagerId: string | null;
      price: number | null;
      closedAt: Date | null;
    }> = [];
    if (kpiFromLeads) {
      // SOTUV = 100% To'lov (CONVERTED) lidlar; tushum = ularning deal narxlari,
      // sotuv lidining menejeriga atributsiya (salesCount esa lidlardan sanaladi).
      const convLeadMgr = new Map<number, string>();
      for (const l of leads) {
        if (l.isConverted && l.bitrixLeadId != null && l.responsibleManagerId) {
          convLeadMgr.set(l.bitrixLeadId, l.responsibleManagerId);
        }
      }
      const convIds = [...convLeadMgr.keys()];
      if (convIds.length > 0) {
        const dealW: Record<string, unknown> = {
          companyId,
          originalLeadId: { in: convIds },
        };
        if (pipelineIds) dealW.pipelineId = { in: pipelineIds };
        const convDeals = await prisma.salesLead.findMany({
          where: dealW,
          select: {
            originalLeadId: true,
            price: true,
            agreedPaymentDate: true,
            closedAt: true,
          },
        });
        const seen = new Set<number>();
        for (const d of convDeals) {
          if (d.originalLeadId == null || seen.has(d.originalLeadId)) continue;
          seen.add(d.originalLeadId);
          sales.push({
            responsibleManagerId: convLeadMgr.get(d.originalLeadId) || null,
            price: d.price,
            closedAt: d.agreedPaymentDate || d.closedAt,
          });
        }
      }
    } else {
      // Sotuvlar (closed won)
      const saleWhere: Record<string, unknown> = {
        companyId,
        isSale: true,
      };
      if (dateRange) saleWhere.closedAt = dateRange;
      if (pipelineIds) saleWhere.pipelineId = { in: pipelineIds };
      if (managerFilterIds) saleWhere.responsibleManagerId = { in: managerFilterIds };
      if (bitrixLeadIdsFromSources) {
        saleWhere.originalLeadId =
          bitrixLeadIdsFromSources.length > 0
            ? { in: bitrixLeadIdsFromSources }
            : { in: [-1] };
      }
      const wonSales = await prisma.salesLead.findMany({
        where: saleWhere,
        select: {
          responsibleManagerId: true,
          price: true,
          closedAt: true,
          leadId: true,
        },
      });

      // Qisman to'lov — ochiq (won/lost emas)
      const partialsWhere: Record<string, unknown> = {
        companyId,
        isPartialPayment: true,
        semanticId: { notIn: ["S", "F"] },
      };
      if (dateRange) partialsWhere.leadCreatedAt = dateRange;
      if (pipelineIds) partialsWhere.pipelineId = { in: pipelineIds };
      if (managerFilterIds)
        partialsWhere.responsibleManagerId = { in: managerFilterIds };
      if (bitrixLeadIdsFromSources) {
        partialsWhere.originalLeadId =
          bitrixLeadIdsFromSources.length > 0
            ? { in: bitrixLeadIdsFromSources }
            : { in: [-1] };
      }
      const partialSales = await prisma.salesLead.findMany({
        where: partialsWhere,
        select: {
          responsibleManagerId: true,
          price: true,
          leadCreatedAt: true,
          leadId: true,
        },
      });

      // Dedup
      const saleIdSet = new Set<number>();
      for (const r of wonSales) {
        if (saleIdSet.has(r.leadId)) continue;
        saleIdSet.add(r.leadId);
        sales.push({
          responsibleManagerId: r.responsibleManagerId,
          price: r.price,
          closedAt: r.closedAt,
        });
      }
      for (const r of partialSales) {
        if (saleIdSet.has(r.leadId)) continue;
        saleIdSet.add(r.leadId);
        sales.push({
          responsibleManagerId: r.responsibleManagerId,
          price: r.price,
          closedAt: r.leadCreatedAt, // ochiq partial — closedAt yo'q, sparkline'da leadCreatedAt ishlatamiz
        });
      }
    }

    // Davrda yopilgan BARCHA deallar (won + lost) — konversiya uchun denominator
    // Shu davrda aktualno "tugallangan" ishlar: sotuv yoki rad.
    const closedWhere: Record<string, unknown> = {
      companyId,
      semanticId: { in: ["S", "F"] },
    };
    if (dateRange) closedWhere.closedAt = dateRange;
    if (pipelineIds) closedWhere.pipelineId = { in: pipelineIds };
    if (managerFilterIds) closedWhere.responsibleManagerId = { in: managerFilterIds };
    if (bitrixLeadIdsFromSources) {
      closedWhere.originalLeadId =
        bitrixLeadIdsFromSources.length > 0
          ? { in: bitrixLeadIdsFromSources }
          : { in: [-1] };
    }
    const closedDeals = await prisma.salesLead.findMany({
      where: closedWhere,
      select: { responsibleManagerId: true, isSale: true },
    });

    // Kunlik sotuv uchun davr chegaralari
    const rangeStart = dateRange?.gte || null;
    const rangeEnd = dateRange?.lte || new Date();
    const DAY_MS = 24 * 3600 * 1000;
    let dayKeys: string[] = [];
    if (rangeStart) {
      const startMs = rangeStart.getTime();
      const endMs = rangeEnd.getTime();
      const dayCount = Math.max(
        1,
        Math.ceil((endMs - startMs) / DAY_MS)
      );
      for (let i = 0; i < dayCount; i += 1) {
        const dt = new Date(startMs + i * DAY_MS);
        dayKeys.push(dt.toISOString().slice(0, 10));
      }
    }

    type MgrAgg = {
      leadCount: number;
      qualifiedLeadCount: number;
      salesCount: number;
      closedTotal: number; // bu davrda yopilgan barcha dealar (S+F)
      revenue: number;
      sparkline: Map<string, number>;
    };
    const agg = new Map<string, MgrAgg>();
    const ensure = (id: string): MgrAgg => {
      let v = agg.get(id);
      if (!v) {
        v = {
          leadCount: 0,
          qualifiedLeadCount: 0,
          salesCount: 0,
          closedTotal: 0,
          revenue: 0,
          sparkline: new Map(),
        };
        for (const k of dayKeys) v.sparkline.set(k, 0);
        agg.set(id, v);
      }
      return v;
    };

    const junkByMgr = new Map<string, number>();
    for (const l of leads) {
      if (!l.responsibleManagerId) continue;
      const cur = ensure(l.responsibleManagerId);
      cur.leadCount += 1;
      if (kpiFromLeads) {
        if (l.statusId === LEADS_JUNK_STATUS_ID) {
          junkByMgr.set(
            l.responsibleManagerId,
            (junkByMgr.get(l.responsibleManagerId) || 0) + 1
          );
        }
        if (l.isConverted) {
          cur.salesCount += 1; // SOTUV = 100% To'lov
          cur.revenue += l.opportunity || 0; // TUSHUM = lid OPPORTUNITY (Bitrix bilan mos)
        }
      } else if (l.isConverted) {
        cur.qualifiedLeadCount += 1;
      }
    }
    // leads-mode: SIFATLI LID = lid − junk
    if (kpiFromLeads) {
      for (const [mId, cur] of agg) {
        cur.qualifiedLeadCount = cur.leadCount - (junkByMgr.get(mId) || 0);
      }
    }

    for (const s of sales) {
      if (!s.responsibleManagerId) continue;
      const cur = ensure(s.responsibleManagerId);
      // leads-mode: salesCount lidlardan, revenue lid OPPORTUNITY'dan (yuqorida).
      // sales faqat sparkline uchun. ProSales: deal narxi.
      if (!kpiFromLeads) {
        cur.salesCount += 1;
        cur.revenue += s.price || 0;
      }
      if (s.closedAt) {
        const key = s.closedAt.toISOString().slice(0, 10);
        if (cur.sparkline.has(key)) {
          cur.sparkline.set(key, (cur.sparkline.get(key) || 0) + 1);
        }
      }
    }

    for (const c of closedDeals) {
      if (!c.responsibleManagerId) continue;
      const cur = ensure(c.responsibleManagerId);
      cur.closedTotal += 1;
    }

    // Overall score: konversiya (50%) + share of total revenue (50%), 0–100
    // leads-mode: TUSHUM = lid OPPORTUNITY (agg.revenue); ProSales: deal narxi.
    const totalRevenue = kpiFromLeads
      ? [...agg.values()].reduce((s, a) => s + a.revenue, 0)
      : sales.reduce((s, r) => s + cleanPrice(r.price), 0);
    const rows = managers
      .map((m) => {
        // Barcha aktiv menejer ko'rinsin — aktivligi yo'qlar nol bilan.
        const a = agg.get(m.id) ?? {
          leadCount: 0,
          qualifiedLeadCount: 0,
          salesCount: 0,
          closedTotal: 0,
          revenue: 0,
          sparkline: new Map<string, number>(dayKeys.map((k) => [k, 0] as [string, number])),
        };
        // Qual lid:
        //  - "leads" modeli (ROZGOVOR): Lead.isConverted — overview/detal bilan bir xil.
        //  - "deals" modeli (ProSales): bu davrda yopilgan barcha deallar (won+lost).
        // Konv = sotuv / qual lid (har doim 0-100%).
        const qualForCard = kpiFromLeads ? a.qualifiedLeadCount : a.closedTotal;
        const conversion =
          qualForCard > 0
            ? Math.min(100, (a.salesCount / qualForCard) * 100)
            : 0;
        const revenueShare = totalRevenue > 0 ? (a.revenue / totalRevenue) * 100 : 0;
        const overallScore = Math.round(
          Math.min(100, conversion * 0.5 + revenueShare * 2.5)
        );
        return {
          managerId: m.id,
          managerName: m.name,
          role: m.role,
          photoUrl: m.customPhotoUrl || m.photoUrl,
          leadCount: a.leadCount,
          qualifiedLeadCount: qualForCard,
          salesCount: a.salesCount,
          revenue: a.revenue,
          conversionRate: Math.round(conversion * 10) / 10,
          overallScore,
          sparkline: [...a.sparkline.entries()].map(([date, count]) => ({
            date,
            count,
          })),
          funnel: {
            lead: a.leadCount,
            qualified: qualForCard,
            sale: a.salesCount,
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.revenue - a.revenue);

    success(res, {
      period: {
        key: period,
        from: dateRange?.gte?.toISOString() || null,
        to: dateRange?.lte?.toISOString() || null,
      },
      managers: rows,
    });
  } catch (err) {
    console.error("Managers sales error:", err);
    error(res, "Menejerlar sotuv statistikasini olishda xatolik");
  }
};

// ── Bitrix task/zadacha statistikasi ────────────────────────────────
// Umumiy zadach  — COMPLETED=N bo'lgan barcha ochiq aktivliklar
// Prosrochenniy  — COMPLETED=N AND DEADLINE < hozir
// Bugungi        — COMPLETED=N AND DEADLINE bugungi Tashkent kun ichida
// Bez zadach     — ochiq deallar (STAGE_SEMANTIC_ID=P) orasida ochiq zadacha
//                  qo'yilmaganlari soni
export const getSalesTaskStats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // 60 soniyalik cache — Bitrix activity API sekin, real-time aniqlik shart emas
    const companyId = req.companyId!;
    const cacheKey = `task-stats:${companyId}:${req.query.managerIds || "*"}:${req.query.pipelineIds || "*"}`;
    const cached = cache.get<unknown>(cacheKey);
    if (cached) {
      success(res, cached);
      return;
    }

    const tNow = nowInTashkent();
    const y = tNow.getUTCFullYear();
    const m = tNow.getUTCMonth() + 1;
    const d = tNow.getUTCDate();

    const nowIso = new Date().toISOString();
    const todayStartIso = tashkentStartOfDay(y, m, d).toISOString();
    const todayEndIso = tashkentEndOfDay(y, m, d).toISOString();

    // Manager filter (bitrix_123 → 123)
    const managerIds = parseManagerIds(req.query.managerIds);
    const bitrixUserIds = managerIds
      ? managerIds
          .map((id) => {
            const m = id.match(/^bitrix_(\d+)$/);
            return m ? Number(m[1]) : null;
          })
          .filter((n): n is number => n !== null)
      : null;

    // Pipeline filter
    const pipelineIds = parsePipelineIds(req.query.pipelineIds);

    // Base activity filter bilan manager filter qo'shamiz
    const withMgr = (f: Record<string, unknown>) => {
      const base = { ...f };
      if (bitrixUserIds && bitrixUserIds.length > 0) {
        base.RESPONSIBLE_ID = bitrixUserIds;
      }
      return base;
    };

    // Ochiq deal'larni avval olamiz — task hisobini shu deal'lar bilan cheklaymiz.
    // Pipeline filter qo'llaniladi (agar berilgan bo'lsa) — Bitrix CRM widget bilan mos.
    const dealsFilter: Record<string, unknown> = { STAGE_SEMANTIC_ID: "P" };
    if (pipelineIds && pipelineIds.length > 0) dealsFilter.CATEGORY_ID = pipelineIds;
    if (bitrixUserIds && bitrixUserIds.length > 0) dealsFilter.ASSIGNED_BY_ID = bitrixUserIds;
    const openDeals = await bitrixFetchAll<{ ID: string }>("crm.deal.list", {
      filter: dealsFilter,
      select: ["ID"],
    });
    const openDealIds = new Set(openDeals.map((x) => String(x.ID)));
    const openDealIdsArr = Array.from(openDealIds).map((id) => Number(id)).filter((n) => !isNaN(n));

    // Task widget hisoblari — faqat shu ochiq deal'lardagi zadach'lar (OWNER_TYPE_ID=2)
    // Bitrix API'da OWNER_ID array bo'lib filter qo'yiladi: @OWNER_ID
    const dealOwnerFilter: Record<string, unknown> = openDealIdsArr.length > 0
      ? { OWNER_TYPE_ID: 2, "@OWNER_ID": openDealIdsArr }
      : { OWNER_TYPE_ID: 2, OWNER_ID: -1 };

    // 1) Umumiy ochiq zadach
    const totalResp = await bitrixCall("crm.activity.list", {
      filter: withMgr({ COMPLETED: "N", ...dealOwnerFilter }),
      select: ["ID"],
      start: 0,
    });
    const totalOpen = totalResp.total || 0;

    // 2) Prosrochenniy
    const overdueResp = await bitrixCall("crm.activity.list", {
      filter: withMgr({ COMPLETED: "N", "<DEADLINE": nowIso, ...dealOwnerFilter }),
      select: ["ID"],
      start: 0,
    });
    const overdue = overdueResp.total || 0;

    // 3) Bugungi
    const todayResp = await bitrixCall("crm.activity.list", {
      filter: withMgr({
        COMPLETED: "N",
        ">=DEADLINE": todayStartIso,
        "<=DEADLINE": todayEndIso,
        ...dealOwnerFilter,
      }),
      select: ["ID"],
      start: 0,
    });
    const today = todayResp.total || 0;

    // 4) Bez zadach
    const activities = await bitrixFetchAll<{ OWNER_ID: string }>(
      "crm.activity.list",
      {
        filter: withMgr({ COMPLETED: "N", ...dealOwnerFilter }),
        select: ["OWNER_ID"],
      }
    );
    const dealsWithTask = new Set(activities.map((a) => String(a.OWNER_ID)));

    let dealsWithoutTask = 0;
    for (const id of openDealIds) {
      if (!dealsWithTask.has(id)) dealsWithoutTask += 1;
    }

    const result = {
      totalOpen,
      overdue,
      today,
      dealsWithoutTask,
      openDeals: openDealIds.size,
    };
    cache.set(cacheKey, result, 60 * 1000); // 60 soniya
    success(res, result);
  } catch (err) {
    console.error("Sales task stats error:", err);
    error(res, "Zadach statistikasini olishda xatolik");
  }
};

// ── GET /api/sales/task-list?kind=total|overdue|today|noTask ─────────────
// Zadach KPI cardlardan ochiladigan ro'yxat. Manager filter va Aktiv bo'lim
// cheklovi qo'llanadi.
export const getSalesTaskList = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const kindRaw = String(req.query.kind || "total");
    const kind = (["total", "overdue", "today", "noTask"] as const).includes(
      kindRaw as "total" | "overdue" | "today" | "noTask",
    )
      ? (kindRaw as "total" | "overdue" | "today" | "noTask")
      : "total";

    // 60 soniyalik cache — Bitrix activity ro'yxati sekin chiqaradi
    const taskCacheKey = `task-list:${companyId}:${kind}:${req.query.managerIds || "*"}:${req.query.pipelineIds || "*"}`;
    const cachedList = cache.get<unknown>(taskCacheKey);
    if (cachedList) {
      success(res, cachedList);
      return;
    }

    const tNow = nowInTashkent();
    const y = tNow.getUTCFullYear();
    const m = tNow.getUTCMonth() + 1;
    const d = tNow.getUTCDate();
    const nowIso = new Date().toISOString();
    const todayStartIso = tashkentStartOfDay(y, m, d).toISOString();
    const todayEndIso = tashkentEndOfDay(y, m, d).toISOString();

    const managerIds = parseManagerIds(req.query.managerIds);
    const pipelineIds = parsePipelineIds(req.query.pipelineIds);

    // Aktiv bo'lim cheklovi
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { activeDepartmentIds: true },
    });
    const activeDeptIds = company?.activeDepartmentIds || [];
    let allowedManagerIds: string[] | null = null;
    if (activeDeptIds.length > 0) {
      const mgrs = await prisma.manager.findMany({
        where: { companyId, departmentId: { in: activeDeptIds } },
        select: { id: true },
      });
      allowedManagerIds = mgrs.map((m) => m.id);
      if (allowedManagerIds.length === 0) allowedManagerIds = ["__no_match__"];
    }

    const effectiveManagerIds = (() => {
      if (!allowedManagerIds) return managerIds;
      if (!managerIds) return allowedManagerIds;
      const allowed = new Set(allowedManagerIds);
      const intersect = managerIds.filter((id) => allowed.has(id));
      return intersect.length > 0 ? intersect : ["__no_match__"];
    })();

    // bitrix_NN → NN
    const bitrixUserIds = effectiveManagerIds
      ? effectiveManagerIds
          .map((id) => {
            const mt = id.match(/^bitrix_(\d+)$/);
            return mt ? Number(mt[1]) : null;
          })
          .filter((n): n is number => n !== null)
      : null;

    const withMgr = (f: Record<string, unknown>) => {
      const base = { ...f };
      if (bitrixUserIds && bitrixUserIds.length > 0) {
        base.RESPONSIBLE_ID = bitrixUserIds;
      }
      return base;
    };

    // Manager nomi — Bitrix user ID dan
    const localMgrs = await prisma.manager.findMany({
      where: { companyId },
      select: { id: true, name: true, photoUrl: true, customPhotoUrl: true },
    });
    const mgrByBitrixId = new Map<string, { id: string; name: string; photoUrl: string | null; customPhotoUrl: string | null }>();
    for (const m of localMgrs) {
      const mt = m.id.match(/^bitrix_(\d+)$/);
      if (mt) mgrByBitrixId.set(mt[1], m);
    }

    if (kind === "noTask") {
      // Open dealdan task'siz bo'lganlar
      const dealsFilter: Record<string, unknown> = { STAGE_SEMANTIC_ID: "P" };
      if (pipelineIds && pipelineIds.length > 0)
        dealsFilter.CATEGORY_ID = pipelineIds;
      if (bitrixUserIds && bitrixUserIds.length > 0)
        dealsFilter.ASSIGNED_BY_ID = bitrixUserIds;

      const openDeals = await bitrixFetchAll<{
        ID: string;
        TITLE: string;
        ASSIGNED_BY_ID: string;
        STAGE_NAME: string;
        DATE_CREATE: string;
      }>("crm.deal.list", {
        filter: dealsFilter,
        select: ["ID", "TITLE", "ASSIGNED_BY_ID", "STAGE_NAME", "DATE_CREATE"],
      });

      const activities = await bitrixFetchAll<{ OWNER_ID: string }>(
        "crm.activity.list",
        {
          filter: withMgr({ COMPLETED: "N", OWNER_TYPE_ID: 2 }),
          select: ["OWNER_ID"],
        },
      );
      const dealsWithTask = new Set(activities.map((a) => String(a.OWNER_ID)));

      const items = openDeals
        .filter((dd) => !dealsWithTask.has(String(dd.ID)))
        .slice(0, 1000)
        .map((dd) => {
          const mgr = mgrByBitrixId.get(String(dd.ASSIGNED_BY_ID));
          return {
            id: String(dd.ID),
            title: dd.TITLE || `Deal #${dd.ID}`,
            statusName: dd.STAGE_NAME,
            date: dd.DATE_CREATE,
            manager: mgr?.name || null,
            managerPhotoUrl: mgr?.customPhotoUrl || mgr?.photoUrl || null,
            type: "deal",
          };
        });

      const noTaskResult = { kind, count: items.length, items };
      cache.set(taskCacheKey, noTaskResult, 60 * 1000);
      success(res, noTaskResult);
      return;
    }

    // total / overdue / today — crm.activity.list
    const baseFilter: Record<string, unknown> = withMgr({ COMPLETED: "N" });
    if (kind === "overdue") baseFilter["<DEADLINE"] = nowIso;
    if (kind === "today") {
      baseFilter[">=DEADLINE"] = todayStartIso;
      baseFilter["<=DEADLINE"] = todayEndIso;
    }

    const acts = await bitrixFetchAll<{
      ID: string;
      SUBJECT: string;
      DEADLINE: string | null;
      RESPONSIBLE_ID: string;
      OWNER_ID: string;
      OWNER_TYPE_ID: string;
      DESCRIPTION: string;
      TYPE_ID: string;
      CREATED: string;
    }>("crm.activity.list", {
      filter: baseFilter,
      select: [
        "ID",
        "SUBJECT",
        "DEADLINE",
        "RESPONSIBLE_ID",
        "OWNER_ID",
        "OWNER_TYPE_ID",
        "TYPE_ID",
        "CREATED",
      ],
      order: kind === "today" ? { DEADLINE: "ASC" } : { CREATED: "DESC" },
    });

    const items = acts.slice(0, 1000).map((a) => {
      const mgr = mgrByBitrixId.get(String(a.RESPONSIBLE_ID));
      return {
        id: String(a.ID),
        title: a.SUBJECT || `Aktivlik #${a.ID}`,
        statusName: a.DEADLINE
          ? new Date(a.DEADLINE).toLocaleDateString("uz-UZ")
          : null,
        date: a.DEADLINE || a.CREATED,
        manager: mgr?.name || null,
        managerPhotoUrl: mgr?.customPhotoUrl || mgr?.photoUrl || null,
        type: "activity",
        ownerId: a.OWNER_ID ? String(a.OWNER_ID) : null,
      };
    });

    const taskResult = { kind, count: items.length, items };
    cache.set(taskCacheKey, taskResult, 60 * 1000);
    success(res, taskResult);
  } catch (err) {
    console.error("Sales task list error:", err);
    error(res, "Zadach ro'yxatini olishda xatolik");
  }
};

// ── GET /api/sales/kelishilgan-tolov — "Kelishilgan to'lov" KPI ─────────
// Bitrix custom field UF_CRM_1761119000060 — "Kelishilgan to'lov sanasi".
// Davr ichida shu sana tushadigan dealar (hamma statuslar) — frontend
// KpiCard + modalda ko'rsatadi.
// KPI cardlardan ochiladigan lid ro'yxati endpoint.
// kind: "lid" — barcha Bitrix leadlar (Lead jadvali)
//       "qualified" — Lead.isConverted = true (sifatli lid)
//       "sotuv"  — SalesLead.isSale = true
export const getKpiLeadsList = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const kindRaw = String(req.query.kind || "lid");
    const kind = (["lid", "qualified", "sotuv"] as const).includes(
      kindRaw as "lid" | "qualified" | "sotuv",
    )
      ? (kindRaw as "lid" | "qualified" | "sotuv")
      : "lid";

    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const pipelineIds = parsePipelineIds(req.query.pipelineIds);
    const managerIds = parseManagerIds(req.query.managerIds);
    const sourceIds = parseSourceIds(req.query.sourceIds);

    const dateRange = getDateRange(period, dateFrom, dateTo);

    // Aktiv bo'limlar — boshliq tanlagan bo'lsa shu bo'lim menejerlarini olamiz
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { activeDepartmentIds: true },
    });
    const activeDeptIds = company?.activeDepartmentIds || [];
    let activeDeptManagerIds: string[] | null = null;
    if (activeDeptIds.length > 0) {
      const mgrs = await prisma.manager.findMany({
        where: { companyId, departmentId: { in: activeDeptIds } },
        select: { id: true },
      });
      activeDeptManagerIds = mgrs.map((m) => m.id);
      if (activeDeptManagerIds.length === 0) activeDeptManagerIds = ["__no_match__"];
    }

    // Joriy filter managerId va aktiv bo'lim cheklovini birlashtiramiz
    const effectiveManagerIds = (() => {
      if (!activeDeptManagerIds) return managerIds; // aktiv bo'lim sozlanmagan
      if (!managerIds) return activeDeptManagerIds; // faqat aktiv bo'lim
      const allowed = new Set(activeDeptManagerIds);
      const intersect = managerIds.filter((id) => allowed.has(id));
      return intersect.length > 0 ? intersect : ["__no_match__"];
    })();

    const leadBitrixIdsFromPipelines = pipelineIds
      ? await resolveLeadIdsForPipelines(companyId, pipelineIds)
      : null;
    const bitrixLeadIdsFromSources = sourceIds
      ? await resolveBitrixLeadIdsForSources(companyId, sourceIds)
      : null;

    const sourceMap = await getSourceMap();

    if (kind === "sotuv") {
      // SalesLead.isSale=true (won, davrda yopilgan) + isPartialPayment=true (ochiq qisman to'lov)
      const wonW: Record<string, unknown> = { companyId, isSale: true };
      if (dateRange) wonW.closedAt = dateRange;
      if (pipelineIds) wonW.pipelineId = { in: pipelineIds };
      if (effectiveManagerIds) wonW.responsibleManagerId = { in: effectiveManagerIds };
      if (bitrixLeadIdsFromSources) {
        wonW.originalLeadId = { in: bitrixLeadIdsFromSources };
      }

      const partialW: Record<string, unknown> = {
        companyId,
        isPartialPayment: true,
        semanticId: { notIn: ["S", "F"] },
      };
      if (dateRange) partialW.leadCreatedAt = dateRange;
      if (pipelineIds) partialW.pipelineId = { in: pipelineIds };
      if (effectiveManagerIds) partialW.responsibleManagerId = { in: effectiveManagerIds };
      if (bitrixLeadIdsFromSources) {
        partialW.originalLeadId = { in: bitrixLeadIdsFromSources };
      }

      const dealSelect = {
        leadId: true,
        statusName: true,
        pipelineName: true,
        price: true,
        closedAt: true,
        leadCreatedAt: true,
        originalLeadId: true,
        manager: { select: { id: true, name: true, photoUrl: true, customPhotoUrl: true } },
      } as const;

      const [wonDeals, partialDeals] = await Promise.all([
        prisma.salesLead.findMany({ where: wonW, select: dealSelect, orderBy: { closedAt: "desc" }, take: 1000 }),
        prisma.salesLead.findMany({ where: partialW, select: dealSelect, orderBy: { leadCreatedAt: "desc" }, take: 1000 }),
      ]);

      const seen = new Set<number>();
      const deals: typeof wonDeals = [];
      for (const d of [...wonDeals, ...partialDeals]) {
        if (seen.has(d.leadId)) continue;
        seen.add(d.leadId);
        deals.push(d);
      }

      // Source nomi + telefon — originalLeadId orqali Lead jadvalidan
      const originalIds = deals
        .map((d) => d.originalLeadId)
        .filter((v): v is number => v != null);
      const leadSourceMap = new Map<number, string | null>();
      const leadPhoneMap = new Map<number, string | null>();
      if (originalIds.length > 0) {
        const leads = await prisma.lead.findMany({
          where: { companyId, bitrixLeadId: { in: originalIds } },
          select: { bitrixLeadId: true, sourceId: true, clientPhone: true },
        });
        for (const l of leads) {
          leadSourceMap.set(l.bitrixLeadId, l.sourceId);
          leadPhoneMap.set(l.bitrixLeadId, l.clientPhone);
        }
      }

      const totalAmount = deals.reduce((s, d) => s + cleanPrice(d.price), 0);
      success(res, {
        kind,
        count: deals.length,
        totalAmount,
        items: deals.map((d) => {
          const srcId = d.originalLeadId
            ? leadSourceMap.get(d.originalLeadId) || null
            : null;
          const phone = d.originalLeadId
            ? leadPhoneMap.get(d.originalLeadId) || null
            : null;
          return {
            id: String(d.leadId ?? ""),
            title: d.statusName || `Deal #${d.leadId}`,
            pipelineName: d.pipelineName,
            price: d.price,
            date: d.closedAt || d.leadCreatedAt,
            sourceName: srcId ? sourceMap.get(srcId) || srcId : null,
            clientPhone: phone,
            manager: d.manager?.name || null,
            managerPhotoUrl: d.manager?.customPhotoUrl || d.manager?.photoUrl || null,
          };
        }),
      });
      return;
    }

    // "lid" yoki "qualified" — Lead jadvalidan
    const where: Record<string, unknown> = { companyId };
    if (dateRange) where.dateCreate = dateRange;
    if (effectiveManagerIds) where.responsibleManagerId = { in: effectiveManagerIds };
    if (kind === "qualified") where.isConverted = true;

    // Source filter — to'g'ridan-to'g'ri Lead.sourceId
    if (sourceIds) where.sourceId = { in: sourceIds };

    // Pipeline filter — leadlarni ma'lum pipeline'dagi dealga aylangan deb cheklaymiz
    if (leadBitrixIdsFromPipelines) {
      where.bitrixLeadId = { in: leadBitrixIdsFromPipelines };
    }

    const leads = await prisma.lead.findMany({
      where,
      select: {
        id: true,
        bitrixLeadId: true,
        title: true,
        clientPhone: true,
        statusName: true,
        sourceId: true,
        opportunity: true,
        dateCreate: true,
        isConverted: true,
        manager: { select: { id: true, name: true, photoUrl: true, customPhotoUrl: true } },
      },
      orderBy: { dateCreate: "desc" },
      take: 1000,
    });

    success(res, {
      kind,
      count: leads.length,
      items: leads.map((l) => ({
        id: String(l.bitrixLeadId),
        title: l.title || `Lid #${l.bitrixLeadId}`,
        clientPhone: l.clientPhone,
        statusName: l.statusName,
        opportunity: l.opportunity || 0,
        date: l.dateCreate,
        sourceName: l.sourceId ? sourceMap.get(l.sourceId) || l.sourceId : null,
        manager: l.manager?.name || null,
        managerPhotoUrl: l.manager?.customPhotoUrl || l.manager?.photoUrl || null,
        isConverted: l.isConverted,
      })),
    });
  } catch (err) {
    console.error("getKpiLeadsList error:", err);
    error(res, "Lid ro'yxatini olishda xatolik");
  }
};

export const getKelishilganTolov = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const period = (req.query.period as string) || "month";
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const pipelineIds = parsePipelineIds(req.query.pipelineIds);
    const managerIds = parseManagerIds(req.query.managerIds);
    const sourceIds = parseSourceIds(req.query.sourceIds);

    const dateRange = getDateRange(period, dateFrom, dateTo);

    const bitrixLeadIdsFromSources = sourceIds
      ? await resolveBitrixLeadIdsForSources(companyId, sourceIds)
      : null;

    const companyKpi = await prisma.company.findUnique({
      where: { id: companyId },
      select: { leadKpiSource: true },
    });
    const kpiFromLeads = companyKpi?.leadKpiSource === "leads";

    const periodOut = {
      key: period,
      from: dateRange?.gte?.toISOString() || null,
      to: dateRange?.lte?.toISOString() || null,
    };

    if (kpiFromLeads) {
      // ROZGOVOR — KELISHILGAN TO'LOV = "3 kun ichida to'lov qiladi" +
      // "Kitob sotib olganlar" statusidagi lidlar (to'lovga kelishganlar).
      const leadW: Record<string, unknown> = {
        companyId,
        statusId: { in: LEADS_AGREED_STATUS_IDS },
      };
      if (dateRange) leadW.dateCreate = dateRange;
      if (managerIds) leadW.responsibleManagerId = { in: managerIds };
      if (sourceIds) leadW.sourceId = { in: sourceIds };
      const leads = await prisma.lead.findMany({
        where: leadW,
        select: {
          bitrixLeadId: true,
          statusName: true,
          opportunity: true,
          dateCreate: true,
          responsibleManagerId: true,
          manager: { select: { name: true } },
        },
        orderBy: { dateCreate: "asc" },
        take: 500,
      });
      const amount = leads.reduce((sum, l) => sum + cleanPrice(l.opportunity), 0);
      success(res, {
        count: leads.length,
        amount,
        period: periodOut,
        deals: leads.map((l) => ({
          id: String(l.bitrixLeadId ?? ""),
          title: l.statusName || `Lead #${l.bitrixLeadId}`,
          agreedPaymentDate: l.dateCreate,
          price: l.opportunity,
          pipelineName: null,
          manager: l.manager?.name || null,
        })),
      });
      return;
    }

    const where: Record<string, unknown> = {
      companyId,
      agreedPaymentDate: { not: null },
    };
    if (dateRange) where.agreedPaymentDate = dateRange;
    if (pipelineIds) where.pipelineId = { in: pipelineIds };
    if (managerIds) where.responsibleManagerId = { in: managerIds };
    if (bitrixLeadIdsFromSources) {
      where.originalLeadId = { in: bitrixLeadIdsFromSources };
    }

    const deals = await prisma.salesLead.findMany({
      where,
      select: {
        leadId: true,
        statusName: true,
        price: true,
        agreedPaymentDate: true,
        pipelineName: true,
        responsibleManagerId: true,
        manager: { select: { id: true, name: true, photoUrl: true, customPhotoUrl: true } },
      },
      orderBy: { agreedPaymentDate: "asc" },
      take: 500,
    });

    const amount = deals.reduce((sum, d) => sum + cleanPrice(d.price), 0);

    success(res, {
      count: deals.length,
      amount,
      period: periodOut,
      deals: deals.map((d) => ({
        id: String(d.leadId ?? ""),
        title: d.statusName || `Deal #${d.leadId}`,
        agreedPaymentDate: d.agreedPaymentDate,
        price: d.price,
        pipelineName: d.pipelineName,
        manager: d.manager?.name || null,
      })),
    });
  } catch (err) {
    console.error("Kelishilgan tolov error:", err);
    error(res, "Kelishilgan to'lov ma'lumotlarini olishda xatolik");
  }
};
