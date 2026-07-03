// Backfill: Lead.firstAnsweredCallAt — Voximplant javob berilgan (CALL_FAILED_CODE=200)
// birinchi qo'ng'iroq, CRM_ENTITY_ID (=lead) orqali. Faqat shu maydonni yozadi.
//
// Ishlatish:  node scripts/backfill-answered-contact.js [days=90]

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  (process.env.BITRIX_WEBHOOK_URL || "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu").replace(/\/+$/, "");
const ANSWERED_CODE = 200;
const MIN_TALK_SEC = Number(process.env.ANSWERED_CONTACT_MIN_SEC) || 0;

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
  const days = parseInt(process.argv[2], 10) || 90;
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Company topilmadi");
  const from = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  console.log(`Answered-contact backfill oynasi: >= ${from} (${days} kun)`);

  const earliest = new Map(); // leadId -> earliest Date
  let start = 0, scanned = 0;
  while (true) {
    const resp = await bitrixCall("voximplant.statistic.get", {
      FILTER: { ">=CALL_START_DATE": from, CALL_FAILED_CODE: ANSWERED_CODE },
      SORT: "CALL_START_DATE",
      ORDER: "ASC",
      start,
    });
    const batch = resp.result || [];
    for (const c of batch) {
      if (String(c.CRM_ENTITY_TYPE) !== "LEAD") continue;
      const leadId = c.CRM_ENTITY_ID ? parseInt(String(c.CRM_ENTITY_ID), 10) : NaN;
      if (Number.isNaN(leadId)) continue;
      if (MIN_TALK_SEC > 0 && parseInt(String(c.CALL_DURATION || "0"), 10) < MIN_TALK_SEC) continue;
      if (!c.CALL_START_DATE) continue;
      const dt = new Date(String(c.CALL_START_DATE));
      const prev = earliest.get(leadId);
      if (!prev || dt < prev) earliest.set(leadId, dt);
    }
    scanned += batch.length;
    process.stdout.write(`  skan qilindi ${scanned}/${resp.total} (answered), lidlar=${earliest.size}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
    await sleep(200);
  }
  console.log("");

  const ids = Array.from(earliest.keys());
  let updated = 0;
  const CHUNK = 1000;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const existing = await prisma.lead.findMany({
      where: { companyId: company.id, bitrixLeadId: { in: chunk } },
      select: { bitrixLeadId: true, firstAnsweredCallAt: true },
    });
    const toUpdate = [];
    for (const l of existing) {
      const nd = earliest.get(l.bitrixLeadId);
      if (!nd) continue;
      if (!l.firstAnsweredCallAt || nd < l.firstAnsweredCallAt) toUpdate.push({ id: l.bitrixLeadId, date: nd });
    }
    const W = 25;
    for (let j = 0; j < toUpdate.length; j += W) {
      await Promise.all(
        toUpdate.slice(j, j + W).map((u) =>
          prisma.lead.updateMany({
            where: { companyId: company.id, bitrixLeadId: u.id },
            data: { firstAnsweredCallAt: u.date },
          })
        )
      );
      updated += Math.min(W, toUpdate.length - j);
      process.stdout.write(`  yozildi ${updated}\r`);
    }
  }
  console.log(`\n✓ ${updated} ta lidda firstAnsweredCallAt yozildi (Bitrix'da answered call topilgan: ${earliest.size} lid)`);

  const withCall = await prisma.lead.count({ where: { companyId: company.id, firstAnsweredCallAt: { not: null } } });
  console.log(`DB: jami ${withCall} lidda firstAnsweredCallAt bor.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
