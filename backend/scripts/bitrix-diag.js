// DB ↔ Bitrix24 yonma-yon sverka (lead + deal). QA tekshiruvi:
// "har section'dagi son Bitrix bilan mos kelyaptimi" — farqli ID'larni ko'rsatadi.
//
// Pagination ID-KURSOR (`>ID` + start:-1) — bitrix-sync.ts bilan bir xil usul,
// offset-paging skip/dublikatisiz, count'siz tez.
//
// Ishlatish:
//   node -r dotenv/config scripts/bitrix-diag.js            # joriy oy
//   node -r dotenv/config scripts/bitrix-diag.js 2026-06    # aniq oy
//   node -r dotenv/config scripts/bitrix-diag.js --days 7   # oxirgi 7 kun
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const WH = (process.env.BITRIX_WEBHOOK_URL || process.env.BITRIX_WEBHOOK || "").replace(/\/+$/, "");
if (!WH) { console.error("BITRIX_WEBHOOK_URL yo'q (.env)"); process.exit(1); }

const OFF = 5; // Tashkent UTC+5
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bitrix(method, payload = {}, retry = 0) {
  try {
    const r = await axios.post(`${WH}/${method}.json`, payload, { timeout: 30000, validateStatus: () => true });
    if (r.data && r.data.error === "QUERY_LIMIT_EXCEEDED") {
      if (retry > 8) throw new Error("rate limit");
      await sleep(1500 * (retry + 1)); return bitrix(method, payload, retry + 1);
    }
    return r.data;
  } catch (e) {
    if (retry > 5) throw e;
    await sleep(1500 * (retry + 1)); return bitrix(method, payload, retry + 1);
  }
}

// ID-kursor: oynaga (DATE_CREATE) mos BARCHA ID'lar.
async function bitrixIds(method, gteIso, lteIso) {
  const ids = new Set(); let lastId = 0;
  while (true) {
    const r = await bitrix(method, {
      filter: { ">=DATE_CREATE": gteIso, "<=DATE_CREATE": lteIso, ">ID": lastId },
      select: ["ID"], order: { ID: "ASC" }, start: -1,
    });
    if (r.error || r.error_description) throw new Error(`${method}: ${r.error_description || r.error}`);
    const b = r.result || []; if (!b.length) break;
    for (const x of b) { const id = +x.ID; ids.add(id); if (id > lastId) lastId = id; }
    if (b.length < 50) break;
  }
  return ids;
}

function windowFromArgs() {
  const arg = process.argv[2];
  if (arg === "--days") {
    const n = Number(process.argv[3]) || 7;
    const lte = new Date();
    const gte = new Date(lte.getTime() - n * 24 * 3600 * 1000);
    return { gte, lte, label: `oxirgi ${n} kun` };
  }
  let y, m;
  if (arg && /^\d{4}-\d{2}$/.test(arg)) { [y, m] = arg.split("-").map(Number); }
  else { const d = new Date(); y = d.getUTCFullYear(); m = d.getUTCMonth() + 1; }
  // Tashkent oy chegaralari
  const gte = new Date(Date.UTC(y, m - 1, 1, -OFF, 0, 0));
  const lte = new Date(Date.UTC(y, m, 1, -OFF, 0, 0) - 1); // oy oxiri
  const now = new Date();
  return { gte, lte: lte > now ? now : lte, label: `${y}-${String(m).padStart(2, "0")}` };
}

async function compare(name, getDbIds, method, gte, lte) {
  const dbSet = new Set(await getDbIds(gte, lte));
  const bxSet = await bitrixIds(method, gte.toISOString(), lte.toISOString());
  const onlyBitrix = [...bxSet].filter((i) => !dbSet.has(i));
  const onlyDb = [...dbSet].filter((i) => !bxSet.has(i));
  console.log(`\n=== ${name} ===`);
  console.log(`  DB: ${dbSet.size}   Bitrix: ${bxSet.size}   farq: ${dbSet.size - bxSet.size}`);
  console.log(`  Bitrix'da bor, DB'da YO'Q (${onlyBitrix.length}):`, onlyBitrix.slice(0, 20), onlyBitrix.length > 20 ? "…" : "");
  console.log(`  DB'da bor, Bitrix'da YO'Q (${onlyDb.length}):`, onlyDb.slice(0, 20), onlyDb.length > 20 ? "…" : "");
}

(async () => {
  const { gte, lte, label } = windowFromArgs();
  const c = await prisma.company.findFirst({ select: { id: true, name: true } });
  console.log(`Kompaniya: ${c.name}  |  Oyna: ${label}  (${gte.toISOString()} .. ${lte.toISOString()})`);

  await compare(
    "LEAD (Лиды)",
    async (g, l) => (await prisma.lead.findMany({ where: { companyId: c.id, dateCreate: { gte: g, lte: l } }, select: { bitrixLeadId: true } })).map((r) => r.bitrixLeadId),
    "crm.lead.list", gte, lte,
  );
  await compare(
    "DEAL (Сделки)",
    async (g, l) => (await prisma.salesLead.findMany({ where: { companyId: c.id, leadCreatedAt: { gte: g, lte: l } }, select: { leadId: true } })).map((r) => r.leadId),
    "crm.deal.list", gte, lte,
  );

  console.log("\nKutilgan: farq ≈ 0 yoki faqat oxirgi bir necha daqiqada yaratilgan yangi yozuvlar (keyingi reconcile tenglashtiradi).");
  await prisma.$disconnect();
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
