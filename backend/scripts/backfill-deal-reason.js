// One-off: SalesLead.closeReasonId/Name'ni Bitrix deal "Yopilish sababi"
// (UF_CRM_1777802548185 enumeration) dan to'ldiradi. Idempotent.
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
const prisma = new PrismaClient();

const WH =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://rozgovoruz.bitrix24.kz/rest/527/8cmow72uy63s4ewg";
const FIELD = "UF_CRM_69CFC6BD9EFCB";

async function bx(m, p = {}, retry = 0) {
  const r = await axios.post(`${WH}/${m}.json`, p, {
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
    timeout: 30000,
  });
  if (r.data && r.data.error === "QUERY_LIMIT_EXCEEDED" && retry < 6) {
    await new Promise((s) => setTimeout(s, 2000 * (retry + 1)));
    return bx(m, p, retry + 1);
  }
  return r.data;
}

async function main() {
  // enum ID → label
  const f = await bx("crm.deal.fields");
  const items = ((f.result || {})[FIELD] || {}).items || [];
  const map = new Map(items.map((it) => [String(it.ID), String(it.VALUE)]));
  console.log(`Reason enum: ${map.size} ta`);

  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("Company yo'q");
    process.exit(1);
  }

  let start = 0;
  let scanned = 0;
  let fixed = 0;
  while (true) {
    const resp = await bx("crm.deal.list", {
      select: ["ID", FIELD],
      order: { ID: "ASC" },
      start,
    });
    const batch = resp.result || [];
    if (batch.length === 0) break;
    for (const d of batch) {
      scanned++;
      const leadId = parseInt(String(d.ID), 10);
      if (Number.isNaN(leadId)) continue;
      const raw = d[FIELD];
      const id =
        raw === null || raw === undefined || raw === "" ? null : String(raw);
      const name = id ? map.get(id) || null : null;
      const row = await prisma.salesLead.findUnique({
        where: { companyId_leadId: { companyId: company.id, leadId } },
        select: { closeReasonId: true, closeReasonName: true },
      });
      if (!row) continue;
      if (row.closeReasonId !== id || row.closeReasonName !== name) {
        await prisma.salesLead.update({
          where: { companyId_leadId: { companyId: company.id, leadId } },
          data: { closeReasonId: id, closeReasonName: name },
        });
        fixed++;
      }
    }
    if (resp.next === undefined) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
  }
  console.log(`Scan: ${scanned}, to'ldirildi: ${fixed}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("XATO:", e.message);
  process.exit(1);
});
