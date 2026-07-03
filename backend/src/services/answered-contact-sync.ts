// Voximplant "javob berilgan birinchi aloqa" sync → Lead.firstAnsweredCallAt.
//
// Aloqaga chiqish vaqti (lid yaratilgan → birinchi aloqa) ANIQ bo'lishi uchun:
//   - Telefon bo'yicha emas (DB'da clientPhone ko'pincha bo'sh), balki qo'ng'iroqning
//     CRM_ENTITY_ID (= lead ID) orqali lidga bog'lanadi.
//   - FAQAT javob berilgan qo'ng'iroqlar hisobga olinadi: Voximplant CALL_FAILED_CODE=200.
//     (Javob bermagan qo'ng'iroqlar — 603/304 — menejer "halol" vaqtini cho'zmasin.)
//   - Har lid uchun ENG ERTA answered qo'ng'iroq sanasi yoziladi.
//
// Backfill (uzoq oyna) + scheduler incremental (qisqa overlap) ikkalasi shuni ishlatadi.

import axios from "axios";
import { prisma } from "../utils/prisma";
import { BITRIX_WEBHOOK_URL as BITRIX_WEBHOOK } from "../utils/bitrix-config";

const ANSWERED_CODE = 200; // Voximplant: javob berilgan (200 OK)
// Ixtiyoriy — javob berilgan, lekin darhol uzilgan (0-1s) qo'ng'iroqlarni ham
// chiqarib tashlash uchun minimal suhbat davomiyligi (sekund). 0 = filtrsiz.
const MIN_TALK_SEC = Number(process.env.ANSWERED_CONTACT_MIN_SEC) || 0;
// Incremental default oynasi — oxirgi kunlar (kech kelgan yozuvlar uchun overlap).
const INCREMENTAL_DAYS = Number(process.env.ANSWERED_CONTACT_INCREMENTAL_DAYS) || 2;
// Backfill default oynasi (kun) — so'nggi shuncha kun ichidagi lidlar qamrab olinadi.
const COLD_START_DAYS = Number(process.env.ANSWERED_CONTACT_COLD_DAYS) || 90;

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

// Voximplant answered qo'ng'iroqlarini oynada skanerlab, har lid (CRM_ENTITY_ID=LEAD)
// uchun ENG ERTA javob-qo'ng'iroq sanasini yig'adi.
async function scanAnsweredByLead(fromIso: string): Promise<Map<number, Date>> {
  const earliest = new Map<number, Date>();
  let start = 0;
  while (true) {
    const resp = await bitrixCall("voximplant.statistic.get", {
      FILTER: { ">=CALL_START_DATE": fromIso, CALL_FAILED_CODE: ANSWERED_CODE },
      SORT: "CALL_START_DATE",
      ORDER: "ASC",
      start,
    });
    const batch = (resp.result as Array<Record<string, unknown>>) || [];
    for (const c of batch) {
      if (String(c.CRM_ENTITY_TYPE) !== "LEAD") continue;
      const leadId = c.CRM_ENTITY_ID ? parseInt(String(c.CRM_ENTITY_ID), 10) : NaN;
      if (Number.isNaN(leadId)) continue;
      if (MIN_TALK_SEC > 0) {
        const dur = parseInt(String(c.CALL_DURATION || "0"), 10);
        if (dur < MIN_TALK_SEC) continue;
      }
      if (!c.CALL_START_DATE) continue;
      const dt = new Date(String(c.CALL_START_DATE));
      const prev = earliest.get(leadId);
      if (!prev || dt < prev) earliest.set(leadId, dt);
    }
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
    await sleep(200);
  }
  return earliest;
}

// Yig'ilgan {leadId → earliest} ni Lead.firstAnsweredCallAt ga yozadi (faqat
// mavjud qiymatdan ERTAROQ bo'lsa yoki bo'sh bo'lsa — idempotent).
async function applyEarliest(
  companyId: string,
  earliest: Map<number, Date>
): Promise<number> {
  if (earliest.size === 0) return 0;
  const ids = Array.from(earliest.keys());
  let updated = 0;
  const CHUNK = 1000;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const existing = await prisma.lead.findMany({
      where: { companyId, bitrixLeadId: { in: chunk } },
      select: { bitrixLeadId: true, firstAnsweredCallAt: true },
    });
    const toUpdate: Array<{ bitrixLeadId: number; date: Date }> = [];
    for (const l of existing) {
      const nd = earliest.get(l.bitrixLeadId);
      if (!nd) continue;
      if (!l.firstAnsweredCallAt || nd < l.firstAnsweredCallAt) {
        toUpdate.push({ bitrixLeadId: l.bitrixLeadId, date: nd });
      }
    }
    // Konkurent kichik guruhlarda yozamiz
    const W = 25;
    for (let j = 0; j < toUpdate.length; j += W) {
      await Promise.all(
        toUpdate.slice(j, j + W).map((u) =>
          prisma.lead.updateMany({
            where: { companyId, bitrixLeadId: u.bitrixLeadId },
            data: { firstAnsweredCallAt: u.date },
          })
        )
      );
      updated += Math.min(W, toUpdate.length - j);
    }
  }
  return updated;
}

// Bitta kompaniya uchun sync. fromIso berilmasa — incremental (oxirgi INCREMENTAL_DAYS).
export async function syncAnsweredContactsForCompany(
  companyId: string,
  fromIso?: string
): Promise<number> {
  const from =
    fromIso ||
    new Date(Date.now() - INCREMENTAL_DAYS * 24 * 3600 * 1000).toISOString();
  const earliest = await scanAnsweredByLead(from);
  return applyEarliest(companyId, earliest);
}

// Backfill — uzoq oyna (default COLD_START_DAYS kun).
export async function backfillAnsweredContactsForCompany(
  companyId: string,
  days: number = COLD_START_DAYS
): Promise<number> {
  const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const earliest = await scanAnsweredByLead(from);
  return applyEarliest(companyId, earliest);
}

// Scheduler entrypoint — barcha kompaniyalar (incremental).
export async function runAnsweredContactsSync(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    try {
      const n = await syncAnsweredContactsForCompany(c.id);
      if (n > 0) console.log(`[answered-contact-sync] ${c.name}: ${n} lid firstAnsweredCallAt yangilandi`);
    } catch (err) {
      console.error(`[answered-contact-sync] ${c.name} failed:`, (err as Error).message);
    }
  }
}
