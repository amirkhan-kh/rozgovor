const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");
const PROJECT = "big-quanta-469517-h6";

const TESTS = [
  ["gemini-3.1-pro-preview", "global"],
  ["gemini-3.1-pro", "global"],
  ["gemini-3.1-flash-lite-preview", "global"],
  ["gemini-3.1-flash-lite", "global"],
  ["gemini-3.1-flash-preview", "global"],
  ["gemini-3.1-flash", "global"],
  ["gemini-3-flash-lite-preview", "global"],
  ["gemini-3-flash-preview", "global"],
];

(async () => {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = (await (await auth.getClient()).getAccessToken()).token;
  for (const [m, loc] of TESTS) {
    const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
    const url = `https://${host}/v1/projects/${PROJECT}/locations/${loc}/publishers/google/models/${m}:generateContent`;
    try {
      const t0 = Date.now();
      const r = await axios.post(url, {
        contents: [{ role: "user", parts: [{ text: "Say OK in one word" }] }],
        generationConfig: { maxOutputTokens: 10 },
      }, { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true, timeout: 15000 });
      const dt = Date.now() - t0;
      if (r.status === 200) {
        const txt = (r.data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
        console.log(`✓ ${m.padEnd(34)} ${dt}ms  "${txt}"`);
      } else {
        console.log(`✗ ${m.padEnd(34)} ${r.status}  ${(r.data?.error?.message || "").slice(0, 60)}`);
      }
    } catch (e) {
      console.log(`✗ ${m} ERR ${e.message}`);
    }
  }
})();
