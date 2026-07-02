// Lead.firstCallAt sync — Bitrix crm.activity (TYPE_ID=2 = qo'ng'iroq, OWNER_TYPE_ID=1 = lead).
// "Aloqaga chiqish" metrikasi manbasi: lid yaratilgandan birinchi qo'ng'iroqgacha.
// AudioFile'dan farqli — yozuvsiz/qisqa qo'ng'iroqlarni ham hisobga oladi (haqiqiy birinchi aloqa).
//
// Ishlatish:  node scripts/sync-lead-first-calls.js [days=120]
// Incremental emas — berilgan oyna ichidagi barcha lead qo'ng'iroqlarini qayta hisoblaydi.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

let WH = process.env.BITRIX_WEBHOOK_URL || "";
if (!WH.endsWith("/")) WH += "/";
const DAYS = Number(process.argv[2]) || 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bitrix(method, body, retry = 0) {
  try {
    const r = await fetch(WH + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (data.error === "QUERY_LIMIT_EXCEEDED") {
      if (retry > 8) throw new Error("rate limit");
      await sleep(2000 * (retry + 1));
      return bitrix(method, body, retry + 1);
    }
    return data;
  } catch (e) {
    if (retry > 6) throw e;
    await sleep(1500 * (retry + 1));
    return bitrix(method, body, retry + 1);
  }
}

async function syncCompany(companyId, name) {
  const sinceMs = Date.now() - DAYS * 24 * 3600 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  // 1) Barcha lead qo'ng'iroq-activitylarini oynada tortamiz, per-lead eng ertasini olamiz.
  const firstByLead = new Map(); // bitrixLeadId(number) -> Date
  let start = 0, page = 0;
  while (true) {
    const resp = await bitrix("crm.activity.list", {
      filter: { OWNER_TYPE_ID: 1, TYPE_ID: 2, ">=CREATED": sinceIso },
      select: ["OWNER_ID", "START_TIME", "CREATED"],
      order: { CREATED: "ASC" },
      start,
    });
    if (resp.error) { console.log(`  activity.list ERR: ${resp.error_description || resp.error}`); break; }
    const batch = resp.result || [];
    for (const a of batch) {
      const id = parseInt(a.OWNER_ID, 10);
      if (!id) continue;
      const t = new Date(a.START_TIME || a.CREATED);
      if (isNaN(t.getTime())) continue;
      const prev = firstByLead.get(id);
      if (!prev || t < prev) firstByLead.set(id, t);
    }
    page++;
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
    await sleep(150);
  }
  console.log(`  ${page} sahifa, ${firstByLead.size} lidda qo'ng'iroq topildi`);

  // 2) Lokal lidlarga yozamiz (faqat farq bo'lsa).
  const leads = await prisma.lead.findMany({
    where: { companyId },
    select: { id: true, bitrixLeadId: true, firstCallAt: true },
  });
  let updated = 0;
  for (const l of leads) {
    const fc = firstByLead.get(l.bitrixLeadId) || null;
    const cur = l.firstCallAt ? l.firstCallAt.getTime() : null;
    const next = fc ? fc.getTime() : null;
    if (cur !== next) {
      await prisma.lead.update({ where: { id: l.id }, data: { firstCallAt: fc } });
      updated++;
    }
  }
  console.log(`  ${name}: ${updated} lid firstCallAt yangilandi`);
  return updated;
}

(async () => {
  console.log(`Lead.firstCallAt sync — oxirgi ${DAYS} kun — portal: ${WH.replace(/rest\/(\d+)\/[^/]+/, "rest/$1/***")}`);
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    try { await syncCompany(c.id, c.name); }
    catch (e) { console.error(`  ${c.name} failed: ${e.message}`); }
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
