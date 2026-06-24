// Bitrix24 dealdan SalesLead jadvalini to'ldirish (oxirgi 3 oy)
// Har Bitrix deal bitta unikal sotuv/lead sifatida saqlanadi.

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

// Bitrix custom field — "Kelishilgan to'lov sanasi" (type: date).
// Discovered via scripts/find-kelishilgan-field.js (userfield.get):
//   UF_CRM_1761119000060 = "Kelishilgan to'lov sanasi"
const KELISHILGAN_FIELD = "UF_CRM_1761119000060";

// Qisman to'lov — stage NAME bilan match. Bitrix ID'lari pipelineda turlicha
// (C12:UC_KNWAWJ "Qisman tolov1", C38:UC_UBEBWK "Qisman to'lov qildi", ...)
function isPartialPaymentStageName(name) {
  if (!name) return false;
  const low = String(name).toLowerCase();
  return (
    low.includes("qisman to'lov") ||
    low.includes("qisman tolov") ||
    low.includes("частичная оплата") ||
    low.includes("частичная оплат") ||
    low.includes("qisman to`lov")
  );
}

async function bitrixCall(method, payload = {}) {
  const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s < 500,
  });
  return resp.data;
}

async function fetchAllDeals(dateFromISO) {
  const deals = [];
  let start = 0;
  const PAGE = 50; // Bitrix default

  while (true) {
    const resp = await bitrixCall("crm.deal.list", {
      filter: {
        ">=DATE_CREATE": dateFromISO,
      },
      select: [
        "ID",
        "TITLE",
        "CATEGORY_ID",
        "STAGE_ID",
        "STAGE_SEMANTIC_ID",
        "OPPORTUNITY",
        "CURRENCY_ID",
        "CLOSED",
        "CLOSEDATE",
        "DATE_CREATE",
        "ASSIGNED_BY_ID",
        "LEAD_ID",
        KELISHILGAN_FIELD,
      ],
      order: { DATE_CREATE: "ASC" },
      start,
    });
    const batch = resp.result || [];
    deals.push(...batch);
    process.stdout.write(
      `  fetched ${deals.length}/${resp.total}\r`
    );
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= resp.total) break;
  }
  console.log("");
  return deals;
}

async function fetchAllClosedSales(dateFromISO) {
  // Sotuvlar: CLOSEDATE davr ichida + STAGE_SEMANTIC_ID = S (won)
  const deals = [];
  let start = 0;

  while (true) {
    const resp = await bitrixCall("crm.deal.list", {
      filter: {
        ">=CLOSEDATE": dateFromISO,
        STAGE_SEMANTIC_ID: "S",
      },
      select: [
        "ID",
        "TITLE",
        "CATEGORY_ID",
        "STAGE_ID",
        "STAGE_SEMANTIC_ID",
        "OPPORTUNITY",
        "CURRENCY_ID",
        "CLOSED",
        "CLOSEDATE",
        "DATE_CREATE",
        "ASSIGNED_BY_ID",
        "LEAD_ID",
        KELISHILGAN_FIELD,
      ],
      order: { CLOSEDATE: "ASC" },
      start,
    });
    const batch = resp.result || [];
    deals.push(...batch);
    process.stdout.write(
      `  fetched ${deals.length}/${resp.total}\r`
    );
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= resp.total) break;
  }
  console.log("");
  return deals;
}

async function getCategoryMap() {
  const resp = await bitrixCall("crm.dealcategory.list");
  const map = new Map();
  // Category 0 (default) Bitrix list'ga kelmaydi
  map.set(0, "Asosiy");
  for (const c of resp.result || []) {
    map.set(Number(c.ID), c.NAME);
  }
  return map;
}

async function getStageMap(categoryIds) {
  const map = new Map();
  for (const cid of categoryIds) {
    try {
      const resp = await bitrixCall("crm.dealcategory.stage.list", { id: cid });
      for (const s of resp.result || []) {
        // Bitrix STATUS_ID to'g'ridan-to'g'ri qaytadi:
        //   cat 0: "NEW", "LOSE", "WON"
        //   cat N: "C<N>:NEW", "C<N>:LOSE"
        map.set(s.STATUS_ID, s.NAME);
      }
    } catch (err) {
      console.log(`  stage map err for cid=${cid}:`, err.message);
    }
  }
  return map;
}

function parseOpportunity(v) {
  if (!v) return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// Valyuta kurslari: CURRENCY_ID → 1 birlik = necha UZS (base = UZS).
// USD/EUR/RUB dealar konvert qilinmasa face value UZS bo'lib qoladi.
async function getCurrencyMap() {
  const map = new Map();
  map.set("UZS", 1);
  try {
    const resp = await bitrixCall("crm.currency.list");
    for (const c of resp.result || []) {
      const amount = parseFloat(c.AMOUNT) || 1;
      const cnt = parseFloat(c.AMOUNT_CNT) || 1;
      map.set(String(c.CURRENCY), amount / cnt);
    }
  } catch (err) {
    console.log("  currency map err:", err.message);
  }
  return map;
}

function oppToUzs(opportunity, currencyId, rates) {
  const raw = parseOpportunity(opportunity);
  if (raw <= 0) return 0;
  const rate = rates.get(currencyId ? String(currencyId) : "UZS") ?? 1;
  return Math.round(raw * rate);
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("Company topilmadi, avval yarating");
    process.exit(1);
  }
  console.log(`Company: ${company.name} (${company.id})`);

  const now = new Date();
  const threeMoAgo = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - 3,
    now.getUTCDate(),
    -5, 0, 0
  ));
  const dateFromISO = threeMoAgo.toISOString();
  console.log(`Sync window: ${dateFromISO} → now\n`);

  console.log("1) Category/pipeline map yig'ilyapti...");
  const catMap = await getCategoryMap();
  console.log(`   ${catMap.size} ta pipeline`);

  console.log("2) Stage/status map yig'ilyapti...");
  const stageMap = await getStageMap([...catMap.keys()]);
  console.log(`   ${stageMap.size} ta stage`);

  console.log("2b) Valyuta kurslari yig'ilyapti...");
  const rates = await getCurrencyMap();
  console.log(`   ${rates.size} ta valyuta (USD=${rates.get("USD")})`);

  console.log("3) Deallar yuklanmoqda (created)...");
  const createdDeals = await fetchAllDeals(dateFromISO);
  console.log(`   ${createdDeals.length} ta created`);

  console.log("4) Sotuvlar yuklanmoqda (closed)...");
  const closedDeals = await fetchAllClosedSales(dateFromISO);
  console.log(`   ${closedDeals.length} ta closed sotuv`);

  // Dedup va merge
  const all = new Map();
  for (const d of [...createdDeals, ...closedDeals]) {
    all.set(d.ID, d);
  }
  console.log(`\nJami unikal deallar: ${all.size}`);

  let upserted = 0;
  for (const [id, d] of all) {
    const leadIdNum = parseInt(id, 10);
    if (isNaN(leadIdNum)) continue;

    const categoryId = parseInt(d.CATEGORY_ID, 10);
    const isSale = d.STAGE_SEMANTIC_ID === "S";
    const stageName = stageMap.get(d.STAGE_ID) || d.STAGE_ID;
    const isPartialPayment = isPartialPaymentStageName(stageName);
    const amoUserId = d.ASSIGNED_BY_ID ? String(d.ASSIGNED_BY_ID) : null;
    const leadCreatedAt = d.DATE_CREATE ? new Date(d.DATE_CREATE) : new Date();
    const closedAt = d.CLOSEDATE ? new Date(d.CLOSEDATE) : null;
    const rawAgreed = d[KELISHILGAN_FIELD];
    const agreedPaymentDate =
      rawAgreed && String(rawAgreed).length > 0 ? new Date(rawAgreed) : null;

    await prisma.salesLead.upsert({
      where: { companyId_leadId: { companyId: company.id, leadId: leadIdNum } },
      create: {
        companyId: company.id,
        leadId: leadIdNum,
        pipelineId: categoryId,
        pipelineName: catMap.get(categoryId) || `Pipeline ${categoryId}`,
        statusId: null, // Bitrix STAGE_ID string — statusName'da saqlanadi
        statusName: stageName,
        semanticId: d.STAGE_SEMANTIC_ID || null,
        price: oppToUzs(d.OPPORTUNITY, d.CURRENCY_ID, rates),
        responsibleManagerId: null,
        amocrmUserId: amoUserId, // Bitrix user id shu yerga yoziladi
        leadCreatedAt,
        closedAt,
        isSale,
        isPartialPayment,
        agreedPaymentDate,
        originalLeadId: d.LEAD_ID ? Number(d.LEAD_ID) : null,
      },
      update: {
        pipelineId: categoryId,
        pipelineName: catMap.get(categoryId) || `Pipeline ${categoryId}`,
        statusName: stageName,
        semanticId: d.STAGE_SEMANTIC_ID || null,
        originalLeadId: d.LEAD_ID ? Number(d.LEAD_ID) : null,
        price: oppToUzs(d.OPPORTUNITY, d.CURRENCY_ID, rates),
        amocrmUserId: amoUserId,
        leadCreatedAt,
        closedAt,
        isSale,
        isPartialPayment,
        agreedPaymentDate,
      },
    });
    upserted += 1;
    if (upserted % 100 === 0) {
      process.stdout.write(`  upserted ${upserted}/${all.size}\r`);
    }
  }
  console.log(`\n✓ ${upserted} ta deal SalesLead jadvaliga yozildi`);

  // Natija
  const total = await prisma.salesLead.count({ where: { companyId: company.id } });
  const sales = await prisma.salesLead.count({
    where: { companyId: company.id, isSale: true },
  });
  const revAgg = await prisma.salesLead.aggregate({
    where: { companyId: company.id, isSale: true },
    _sum: { price: true },
  });
  console.log(`\n=== DB natijasi ===`);
  console.log(`  ${total} deal`);
  console.log(`  ${sales} sotuv`);
  console.log(`  ${(revAgg._sum.price || 0).toLocaleString()} UZS`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
