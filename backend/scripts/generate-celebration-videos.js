/*
 * Veo 3 celebration-video generator.
 * Per-manager one-time generation of 5 scenarios. Videos saved locally,
 * audio mix-down is a separate step (see mix-celebration-audio.sh).
 *
 * Usage:
 *   node scripts/generate-celebration-videos.js "Bexruz Urazboyev" [referenceImagePath]
 */

require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const { Storage } = require("@google-cloud/storage");
const fs = require("fs");
const path = require("path");

const MANAGER_NAME = process.argv[2] || "Bexruz Urazboyev";
const DEFAULT_REF =
  "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales/image_ref_blackbg.png";
const REFERENCE_IMAGE = process.argv[3] || DEFAULT_REF;
const PROJECT_ROOT =
  "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales";
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "video-test", "output");

const MODEL = "veo-3.0-generate-001";
const GCS_BUCKET = "big-quanta-469517-h6-salesai-stt";

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const SLUG = slugify(MANAGER_NAME);
const OUTPUT_DIR = path.join(OUTPUT_ROOT, SLUG);
const GCS_OUTPUT_URI = `gs://${GCS_BUCKET}/veo-celebrations/${SLUG}/`;

const NAME_UPPER = MANAGER_NAME.toUpperCase();

// Shared preamble ensures the subject's face and outfit stay consistent
// across all 5 scenarios when paired with the reference image.
// IMPORTANT: We only want the face / hair / suit from the reference photo —
// NOT the photo's original background. Each scenario builds a fresh scene.
const SUBJECT = `
SUBJECT: The same person shown in the reference image. Preserve his
exact face, hair, beard, skin tone, suit, shirt and lapel pin faithfully
— do not change his appearance.`.trim();

// IMPORTANT: Veo 3 on Vertex AI rejects prompts that instruct it to render
// specific user-supplied text (e.g. names, captions). We therefore keep
// prompts text-free and add name + "+1 SOTUV" in post via ffmpeg drawtext.

const NO_TEXT_DIRECTIVE = `
IMPORTANT: No on-screen text, captions, subtitles, logos, or watermarks
anywhere in the video. Clean scene only.`.trim();

const NEGATIVE_PROMPT = [
  "any on-screen text",
  "captions",
  "subtitles",
  "logos",
  "watermarks",
  "cartoon effects",
  "shaky camera",
  "jump cut",
].join(", ");

const scenarios = [
  {
    id: 1,
    name: "arms-crossing-in",
    prompt: `An 8-second cinematic 16:9 celebration video shot against a pure solid black background with no other environment visible. The same man from the reference image stands at center on this completely black background. Golden light particles and glowing amber embers drift softly through the frame, lit against the pure black. At the start his arms hang relaxed at his sides. Over the first two seconds he smoothly raises his forearms and crosses them over his chest, right over left, in one slow deliberate confident motion. He holds the crossed-arms pose for the remaining six seconds, his smile growing wider, his chin lifting slightly, giving one calm proud nod. Warm gold rim light from behind, soft cool key light from front, catchlights in his eyes. Locked medium chest-up shot, subtle slow push-in. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 2,
    name: "walk-in-confetti",
    // Walks toward camera from a distance, stops and smiles. Confetti surrounds.
    prompt: `An 8-second cinematic 16:9 celebration video. In a dark warm space filled with soft golden confetti floating gently through the air, the same man from the reference image is seen from a distance at the start of the shot. He walks confidently toward the camera with a smooth proud stride. As he reaches medium-shot distance around second five he slows to a stop, faces the camera directly, and flashes a wide proud smile. He gives one slow energetic nod. Golden confetti drifts softly all around him throughout the walk. Warm amber bokeh glows behind him, warm gold backlight makes the confetti sparkle. Camera stays locked, he walks into frame. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 3,
    name: "open-arms-wide",
    // Arms spread wide to both sides — open welcoming victory gesture.
    prompt: `An 8-second cinematic 16:9 celebration video. The video opens in near darkness. At 0.4 seconds a focused white spotlight fades on from above revealing the same man from the reference image standing center-frame. His arms are at his sides. From second one to second two he slowly spreads both arms wide open to his sides, extending them horizontally outward, palms facing forward in a grand open gesture. He holds this wide open-arms pose until second six, a big proud confident smile on his face. At second six he slowly brings his arms back down to his sides and gives one deliberate nod. Thin vertical streaks of golden light drift slowly in the atmospheric haze behind him. Hard top spotlight, dramatic theatrical feel, cool edge light from behind. Locked medium shot, subtle push-in. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 4,
    name: "cyan-thumbs-up",
    // Right thumb then left thumb, modern cyan atmosphere.
    prompt: `An 8-second cinematic 16:9 celebration video. In a sleek modern dark atmosphere where soft cyan and violet bokeh light glows around the edges, the same man from the reference image stands confidently at center immersed in the cool colored light. Both arms start at his sides. Around second one he raises his right hand and gives a clear thumbs up toward the camera. Around second three he raises his left hand as well, giving a strong double thumbs-up. He holds both thumbs up with a wide confident smile and gives one small nod around second six. Cool blue rim light highlights his shoulders and hair, warm key light on his face, the cyan bokeh glowing around him. Locked medium shot, slight push-in. Modern premium cinematic style. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
  {
    id: 5,
    name: "side-entry-golden",
    // Enters from the left side of frame, walks to center, stops and smiles.
    prompt: `An 8-second cinematic 16:9 celebration video. In a warm golden atmosphere with soft golden light particles drifting through dark air, the same man from the reference image enters the frame from the left side at the start of the shot, walking confidently toward the center. His stride is smooth and proud. He slows to a stop at center frame around second five, turns to face the camera directly, and gives a broad proud smile with a slow deliberate nod. Warm golden particles drift gently all around him throughout. Warm golden key light, strong amber rim light from behind, catchlights in his eyes. Camera stays locked as he walks into position. Premium prestigious cinematic style. No text, no captions, no subtitles, no logos, no watermarks.`,
  },
];

const storage = new Storage();

async function downloadFromGcs(gsUri, destPath) {
  const m = gsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!m) throw new Error(`bad gs uri: ${gsUri}`);
  const [, bucket, object] = m;
  await storage.bucket(bucket).file(object).download({ destination: destPath });
}

function mimeFromPath(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

async function run() {
  if (!fs.existsSync(REFERENCE_IMAGE)) {
    throw new Error(`Reference image not found: ${REFERENCE_IMAGE}`);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });

  const imageBytes = fs.readFileSync(REFERENCE_IMAGE).toString("base64");
  const mimeType = mimeFromPath(REFERENCE_IMAGE);

  console.log(`Manager: ${MANAGER_NAME}`);
  console.log(`Reference: ${REFERENCE_IMAGE}`);
  console.log(`Output:    ${OUTPUT_DIR}`);
  console.log(`Model:     ${MODEL}`);
  console.log("");

  const onlyIds = process.env.ONLY
    ? process.env.ONLY.split(",").map((x) => parseInt(x, 10))
    : null;

  for (const scenario of scenarios) {
    if (onlyIds && !onlyIds.includes(scenario.id)) continue;

    const outputPath = path.join(
      OUTPUT_DIR,
      `v${scenario.id}-${scenario.name}.mp4`
    );
    if (fs.existsSync(outputPath)) {
      console.log(`[v${scenario.id}] already exists, skipping`);
      continue;
    }

    const tStart = Date.now();
    console.log(`[v${scenario.id}] starting: ${scenario.name}`);

    let operation = await ai.models.generateVideos({
      model: MODEL,
      prompt: scenario.prompt,
      image: { imageBytes, mimeType },
      config: {
        aspectRatio: "16:9",
        durationSeconds: 8,
        numberOfVideos: 1,
        resolution: "720p",
        personGeneration: "allow_adult",
        generateAudio: false,
        negativePrompt: NEGATIVE_PROMPT,
        outputGcsUri: GCS_OUTPUT_URI,
      },
    });

    console.log(`[v${scenario.id}] operation=${operation.name || "?"}`);

    while (!operation.done) {
      await new Promise((r) => setTimeout(r, 15000));
      operation = await ai.operations.getVideosOperation({ operation });
      const elapsed = Math.round((Date.now() - tStart) / 1000);
      console.log(
        `[v${scenario.id}] polling… done=${!!operation.done} (${elapsed}s)`
      );
    }

    if (operation.error) {
      console.error(
        `[v${scenario.id}] ERROR:`,
        JSON.stringify(operation.error)
      );
      continue;
    }

    const rai = operation.response?.raiMediaFilteredReasons;
    if (rai && rai.length) {
      console.error(`[v${scenario.id}] RAI filtered:`, rai);
    }

    const video = operation.response?.generatedVideos?.[0]?.video;
    if (!video) {
      console.error(`[v${scenario.id}] no video in response`);
      continue;
    }

    console.log(`[v${scenario.id}] gcs=${video.uri || "(inline bytes)"}`);
    if (video.uri && video.uri.startsWith("gs://")) {
      await downloadFromGcs(video.uri, outputPath);
    } else if (video.videoBytes) {
      fs.writeFileSync(outputPath, Buffer.from(video.videoBytes, "base64"));
    } else {
      throw new Error("video has no uri or bytes");
    }
    const kb = Math.round(fs.statSync(outputPath).size / 1024);
    console.log(
      `[v${scenario.id}] saved: ${outputPath} (${kb} KB, ${Math.round(
        (Date.now() - tStart) / 1000
      )}s)`
    );
  }

  console.log("\nAll scenarios complete.");
}

run().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
