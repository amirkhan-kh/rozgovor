// 3.1 Flash + 3 Flash Preview tahlilini taqqoslash (oldingi transcript bilan)
require("dotenv").config({ path: "/var/www/prosales-backend/.env" });
process.env.GOOGLE_APPLICATION_CREDENTIALS = "/var/www/prosales-backend/credentials/big-quanta-469517-h6-55280c39d520.json";
process.env.VERTEX_PROJECT = "big-quanta-469517-h6";

const fs = require("fs");
const axios = require("axios");
const { GoogleAuth } = require("google-auth-library");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const PROJECT = "big-quanta-469517-h6";

const PRICE = {
  "gemini-3.1-flash-lite-preview": { in: 0.10, out: 0.40 },
  "gemini-3-flash-preview":         { in: 0.30, out: 2.50 },
};

let _t = null, _exp = 0;
async function getToken() {
  if (_t && Date.now() < _exp) return _t;
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  _t = (await (await auth.getClient()).getAccessToken()).token;
  _exp = Date.now() + 50 * 60 * 1000;
  return _t;
}

async function call(model, prompt) {
  const token = await getToken();
  const url = `https://aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/global/publishers/google/models/${model}:generateContent`;
  const t0 = Date.now();
  const r = await axios.post(url, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 8192 },
  }, { headers: { Authorization: `Bearer ${token}` }, timeout: 600000, validateStatus: () => true });
  const ms = Date.now() - t0;
  if (r.status !== 200) throw new Error(`${model} ${r.status}: ${JSON.stringify(r.data).slice(0, 400)}`);
  const text = r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const u = r.data?.usageMetadata || {};
  const inTok = u.promptTokenCount || 0, outTok = u.candidatesTokenCount || 0;
  const p = PRICE[model] || { in: 0, out: 0 };
  const cost = (inTok / 1e6) * p.in + (outTok / 1e6) * p.out;
  return { ms, inTok, outTok, cost, text };
}

(async () => {
  const prior = JSON.parse(fs.readFileSync("/tmp/compare-analiz-result.json", "utf-8"));
  const transcript = prior.transcript;
  console.log(`Transcript len: ${transcript.length} chars\n`);

  const cat = await prisma.criteriaCategory.findFirst({
    where: { name: "Qayta qo'ng'iroq" },
    include: { criteria: { orderBy: { sortOrder: "asc" } } },
  });
  const criteriaText = cat.criteria.map((c, i) => `${i + 1}. ${c.name}\n   ${c.description}`).join("\n\n");
  const criteriaNames = cat.criteria.map(c => c.name);

  const prompt = `Sen sotuv qo'ng'iroqlarini tahlil qiluvchi ekspertsan. Quyidagi suhbat transkripti (Yandex STT, diarize yo'q) bo'yicha "${cat.name}" mezonlari ostida baho qoy.

MEZONLAR:
${criteriaText}

SUHBAT:
${transcript}

Har mezonga 0-100 ball va 1-2 jumlali izoh ber. JSON: {"criteria": {"<mezon nomi>": {"score": <0-100>, "comment": "<izoh>"}}}`;

  console.log("→ gemini-3.1-flash-lite-preview...");
  const lite = await call("gemini-3.1-flash-lite-preview", prompt);
  console.log(`  ${(lite.ms/1000).toFixed(1)}s | ${lite.inTok}+${lite.outTok} tok | $${lite.cost.toFixed(4)}`);

  console.log("\n→ gemini-3-flash-preview...");
  const flash = await call("gemini-3-flash-preview", prompt);
  console.log(`  ${(flash.ms/1000).toFixed(1)}s | ${flash.inTok}+${flash.outTok} tok | $${flash.cost.toFixed(4)}`);

  // Robust score extraction (handles short keys like "Bosim", "Kayfiyat")
  function extract(scores, fullName) {
    if (scores[fullName]) return scores[fullName];
    const short = fullName.split("—")[0].trim();
    if (scores[short]) return scores[short];
    for (const k of Object.keys(scores)) {
      if (fullName.startsWith(k) || k.startsWith(fullName.split("—")[0].trim())) return scores[k];
    }
    return null;
  }

  let sLite = {}, sFlash = {};
  try { sLite = JSON.parse(lite.text).criteria || {}; } catch { console.log("⚠ lite parse fail"); }
  try { sFlash = JSON.parse(flash.text).criteria || {}; } catch { console.log("⚠ flash parse fail"); }

  // Existing scores from prior test
  const sPro25 = prior["2.5pro"].scores;
  const sPro31 = prior["3.1pro"].scores;

  console.log("\n\n═════ TO'LIQ SOLISHTIRISH ═════\n");
  console.log("Mezon".padEnd(40) + " | 2.5 Pro | 3.1 Pro | 3.1 FL  | 3 Flash ");
  console.log("─".repeat(90));
  let s25 = 0, s31p = 0, s31fl = 0, s3f = 0, n = 0;
  for (const name of criteriaNames) {
    const r25 = extract(sPro25, name);
    const r31p = extract(sPro31, name);
    const r31fl = extract(sLite, name);
    const r3f = extract(sFlash, name);
    if (r25?.score != null) s25 += r25.score;
    if (r31p?.score != null) s31p += r31p.score;
    if (r31fl?.score != null) s31fl += r31fl.score;
    if (r3f?.score != null) s3f += r3f.score;
    n++;
    console.log(
      name.padEnd(40).slice(0, 40) +
      ` | ${String(r25?.score ?? "?").padStart(6)}  ` +
      `| ${String(r31p?.score ?? "?").padStart(6)}  ` +
      `| ${String(r31fl?.score ?? "?").padStart(6)}  ` +
      `| ${String(r3f?.score ?? "?").padStart(6)}`
    );
  }
  console.log("─".repeat(90));
  console.log("O'rtacha".padEnd(40) +
    ` | ${(s25/n).toFixed(1).padStart(6)}  ` +
    `| ${(s31p/n).toFixed(1).padStart(6)}  ` +
    `| ${(s31fl/n).toFixed(1).padStart(6)}  ` +
    `| ${(s3f/n).toFixed(1).padStart(6)}`);

  console.log("\n═ Vaqt va narx ═");
  console.log("Model".padEnd(35) + " | Vaqt   | Narx");
  console.log("─".repeat(60));
  console.log("gemini-2.5-pro".padEnd(35) + ` | ${(prior["2.5pro"].ms/1000).toFixed(1)}s | $${prior["2.5pro"].cost.toFixed(4)}`);
  console.log("gemini-3.1-pro-preview".padEnd(35) + ` | ${(prior["3.1pro"].ms/1000).toFixed(1)}s | $${prior["3.1pro"].cost.toFixed(4)}`);
  console.log("gemini-3.1-flash-lite-preview".padEnd(35) + ` | ${(lite.ms/1000).toFixed(1)}s | $${lite.cost.toFixed(4)}`);
  console.log("gemini-3-flash-preview".padEnd(35) + ` | ${(flash.ms/1000).toFixed(1)}s | $${flash.cost.toFixed(4)}`);

  console.log("\n═ Izoh namunasi (E'tirozlar bilan ishlash) ═");
  const k = "E'tirozlar bilan ishlash";
  console.log("2.5 Pro:    ", extract(sPro25, k)?.comment || "?");
  console.log("3.1 Pro:    ", extract(sPro31, k)?.comment || "?");
  console.log("3.1 FL Lite:", extract(sLite, k)?.comment || "?");
  console.log("3 Flash:    ", extract(sFlash, k)?.comment || "?");

  fs.writeFileSync("/tmp/test-flash3-result.json", JSON.stringify({
    "3.1-flash-lite-preview": { ms: lite.ms, cost: lite.cost, scores: sLite },
    "3-flash-preview": { ms: flash.ms, cost: flash.cost, scores: sFlash },
  }, null, 2));
  await prisma.$disconnect();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
