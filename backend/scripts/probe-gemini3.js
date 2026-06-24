const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");

const PROJECT = "big-quanta-469517-h6";

const TESTS = [
  // [location, modelId]
  ["us-central1", "gemini-3-pro-preview-12-2025"],
  ["us-central1", "gemini-3-pro-preview-2025-12"],
  ["us-central1", "gemini-3-pro-001"],
  ["us-central1", "gemini-3-pro-002"],
  ["us-central1", "gemini-3-pro-preview-06-2025"],
  ["us-central1", "gemini-3-pro-preview-09-2025"],
  ["us-central1", "gemini-pro-3"],
  ["us-central1", "gemini-3-1-pro"],
  ["us-central1", "gemini-3.1-pro"],
  ["us-central1", "gemini-experimental"],
  ["us-central1", "gemini-exp"],
  ["us-central1", "gemini-pro"],
  ["global", "gemini-3-pro-preview"],
  ["global", "gemini-3-pro"],
  ["us-east5", "gemini-3-pro-preview"],
  ["us-east1", "gemini-3-pro-preview"],
];

(async () => {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  for (const [loc, m] of TESTS) {
    const url = `https://${loc}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${loc}/publishers/google/models/${m}:generateContent`;
    try {
      const resp = await axios.post(
        url,
        { contents: [{ role: "user", parts: [{ text: "OK" }] }], generationConfig: { maxOutputTokens: 5 } },
        { headers: { Authorization: `Bearer ${token}` }, validateStatus: () => true, timeout: 15000 }
      );
      const ok = resp.status === 200;
      const msg = ok ? "OK" : (resp.data?.error?.message?.slice(0, 60) || "");
      console.log(`${ok ? "✓" : "✗"} ${loc.padEnd(12)} ${m.padEnd(32)} ${resp.status}  ${msg}`);
    } catch (e) {
      console.log(`✗ ${loc} ${m} ERR ${e.message?.slice(0, 60)}`);
    }
  }
})();
