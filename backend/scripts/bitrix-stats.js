const axios = require("axios");
const BITRIX = "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";
const USERS = { 64: "Aziza", 976: "Muslima", 1534: "Visola", 2042: "Xusnora", 2140: "Zilolaxon" };
const MIN_DURATION = 30; // seconds — 30s+ qo'ng'iroqlar
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function bitrix(method, payload = {}, retry = 0) {
  try {
    const r = await axios.post(`${BITRIX}/${method}.json`, payload, { timeout: 30000, validateStatus: () => true });
    if (r.data && r.data.error === "QUERY_LIMIT_EXCEEDED") {
      if (retry > 8) throw new Error("rate limit");
      await sleep(2000 * (retry + 1));
      return bitrix(method, payload, retry + 1);
    }
    return r.data;
  } catch (e) {
    if (retry > 5) throw e;
    await sleep(2000 * (retry + 1));
    return bitrix(method, payload, retry + 1);
  }
}

(async () => {
  const totals = {};
  let grandCalls = 0, grandSec = 0;
  for (const [uid, name] of Object.entries(USERS)) {
    let count = 0, durSec = 0, start = 0, total = 0;
    while (true) {
      const r = await bitrix("voximplant.statistic.get", {
        FILTER: { PORTAL_USER_ID: uid, ">CALL_DURATION": MIN_DURATION - 1 },
        SORT: "CALL_START_DATE",
        ORDER: "ASC",
        start,
      });
      total = r.total || 0;
      const batch = r.result || [];
      for (const c of batch) {
        const d = Number(c.CALL_DURATION || 0);
        if (d >= MIN_DURATION) { count++; durSec += d; }
      }
      process.stdout.write(`  ${name} (${uid}): ${count}/${total}\r`);
      if (r.next === undefined || batch.length === 0) break;
      start = r.next;
      if (start >= total) break;
      await sleep(150);
    }
    console.log(`\n  ✓ ${name} (${uid}): ${count} ta qo'ng'iroq, ${(durSec/3600).toFixed(2)} soat (${durSec}s)`);
    totals[name] = { count, durSec };
    grandCalls += count;
    grandSec += durSec;
  }
  console.log("\n=== JAMI ===");
  console.log(`Qo'ng'iroqlar: ${grandCalls} ta`);
  console.log(`Davomiyligi:   ${(grandSec/3600).toFixed(2)} soat (${grandSec} sekund)`);
  console.log(`O'rtacha:       ${grandCalls > 0 ? Math.round(grandSec/grandCalls) : 0}s/qo'ng'iroq`);
  console.log("\n=== Bo'yicha ===");
  for (const [n, t] of Object.entries(totals)) {
    console.log(`  ${n}: ${t.count} ta · ${(t.durSec/3600).toFixed(2)} soat`);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
