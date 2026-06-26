// Mavjud SalesLead rowlariga Bitrix LEAD_ID ni backfill qilish.
// Shu bilan Lid soni filter'da (pipeline tanlanganda) to'g'ri sanab beramiz.

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

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

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) return;

  const dbDealIds = new Set(
    (
      await prisma.salesLead.findMany({
        where: { companyId: company.id },
        select: { leadId: true },
      })
    ).map((r) => r.leadId)
  );
  console.log(`DB: ${dbDealIds.size} deal`);

  // Bitrix'dan hamma dealarning ID + LEAD_ID ni yuklaymiz (pagination)
  const leadIdByDeal = new Map();
  let start = 0;
  while (true) {
    const resp = await bitrixCall("crm.deal.list", {
      select: ["ID", "LEAD_ID"],
      order: { ID: "ASC" },
      start,
    });
    const batch = resp.result || [];
    for (const d of batch) {
      const dealId = Number(d.ID);
      if (!dbDealIds.has(dealId)) continue;
      const leadId = d.LEAD_ID ? Number(d.LEAD_ID) : null;
      leadIdByDeal.set(dealId, leadId);
    }
    process.stdout.write(`  fetched ${start + batch.length}/${resp.total}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= resp.total) break;
    await sleep(200);
  }
  console.log(`\nLinked found: ${leadIdByDeal.size}`);

  let updated = 0;
  let withLead = 0;
  for (const [dealId, leadId] of leadIdByDeal) {
    await prisma.salesLead.update({
      where: { companyId_leadId: { companyId: company.id, leadId: dealId } },
      data: { originalLeadId: leadId },
    });
    updated += 1;
    if (leadId) withLead += 1;
    if (updated % 200 === 0) {
      process.stdout.write(`  updated ${updated}/${leadIdByDeal.size}\r`);
    }
  }
  console.log(`\n✓ ${updated} row yangilandi, ${withLead} lid bilan bog'langan`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
