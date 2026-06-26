// Bitrix24 integratsiya health-check — har bir "qism" ishlayotganini tekshiradi.
// DB shart EMAS. Faqat webhook'ni sinaydi.
//
// Ishlatish:
//   BITRIX_WEBHOOK_URL="https://.../rest/527/<token>/" \
//   PAYMENT_DATE_FIELD="UF_CRM_687F7EA97DF93" \
//   node scripts/bitrix-healthcheck.js

const axios = require("axios");

const WEBHOOK = (process.env.BITRIX_WEBHOOK_URL || "").replace(/\/+$/, "");
if (!WEBHOOK) {
  console.error("BITRIX_WEBHOOK_URL env kerak (maxfiy — kodda saqlanmaydi).");
  process.exit(1);
}
const PAYMENT_FIELD = process.env.PAYMENT_DATE_FIELD || "UF_CRM_687F7EA97DF93";

async function call(method, payload = {}) {
  const resp = await axios.post(`${WEBHOOK}/${method}.json`, payload, {
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s < 600,
    timeout: 30000,
  });
  return resp.data;
}

const ok = (s) => `\x1b[32m✓\x1b[0m ${s}`;
const bad = (s) => `\x1b[31m✗\x1b[0m ${s}`;
const warn = (s) => `\x1b[33m⚠\x1b[0m ${s}`;

async function main() {
  console.log(`\nWebhook: ${WEBHOOK}\n${"─".repeat(60)}`);

  // 1) profile — token tirikmi
  try {
    const r = await call("profile");
    if (r.result?.ID) console.log(ok(`profile — ID=${r.result.ID} ADMIN=${r.result.ADMIN} (${r.result.NAME})`));
    else console.log(bad(`profile — ${r.error_description || JSON.stringify(r).slice(0, 120)}`));
  } catch (e) { console.log(bad(`profile — ${e.message}`)); }

  // 2) user.get — menejerlar
  try {
    const r = await call("user.get", { FILTER: { ACTIVE: true } });
    console.log(ok(`user.get — ${r.total ?? (r.result || []).length} ta aktiv foydalanuvchi`));
  } catch (e) { console.log(bad(`user.get — ${e.message}`)); }

  // 3) department.get — bo'limlar
  try {
    const r = await call("department.get", {});
    console.log(ok(`department.get — ${r.total ?? (r.result || []).length} ta bo'lim`));
  } catch (e) { console.log(bad(`department.get — ${e.message}`)); }

  // 4) crm.dealcategory.list — pipeline'lar (0 default qaytmaydi)
  let categories = [0];
  try {
    const r = await call("crm.dealcategory.list", {});
    const list = r.result || [];
    categories = [0, ...list.map((c) => Number(c.ID))];
    const names = ["0=Asosiy(default)", ...list.map((c) => `${c.ID}=${c.NAME}`)];
    console.log(ok(`crm.dealcategory.list — ${names.join(", ")}`));
  } catch (e) { console.log(bad(`crm.dealcategory.list — ${e.message}`)); }

  // 5) crm.dealcategory.stage.list — har pipeline stagelari
  for (const cid of categories) {
    try {
      const r = await call("crm.dealcategory.stage.list", { id: cid });
      const stages = r.result || [];
      console.log(ok(`  stage.list cat=${cid} — ${stages.length} stage (${stages.slice(0, 3).map((s) => s.STATUS_ID).join(", ")}...)`));
    } catch (e) { console.log(bad(`  stage.list cat=${cid} — ${e.message}`)); }
  }

  // 6) crm.lead.list CONVERTED — kval lid
  try {
    const r = await call("crm.lead.list", { filter: { STATUS_ID: "CONVERTED" }, select: ["ID"], start: 0 });
    console.log(ok(`crm.lead.list CONVERTED — ${r.total} kval lid`));
  } catch (e) { console.log(bad(`crm.lead.list — ${e.message}`)); }

  // 7) crm.deal.list — total + payment field to'ldirilganmi
  try {
    const r = await call("crm.deal.list", { select: ["ID", "STAGE_SEMANTIC_ID", PAYMENT_FIELD], start: 0 });
    const batch = r.result || [];
    const filled = batch.filter((d) => d[PAYMENT_FIELD] && String(d[PAYMENT_FIELD]).length > 0).length;
    const won = batch.filter((d) => d.STAGE_SEMANTIC_ID === "S").length;
    console.log(ok(`crm.deal.list — total=${r.total} | 1-sahifa: ${won}/${batch.length} won, ${filled}/${batch.length} da ${PAYMENT_FIELD} to'ldirilgan`));
    if (filled === 0) console.log(warn(`  ${PAYMENT_FIELD} hech birida to'ldirilmagan — field kodi to'g'rimi? (1-sahifa ko'rinishi)`));
  } catch (e) { console.log(bad(`crm.deal.list — ${e.message}`)); }

  // 8) voximplant.statistic.get — qo'ng'iroqlar + CALL_RECORD_URL + download
  try {
    const r = await call("voximplant.statistic.get", { start: 0 });
    const calls = r.result || [];
    const withRec = calls.filter((c) => c.CALL_RECORD_URL);
    console.log(ok(`voximplant.statistic.get — total=${r.total} | 1-sahifa: ${withRec.length}/${calls.length} da CALL_RECORD_URL bor`));
    if (withRec.length > 0) {
      const url = withRec[0].CALL_RECORD_URL;
      try {
        const head = await axios.get(url, { responseType: "arraybuffer", timeout: 30000, maxContentLength: 5 * 1024 * 1024, validateStatus: (s) => s < 600 });
        const ct = head.headers["content-type"] || "?";
        const bytes = head.data?.byteLength ?? 0;
        if (head.status === 200 && /audio|mpeg|octet/.test(ct)) console.log(ok(`  record download — HTTP 200, ${ct}, ${bytes} bayt`));
        else console.log(warn(`  record download — HTTP ${head.status}, ${ct}, ${bytes} bayt (token muddati o'tgan bo'lishi mumkin)`));
      } catch (e) { console.log(bad(`  record download — ${e.message}`)); }
    } else {
      console.log(warn(`  CALL_RECORD_URL 1-sahifada yo'q — kattaroq oynani tekshiring`));
    }
  } catch (e) { console.log(bad(`voximplant.statistic.get — ${e.message}`)); }

  console.log(`${"─".repeat(60)}\nHealth-check tugadi.\n`);
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
