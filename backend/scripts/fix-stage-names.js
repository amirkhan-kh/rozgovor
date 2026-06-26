// SalesLead.statusName'larni Bitrix stage nomlari bilan to'g'rilash
// (sync bug: stage code "C64:LOSE" o'rniga "Сделка провалена" bo'lishi kerak)

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(method, payload = {}) {
  const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s < 500,
    timeout: 30000,
  });
  return resp.data;
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) return;

  // Barcha pipeline'lar
  const catResp = await bitrixCall("crm.dealcategory.list");
  const categoryIds = [0, ...(catResp.result || []).map((c) => Number(c.ID))];

  // Har pipeline uchun stage nomlarini yig'ish.
  // Bitrix STATUS_ID formati:
  //   - Category 0: "NEW", "PREPARATION", "WON", "LOSE" (prefiksiz)
  //   - Category N: "C<N>:NEW", "C<N>:LOSE" (prefiksli)
  const stageMap = new Map();
  for (const cid of categoryIds) {
    try {
      const resp = await bitrixCall("crm.dealcategory.stage.list", { id: cid });
      for (const s of resp.result || []) {
        stageMap.set(s.STATUS_ID, s.NAME);
      }
    } catch (err) {
      console.log(`  skip cat=${cid}: ${err.message}`);
    }
  }
  console.log(`Stage map size: ${stageMap.size}`);

  // Noto'g'ri statusName'larni topish: agar "C<n>:..." bilan boshlangan bo'lsa
  const rows = await prisma.salesLead.findMany({
    where: {
      companyId: company.id,
      statusName: { startsWith: "C" },
    },
    select: { id: true, statusName: true, pipelineId: true },
  });
  console.log(`Notogri statusName: ${rows.length} ta row`);

  let fixed = 0;
  for (const r of rows) {
    // r.statusName = "C64:LOSE" — bu aslida STAGE_ID bo'lib ketgan
    const realName = stageMap.get(r.statusName);
    if (!realName) continue;
    await prisma.salesLead.update({
      where: { id: r.id },
      data: { statusName: realName },
    });
    fixed += 1;
    if (fixed % 100 === 0) process.stdout.write(`  ${fixed}/${rows.length}\r`);
  }
  console.log(`\n✓ ${fixed} ta row yangilandi`);

  // Verify
  const badLeft = await prisma.salesLead.count({
    where: { companyId: company.id, statusName: { startsWith: "C" } },
  });
  console.log(`Hali ham bad: ${badLeft}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
