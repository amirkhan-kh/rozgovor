// Bitrix24'dan oxirgi o'zgargan dealar va lidlarni incremental sinxronlash.
// Har 5 daqiqada ishga tushadi — so'nggi 15 daqiqada yangilangan yozuvlarni oladi.
// (Buffer 15 min — biroz overlap bilan hech nima o'tkazilmasligi uchun.)

import axios from "axios";
import { prisma } from "../utils/prisma";
import { BITRIX_WEBHOOK_URL as BITRIX_WEBHOOK } from "../utils/bitrix-config";
import { broadcast } from "./websocket";

async function bitrixCall(
  method: string,
  payload: Record<string, unknown> = {},
  retry = 0
): Promise<{ result?: unknown; total?: number; next?: number; error?: string; error_description?: string }> {
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

interface DealMaps {
  stageMap: Map<string, string>;
  catMap: Map<number, string>;
  rates: Map<string, number>;
  reasons: Map<string, string>;
}

// Bitrix deal → SalesLead maydonlari (companyId/leadId'siz — ular upsert key'i).
// ⚠️ Webhook (upsertDealById) va cron (syncRecentDeals) ikkalasi SHU funksiyani
// ishlatadi — aks holda isSale/excludedPipelines hisobi ajralib, bir xil deal
// ikki yo'lda turlicha bo'lib qoladi (real-time va 5-daqiqalik sync kelishmaydi).
function buildSalesLeadCore(
  d: Record<string, unknown>,
  managerId: string | null,
  maps: DealMaps,
  excluded: Set<string>
) {
  const categoryId = parseInt(String(d.CATEGORY_ID), 10);
  const pipelineName = maps.catMap.get(categoryId) || `Pipeline ${categoryId}`;
  const semantic = (d.STAGE_SEMANTIC_ID as string) || null;
  const isExcluded = excluded.has(String(categoryId)) || excluded.has(pipelineName);
  const isSale = semantic === "S" && !isExcluded;
  const stageName = maps.stageMap.get(String(d.STAGE_ID)) || String(d.STAGE_ID);
  const leadCreatedAt = d.DATE_CREATE ? new Date(String(d.DATE_CREATE)) : new Date();
  const closedAt = d.CLOSEDATE ? new Date(String(d.CLOSEDATE)) : null;
  const reason = dealReason(d, maps.reasons);
  return {
    pipelineId: categoryId,
    pipelineName,
    statusName: stageName,
    semanticId: semantic,
    price: oppToUzs(d.OPPORTUNITY, d.CURRENCY_ID, maps.rates),
    responsibleManagerId: managerId,
    amocrmUserId: d.ASSIGNED_BY_ID ? String(d.ASSIGNED_BY_ID) : null,
    leadCreatedAt,
    closedAt,
    isSale,
    isPartialPayment: isPartialStage(stageName),
    closeReasonId: reason.id,
    closeReasonName: reason.name,
    originalLeadId: d.LEAD_ID ? Number(d.LEAD_ID) : null,
  };
}

// Company'ning excludedPipelines'ini Set'ga aylantiradi (ID-string yoki NAME match).
async function getExcludedSet(companyId: string): Promise<Set<string>> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { excludedPipelines: true },
  });
  return new Set(company?.excludedPipelines || []);
}

// So'nggi N daqiqada yangilangan dealarni Bitrix'dan olib upsert qilish
async function syncRecentDeals(
  companyId: string,
  fromIso: string
): Promise<number> {
  const [stageMap, catMap, rates, reasons, excluded] = await Promise.all([
    getStageMap(),
    getCategoryMap(),
    getCurrencyMap(),
    getDealReasonMap(),
    getExcludedSet(companyId),
  ]);
  const maps: DealMaps = { stageMap, catMap, rates, reasons };
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
      const bitrixUserId = d.ASSIGNED_BY_ID ? String(d.ASSIGNED_BY_ID) : null;
      const managerId = await ensureManager(companyId, bitrixUserId);
      const core = buildSalesLeadCore(d, managerId, maps, excluded);

      await prisma.salesLead.upsert({
        where: { companyId_leadId: { companyId, leadId: leadIdNum } },
        create: { companyId, leadId: leadIdNum, ...core },
        update: core,
      });
      upserted += 1;
    }

    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
  }
  return upserted;
}

// Bitrix lead → Lead maydonlari (companyId/bitrixLeadId'siz — upsert key'i).
// ⚠️ syncRecentLeads + upsertLeadById + reconcile ikkalasi SHU funksiyani
// ishlatadi — lead-yo'l ham deal kabi ajralib qolmasligi uchun.
function buildLeadCore(l: Record<string, unknown>, managerId: string | null) {
  const statusId = (l.STATUS_ID as string) || null;
  return {
    title: (l.TITLE as string) || null,
    statusId,
    statusName: null as string | null,
    sourceId: (l.SOURCE_ID as string) || null,
    opportunity: parseOpp(l.OPPORTUNITY),
    responsibleManagerId: managerId,
    bitrixUserId: l.ASSIGNED_BY_ID ? String(l.ASSIGNED_BY_ID) : null,
    dateCreate: l.DATE_CREATE ? new Date(String(l.DATE_CREATE)) : new Date(),
    isConverted: statusId === "CONVERTED",
  };
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
      const bitrixUserId = l.ASSIGNED_BY_ID ? String(l.ASSIGNED_BY_ID) : null;
      const managerId = await ensureManager(companyId, bitrixUserId);
      const core = buildLeadCore(l, managerId);

      await prisma.lead.upsert({
        where: { companyId_bitrixLeadId: { companyId, bitrixLeadId } },
        create: { companyId, bitrixLeadId, ...core },
        update: core,
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
  const [stageMap, catMap, rates, reasons, resp, excluded] = await Promise.all([
    getStageMap(),
    getCategoryMap(),
    getCurrencyMap(),
    getDealReasonMap(),
    bitrixCall("crm.deal.get", { id: dealId }),
    getExcludedSet(companyId),
  ]);
  const d = resp.result as Record<string, unknown> | undefined;
  if (!d || !d.ID) return null;

  const leadIdNum = parseInt(String(d.ID), 10);
  if (Number.isNaN(leadIdNum)) return null;
  const bitrixUserId = d.ASSIGNED_BY_ID ? String(d.ASSIGNED_BY_ID) : null;
  const managerId = await ensureManager(companyId, bitrixUserId);
  const maps: DealMaps = { stageMap, catMap, rates, reasons };
  const core = buildSalesLeadCore(d, managerId, maps, excluded);

  const existing = await prisma.salesLead.findUnique({
    where: { companyId_leadId: { companyId, leadId: leadIdNum } },
    select: { isSale: true },
  });
  const wasSale = existing?.isSale ?? false;

  await prisma.salesLead.upsert({
    where: { companyId_leadId: { companyId, leadId: leadIdNum } },
    create: { companyId, leadId: leadIdNum, ...core },
    update: core,
  });

  return { isSale: core.isSale, wasSale, managerId };
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
  const bitrixUserId = l.ASSIGNED_BY_ID ? String(l.ASSIGNED_BY_ID) : null;
  const managerId = await ensureManager(companyId, bitrixUserId);
  const core = buildLeadCore(l, managerId);

  await prisma.lead.upsert({
    where: { companyId_bitrixLeadId: { companyId, bitrixLeadId } },
    create: { companyId, bitrixLeadId, ...core },
    update: core,
  });
  return true;
}

// ─────────────────────────────────────────────────────────────────────
// RECONCILE (o'z-o'zini tuzatuvchi sverka)
// Maqsad: DB raqamlari DOIMO Bitrix bilan mos — drift to'planmaydi.
// Webhook/incremental yetmasa (restart, rate-limit, webhook kelmasa,
// o'chirilgan yozuv arvoh bo'lib qolsa) — sverka raqamni Bitrix'ga qaytaradi.
//
// Ikki qatlam (oyna = DATE_CREATE):
//   • Qisqa  — oxirgi N kun (BITRIX_RECONCILE_RECENT_DAYS, default 2), har 5 daq.
//   • To'liq — oxirgi M oy  (BITRIX_RECONCILE_MONTHS, default 3), kunlik.
//
// Har oynaga: Bitrix'da bor-DB'da yo'q → upsert; DB'da bor-Bitrix'da yo'q →
// `*.get` bilan tasdiqlab o'chirish (false-delete'siz — TZ chegara/race himoyasi).
//
// Pagination ID-KURSOR: offset-paging (start+=50) katta hajmda yozuv qo'shilsa/
// o'chsa SKIP yoki DUBLIKAT beradi (Bitrix hujjati). `>ID` kursor + `start:-1`
// (count'ni o'chiradi → ~500× tez) buni butunlay yo'q qiladi.
// ─────────────────────────────────────────────────────────────────────

const RECONCILE_RECENT_DAYS = Number(process.env.BITRIX_RECONCILE_RECENT_DAYS) || 2;
const RECONCILE_MONTHS = Number(process.env.BITRIX_RECONCILE_MONTHS) || 3;

// ID-kursor pager: baseFilter'ga mos BARCHA ID'larni yig'adi (faqat ID, yengil).
// `start:-1` → count o'chadi (tez); `>ID` → race-safe (skip/dublikat yo'q).
async function pageAllIdsByCursor(
  method: string,
  baseFilter: Record<string, unknown>
): Promise<{ ids: Set<number>; ok: boolean }> {
  const ids = new Set<number>();
  let lastId = 0;
  while (true) {
    const resp = await bitrixCall(method, {
      filter: { ...baseFilter, ">ID": lastId },
      select: ["ID"],
      order: { ID: "ASC" },
      start: -1,
    });
    // Har qanday API xatosi → skan to'liq emas, o'chirish XAVFLI → ok=false.
    if (resp.error || resp.error_description) {
      return { ids, ok: false };
    }
    const batch = (resp.result as Array<{ ID: string }>) || [];
    for (const r of batch) {
      const n = parseInt(String(r.ID), 10);
      if (!Number.isNaN(n)) {
        ids.add(n);
        if (n > lastId) lastId = n;
      }
    }
    if (batch.length < 50) break; // oxirgi sahifa
  }
  return { ids, ok: true };
}

// `*.get` mavjud bo'lmagan ID uchun {error:"", error_description:"Not found"}
// qaytaradi → faqat shu holatda "haqiqatan o'chirilgan" deb hisoblaymiz.
async function confirmedDeletedInBitrix(getMethod: string, id: number): Promise<boolean> {
  const resp = await bitrixCall(getMethod, { id });
  const exists = !!(resp.result && (resp.result as Record<string, unknown>).ID);
  if (exists) return false;
  return (resp.error_description || "").toLowerCase().includes("not found");
}

// Tashlab yuborilmas guard: candidate stale soni mantiqsiz katta bo'lsa
// (ehtimol scan to'liq bo'lmagan) — o'chirmaymiz, ogohlantiramiz.
function tooManyToDelete(candidateCount: number, dbCount: number): boolean {
  return candidateCount > Math.max(200, Math.floor(dbCount * 0.3));
}

// Bitta oyna uchun deal sverkasi (DATE_CREATE [gte,lte]).
async function reconcileDealsWindow(
  companyId: string,
  gteIso: string,
  lteIso: string
): Promise<{ added: number; deleted: number }> {
  const { ids: bitrixIds, ok } = await pageAllIdsByCursor("crm.deal.list", {
    ">=DATE_CREATE": gteIso,
    "<=DATE_CREATE": lteIso,
  });
  if (!ok) {
    console.warn("[bitrix-reconcile] deals: skan xato — oyna o'tkazib yuborildi");
    return { added: 0, deleted: 0 };
  }
  const dbRows = await prisma.salesLead.findMany({
    where: { companyId, leadCreatedAt: { gte: new Date(gteIso), lte: new Date(lteIso) } },
    select: { leadId: true },
  });
  const dbIds = new Set(dbRows.map((r) => r.leadId));

  // Bitrix'da bor, DB'da yo'q → upsert (yetishmaganni qo'shadi).
  let added = 0;
  for (const id of bitrixIds) {
    if (!dbIds.has(id)) {
      const r = await upsertDealById(companyId, id);
      if (r) added += 1;
    }
  }

  // DB'da bor, Bitrix'da yo'q → tasdiqlab o'chirish (arvoh yozuvni tozalaydi).
  const ghosts = [...dbIds].filter((id) => !bitrixIds.has(id));
  let deleted = 0;
  if (ghosts.length > 0 && tooManyToDelete(ghosts.length, dbIds.size)) {
    console.warn(`[bitrix-reconcile] deals: ${ghosts.length} ghost juda ko'p — qo'lda tekshiring, skip`);
  } else {
    for (const id of ghosts) {
      if (await confirmedDeletedInBitrix("crm.deal.get", id)) {
        await prisma.salesLead.deleteMany({ where: { companyId, leadId: id } });
        deleted += 1;
      }
    }
  }
  return { added, deleted };
}

// Bitta oyna uchun lead sverkasi.
async function reconcileLeadsWindow(
  companyId: string,
  gteIso: string,
  lteIso: string
): Promise<{ added: number; deleted: number }> {
  const { ids: bitrixIds, ok } = await pageAllIdsByCursor("crm.lead.list", {
    ">=DATE_CREATE": gteIso,
    "<=DATE_CREATE": lteIso,
  });
  if (!ok) {
    console.warn("[bitrix-reconcile] leads: skan xato — oyna o'tkazib yuborildi");
    return { added: 0, deleted: 0 };
  }
  const dbRows = await prisma.lead.findMany({
    where: { companyId, dateCreate: { gte: new Date(gteIso), lte: new Date(lteIso) } },
    select: { bitrixLeadId: true },
  });
  const dbIds = new Set(dbRows.map((r) => r.bitrixLeadId));

  let added = 0;
  for (const id of bitrixIds) {
    if (!dbIds.has(id)) {
      if (await upsertLeadById(companyId, id)) added += 1;
    }
  }

  const ghosts = [...dbIds].filter((id) => !bitrixIds.has(id));
  let deleted = 0;
  if (ghosts.length > 0 && tooManyToDelete(ghosts.length, dbIds.size)) {
    console.warn(`[bitrix-reconcile] leads: ${ghosts.length} ghost juda ko'p — qo'lda tekshiring, skip`);
  } else {
    for (const id of ghosts) {
      if (await confirmedDeletedInBitrix("crm.lead.get", id)) {
        await prisma.lead.deleteMany({ where: { companyId, bitrixLeadId: id } });
        deleted += 1;
      }
    }
  }
  return { added, deleted };
}

// Berilgan oyna bo'yicha deal + lead sverkasini barcha kompaniyalarga yuritadi.
async function runReconcileWindow(
  gteIso: string,
  lteIso: string,
  label: string
): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    try {
      const d = await reconcileDealsWindow(c.id, gteIso, lteIso);
      const l = await reconcileLeadsWindow(c.id, gteIso, lteIso);
      if (d.added + d.deleted + l.added + l.deleted > 0) {
        console.log(
          `[bitrix-reconcile/${label}] ${c.name}: deal +${d.added}/-${d.deleted}, lead +${l.added}/-${l.deleted}`,
        );
        broadcast({ type: "refresh", companyId: c.id });
      }
    } catch (err) {
      console.error(`[bitrix-reconcile/${label}] ${c.name} failed:`, (err as Error).message);
    }
  }
}

// Qisqa reconcile — oxirgi N kun (har 5 daqiqada, arzon).
export async function runBitrixReconcileRecent(): Promise<void> {
  const lte = new Date();
  const gte = new Date(lte.getTime() - RECONCILE_RECENT_DAYS * 24 * 3600 * 1000);
  await runReconcileWindow(gte.toISOString(), lte.toISOString(), "recent");
}

// To'liq reconcile — oxirgi M oy (kunlik; eski o'chirilganlar uchun).
export async function runBitrixReconcile(): Promise<void> {
  const lte = new Date();
  const gte = new Date(lte.getTime());
  gte.setMonth(gte.getMonth() - RECONCILE_MONTHS);
  await runReconcileWindow(gte.toISOString(), lte.toISOString(), "full");
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
