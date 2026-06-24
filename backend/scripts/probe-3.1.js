const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");

const PROJECT = "big-quanta-469517-h6";

const MODELS = [
  "gemini-3-pro-preview",
  "gemini-3-pro",
  "gemini-3.1-pro",
  "gemini-3.1-pro-preview",
  "gemini-3-1-pro",
  "gemini-3-1-pro-preview",
  "gemini-3-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-1-flash-lite",
  "gemini-3-1-flash-lite-preview",
  "gemini-3-pro-preview-2025",
  "gemini-3-pro-preview-2025-12",
];

const LOCATIONS = ["us-central1", "us-east5", "us-east1", "us-west1", "europe-west4", "global"];
const VERSIONS = ["v1", "v1beta1"];

(async () => {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = (await (await auth.getClient()).getAccessToken()).token;

  for (const m of MODELS) {
    for (const loc of LOCATIONS) {
      for (const v of VERSIONS) {
        const host = loc === "global" ? "aiplatform.googleapis.com" : `${loc}-aiplatform.googleapis.com`;
        const url = `https://${host}/${v}/projects/${PROJECT}/locations/${loc}/publishers/google/models/${m}:generateContent`;
        try {
          const resp = await axios.post(url, {
            contents: [{ role: "user", parts: [{ text: "OK" }] }],
            generationConfig: { maxOutputTokens: 5 },
          }, { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true, timeout: 10000 });
          if (resp.status === 200) {
            console.log(`✓ ${v} ${loc.padEnd(14)} ${m}`);
            return; // first success enough
          } else if (resp.status !== 404 && resp.status !== 400) {
            console.log(`? ${v} ${loc.padEnd(14)} ${m.padEnd(36)} ${resp.status}: ${(resp.data?.error?.message || "").slice(0, 80)}`);
          }
        } catch (e) {}
      }
    }
  }
  console.log("hech bir kombinatsiya 200 qaytarmadi");
})();
