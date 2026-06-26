// Mavjud SalesLead rowlariga STAGE_SEMANTIC_ID ni Bitrix'dan olib backfill qilish.

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(method, payload = {}, retry = 0) {
  try {
    const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
      timeout: 30000,
    });
    if (resp.data && resp.data.error === "QUERY_LIMIT_EXCEEDED") {
      if (retry > 8) throw new Error("rate limit after 8 retries");
      await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
      return bitrixCall(method, payload, retry + 1);
    }
    return resp.data;
  } catch (err) {
    if (retry > 8) throw err;
    await new Promise((r) => setTimeout(r, 2000 * (retry + 1)));
    return bitrixCall(method, payload, retry + 1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) return;

  // Barcha dealarni Bitrix'dan ID + STAGE_ID + SEMANTIC yuklash
  // Davr filteri yo'q — barcha hozir DB'da bor rowlar uchun kerak
  const leadIds = (
    await prisma.salesLead.findMany({
      where: { companyId: company.id },
      select: { leadId: true },
    })
  ).map((r) => r.leadId);
  console.log(`DB'da ${leadIds.length} deal row`);

  // Stage → semantic map
  const catResp = await bitrixCall("crm.dealcategory.list");
  const categoryIds = [0, ...(catResp.result || []).map((c) => Number(c.ID))];
  const stageSemantic = new Map();
  for (const cid of categoryIds) {
    try {
      const resp = await bitrixCall("crm.dealcategory.stage.list", { id: cid });
      for (const s of resp.result || []) {
        stageSemantic.set(s.STATUS_ID, s.SEMANTICS || null);
      }
    } catch {}
  }
  console.log(`Stage map: ${stageSemantic.size}`);

  // Bitrix'dan barcha dealarning STAGE_ID ini tortamiz
  const stageById = new Map();
  let start = 0;
  while (true) {
    const resp = await bitrixCall("crm.deal.list", {
      select: ["ID", "STAGE_ID", "STAGE_SEMANTIC_ID"],
      order: { ID: "ASC" },
      start,
    });
    const batch = resp.result || [];
    for (const d of batch) stageById.set(Number(d.ID), d.STAGE_SEMANTIC_ID);
    process.stdout.write(`  fetched ${stageById.size}/${resp.total}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= resp.total) break;
    await sleep(200);
  }
  console.log(`\nBitrix'dan ${stageById.size} deal tortildi`);

  let updated = 0;
  for (const leadId of leadIds) {
    const sem = stageById.get(leadId);
    if (!sem) continue;
    await prisma.salesLead.update({
      where: { companyId_leadId: { companyId: company.id, leadId } },
      data: { semanticId: sem },
    });
    updated += 1;
    if (updated % 200 === 0) {
      process.stdout.write(`  updated ${updated}/${leadIds.length}\r`);
    }
  }
  console.log(`\n✓ ${updated} row yangilandi`);

  // Verify
  const sCount = await prisma.salesLead.count({
    where: { companyId: company.id, semanticId: "S" },
  });
  const fCount = await prisma.salesLead.count({
    where: { companyId: company.id, semanticId: "F" },
  });
  const pCount = await prisma.salesLead.count({
    where: { companyId: company.id, semanticId: "P" },
  });
  console.log(`S=${sCount} F=${fCount} P=${pCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
