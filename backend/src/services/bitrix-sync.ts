// Bitrix24'dan oxirgi o'zgargan dealar va lidlarni incremental sinxronlash.
// Har 5 daqiqada ishga tushadi — so'nggi 15 daqiqada yangilangan yozuvlarni oladi.
// (Buffer 15 min — biroz overlap bilan hech nima o'tkazilmasligi uchun.)

import axios from "axios";
import { prisma } from "../utils/prisma";

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(
  method: string,
  payload: Record<string, unknown> = {},
  retry = 0
): Promise<{ result?: unknown; total?: number; next?: number; error?: string }> {
  try {
    const resp = await axios.post(
      `${BITRIX_WEBHOOK}/${method}.json`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true,
        timeout: 30000,
      }
    );
    if (resp.data && resp.data.error === "QUERY_LIMIT_EXCEEDED") {
      if (retry > 5) throw new Error("bitrix rate limit");
      await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
      return bitrixCall(method, payload, retry + 1);
    }
    return resp.data;
  } catch (err) {
    if (retry > 5) throw err;
    await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
    return bitrixCall(method, payload, retry + 1);
  }
}

// Stage map cache (10 daqiqa) — har sync'da qayta yuklamaslik uchun
let stageMapCache: { map: Map<string, string>; expiresAt: number } | null = null;
async function getStageMap(): Promise<Map<string, string>> {
  if (stageMapCache && stageMapCache.expiresAt > Date.now()) {
    return stageMapCache.map;
  }
  const catResp = await bitrixCall("crm.dealcategory.list");
  const categoryIds = [0, ...((catResp.result as Array<{ ID: string }>) || []).map((c) => Number(c.ID))];
  const map = new Map<string, string>();
  for (const cid of categoryIds) {
    try {
      const resp = await bitrixCall("crm.dealcategory.stage.list", { id: cid });
      for (const s of (resp.result as Array<{ STATUS_ID: string; NAME: string }>) || []) {
        map.set(s.STATUS_ID, s.NAME);
      }
    } catch {
      // continue
    }
  }
  stageMapCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

let categoryMapCache: { map: Map<number, string>; expiresAt: number } | null = null;
async function getCategoryMap(): Promise<Map<number, string>> {
  if (categoryMapCache && categoryMapCache.expiresAt > Date.now()) {
    return categoryMapCache.map;
  }
  const resp = await bitrixCall("crm.dealcategory.list");
  const map = new Map<number, string>();
  map.set(0, "Asosiy");
  for (const c of (resp.result as Array<{ ID: string; NAME: string }>) || []) {
    map.set(Number(c.ID), c.NAME);
  }
  categoryMapCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

const parseOpp = (v: unknown): number => {
  if (!v) return 0;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? 0 : n;
};

// Valyuta kurslari cache (10 daqiqa). Bitrix dealarda OPPORTUNITY o'z
// CURRENCY_ID'sida (USD/EUR/RUB/UZS). Base = UZS. Konvertatsiya qilmasak
// $200 deal 200 UZS bo'lib qoladi → sotuv summasi buziladi (D6751 bug).
// map: CURRENCY_ID → 1 birlik = necha UZS.
let currencyMapCache: { map: Map<string, number>; expiresAt: number } | null = null;
async function getCurrencyMap(): Promise<Map<string, number>> {
  if (currencyMapCache && currencyMapCache.expiresAt > Date.now()) {
    return currencyMapCache.map;
  }
  const map = new Map<string, number>();
  map.set("UZS", 1);
  try {
    const resp = await bitrixCall("crm.currency.list");
    for (const c of (resp.result as Array<Record<string, unknown>>) || []) {
      const code = String(c.CURRENCY);
      const amount = parseFloat(String(c.AMOUNT)) || 1;
      const cnt = parseFloat(String(c.AMOUNT_CNT)) || 1;
      // 1 birlik valyuta = AMOUNT/AMOUNT_CNT UZS (base)
      map.set(code, amount / cnt);
    }
  } catch {
    // kurslar olinmasa — UZS=1 bilan davom (eski xatti-harakat)
  }
  currencyMapCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

// Bitrix deal "Yopilish sababi" enumeration maydoni.
const DEAL_REASON_FIELD = "UF_CRM_1777802548185";

// Reason enum cache (10 daqiqa): enum ID (string) → label.
let reasonMapCache: { map: Map<string, string>; expiresAt: number } | null = null;
async function getDealReasonMap(): Promise<Map<string, string>> {
  if (reasonMapCache && reasonMapCache.expiresAt > Date.now()) {
    return reasonMapCache.map;
  }
  const map = new Map<string, string>();
  try {
    const resp = await bitrixCall("crm.deal.fields");
    const fields = (resp.result as Record<string, any>) || {};
    const f = fields[DEAL_REASON_FIELD];
    for (const it of (f?.items as Array<{ ID: unknown; VALUE: unknown }>) || []) {
      map.set(String(it.ID), String(it.VALUE));
    }
  } catch {
    // map bo'sh qoladi — closeReasonName null bo'ladi
  }
  reasonMapCache = { map, expiresAt: Date.now() + 10 * 60 * 1000 };
  return map;
}

// Deal'dagi reason enum ID'ni {id,name} ga aylantiradi.
function dealReason(
  d: Record<string, unknown>,
  reasons: Map<string, string>
): { id: string | null; name: string | null } {
  const raw = d[DEAL_REASON_FIELD];
  const id = raw === null || raw === undefined || raw === "" ? null : String(raw);
  if (!id) return { id: null, name: null };
  return { id, name: reasons.get(id) || null };
}

// OPPORTUNITY'ni CURRENCY_ID bo'yicha UZS'ga o'tkazadi.
function oppToUzs(
  opportunity: unknown,
  currencyId: unknown,
  rates: Map<string, number>
): number {
  const raw = parseOpp(opportunity);
  if (raw <= 0) return 0;
  const code = currencyId ? String(currencyId) : "UZS";
  const rate = rates.get(code) ?? 1;
  return Math.round(raw * rate);
}

// Bitrix stage nomi "Qisman to'lov" yoki "Частичная оплата" bo'lsa true.
const isPartialStage = (name: string | null | undefined): boolean => {
  if (!name) return false;
  const s = String(name).toLowerCase();
  return /qisman\s*to.?lov/.test(s) || /частичн\w*\s*оплат/.test(s);
};

// Bir sync run'da ishlatilgan manager idlar to'plami — topilmasa avtomatik placeholder yaratiladi
async function ensureManager(
  companyId: string,
  bitrixUserId: string | null
): Promise<string | null> {
  if (!bitrixUserId) return null;
  const managerId = `bitrix_${bitrixUserId}`;
  // upsert: concurrent webhooklarda race oldini olish.
  await prisma.manager.upsert({
    where: { id: managerId },
    create: {
      id: managerId,
      name: `User #${bitrixUserId}`,
      email: `bitrix_${bitrixUserId}@prosales.local`,
      companyId,
      isActive: false,
      role: "sotuvchi",
    },
    update: {},
  });
  return managerId;
}

// So'nggi N daqiqada yangilangan dealarni Bitrix'dan olib upsert qilish
async function syncRecentDeals(
  companyId: string,
  fromIso: string
): Promise<number> {
  const [stageMap, catMap, rates, reasons] = await Promise.all([
    getStageMap(),
    getCategoryMap(),
    getCurrencyMap(),
    getDealReasonMap(),
  ]);
  let upserted = 0;
  let start = 0;

  while (true) {
    const resp = await bitrixCall("crm.deal.list", {
      filter: { ">=DATE_MODIFY": fromIso },
      select: [
        "ID",
        "TITLE",
        "CATEGORY_ID",
        "STAGE_ID",
        "STAGE_SEMANTIC_ID",
        "OPPORTUNITY",
        "CURRENCY_ID",
        "CLOSEDATE",
        "DATE_CREATE",
        "DATE_MODIFY",
        "ASSIGNED_BY_ID",
        "LEAD_ID",
        DEAL_REASON_FIELD,
      ],
      order: { DATE_MODIFY: "ASC" },
      start,
    });
    const batch = (resp.result as Array<Record<string, unknown>>) || [];
    if (batch.length === 0) break;

    for (const d of batch) {
      const leadIdNum = parseInt(String(d.ID), 10);
      if (Number.isNaN(leadIdNum)) continue;
      const categoryId = parseInt(String(d.CATEGORY_ID), 10);
      const semantic = (d.STAGE_SEMANTIC_ID as string) || null;
      const isSale = semantic === "S";
      const stageName = stageMap.get(String(d.STAGE_ID)) || String(d.STAGE_ID);
      const bitrixUserId = d.ASSIGNED_BY_ID ? String(d.ASSIGNED_BY_ID) : null;
      const managerId = await ensureManager(companyId, bitrixUserId);
      const leadCreatedAt = d.DATE_CREATE ? new Date(String(d.DATE_CREATE)) : new Date();
      const closedAt = d.CLOSEDATE ? new Date(String(d.CLOSEDATE)) : null;
      const reason = dealReason(d, reasons);

      await prisma.salesLead.upsert({
        where: { companyId_leadId: { companyId, leadId: leadIdNum } },
        create: {
          companyId,
          leadId: leadIdNum,
          pipelineId: categoryId,
          pipelineName: catMap.get(categoryId) || `Pipeline ${categoryId}`,
          statusName: stageName,
          semanticId: semantic,
          price: oppToUzs(d.OPPORTUNITY, d.CURRENCY_ID, rates),
          responsibleManagerId: managerId,
          amocrmUserId: bitrixUserId,
          leadCreatedAt,
          closedAt,
          isSale,
          isPartialPayment: isPartialStage(stageName),
          closeReasonId: reason.id,
          closeReasonName: reason.name,
          originalLeadId: d.LEAD_ID ? Number(d.LEAD_ID) : null,
        },
        update: {
          pipelineId: categoryId,
          pipelineName: catMap.get(categoryId) || `Pipeline ${categoryId}`,
          statusName: stageName,
          semanticId: semantic,
          price: oppToUzs(d.OPPORTUNITY, d.CURRENCY_ID, rates),
          responsibleManagerId: managerId,
          amocrmUserId: bitrixUserId,
          leadCreatedAt,
          closedAt,
          isSale,
          isPartialPayment: isPartialStage(stageName),
          closeReasonId: reason.id,
          closeReasonName: reason.name,
          originalLeadId: d.LEAD_ID ? Number(d.LEAD_ID) : null,
        },
      });
      upserted += 1;
    }

    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
  }
  return upserted;
}

async function syncRecentLeads(
  companyId: string,
  fromIso: string
): Promise<number> {
  let upserted = 0;
  let start = 0;

  while (true) {
    const resp = await bitrixCall("crm.lead.list", {
      filter: { ">=DATE_MODIFY": fromIso },
      select: [
        "ID",
        "TITLE",
        "STATUS_ID",
        "SOURCE_ID",
        "OPPORTUNITY",
        "ASSIGNED_BY_ID",
        "DATE_CREATE",
        "DATE_MODIFY",
      ],
      order: { DATE_MODIFY: "ASC" },
      start,
    });
    const batch = (resp.result as Array<Record<string, unknown>>) || [];
    if (batch.length === 0) break;

    for (const l of batch) {
      const bitrixLeadId = parseInt(String(l.ID), 10);
      if (Number.isNaN(bitrixLeadId)) continue;
      const statusId = (l.STATUS_ID as string) || null;
      const isConverted = statusId === "CONVERTED";
      const bitrixUserId = l.ASSIGNED_BY_ID ? String(l.ASSIGNED_BY_ID) : null;
      const managerId = await ensureManager(companyId, bitrixUserId);
      const dateCreate = l.DATE_CREATE ? new Date(String(l.DATE_CREATE)) : new Date();

      await prisma.lead.upsert({
        where: { companyId_bitrixLeadId: { companyId, bitrixLeadId } },
        create: {
          companyId,
          bitrixLeadId,
          title: (l.TITLE as string) || null,
          statusId,
          statusName: null,
          sourceId: (l.SOURCE_ID as string) || null,
          opportunity: parseOpp(l.OPPORTUNITY),
          responsibleManagerId: managerId,
          bitrixUserId,
          dateCreate,
          isConverted,
        },
        update: {
          title: (l.TITLE as string) || null,
          statusId,
          sourceId: (l.SOURCE_ID as string) || null,
          opportunity: parseOpp(l.OPPORTUNITY),
          responsibleManagerId: managerId,
          bitrixUserId,
          dateCreate,
          isConverted,
        },
      });
      upserted += 1;
    }

    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
  }
  return upserted;
}

// Bitta dealni Bitrix'dan olib upsert qiladi. Webhook handler chaqiradi.
export async function upsertDealById(
  companyId: string,
  dealId: number
): Promise<{ isSale: boolean; wasSale: boolean; managerId: string | null } | null> {
  const [stageMap, catMap, rates, reasons, resp] = await Promise.all([
    getStageMap(),
    getCategoryMap(),
    getCurrencyMap(),
    getDealReasonMap(),
    bitrixCall("crm.deal.get", { id: dealId }),
  ]);
  const d = resp.result as Record<string, unknown> | undefined;
  if (!d || !d.ID) return null;

  const leadIdNum = parseInt(String(d.ID), 10);
  if (Number.isNaN(leadIdNum)) return null;
  const categoryId = parseInt(String(d.CATEGORY_ID), 10);
  const semantic = (d.STAGE_SEMANTIC_ID as string) || null;
  const isSale = semantic === "S";
  const stageName = stageMap.get(String(d.STAGE_ID)) || String(d.STAGE_ID);
  const bitrixUserId = d.ASSIGNED_BY_ID ? String(d.ASSIGNED_BY_ID) : null;
  const managerId = await ensureManager(companyId, bitrixUserId);
  const leadCreatedAt = d.DATE_CREATE ? new Date(String(d.DATE_CREATE)) : new Date();
  const closedAt = d.CLOSEDATE ? new Date(String(d.CLOSEDATE)) : null;
  const reason = dealReason(d, reasons);

  const existing = await prisma.salesLead.findUnique({
    where: { companyId_leadId: { companyId, leadId: leadIdNum } },
    select: { isSale: true },
  });
  const wasSale = existing?.isSale ?? false;

  await prisma.salesLead.upsert({
    where: { companyId_leadId: { companyId, leadId: leadIdNum } },
    create: {
      companyId,
      leadId: leadIdNum,
      pipelineId: categoryId,
      pipelineName: catMap.get(categoryId) || `Pipeline ${categoryId}`,
      statusName: stageName,
      semanticId: semantic,
      price: oppToUzs(d.OPPORTUNITY, d.CURRENCY_ID, rates),
      responsibleManagerId: managerId,
      amocrmUserId: bitrixUserId,
      leadCreatedAt,
      closedAt,
      isSale,
      isPartialPayment: isPartialStage(stageName),
      closeReasonId: reason.id,
      closeReasonName: reason.name,
      originalLeadId: d.LEAD_ID ? Number(d.LEAD_ID) : null,
    },
    update: {
      pipelineId: categoryId,
      pipelineName: catMap.get(categoryId) || `Pipeline ${categoryId}`,
      statusName: stageName,
      semanticId: semantic,
      price: oppToUzs(d.OPPORTUNITY, d.CURRENCY_ID, rates),
      responsibleManagerId: managerId,
      amocrmUserId: bitrixUserId,
      leadCreatedAt,
      closedAt,
      isSale,
      isPartialPayment: isPartialStage(stageName),
      closeReasonId: reason.id,
      closeReasonName: reason.name,
      originalLeadId: d.LEAD_ID ? Number(d.LEAD_ID) : null,
    },
  });

  return { isSale, wasSale, managerId };
}

export async function upsertLeadById(
  companyId: string,
  leadId: number
): Promise<boolean> {
  const resp = await bitrixCall("crm.lead.get", { id: leadId });
  const l = resp.result as Record<string, unknown> | undefined;
  if (!l || !l.ID) return false;

  const bitrixLeadId = parseInt(String(l.ID), 10);
  if (Number.isNaN(bitrixLeadId)) return false;
  const statusId = (l.STATUS_ID as string) || null;
  const isConverted = statusId === "CONVERTED";
  const bitrixUserId = l.ASSIGNED_BY_ID ? String(l.ASSIGNED_BY_ID) : null;
  const managerId = await ensureManager(companyId, bitrixUserId);
  const dateCreate = l.DATE_CREATE ? new Date(String(l.DATE_CREATE)) : new Date();

  await prisma.lead.upsert({
    where: { companyId_bitrixLeadId: { companyId, bitrixLeadId } },
    create: {
      companyId,
      bitrixLeadId,
      title: (l.TITLE as string) || null,
      statusId,
      statusName: null,
      sourceId: (l.SOURCE_ID as string) || null,
      opportunity: parseOpp(l.OPPORTUNITY),
      responsibleManagerId: managerId,
      bitrixUserId,
      dateCreate,
      isConverted,
    },
    update: {
      title: (l.TITLE as string) || null,
      statusId,
      sourceId: (l.SOURCE_ID as string) || null,
      opportunity: parseOpp(l.OPPORTUNITY),
      responsibleManagerId: managerId,
      bitrixUserId,
      dateCreate,
      isConverted,
    },
  });
  return true;
}

// Asosiy entrypoint — scheduler dan chaqiriladi
export async function runBitrixIncrementalSync(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  if (companies.length === 0) return;

  // 15 daqiqa buffer — overlap bilan hech narsa o'tkazmaslik
  const fromIso = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  for (const c of companies) {
    try {
      const [deals, leads] = await Promise.all([
        syncRecentDeals(c.id, fromIso),
        syncRecentLeads(c.id, fromIso),
      ]);
      if (deals > 0 || leads > 0) {
        console.log(
          `[bitrix-sync] ${c.name}: ${deals} deal, ${leads} lead upserted`
        );
      }
    } catch (err) {
      console.error(`[bitrix-sync] ${c.name} failed:`, (err as Error).message);
    }
  }
}
