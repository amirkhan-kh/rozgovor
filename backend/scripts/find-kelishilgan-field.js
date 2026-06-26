// Research skript: Bitrix24'da "Kelishilgan to'lov" custom field'ini topish
// Deal custom fieldlarini aylanib chiqadi va TITLE/LIST_LABEL orqali kandidatlarni print qiladi.
//
// Ishga tushirish:
//   node scripts/find-kelishilgan-field.js

const axios = require("axios");

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(method, payload = {}) {
  const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s < 500,
    timeout: 30000,
  });
  return resp.data;
}

async function fetchAllFields(method) {
  const all = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall(method, { start });
    const batch = resp.result || [];
    all.push(...batch);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= (resp.total || 0)) break;
  }
  return all;
}

const KEYWORDS = [
  "kelishilgan",
  "kelish",
  "соглас",
  "дата плат",
  "payment",
  "plat",
  "tolov",
  "to'lov",
];

function matchKeyword(title) {
  if (!title) return false;
  const low = String(title).toLowerCase();
  return KEYWORDS.some((kw) => low.includes(kw));
}

async function main() {
  console.log("=== Bitrix Deal custom fields (crm.deal.userfield.list) ===\n");

  const dealFields = await fetchAllFields("crm.deal.userfield.list");
  console.log(`Jami: ${dealFields.length} ta custom field\n`);

  console.log("--- Dump 1-ta field (struktura ko'rish uchun) ---");
  if (dealFields[0]) {
    console.log(JSON.stringify(dealFields[0], null, 2));
  }

  console.log("\n--- Barcha fieldlar (qisqa, dateti / datetime) ---");
  const dateFields = dealFields.filter((f) =>
    ["date", "datetime"].includes(String(f.USER_TYPE_ID))
  );
  for (const f of dateFields) {
    const title =
      (f.LIST_COLUMN_LABEL && (f.LIST_COLUMN_LABEL.ru || f.LIST_COLUMN_LABEL.en)) ||
      (f.EDIT_FORM_LABEL && (f.EDIT_FORM_LABEL.ru || f.EDIT_FORM_LABEL.en)) ||
      (f.LIST_FILTER_LABEL && (f.LIST_FILTER_LABEL.ru || f.LIST_FILTER_LABEL.en)) ||
      f.FIELD_NAME;
    console.log(
      `  ${f.FIELD_NAME.padEnd(34)} | ${String(f.USER_TYPE_ID).padEnd(14)} | ${title}`
    );
  }

  // Alternate: crm.deal.fields qaytargan title
  console.log("\n--- crm.deal.fields (schema) DUMP 1 UF field ---");
  const schema = await bitrixCall("crm.deal.fields", {});
  const fieldsMap = schema.result || {};
  const ufEntries = Object.entries(fieldsMap).filter(([k]) => k.startsWith("UF_CRM_"));
  console.log(`  UF fields in schema: ${ufEntries.length}`);
  if (ufEntries[0]) console.log(`  First UF: ${ufEntries[0][0]} = ${JSON.stringify(ufEntries[0][1])}`);

  // Keyword match schema'da title bo'yicha
  console.log("\n--- schema title keyword-match ---");
  for (const [code, meta] of ufEntries) {
    const t =
      (meta && (meta.title || meta.listLabel || meta.formLabel)) || "";
    if (matchKeyword(t)) {
      console.log(`  ★ ${code} | type=${meta && meta.type} | title="${t}"`);
    }
  }

  // LAST RESORT: fetch userfield with individual GET — bu labelni beradi
  console.log("\n--- userfield.get (individual) — faqat date/datetime uchun ---");
  for (const f of dateFields) {
    const resp = await bitrixCall("crm.deal.userfield.get", { id: f.ID });
    const meta = resp.result || {};
    const label =
      (meta.LIST_COLUMN_LABEL && (meta.LIST_COLUMN_LABEL.ru || meta.LIST_COLUMN_LABEL.en)) ||
      (meta.EDIT_FORM_LABEL && (meta.EDIT_FORM_LABEL.ru || meta.EDIT_FORM_LABEL.en)) ||
      "";
    const marker = matchKeyword(label) ? "★" : " ";
    console.log(`  ${marker} ${f.FIELD_NAME.padEnd(34)} | ${String(f.USER_TYPE_ID).padEnd(10)} | "${label}"`);
  }

  console.log("\n--- Nomzodlar (keyword-match) ---");
  const candidates = [];
  for (const f of dealFields) {
    const ru =
      (f.LIST_COLUMN_LABEL && f.LIST_COLUMN_LABEL.ru) ||
      (f.EDIT_FORM_LABEL && f.EDIT_FORM_LABEL.ru) ||
      (f.LIST_FILTER_LABEL && f.LIST_FILTER_LABEL.ru) ||
      "";
    const en =
      (f.LIST_COLUMN_LABEL && f.LIST_COLUMN_LABEL.en) ||
      (f.EDIT_FORM_LABEL && f.EDIT_FORM_LABEL.en) ||
      "";
    const titles = [ru, en, f.FIELD_NAME].filter(Boolean);
    if (titles.some(matchKeyword)) {
      candidates.push({ code: f.FIELD_NAME, type: f.USER_TYPE_ID, ru, en });
      console.log(
        `  ★ ${f.FIELD_NAME} | type=${f.USER_TYPE_ID} | ru="${ru}" | en="${en}"`
      );
    }
  }

  if (candidates.length === 0) {
    console.log("  (nomzod topilmadi — LOW-LEVEL keyword bilan qayta qidirish kerak)");
  }

  // Bonus: stage'lar (Qisman to'lov nomi bilan) — stages API
  console.log("\n=== Dealcategory stages (NAME contains 'Qisman' / 'Частичная') ===");
  const cats = await bitrixCall("crm.dealcategory.list");
  const catIds = [0, ...(cats.result || []).map((c) => Number(c.ID))];
  for (const cid of catIds) {
    try {
      const resp = await bitrixCall("crm.dealcategory.stage.list", { id: cid });
      for (const s of resp.result || []) {
        const nameLow = String(s.NAME || "").toLowerCase();
        if (
          nameLow.includes("qisman") ||
          nameLow.includes("частичн") ||
          nameLow.includes("partial")
        ) {
          console.log(
            `  cat=${cid} status=${s.STATUS_ID} name="${s.NAME}" semantic=${s.SEMANTICS || "-"}`
          );
        }
      }
    } catch (err) {
      // skip
    }
  }

  console.log("\n=== Sample deal (oxirgi 1 ta) — custom fieldlar bilan ===");
  const sample = await bitrixCall("crm.deal.list", {
    order: { DATE_CREATE: "DESC" },
    start: 0,
    select: ["*", "UF_*"],
  });
  const first = (sample.result || [])[0];
  if (first) {
    for (const key of Object.keys(first)) {
      if (key.startsWith("UF_")) {
        console.log(`  ${key} = ${JSON.stringify(first[key])}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err && err.message);
  process.exit(1);
});
