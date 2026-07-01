// One-off: Lead.rejectReasonId/Name'ni Bitrix LEAD "Sifatsiz lid" sababi
// (UF_CRM_1775192522399 enumeration, rozgovoruz portali) dan to'ldiradi. Idempotent.
// Jonli crm.lead.fields'dan tasdiqlangan (2026-07): 1117=Noto'g'ri raqam,
// 1119=Ariza qoldirmagan, 1121=Bepul xohladi, 1123=Chet el raqami.
const { PrismaClient } = require("@prisma/client");
const axios = require("axios");
require("dotenv").config();

const prisma = new PrismaClient();

const WH = process.env.BITRIX_WEBHOOK_URL;
const FIELD = "UF_CRM_1775192522399";

async function bx(m, p = {}, retry = 0) {
  if (!WH) {
    throw new Error("BITRIX_WEBHOOK_URL env yo'q");
  }
  const r = await axios.post(`${WH.replace(/\/$/, "")}/${m}.json`, p, {
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
  const f = await bx("crm.lead.fields");
  if (f.error) {
    console.error("crm.lead.fields XATO:", f.error, f.error_description);
    process.exit(1);
  }
  const items = ((f.result || {})[FIELD] || {}).items || [];
  const map = new Map(items.map((it) => [String(it.ID), String(it.VALUE)]));
  console.log(`Reason enum: ${map.size} ta`);
  if (map.size === 0) {
    console.error(`Maydon ${FIELD} topilmadi yoki bo'sh — to'xtatildi.`);
    process.exit(1);
  }

  const company = await prisma.company.findFirst();
  if (!company) {
    console.log("Company yo'q");
    process.exit(1);
  }

  let start = 0;
  let scanned = 0;
  let fixed = 0;
  while (true) {
    const resp = await bx("crm.lead.list", {
      select: ["ID", FIELD],
      order: { ID: "ASC" },
      start,
    });
    if (resp.error) {
      console.error("crm.lead.list XATO:", resp.error, resp.error_description);
      process.exit(1);
    }
    const batch = resp.result || [];
    if (batch.length === 0) break;
    for (const l of batch) {
      scanned++;
      const bitrixLeadId = parseInt(String(l.ID), 10);
      if (Number.isNaN(bitrixLeadId)) continue;
      const raw = l[FIELD];
      const id =
        raw === null || raw === undefined || raw === "" ? null : String(raw);
      const name = id ? map.get(id) || null : null;
      const row = await prisma.lead.findUnique({
        where: { companyId_bitrixLeadId: { companyId: company.id, bitrixLeadId } },
        select: { rejectReasonId: true, rejectReasonName: true },
      });
      if (!row) continue; // faqat bizda mavjud lidlarni to'ldiramiz
      if (row.rejectReasonId !== id || row.rejectReasonName !== name) {
        await prisma.lead.update({
          where: { companyId_bitrixLeadId: { companyId: company.id, bitrixLeadId } },
          data: { rejectReasonId: id, rejectReasonName: name },
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
