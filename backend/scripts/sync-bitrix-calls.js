// Bitrix24 voximplant.statistic.get → AudioFile jadvaliga sync qilish.
// Har qo'ng'iroq uchun CRM entity (Lead yoki Deal) ma'lumotlari ham olinadi:
//   - leadCreatedAt — Lead/Deal DATE_CREATE
//   - firstContactAt — CALL_START_DATE
//   - pipelineName — Deal.CATEGORY nomi
//   - sourceId/sourceName — Lead.SOURCE_ID + lug'at
//   - direction — CALL_TYPE (1=outgoing, 2=incoming)
//
// CLI: node sync-bitrix-calls.js [days=3] [minQaytaSec=120] [minSotuvSec=180]
// Default filter qoida: qayta ≥ 120s, sotuv (1-qo'ng'iroq) ≥ 180s.
// MUHIM: argument berganda IKKALASI ham (qayta + sotuv) berilishi kerak,
// aks holda eski qiymat saqlanib qoladi va shovqinli audiolar DB'ga tushadi.

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

const DAYS = Number(process.argv[2] || 3);
// Kategoriya bo'yicha filter:
//   qayta qo'ng'iroq → minimum 2 daqiqa (120s)
//   sotuv (1-qo'ng'iroq) → minimum 3 daqiqa (180s)
const MIN_QAYTA = Number(process.argv[3] || 120);
const MIN_SOTUV = Number(process.argv[4] || 180);
const MIN_DURATION = Math.min(MIN_QAYTA, MIN_SOTUV); // early filter — eng kichigi

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

// Source lug'at (STATUS_ID → NAME) — crm.status.list ENTITY_ID=SOURCE
async function getSourceMap() {
  const resp = await bitrixCall("crm.status.list", {
    filter: { ENTITY_ID: "SOURCE" },
  });
  const map = new Map();
  for (const s of resp.result || []) {
    map.set(s.STATUS_ID, s.NAME);
  }
  return map;
}

// Pipeline (category) lug'ati — crm.dealcategory.list
async function getCategoryMap() {
  const resp = await bitrixCall("crm.dealcategory.list");
  const map = new Map();
  map.set(0, "Asosiy");
  for (const c of resp.result || []) {
    map.set(Number(c.ID), c.NAME);
  }
  return map;
}

async function fetchCalls(dateFromIso) {
  const all = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall("voximplant.statistic.get", {
      FILTER: { ">=CALL_START_DATE": dateFromIso },
      SORT: "CALL_START_DATE",
      ORDER: "ASC",
      start,
    });
    const batch = resp.result || [];
    all.push(...batch);
    process.stdout.write(`  fetched ${all.length}/${resp.total}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= resp.total) break;
    await sleep(200);
  }
  console.log("");
  return all;
}

async function ensureManager(companyId, bitrixUserId) {
  if (!bitrixUserId) return null;
  const managerId = `bitrix_${bitrixUserId}`;
  const existing = await prisma.manager.findUnique({ where: { id: managerId } });
  if (existing) return managerId;
  await prisma.manager.create({
    data: {
      id: managerId,
      name: `User #${bitrixUserId}`,
      email: `bitrix_${bitrixUserId}@prosales.local`,
      companyId,
      isActive: false,
      role: "sotuvchi",
    },
  });
  return managerId;
}

// Lead ma'lumotlari cache (Bitrix call'larda ko'p lidlar takroriy)
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
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Company topilmadi");
    process.exit(1);
  }

  const fromIso = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString();
  console.log(`Company: ${company.name}`);
  console.log(`Window: oxirgi ${DAYS} kun (${fromIso} dan)`);
  console.log(`Filter: CALL_RECORD_URL bor + qayta>=${MIN_QAYTA}s, sotuv>=${MIN_SOTUV}s\n`);

  console.log("1) Lug'atlarni yuklash...");
  const [sourceMap, catMap] = await Promise.all([getSourceMap(), getCategoryMap()]);
  console.log(`   Source: ${sourceMap.size}, Pipeline: ${catMap.size}`);

  console.log("\n2) voximplant.statistic.get...");
  const calls = await fetchCalls(fromIso);
  console.log(`   ${calls.length} qo'ng'iroq keldi\n`);

  // Qayta/sotuv avtomatik ajratish uchun — har key bo'yicha birinchi aloqa sanasi
  // Key: "L:<leadId>" yoki "P:<phoneNumber>"
  // DB dan eski audio fayllarning minCallDate'ini yuklaymiz — keyin sync window'dagi
  // qo'ng'iroqlar shunga taqqoslanadi.
  console.log("2b) Mavjud qo'ng'iroqlarning birinchi sanasini yuklash...");
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
  console.log(`   ${firstCallDateByKey.size} ta unique key DB'dan`);

  // Lid/deal id larning unique to'plamini oldindan olish (cache uchun)
  const uniqueLeadIds = new Set();
  const uniqueDealIds = new Set();
  for (const c of calls) {
    if (!c.CALL_RECORD_URL) continue;
    if (parseInt(c.CALL_DURATION || "0", 10) < MIN_DURATION) continue;
    if (c.CRM_ENTITY_TYPE === "LEAD" && c.CRM_ENTITY_ID) uniqueLeadIds.add(String(c.CRM_ENTITY_ID));
    if (c.CRM_ENTITY_TYPE === "DEAL" && c.CRM_ENTITY_ID) uniqueDealIds.add(String(c.CRM_ENTITY_ID));
  }
  console.log(`3) CRM entity lookup: ${uniqueLeadIds.size} lid + ${uniqueDealIds.size} deal`);

  let withRec = 0;
  let skippedShort = 0;
  let skippedNoRec = 0;
  let upserted = 0;

  for (const c of calls) {
    const url = c.CALL_RECORD_URL;
    const duration = parseInt(c.CALL_DURATION || "0", 10);

    if (!url) { skippedNoRec += 1; continue; }
    withRec += 1;
    if (duration < MIN_DURATION) { skippedShort += 1; continue; }

    const bitrixCallId = String(c.ID);
    const fileName = `bitrix_call_${bitrixCallId}.mp3`;
    const managerId = await ensureManager(company.id, c.PORTAL_USER_ID);
    const callDate = c.CALL_START_DATE ? new Date(c.CALL_START_DATE) : new Date();
    const crmEntityId = c.CRM_ENTITY_ID ? String(c.CRM_ENTITY_ID) : null;
    const direction =
      String(c.CALL_TYPE) === "1" ? "outgoing" :
      String(c.CALL_TYPE) === "2" ? "incoming" : null;

    // CRM entity ma'lumotini olish (Lead yoki Deal)
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
          statusName = lead.STATUS_ID || null;
        }
      } else if (c.CRM_ENTITY_TYPE === "DEAL" && crmEntityId) {
        const deal = await fetchDeal(crmEntityId);
        if (deal) {
          leadCreatedAt = deal.DATE_CREATE ? new Date(deal.DATE_CREATE) : null;
          const catId = parseInt(deal.CATEGORY_ID || "0", 10);
          pipelineName = catMap.get(catId) || `Pipeline ${catId}`;
          leadIdInt = parseInt(crmEntityId, 10);
          statusName = deal.STAGE_ID || null;
          // Deal uchun ham source'ni asosiy LEAD_ID orqali topish mumkin
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
      // CRM lookup xato bo'lsa davom etamiz
    }

    // Qayta/sotuv aniqlash — shu lead yoki telefon bo'yicha avvalroq qo'ng'iroq bormi?
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
    // Hozirgi qo'ng'iroqni ham map ga qo'shamiz — keyingi qo'ng'iroqlar bilan taqqoslash uchun
    for (const k of keys) {
      const prev = firstCallDateByKey.get(k);
      if (!prev || callDate < prev) firstCallDateByKey.set(k, callDate);
    }
    const category = isRepeat ? "qayta" : "sotuv";

    // Kategoriya-aware duration filter
    const minForCategory = category === "qayta" ? MIN_QAYTA : MIN_SOTUV;
    if (duration < minForCategory) { skippedShort += 1; continue; }

    // Bir xil call ID bo'yicha upsert
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
      firstContactAt: callDate, // birinchi kontakt = shu qo'ng'iroq
      // Deal bo'lmasa (hali lid pipeline'ga kirmagan) → "Yangi lid"
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
    }
    upserted += 1;

    if (upserted % 25 === 0) {
      process.stdout.write(`  upserted ${upserted}\r`);
    }
  }

  console.log("");
  console.log(`=== Natija ===`);
  console.log(`  Jami qo'ng'iroq:          ${calls.length}`);
  console.log(`  Yozuvi yo'q:              ${skippedNoRec}`);
  console.log(`  Qisqa (qayta<${MIN_QAYTA}s, sotuv<${MIN_SOTUV}s): ${skippedShort}`);
  console.log(`  AudioFile upserted:       ${upserted}`);

  // Natija tekshirish
  const stats = await prisma.audioFile.aggregate({
    where: { companyId: company.id },
    _count: { _all: true },
  });
  const withPipeline = await prisma.audioFile.count({
    where: { companyId: company.id, pipelineName: { not: null } },
  });
  const withSource = await prisma.audioFile.count({
    where: { companyId: company.id, sourceName: { not: null } },
  });
  const withLeadDate = await prisma.audioFile.count({
    where: { companyId: company.id, leadCreatedAt: { not: null } },
  });
  console.log(`\n  DB jami: ${stats._count._all}`);
  console.log(`  Voronka to'ldirildi:  ${withPipeline}`);
  console.log(`  Manba to'ldirildi:    ${withSource}`);
  console.log(`  Lid sana to'ldirildi: ${withLeadDate}`);

  const sotuvCount = await prisma.audioFile.count({
    where: { companyId: company.id, category: "sotuv" },
  });
  const qaytaCount = await prisma.audioFile.count({
    where: { companyId: company.id, category: "qayta" },
  });
  console.log(`  Kategoriya: ${sotuvCount} sotuv + ${qaytaCount} qayta`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
