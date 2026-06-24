const { GoogleAuth } = require("google-auth-library");
const axios = require("axios");

(async () => {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const token = (await (await auth.getClient()).getAccessToken()).token;
  const project = "big-quanta-469517-h6";

  for (const loc of ["us-central1", "global"]) {
    console.log(`\n=== ${loc} ===`);
    const url = `https://${loc}-aiplatform.googleapis.com/v1beta1/publishers/google/models?filter=is_hf_wrapper_model%3Dfalse&pageSize=300`;
    try {
      const r = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
        timeout: 30000,
      });
      if (r.status !== 200) {
        console.log(`status=${r.status}: ${r.data?.error?.message || JSON.stringify(r.data).slice(0, 200)}`);
        continue;
      }
      const models = (r.data.publisherModels || [])
        .map(m => m.name.split("/").pop())
        .filter(n => n.startsWith("gemini"))
        .sort();
      console.log(`${models.length} gemini models:`);
      console.log(models.join("\n"));
    } catch (e) {
      console.log("err:", e.message);
    }
  }
})();
