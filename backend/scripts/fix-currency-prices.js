// One-off: SalesLead.price'ni Bitrix valyuta kursi bo'yicha UZS'ga to'g'rilaydi.
// USD/EUR/RUB dealar avval face value (200) UZS deb saqlangan edi.
// Faqat price'ni yangilaydi, idempotent. Boshqa hech narsaga tegmaydi.
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bx(method, payload = {}, retry = 0) {
  const r = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
    timeout: 30000,
  });
  if (r.data && r.data.error === "QUERY_LIMIT_EXCEEDED" && retry < 6) {
    await new Promise((s) => setTimeout(s, 2000 * (retry + 1)));
    return bx(method, payload, retry + 1);
  }
  return r.data;
}

async function main() {
  // 1) Valyuta kurslari
  const rates = new Map([["UZS", 1]]);
  const cr = await bx("crm.currency.list");
  for (const c of cr.result || []) {
    const amount = parseFloat(c.AMOUNT) || 1;
    const cnt = parseFloat(c.AMOUNT_CNT) || 1;
    rates.set(String(c.CURRENCY), amount / cnt);
  }
  console.log(
    "Kurslar:",
    [...rates.entries()].map(([k, v]) => `${k}=${v}`).join(" ")
  );

  // 2) Bitrix dealarni varaqlab CURRENCY_ID + OPPORTUNITY olamiz
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
      select: ["ID", "OPPORTUNITY", "CURRENCY_ID"],
      order: { ID: "ASC" },
      start,
    });
    const batch = resp.result || [];
    if (batch.length === 0) break;
    for (const d of batch) {
      scanned++;
      const leadId = parseInt(String(d.ID), 10);
      if (Number.isNaN(leadId)) continue;
      const raw = parseFloat(String(d.OPPORTUNITY)) || 0;
      if (raw <= 0) continue;
      const rate = rates.get(String(d.CURRENCY_ID || "UZS")) ?? 1;
      const correct = Math.round(raw * rate);
      const row = await prisma.salesLead.findUnique({
        where: { companyId_leadId: { companyId: company.id, leadId } },
        select: { price: true },
      });
      if (!row) continue;
      if (Math.round(row.price || 0) !== correct) {
        await prisma.salesLead.update({
          where: { companyId_leadId: { companyId: company.id, leadId } },
          data: { price: correct },
        });
        fixed++;
        if (d.CURRENCY_ID && d.CURRENCY_ID !== "UZS") {
          console.log(
            `  #${leadId} ${d.CURRENCY_ID} ${raw} → ${correct.toLocaleString()} UZS (eski ${row.price})`
          );
        }
      }
    }
    if (resp.next === undefined) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
  }
  console.log(`\nScan: ${scanned} deal, tuzatildi: ${fixed}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("XATO:", e.message);
  process.exit(1);
});
