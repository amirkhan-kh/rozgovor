// Bitrix24 outbound webhook DIAGNOSTIKA + sozlash yo'riqnomasi.
//
// ⚠️ MUHIM: `event.bind` / `event.get` metodlari INBOUND webhook (rest/<user>/<token>)
// bilan ISHLAMAYDI — Bitrix `WRONG_AUTH_TYPE` qaytaradi. Ular faqat OAuth "local
// application" kontekstida ishlaydi. Shuning uchun bu skriptning eski "bind" rejimi
// hech qachon hech narsa bog'lamagan (jim muvaffaqiyatsizlik).
//
// Real-time outbound webhook'ni TO'G'RI ulashning ikki yo'li bor:
//
//   YO'L A (tavsiya — kod talab qilmaydi):
//     Bitrix UI → "Разработчикам" (Developer resources) → "Другое" → "Исходящий вебхук"
//     (Outbound webhook). Quyidagilarni belgilang:
//       • Hodisalar (events): ONCRMDEALADD, ONCRMDEALUPDATE, ONCRMDEALDELETE,
//                             ONCRMLEADADD, ONCRMLEADUPDATE, ONCRMLEADDELETE
//       • Handler URL: https://salesairozgovoruz.asosit.uz/api/webhooks/bitrix
//     So'ng Bitrix bergan "application_token"ni .env'ga yozing:
//       BITRIX_WEBHOOK_TOKEN=<application_token>
//
//   YO'L B (OAuth local app — murakkabroq):
//     Local application yarating, `event.bind` huquqini bering, keyin event.bind ishlaydi.
//
// Ishlatish:
//   node scripts/bitrix-webhook-doctor.js          # diagnostika (default)
//   node scripts/bitrix-webhook-doctor.js ping      # handler URL'ga test POST yuborish
const axios = require("axios");

const WH =
  process.env.BITRIX_WEBHOOK_URL ||
  process.env.BITRIX_WEBHOOK ||
  "https://rozgovoruz.bitrix24.kz/rest/527/8cmow72uy63s4ewg";
const HANDLER =
  process.env.HANDLER_URL ||
  "https://salesairozgovoruz.asosit.uz/api/webhooks/bitrix";
const EVENTS = [
  "ONCRMLEADADD",
  "ONCRMLEADUPDATE",
  "ONCRMLEADDELETE",
  "ONCRMDEALADD",
  "ONCRMDEALUPDATE",
  "ONCRMDEALDELETE",
];

async function call(method, payload) {
  const r = await axios.post(`${WH}/${method}.json`, payload, {
    headers: { "Content-Type": "application/json" },
    validateStatus: () => true,
    timeout: 30000,
  });
  return r.data;
}

function printManualSteps() {
  console.log(`
────────────────────────────────────────────────────────────────────
Outbound webhook'ni QO'LDA sozlash (event.bind inbound token bilan ishlamaydi):

  Bitrix UI → Разработчикам → Другое → Исходящий вебхук
    Hodisalar:  ${EVENTS.join(", ")}
    Handler:    ${HANDLER}
  So'ng application_token ni .env'ga:
    BITRIX_WEBHOOK_TOKEN=<application_token>
────────────────────────────────────────────────────────────────────`);
}

(async () => {
  const mode = process.argv[2] || "doctor";

  if (mode === "ping") {
    // Bitrix outbound webhook formatini taqlid qilib handler'ni sinaymiz (form-urlencoded).
    const body = new URLSearchParams();
    body.set("event", "ONCRMDEALUPDATE");
    body.set("data[FIELDS][ID]", "0");
    const r = await axios.post(HANDLER, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      validateStatus: () => true,
      timeout: 15000,
    });
    console.log(`Handler ${HANDLER} → HTTP ${r.status}`, JSON.stringify(r.data));
    console.log(
      r.status === 200
        ? "✅ Handler yetib boryapti (deal=0 → no-op, bu normal)."
        : "❌ Handler javob bermadi — URL/proxy/SSL ni tekshiring.",
    );
    return;
  }

  console.log(`Portal:  ${WH.replace(/\/rest\/\d+\/[a-z0-9]+/i, "/rest/***")}`);
  console.log(`Handler: ${HANDLER}\n`);

  // 1) Portal yetib boradimi + qaysi scope'lar bor
  const scope = await call("scope", {});
  if (scope.error) {
    console.log(`❌ Portal javob bermadi: ${scope.error} ${scope.error_description || ""}`);
    return;
  }
  console.log(`✅ Portal OK. Scope: ${(scope.result || []).join(", ")}`);
  if (!(scope.result || []).includes("crm")) {
    console.log("⚠️  'crm' scope yo'q — deal/lead o'qib bo'lmaydi. Webhook huquqlarini kengaytiring.");
  }

  // 2) event.bind ishlaydimi? (inbound token bo'lsa — yo'q)
  const bindTest = await call("event.bind", { event: "ONCRMDEALUPDATE", handler: HANDLER });
  if (bindTest.error === "WRONG_AUTH_TYPE") {
    console.log(
      "\nℹ️  event.bind bu token bilan ishlamaydi (WRONG_AUTH_TYPE) — bu KUTILGAN holat.",
    );
    console.log(
      "    Outbound webhook'ni Bitrix UI'dan qo'lda sozlash kerak (pastdagi qadamlar).",
    );
    printManualSteps();
    return;
  }
  if (bindTest.error) {
    console.log(`\n⚠️  event.bind xato: ${bindTest.error} ${bindTest.error_description || ""}`);
    printManualSteps();
    return;
  }

  // 3) OAuth app kontekstida — bind ishladi, hammasini bog'laymiz
  console.log("\n✅ event.bind ishladi (OAuth app). Barcha hodisalar bog'lanyapti:");
  for (const event of EVENTS) {
    const r = await call("event.bind", { event, handler: HANDLER });
    console.log(`  ${event}: ${r.error ? "ERR " + r.error_description : "OK"}`);
  }
})().catch((e) => {
  console.error("ERR", e.response?.data || e.message);
  process.exit(1);
});
