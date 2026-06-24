// Probe which Gemini model IDs exist on Vertex AI
const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");

const PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const LOCATION = process.env.VERTEX_LOCATION || "us-central1";

const CANDIDATES = [
  "gemini-3-pro-preview",
  "gemini-3-pro",
  "gemini-3.0-pro",
  "gemini-3-pro-latest",
  "gemini-3-flash",
  "gemini-3-flash-preview",
  "gemini-3.0-flash",
  "gemini-3-pro-exp",
  "gemini-3-pro-002",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

(async () => {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await auth.getClient();
  const token = (await client.getAccessToken()).token;

  for (const m of CANDIDATES) {
    const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${m}:generateContent`;
    try {
      const t0 = Date.now();
      const resp = await axios.post(
        url,
        {
          contents: [{ role: "user", parts: [{ text: "say OK" }] }],
          generationConfig: { maxOutputTokens: 5 },
        },
        {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          validateStatus: () => true,
          timeout: 15000,
        }
      );
      const dt = Date.now() - t0;
      const ok = resp.status === 200;
      const txt = ok ? (resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || "?").trim() : (resp.data?.error?.message || "").slice(0, 80);
      console.log(`${ok ? "✓" : "✗"} ${m.padEnd(28)} ${resp.status}  ${dt}ms  ${txt}`);
    } catch (e) {
      console.log(`✗ ${m.padEnd(28)} ERR  ${e.message?.slice(0, 80)}`);
    }
  }
})();
