// Bitrix24 voximplant.statistic.get → AudioFile avtomatik sync.
// scripts/sync-bitrix-calls.js'ning servis varianti — scheduler chaqiradi.
// Audit/Audio sahifa qo'ng'iroq statistikasi DOIMO Bitrix bilan tenglashib turadi.
//
// Incremental: oxirgi sync'langan callDate'dan (− overlap) boshlab oladi →
// har run faqat yangi qo'ng'iroqlarni qayta ishlaydi (fileName bo'yicha idempotent upsert).

import axios from "axios";
import { prisma } from "../utils/prisma";
import { BITRIX_WEBHOOK_URL as BITRIX_WEBHOOK } from "../utils/bitrix-config";

// Kategoriya-aware minimal davomiylik (sekund). Env bilan o'zgartirsa bo'ladi.
const MIN_QAYTA = Number(process.env.BITRIX_CALL_MIN_QAYTA) || 120; // takroriy ≥ 2 daq
const MIN_SOTUV = Number(process.env.BITRIX_CALL_MIN_SOTUV) || 180; // 1-qo'ng'iroq ≥ 3 daq
const MIN_DURATION = Math.min(MIN_QAYTA, MIN_SOTUV);
// Incremental overlap — oxirgi qo'ng'iroqdan shuncha oldin boshlaymiz (kech kelgan
// yozuv/recording o'tkazib yuborilmasligi uchun).
const OVERLAP_HOURS = 6;
// Hech narsa sync qilinmagan bo'lsa — qancha orqaga qarash (kun).
const COLD_START_DAYS = Number(process.env.BITRIX_CALL_COLD_DAYS) || 7;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bitrixCall(
  method: string,
  payload: Record<string, unknown> = {},
  retry = 0
): Promise<{ result?: unknown; total?: number; next?: number; error?: string }> {
  try {
    const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
      timeout: 30000,
    });
    if (resp.data && resp.data.error === "QUERY_LIMIT_EXCEEDED") {
      if (retry > 8) throw new Error("rate limit");
      await sleep(2000 * (retry + 1));
      return bitrixCall(method, payload, retry + 1);
    }
    return resp.data;
  } catch (err) {
    if (retry > 8) throw err;
    await sleep(2000 * (retry + 1));
    return bitrixCall(method, payload, retry + 1);
  }
}

async function getSourceMap(): Promise<Map<string, string>> {
  const resp = await bitrixCall("crm.status.list", { filter: { ENTITY_ID: "SOURCE" } });
  const map = new Map<string, string>();
  for (const s of (resp.result as Array<{ STATUS_ID: string; NAME: string }>) || []) {
    map.set(s.STATUS_ID, s.NAME);
  }
  return map;
}

async function getCategoryMap(): Promise<Map<number, string>> {
  const resp = await bitrixCall("crm.dealcategory.list");
  const map = new Map<number, string>();
  map.set(0, "Asosiy");
  for (const c of (resp.result as Array<{ ID: string; NAME: string }>) || []) {
    map.set(Number(c.ID), c.NAME);
  }
  return map;
}

async function fetchCalls(dateFromIso: string): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall("voximplant.statistic.get", {
      FILTER: { ">=CALL_START_DATE": dateFromIso },
      SORT: "CALL_START_DATE",
      ORDER: "ASC",
      start,
    });
    const batch = (resp.result as Array<Record<string, unknown>>) || [];
    all.push(...batch);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
    await sleep(200);
  }
  return all;
}

async function ensureManager(companyId: string, bitrixUserId: unknown): Promise<string | null> {
  if (!bitrixUserId) return null;
  const managerId = `bitrix_${bitrixUserId}`;
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

// Bitta kompaniya uchun call sync. fromIso berilmasa — incremental hisoblanadi.
export async function syncBitrixCallsForCompany(
  companyId: string,
  fromIso?: string
): Promise<number> {
  // Incremental window — oxirgi sync'langan qo'ng'iroqdan (− overlap).
  if (!fromIso) {
    const last = await prisma.audioFile.findFirst({
      where: { companyId, callDate: { not: null } },
      orderBy: { callDate: "desc" },
      select: { callDate: true },
    });
    const from = last?.callDate
      ? new Date(last.callDate.getTime() - OVERLAP_HOURS * 3600 * 1000)
      : new Date(Date.now() - COLD_START_DAYS * 24 * 3600 * 1000);
    fromIso = from.toISOString();
  }

  const [sourceMap, catMap, calls] = await Promise.all([
    getSourceMap(),
    getCategoryMap(),
    fetchCalls(fromIso),
  ]);
  if (calls.length === 0) return 0;

  // Birinchi-aloqa sanalari (qayta/sotuv ajratish uchun) — DB'dan.
  const firstCallDateByKey = new Map<string, Date>();
  const existingAudios = await prisma.audioFile.findMany({
    where: { companyId },
    select: { leadId: true, phoneNumber: true, callDate: true, createdAt: true },
  });
  for (const a of existingAudios) {
    const keys: string[] = [];
    if (a.leadId != null) keys.push(`L:${a.leadId}`);
    if (a.phoneNumber) keys.push(`P:${a.phoneNumber}`);
    const d = a.callDate || a.createdAt;
    if (!d) continue;
    for (const k of keys) {
      const prev = firstCallDateByKey.get(k);
      if (!prev || d < prev) firstCallDateByKey.set(k, d);
    }
  }

  const leadCache = new Map<string, Record<string, unknown> | null>();
  const dealCache = new Map<string, Record<string, unknown> | null>();
  const fetchLead = async (id: string) => {
    if (leadCache.has(id)) return leadCache.get(id) ?? null;
    const resp = await bitrixCall("crm.lead.get", { id });
    const l = (resp.result as Record<string, unknown>) || null;
    leadCache.set(id, l);
    return l;
  };
  const fetchDeal = async (id: string) => {
    if (dealCache.has(id)) return dealCache.get(id) ?? null;
    const resp = await bitrixCall("crm.deal.get", { id });
    const d = (resp.result as Record<string, unknown>) || null;
    dealCache.set(id, d);
    return d;
  };

  let upserted = 0;
  for (const c of calls) {
    const url = c.CALL_RECORD_URL as string | undefined;
    const duration = parseInt(String(c.CALL_DURATION || "0"), 10);
    if (!url) continue; // yozuvi yo'q — tahlil qilib bo'lmaydi
    if (duration < MIN_DURATION) continue;

    const bitrixCallId = String(c.ID);
    const fileName = `bitrix_call_${bitrixCallId}.mp3`;
    const managerId = await ensureManager(companyId, c.PORTAL_USER_ID);
    const callDate = c.CALL_START_DATE ? new Date(String(c.CALL_START_DATE)) : new Date();
    const crmEntityId = c.CRM_ENTITY_ID ? String(c.CRM_ENTITY_ID) : null;
    const direction =
      String(c.CALL_TYPE) === "1" ? "outgoing" :
      String(c.CALL_TYPE) === "2" ? "incoming" : null;

    let leadCreatedAt: Date | null = null;
    let pipelineName: string | null = null;
    let sourceId: string | null = null;
    let sourceName: string | null = null;
    let leadIdInt: number | null = null;
    let statusName: string | null = null;

    try {
      if (c.CRM_ENTITY_TYPE === "LEAD" && crmEntityId) {
        const lead = await fetchLead(crmEntityId);
        if (lead) {
          leadCreatedAt = lead.DATE_CREATE ? new Date(String(lead.DATE_CREATE)) : null;
          sourceId = (lead.SOURCE_ID as string) || null;
          sourceName = sourceId ? sourceMap.get(sourceId) || sourceId : null;
          leadIdInt = parseInt(crmEntityId, 10);
          statusName = (lead.STATUS_ID as string) || null;
        }
      } else if (c.CRM_ENTITY_TYPE === "DEAL" && crmEntityId) {
        const deal = await fetchDeal(crmEntityId);
        if (deal) {
          leadCreatedAt = deal.DATE_CREATE ? new Date(String(deal.DATE_CREATE)) : null;
          const catId = parseInt(String(deal.CATEGORY_ID || "0"), 10);
          pipelineName = catMap.get(catId) || `Pipeline ${catId}`;
          leadIdInt = parseInt(crmEntityId, 10);
          statusName = (deal.STAGE_ID as string) || null;
          if (deal.LEAD_ID) {
            const srcLead = await fetchLead(String(deal.LEAD_ID));
            if (srcLead?.SOURCE_ID) {
              sourceId = srcLead.SOURCE_ID as string;
              sourceName = sourceMap.get(sourceId) || sourceId;
            }
          }
        }
      }
    } catch {
      // CRM lookup xato — davom
    }

    // Qayta/sotuv aniqlash
    const keys: string[] = [];
    if (leadIdInt != null) keys.push(`L:${leadIdInt}`);
    if (c.PHONE_NUMBER) keys.push(`P:${c.PHONE_NUMBER}`);
    let isRepeat = false;
    for (const k of keys) {
      const firstSeen = firstCallDateByKey.get(k);
      if (firstSeen && firstSeen < callDate) { isRepeat = true; break; }
    }
    for (const k of keys) {
      const prev = firstCallDateByKey.get(k);
      if (!prev || callDate < prev) firstCallDateByKey.set(k, callDate);
    }
    const category = isRepeat ? "qayta" : "sotuv";
    const minForCategory = category === "qayta" ? MIN_QAYTA : MIN_SOTUV;
    if (duration < minForCategory) continue;

    const data = {
      fileUrl: url,
      managerId,
      duration,
      callDate,
      phoneNumber: (c.PHONE_NUMBER as string) || null,
      crmLeadId: crmEntityId,
      leadId: leadIdInt,
      leadCreatedAt,
      firstContactAt: callDate,
      pipelineName: pipelineName || "Yangi lid",
      sourceId,
      sourceName,
      statusName,
      direction,
      category,
    };

    const existing = await prisma.audioFile.findFirst({
      where: { companyId, fileName },
      select: { id: true },
    });
    if (existing) {
      await prisma.audioFile.update({ where: { id: existing.id }, data });
    } else {
      await prisma.audioFile.create({
        data: { ...data, companyId, fileName, status: "pending" },
      });
    }
    upserted += 1;
  }

  return upserted;
}

// Scheduler entrypoint — barcha kompaniyalar.
export async function runBitrixCallsSync(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    try {
      const n = await syncBitrixCallsForCompany(c.id);
      if (n > 0) console.log(`[bitrix-calls-sync] ${c.name}: ${n} qo'ng'iroq upserted`);
    } catch (err) {
      console.error(`[bitrix-calls-sync] ${c.name} failed:`, (err as Error).message);
    }
  }
}
