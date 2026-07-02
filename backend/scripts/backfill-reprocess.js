// Targeted backfill: faqat Lead.reprocessReasonId/Name ni to'ldiradi.
// Boshqa maydonlarga (opportunity, statusName, isConverted ...) TEGMAYDI —
// prod'da tasdiqlangan revenue/sotuv raqamlari o'zgarmasligi kafolatlanadi.
//
// Ishlatish:  node scripts/backfill-reprocess.js [months=6]
// (PrismaClient .env'ni yuklaydi — inline env shart emas.)

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

// "Qayta Obrabotka" lead enum field (bitrix-sync.ts bilan bir xil)
const REPROCESS_FIELD = "UF_CRM_1744108566958";

async function bitrixCall(method, payload = {}, attempt = 1) {
  try {
    const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
      headers: { "Content-Type": "application/json" },
      validateStatus: (s) => s < 500,
      timeout: 30000,
    });
    return resp.data;
  } catch (err) {
    if (attempt <= 3) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return bitrixCall(method, payload, attempt + 1);
    }
    throw err;
  }
}

async function getEnumMap(fieldId) {
  const resp = await bitrixCall("crm.lead.fields", {});
  const field = (resp.result || {})[fieldId];
  const map = new Map();
  for (const it of (field && field.items) || []) map.set(String(it.ID), it.VALUE);
  return map;
}

async function main() {
  const months = parseInt(process.argv[2], 10) || 6;
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Company topilmadi");

  const now = new Date();
  const from = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate(), -5, 0, 0)
  );
  console.log(`Backfill oynasi: >= ${from.toISOString()} (${months} oy)`);

  const enumMap = await getEnumMap(REPROCESS_FIELD);
  console.log(`Qayta ishlov enum: ${enumMap.size} ta qiymat`);

  // Reprocess field to'ldirilgan leadlarni tortamiz (faqat ID + field)
  const idsByEnum = new Map(); // enumId -> [bitrixLeadId...]
  let start = 0;
  let fetched = 0;
  while (true) {
    const resp = await bitrixCall("crm.lead.list", {
      filter: { ["!" + REPROCESS_FIELD]: "", ">=DATE_CREATE": from.toISOString() },
      select: ["ID", REPROCESS_FIELD],
      order: { DATE_CREATE: "ASC" },
      start,
    });
    const batch = resp.result || [];
    for (const l of batch) {
      const raw = l[REPROCESS_FIELD];
      const enumId = raw === null || raw === undefined || raw === "" ? null : String(raw);
      if (!enumId) continue;
      const bid = parseInt(l.ID, 10);
      if (Number.isNaN(bid)) continue;
      if (!idsByEnum.has(enumId)) idsByEnum.set(enumId, []);
      idsByEnum.get(enumId).push(bid);
    }
    fetched += batch.length;
    process.stdout.write(`  fetched ${fetched}/${resp.total}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= (resp.total || 0)) break;
  }
  console.log("");

  // enum bo'yicha guruhlab, chunk'larda updateMany (faqat reprocess maydonlari)
  const CHUNK = 500;
  let updated = 0;
  for (const [enumId, ids] of idsByEnum.entries()) {
    const name = enumMap.get(enumId) || null;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const res = await prisma.lead.updateMany({
        where: { companyId: company.id, bitrixLeadId: { in: chunk } },
        data: { reprocessReasonId: enumId, reprocessReasonName: name },
      });
      updated += res.count;
      process.stdout.write(`  updated ${updated}\r`);
    }
  }
  console.log(`\n✓ ${updated} ta lead reprocess maydoni yangilandi`);

  const byReprocess = await prisma.lead.groupBy({
    by: ["reprocessReasonName"],
    where: { companyId: company.id, reprocessReasonName: { not: null } },
    _count: { bitrixLeadId: true },
    orderBy: { _count: { bitrixLeadId: "desc" } },
  });
  console.log("\nQayta ishlov berish sabablari (DB):");
  for (const r of byReprocess) {
    console.log(`  ${(r.reprocessReasonName || "?").padEnd(38)} ${r._count.bitrixLeadId}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
