// DB ↔ Bitrix taqqoslash — Iyun 2026 (UI "Bu oy" = Iyun 1 .. bugun).
// Har menejer bo'yicha: LEAD / QUAL (converted) / SOTUV (won deal) DB vs Bitrix.
require("dotenv").config();
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const WEBHOOK = (process.env.BITRIX_WEBHOOK_URL || "").replace(/\/+$/, "");
if (!WEBHOOK) { console.error("BITRIX_WEBHOOK_URL yo'q (.env)"); process.exit(1); }

// Davr — Tashkent UTC+5. UI "Bu oy" = Iyun 1 00:00 .. bugun 23:59.
const FROM = "2026-06-01T00:00:00+05:00";
const TO = "2026-06-27T23:59:59+05:00";
const gteUTC = new Date("2026-05-31T19:00:00.000Z");
const lteUTC = new Date("2026-06-27T18:59:59.000Z");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function bitrix(method, payload = {}, retry = 0) {
  try {
    const r = await axios.post(`${WEBHOOK}/${method}.json`, payload, { timeout: 30000, validateStatus: () => true });
    if (r.data && r.data.error === "QUERY_LIMIT_EXCEEDED") {
      if (retry > 8) throw new Error("rate limit");
      await sleep(1500 * (retry + 1)); return bitrix(method, payload, retry + 1);
    }
    if (r.data && r.data.error) throw new Error(`${r.data.error}: ${r.data.error_description}`);
    return r.data;
  } catch (e) {
    if (retry > 5) throw e;
    await sleep(1500 * (retry + 1)); return bitrix(method, payload, retry + 1);
  }
}

async function pageAll(method, filter, select) {
  const all = []; let start = 0;
  while (true) {
    const r = await bitrix(method, { filter, select, start });
    const batch = r.result || []; all.push(...batch);
    process.stdout.write(`  ${method}: ${all.length}/${r.total}   \r`);
    if (r.next === undefined || batch.length === 0) break;
    start = r.next; if (start >= (r.total || 0)) break;
    await sleep(120);
  }
  process.stdout.write("\n");
  return all;
}

(async () => {
  const company = await prisma.company.findFirst({ select: { id: true, name: true, excludedPipelines: true } });
  const companyId = company.id;
  const excluded = new Set((company.excludedPipelines || []).map((s) => String(s).toLowerCase()));
  console.log(`Company: ${company.name} | excludedPipelines=${JSON.stringify([...excluded])}`);
  console.log(`Davr: ${FROM} .. ${TO}\n`);

  // ── Bitrix categories (pipeline) ──
  const cats = (await bitrix("crm.dealcategory.list", {})).result || [];
  const catName = new Map([["0", "Asosiy"]]);
  for (const c of cats) catName.set(String(c.ID), c.NAME);
  const excludedCatIds = new Set([...catName.entries()].filter(([, n]) => excluded.has(String(n).toLowerCase())).map(([id]) => id));
  console.log(`Bitrix pipelines: ${[...catName.entries()].map(([id, n]) => `${id}=${n}`).join(", ")}`);
  console.log(`Excluded cat ids: ${[...excludedCatIds].join(",") || "—"}\n`);

  // ── Bitrix: won deals (S) Iyunda ──
  const wonDeals = await pageAll("crm.deal.list",
    { ">=CLOSEDATE": FROM, "<=CLOSEDATE": TO, STAGE_SEMANTIC_ID: "S" },
    ["ID", "ASSIGNED_BY_ID", "CATEGORY_ID", "OPPORTUNITY", "CURRENCY_ID", "CLOSEDATE"]);

  // ── Bitrix: barcha lead Iyunda (total) ──
  const leadTotalResp = await bitrix("crm.lead.list", { filter: { ">=DATE_CREATE": FROM, "<=DATE_CREATE": TO }, select: ["ID"], start: 0 });
  const bxLeadTotal = leadTotalResp.total || 0;

  // ── Bitrix: converted lead Iyunda (qual) — per ASSIGNED_BY_ID ──
  const convLeads = await pageAll("crm.lead.list",
    { ">=DATE_CREATE": FROM, "<=DATE_CREATE": TO, STATUS_ID: "CONVERTED" },
    ["ID", "ASSIGNED_BY_ID", "DATE_CREATE"]);

  // Bitrix aggregatlar (uid bo'yicha)
  const bx = new Map(); // uid -> {qual, sotuv, revenue, sotuvNaym}
  const ensureBx = (uid) => { let v = bx.get(uid); if (!v) { v = { qual: 0, sotuv: 0, revenue: 0, sotuvNaym: 0 }; bx.set(uid, v); } return v; };
  for (const l of convLeads) ensureBx(String(l.ASSIGNED_BY_ID)).qual++;
  let bxSotuvTotal = 0, bxSotuvNaym = 0;
  for (const d of wonDeals) {
    const uid = String(d.ASSIGNED_BY_ID);
    const v = ensureBx(uid);
    if (excludedCatIds.has(String(d.CATEGORY_ID))) { v.sotuvNaym++; bxSotuvNaym++; }
    else { v.sotuv++; v.revenue += Number(d.OPPORTUNITY || 0); bxSotuvTotal++; }
  }

  // ── DB aggregatlar ──
  const managers = await prisma.manager.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true } });
  const mById = new Map(managers.map((m) => [m.id, m]));
  const leads = await prisma.lead.findMany({ where: { companyId, dateCreate: { gte: gteUTC, lte: lteUTC } }, select: { responsibleManagerId: true, isConverted: true } });
  const sales = await prisma.salesLead.findMany({ where: { companyId, isSale: true, closedAt: { gte: gteUTC, lte: lteUTC } }, select: { responsibleManagerId: true, price: true, leadId: true } });
  const db = new Map(); // uid -> {lead, qual, sotuv}
  const ensureDb = (uid) => { let v = db.get(uid); if (!v) { v = { lead: 0, qual: 0, sotuv: 0 }; db.set(uid, v); } return v; };
  let dbLeadTotal = 0, dbQualTotal = 0, dbSotuvTotal = 0;
  for (const l of leads) {
    const mid = l.responsibleManagerId; if (!mid) continue;
    const uid = mid.startsWith("bitrix_") ? mid.slice(7) : mid;
    const v = ensureDb(uid); v.lead++; dbLeadTotal++;
    if (l.isConverted) { v.qual++; dbQualTotal++; }
  }
  const seen = new Set();
  for (const s of sales) {
    if (seen.has(s.leadId)) continue; seen.add(s.leadId);
    const mid = s.responsibleManagerId; if (!mid) continue;
    const uid = mid.startsWith("bitrix_") ? mid.slice(7) : mid;
    ensureDb(uid).sotuv++; dbSotuvTotal++;
  }

  // ── Birlashtirilgan jadval ──
  const uidName = new Map();
  for (const m of managers) { const uid = m.id.startsWith("bitrix_") ? m.id.slice(7) : m.id; uidName.set(uid, m.name); }
  const allUids = new Set([...db.keys(), ...bx.keys()]);
  const rows = [...allUids].map((uid) => {
    const d = db.get(uid) || { lead: 0, qual: 0, sotuv: 0 };
    const b = bx.get(uid) || { qual: 0, sotuv: 0, revenue: 0, sotuvNaym: 0 };
    return { uid, name: uidName.get(uid) || "(DB-da menejer YO'Q)", d, b };
  }).sort((a, b) => b.d.lead - a.d.lead || b.b.qual - a.b.qual);

  const mark = (a, b) => (a === b ? " " : "≠");
  console.log("UID     MANAGER                       LEAD(db)  QUAL db/bx     SOTUV db/bx");
  console.log("-".repeat(82));
  for (const r of rows) {
    const ql = `${r.d.qual}/${r.b.qual}`;
    const st = `${r.d.sotuv}/${r.b.sotuv}${r.b.sotuvNaym ? `(+${r.b.sotuvNaym} Naym)` : ""}`;
    console.log(
      `${r.uid.padEnd(7)} ${r.name.slice(0, 28).padEnd(29)} ${String(r.d.lead).padStart(6)}    ${ql.padEnd(8)}${mark(r.d.qual, r.b.qual)}   ${st}${mark(r.d.sotuv, r.b.sotuv) === "≠" ? " ≠" : ""}`
    );
  }
  console.log("-".repeat(82));
  console.log(`\nJAMI:`);
  console.log(`  LEAD   — DB=${dbLeadTotal}  | Bitrix(June total)=${bxLeadTotal}  | farq=${bxLeadTotal - dbLeadTotal}`);
  console.log(`  QUAL   — DB=${dbQualTotal}  | Bitrix(converted, created June)=${convLeads.length}  | farq=${convLeads.length - dbQualTotal}`);
  console.log(`  SOTUV  — DB=${dbSotuvTotal}  | Bitrix(won, excl Naym)=${bxSotuvTotal}  | Naym(excluded)=${bxSotuvNaym}`);

  await prisma.$disconnect();
})().catch((e) => { console.error("\nFATAL:", e.message); process.exit(1); });
