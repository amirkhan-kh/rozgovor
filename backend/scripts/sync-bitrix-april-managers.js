// Aprel 2026 (yoki istalgan davr) qo'ng'iroqlarini faqat aniq menejerlar
// uchun Bitrix24'dan AudioFile jadvaliga sync qiladi.
//
// CLI:
//   node sync-bitrix-april-managers.js [fromDate=2026-04-01] [toDate=2026-04-30] [minDur=30]
//
// Filter: PORTAL_USER_ID IN (64, 976, 1534, 2042, 2140) — Aziza, Muslima,
// Visola, Xusnora, Zilolaxon. CALL_RECORD_URL bor + CALL_DURATION >= minDur.

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

const TARGET_USERS = ["64", "976", "1534", "2042", "2140"];
const TARGET_NAMES = {
  "64": "Aziza",
  "976": "Muslima",
  "1534": "Visola",
  "2042": "Xusnora",
  "2140": "Zilolaxon",
};

const FROM_DATE = process.argv[2] || "2026-04-01";
const TO_DATE = process.argv[3] || "2026-04-30";
const MIN_DURATION = Number(process.argv[4] || 30);

const FROM_ISO = `${FROM_DATE}T00:00:00+05:00`;
const TO_ISO = `${TO_DATE}T23:59:59+05:00`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bitrixCall(method, payload = {}, retry = 0) {
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

async function getSourceMap() {
  const resp = await bitrixCall("crm.status.list", {
    filter: { ENTITY_ID: "SOURCE" },
  });
  const map = new Map();
  for (const s of resp.result || []) map.set(s.STATUS_ID, s.NAME);
  return map;
}

async function getCategoryMap() {
  const resp = await bitrixCall("crm.dealcategory.list");
  const map = new Map();
  map.set(0, "Asosiy");
  for (const c of resp.result || []) map.set(Number(c.ID), c.NAME);
  return map;
}

// Stage list — STATUS_ID → uzbek nom
async function getStageNameMap(catMap) {
  const map = new Map();
  for (const catId of catMap.keys()) {
    const resp = await bitrixCall("crm.dealcategory.stage.list", { id: catId });
    for (const s of resp.result || []) {
      map.set(s.STATUS_ID, s.NAME);
    }
    await sleep(120);
  }
  return map;
}

async function fetchCallsForUser(uid) {
  const all = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall("voximplant.statistic.get", {
      FILTER: {
        PORTAL_USER_ID: uid,
        ">=CALL_START_DATE": FROM_ISO,
        "<=CALL_START_DATE": TO_ISO,
        ">CALL_DURATION": MIN_DURATION - 1,
      },
      SORT: "CALL_START_DATE",
      ORDER: "ASC",
      start,
    });
    const batch = resp.result || [];
    all.push(...batch);
    process.stdout.write(`  ${TARGET_NAMES[uid]}: ${all.length}/${resp.total || 0}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= (resp.total || 0)) break;
    await sleep(150);
  }
  console.log("");
  return all;
}

async function ensureManager(companyId, bitrixUserId) {
  if (!bitrixUserId) return null;
  const managerId = `bitrix_${bitrixUserId}`;
  const existing = await prisma.manager.findUnique({ where: { id: managerId } });
  if (existing) return managerId;
  const name = TARGET_NAMES[String(bitrixUserId)] || `User #${bitrixUserId}`;
  await prisma.manager.create({
    data: {
      id: managerId,
      name,
      email: `bitrix_${bitrixUserId}@prosales.local`,
      companyId,
      isActive: true,
      role: "sotuvchi",
    },
  });
  return managerId;
}

const leadCache = new Map();
async function fetchLead(leadId) {
  if (leadCache.has(leadId)) return leadCache.get(leadId);
  const resp = await bitrixCall("crm.lead.get", { id: leadId });
  const l = resp.result || null;
  leadCache.set(leadId, l);
  return l;
}

const dealCache = new Map();
async function fetchDeal(dealId) {
  if (dealCache.has(dealId)) return dealCache.get(dealId);
  const resp = await bitrixCall("crm.deal.get", { id: dealId });
  const d = resp.result || null;
  dealCache.set(dealId, d);
  return d;
}

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: "ProSalesGroup" },
  });
  if (!company) {
    console.error("ProSalesGroup company topilmadi");
    process.exit(1);
  }

  console.log(`Company: ${company.name}`);
  console.log(`Window:  ${FROM_DATE} ... ${TO_DATE}`);
  console.log(`Users:   ${TARGET_USERS.join(", ")}`);
  console.log(`Filter:  CALL_RECORD_URL bor + duration >= ${MIN_DURATION}s\n`);

  console.log("1) Lug'atlarni yuklash...");
  const [sourceMap, catMap] = await Promise.all([getSourceMap(), getCategoryMap()]);
  const stageNameMap = await getStageNameMap(catMap);
  console.log(`   Source: ${sourceMap.size}, Pipeline: ${catMap.size}, Stage: ${stageNameMap.size}\n`);

  console.log("2) voximplant.statistic.get (per user)...");
  const allCalls = [];
  for (const uid of TARGET_USERS) {
    const calls = await fetchCallsForUser(uid);
    allCalls.push(...calls);
  }
  console.log(`   ${allCalls.length} qo'ng'iroq keldi\n`);

  // Qayta/sotuv klassifikatsiya — DB'dan oldingi qo'ng'iroqlarni yuklash
  console.log("3) Mavjud qo'ng'iroqlarning birinchi sanalari...");
  const firstCallDateByKey = new Map();
  const existingAudios = await prisma.audioFile.findMany({
    where: { companyId: company.id },
    select: { leadId: true, phoneNumber: true, callDate: true, createdAt: true },
  });
  for (const a of existingAudios) {
    const keys = [];
    if (a.leadId != null) keys.push(`L:${a.leadId}`);
    if (a.phoneNumber) keys.push(`P:${a.phoneNumber}`);
    const d = a.callDate || a.createdAt;
    if (!d) continue;
    for (const k of keys) {
      const prev = firstCallDateByKey.get(k);
      if (!prev || d < prev) firstCallDateByKey.set(k, d);
    }
  }
  console.log(`   ${firstCallDateByKey.size} ta unique key DB'dan\n`);

  let withRec = 0;
  let skippedShort = 0;
  let skippedNoRec = 0;
  let skippedOtherUser = 0;
  let upserted = 0;
  let createdNew = 0;

  for (const c of allCalls) {
    const url = c.CALL_RECORD_URL;
    const duration = parseInt(c.CALL_DURATION || "0", 10);

    if (!TARGET_USERS.includes(String(c.PORTAL_USER_ID))) {
      skippedOtherUser += 1;
      continue;
    }
    if (!url) {
      skippedNoRec += 1;
      continue;
    }
    withRec += 1;
    if (duration < MIN_DURATION) {
      skippedShort += 1;
      continue;
    }

    const bitrixCallId = String(c.ID);
    const fileName = `bitrix_call_${bitrixCallId}.mp3`;
    const managerId = await ensureManager(company.id, c.PORTAL_USER_ID);
    const callDate = c.CALL_START_DATE ? new Date(c.CALL_START_DATE) : new Date();
    const crmEntityId = c.CRM_ENTITY_ID ? String(c.CRM_ENTITY_ID) : null;
    const direction =
      String(c.CALL_TYPE) === "1" ? "outgoing" :
      String(c.CALL_TYPE) === "2" ? "incoming" : null;

    let leadCreatedAt = null;
    let pipelineName = null;
    let sourceId = null;
    let sourceName = null;
    let leadIdInt = null;
    let statusName = null;

    try {
      if (c.CRM_ENTITY_TYPE === "LEAD" && crmEntityId) {
        const lead = await fetchLead(crmEntityId);
        if (lead) {
          leadCreatedAt = lead.DATE_CREATE ? new Date(lead.DATE_CREATE) : null;
          sourceId = lead.SOURCE_ID || null;
          sourceName = sourceId ? sourceMap.get(sourceId) || sourceId : null;
          leadIdInt = parseInt(crmEntityId, 10);
          statusName = lead.STATUS_ID ? stageNameMap.get(lead.STATUS_ID) || lead.STATUS_ID : null;
        }
      } else if (c.CRM_ENTITY_TYPE === "DEAL" && crmEntityId) {
        const deal = await fetchDeal(crmEntityId);
        if (deal) {
          leadCreatedAt = deal.DATE_CREATE ? new Date(deal.DATE_CREATE) : null;
          const catId = parseInt(deal.CATEGORY_ID || "0", 10);
          pipelineName = catMap.get(catId) || `Pipeline ${catId}`;
          leadIdInt = parseInt(crmEntityId, 10);
          statusName = deal.STAGE_ID ? stageNameMap.get(deal.STAGE_ID) || deal.STAGE_ID : null;
          if (deal.LEAD_ID) {
            const srcLead = await fetchLead(String(deal.LEAD_ID));
            if (srcLead?.SOURCE_ID) {
              sourceId = srcLead.SOURCE_ID;
              sourceName = sourceMap.get(sourceId) || sourceId;
            }
          }
        }
      }
    } catch (e) {
      // CRM lookup xatosini tashlamaymiz
    }

    // Sotuv vs qayta — shu lead yoki telefon bo'yicha avval qo'ng'iroq bormi?
    const keys = [];
    if (leadIdInt != null) keys.push(`L:${leadIdInt}`);
    if (c.PHONE_NUMBER) keys.push(`P:${c.PHONE_NUMBER}`);
    let isRepeat = false;
    for (const k of keys) {
      const firstSeen = firstCallDateByKey.get(k);
      if (firstSeen && firstSeen < callDate) {
        isRepeat = true;
        break;
      }
    }
    for (const k of keys) {
      const prev = firstCallDateByKey.get(k);
      if (!prev || callDate < prev) firstCallDateByKey.set(k, callDate);
    }
    const category = isRepeat ? "qayta" : "sotuv";

    const existing = await prisma.audioFile.findFirst({
      where: { companyId: company.id, fileName },
      select: { id: true },
    });

    const payload = {
      fileUrl: url,
      managerId,
      duration,
      callDate,
      phoneNumber: c.PHONE_NUMBER || null,
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

    if (existing) {
      await prisma.audioFile.update({ where: { id: existing.id }, data: payload });
    } else {
      await prisma.audioFile.create({
        data: {
          ...payload,
          companyId: company.id,
          fileName,
          status: "pending",
        },
      });
      createdNew += 1;
    }
    upserted += 1;
    if (upserted % 25 === 0) process.stdout.write(`  upserted ${upserted}\r`);
  }

  console.log("");
  console.log("=== Natija ===");
  console.log(`  Bitrix qo'ng'iroq:        ${allCalls.length}`);
  console.log(`  Boshqa user (skip):       ${skippedOtherUser}`);
  console.log(`  Yozuvi yo'q (skip):       ${skippedNoRec}`);
  console.log(`  Qisqa (< ${MIN_DURATION}s, skip):  ${skippedShort}`);
  console.log(`  Upsert (yangi+yangilangan): ${upserted}`);
  console.log(`  Yangi yaratildi:          ${createdNew}`);

  // Per-manager summary
  const perManager = await prisma.audioFile.groupBy({
    by: ["managerId"],
    where: {
      companyId: company.id,
      managerId: { in: TARGET_USERS.map((u) => `bitrix_${u}`) },
      callDate: { gte: new Date(FROM_ISO), lte: new Date(TO_ISO) },
    },
    _count: { _all: true },
  });
  console.log("\n=== Per-manager (DB'da ${FROM_DATE}..${TO_DATE}) ===");
  for (const r of perManager) {
    const uid = r.managerId.replace("bitrix_", "");
    console.log(`  ${TARGET_NAMES[uid] || uid}: ${r._count._all} ta`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
