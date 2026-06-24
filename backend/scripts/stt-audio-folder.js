// Yandex STT (v3 streaming) — audio papkadagi .ogg fayllarni transkript qiladi
// Diarization YO'Q — faqat matn. Natija .md faylga yoziladi.
// Foydalanish: node scripts/stt-audio-folder.js

require("ts-node/register");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { randomUUID } = require("crypto");
const grpc = require("@grpc/grpc-js");
const { RecognizerClient } = require("@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt_service");
const { RawAudio_AudioEncoding } = require("@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt");

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "AQVNzJY66YR6RQ9jA1UZW-uYbgaMCtrk8OpcR-4m";
const AUDIO_DIR = "/home/grafeas/Personal/SalesAi/audio";
const OUTPUT = path.join(AUDIO_DIR, "transcripts.md");

const FILES = [
  "audio_2026-04-19_20-10-51.ogg",
  "audio_2026-04-19_20-10-54.ogg",
  "audio_2026-04-19_20-10-56.ogg",
  "audio_2026-04-19_20-10-58.ogg",
  "audio_2026-04-19_20-11-00.ogg",
  "audio_2026-04-19_20-11-02.ogg",
  "audio_2026-04-19_20-11-04.ogg",
  "audio_2026-04-19_20-11-07.ogg",
  "audio_2026-04-19_20-11-10.ogg",
  "audio_2026-04-19_20-11-13.ogg",
  "audio_2026-04-19_20-11-16.ogg",
  "audio_2026-04-19_20-11-18.ogg",
  "audio_2026-04-19_20-11-22.ogg",
  "audio_2026-04-19_20-11-25.ogg",
  "audio_2026-04-19_20-11-29.ogg",
  "audio_2026-04-19_20-11-31.ogg",
  "audio_2026-04-19_20-11-35.ogg",
  "audio_2026-04-19_20-11-37.ogg",
  "audio_2026-04-19_20-11-40.ogg",
];

function oggToPcm(oggPath) {
  const pcmPath = path.join(os.tmpdir(), `stt-${randomUUID()}.pcm`);
  execSync(
    `ffmpeg -y -i "${oggPath}" -ac 1 -ar 16000 -f s16le "${pcmPath}" 2>/dev/null`
  );
  const buf = fs.readFileSync(pcmPath);
  try { fs.unlinkSync(pcmPath); } catch {}
  return buf;
}

function transcribePcm(pcmBuffer) {
  return new Promise((resolve, reject) => {
    const client = new RecognizerClient(
      "stt.api.cloud.yandex.net:443",
      grpc.credentials.createSsl()
    );
    const metadata = new grpc.Metadata();
    metadata.set("authorization", `Api-Key ${YANDEX_API_KEY}`);

    const stream = client.recognizeStreaming(metadata);
    const words = [];

    stream.on("data", (response) => {
      if (response.finalRefinement?.normalizedText?.alternatives) {
        for (const alt of response.finalRefinement.normalizedText.alternatives) {
          for (const w of alt.words || []) {
            words.push({
              word: w.text || "",
              startMs: Number(w.startTimeMs || 0),
            });
          }
        }
      }
    });

    stream.on("error", reject);
    stream.on("end", () => {
      const seen = new Set();
      const unique = words.filter((w) => {
        const key = `${w.startMs}-${w.word}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      resolve(unique.map((w) => w.word).join(" ").trim());
    });

    stream.write({
      $type: "speechkit.stt.v3.StreamingRequest",
      sessionOptions: {
        $type: "speechkit.stt.v3.StreamingOptions",
        recognitionModel: {
          $type: "speechkit.stt.v3.RecognitionModelOptions",
          model: "general",
          audioFormat: {
            $type: "speechkit.stt.v3.AudioFormatOptions",
            rawAudio: {
              $type: "speechkit.stt.v3.RawAudio",
              audioEncoding: RawAudio_AudioEncoding.LINEAR16_PCM,
              sampleRateHertz: 16000,
              audioChannelCount: 1,
            },
          },
          textNormalization: {
            $type: "speechkit.stt.v3.TextNormalizationOptions",
            textNormalization: 1,
            profanityFilter: false,
            literatureText: true,
          },
          languageRestriction: {
            $type: "speechkit.stt.v3.LanguageRestrictionOptions",
            restrictionType: 1,
            languageCode: ["uz-UZ"],
          },
          audioProcessingType: 1,
        },
      },
    });

    const CHUNK = 32 * 1024;
    let off = 0;
    const next = () => {
      if (off >= pcmBuffer.length) { stream.end(); return; }
      const chunk = pcmBuffer.slice(off, Math.min(off + CHUNK, pcmBuffer.length));
      stream.write({
        $type: "speechkit.stt.v3.StreamingRequest",
        chunk: { $type: "speechkit.stt.v3.AudioChunk", data: chunk },
      });
      off += CHUNK;
      setImmediate(next);
    };
    next();
  });
}

(async () => {
  const results = [];
  for (let i = 0; i < FILES.length; i++) {
    const name = FILES[i];
    const p = path.join(AUDIO_DIR, name);
    if (!fs.existsSync(p)) {
      console.log(`[${i + 1}/${FILES.length}] ${name} — TOPILMADI`);
      continue;
    }
    process.stdout.write(`[${i + 1}/${FILES.length}] ${name} ... `);
    try {
      const pcm = oggToPcm(p);
      const text = await transcribePcm(pcm);
      results.push({ name, text: text || "[bo'sh]" });
      console.log(`✓ (${text.length} belgi)`);
    } catch (err) {
      console.log(`✗ ${err.message.substring(0, 80)}`);
      results.push({ name, text: `[XATOLIK: ${err.message}]` });
    }
  }

  let md = `# Audio transkriptlar (Yandex STT)\n\nJami: ${results.length} ta fayl\nSana: ${new Date().toISOString()}\n\n`;
  for (const r of results) {
    md += `## ${r.name}\n\n${r.text}\n\n---\n\n`;
  }
  fs.writeFileSync(OUTPUT, md);
  console.log(`\n✅ Tayyor: ${OUTPUT}`);
})();
