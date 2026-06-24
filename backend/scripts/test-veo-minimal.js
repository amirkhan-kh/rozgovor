require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");

const ai = new GoogleGenAI({
  vertexai: true,
  project: "big-quanta-469517-h6",
  location: "us-central1",
});

const REF = "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales/image copy 2.png";
const imageBytes = fs.readFileSync(REF).toString("base64");

const PROMPT = process.env.PROMPT || `A cinematic 8-second 16:9 video.
The same person shown in the reference image stands facing the camera
with arms folded on his chest, smiling confidently. Behind him, gentle
golden fireworks bloom softly in the dark sky. A few gold confetti
flakes drift through the air. The text "BEXRUZ URAZBOYEV" appears on
the lower left in clean white sans-serif. The text "+1 SOTUV" appears
on the right side in large bold white sans-serif. Premium cinematic
celebration style.`;

console.log("Prompt:\n" + PROMPT + "\n---");

(async () => {
  let op = await ai.models.generateVideos({
    model: "veo-3.0-generate-001",
    prompt: PROMPT,
    image: { imageBytes, mimeType: "image/png" },
    config: {
      aspectRatio: "16:9",
      durationSeconds: 8,
      numberOfVideos: 1,
      resolution: "720p",
      personGeneration: "allow_adult",
      generateAudio: false,
      outputGcsUri: "gs://big-quanta-469517-h6-salesai-stt/veo-test/",
    },
  });
  console.log("op:", op.name);

  const t = Date.now();
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 10000));
    op = await ai.operations.getVideosOperation({ operation: op });
    console.log(`poll done=${!!op.done} (${Math.round((Date.now() - t) / 1000)}s)`);
  }

  if (op.error) {
    console.error("ERROR:", JSON.stringify(op.error));
    process.exit(1);
  }
  console.log("OK");
  console.log("rai:", op.response?.raiMediaFilteredReasons);
  console.log("video:", JSON.stringify(op.response?.generatedVideos?.[0]?.video, null, 2));

  const video = op.response?.generatedVideos?.[0]?.video;
  if (video) {
    const out = "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales/video-test/output/_minimal.mp4";
    await ai.files.download({ file: video, downloadPath: out });
    console.log("saved:", out, fs.statSync(out).size, "bytes");
  }
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
