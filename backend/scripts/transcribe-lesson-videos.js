// Kurs videolarini Yandex STT (v3 streaming) bilan transkript qiladi
// Natija: word-level JSON + plain text markdown
// Foydalanish: node scripts/transcribe-lesson-videos.js

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { randomUUID } = require("crypto");
const grpc = require("@grpc/grpc-js");
const {
  RecognizerClient,
} = require("@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt_service");
const {
  RawAudio_AudioEncoding,
} = require("@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt");

const YANDEX_API_KEY =
  process.env.YANDEX_API_KEY || "AQVNzJY66YR6RQ9jA1UZW-uYbgaMCtrk8OpcR-4m";

const PROJECT_ROOT = "/home/grafeas/WORK/Agents/SalesAi | Bitrix | Prosales";
const OUTPUT_DIR = path.join(PROJECT_ROOT, "lesson-transcripts");

const VIDEOS = [
  {
    file: path.join(PROJECT_ROOT, "1)  kurs darsli .mp4"),
    slug: "kurs-darsli",
  },
  {
    file: path.join(PROJECT_ROOT, "dars .mp4"),
    slug: "dars",
  },
];

function mp4ToPcm(mp4Path) {
  const pcmPath = path.join(os.tmpdir(), `stt-${randomUUID()}.pcm`);
  console.log(`  ffmpeg: mp4 → pcm (16kHz mono)...`);
  execSync(
    `ffmpeg -y -i "${mp4Path}" -vn -ac 1 -ar 16000 -f s16le "${pcmPath}" 2>/dev/null`,
    { maxBuffer: 1024 * 1024 * 1024 }
  );
  const stats = fs.statSync(pcmPath);
  console.log(`  pcm yaratildi: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  return pcmPath;
}

function transcribePcmStream(pcmPath) {
  return new Promise((resolve, reject) => {
    const client = new RecognizerClient(
      "stt.api.cloud.yandex.net:443",
      grpc.credentials.createSsl()
    );
    const metadata = new grpc.Metadata();
    metadata.set("authorization", `Api-Key ${YANDEX_API_KEY}`);

    const stream = client.recognizeStreaming(metadata);
    const words = [];
    let lastLogTime = Date.now();

    stream.on("data", (response) => {
      if (response.finalRefinement?.normalizedText?.alternatives) {
        for (const alt of response.finalRefinement.normalizedText.alternatives) {
          for (const w of alt.words || []) {
            words.push({
              word: w.text || "",
              startMs: Number(w.startTimeMs || 0),
              endMs: Number(w.endTimeMs || 0),
            });
          }
        }
        const now = Date.now();
        if (now - lastLogTime > 5000) {
          const lastWord = words[words.length - 1];
          const mins = lastWord
            ? (lastWord.startMs / 1000 / 60).toFixed(1)
            : 0;
          console.log(`  progress: ${words.length} ta so'z, ~${mins} daqiqa...`);
          lastLogTime = now;
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
      resolve(unique);
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

    const fd = fs.openSync(pcmPath, "r");
    const CHUNK = 32 * 1024;
    const buf = Buffer.alloc(CHUNK);
    const stats = fs.fstatSync(fd);
    const total = stats.size;
    let pos = 0;
    const next = () => {
      if (pos >= total) {
        fs.closeSync(fd);
        stream.end();
        return;
      }
      const bytesToRead = Math.min(CHUNK, total - pos);
      const read = fs.readSync(fd, buf, 0, bytesToRead, pos);
      if (read <= 0) {
        fs.closeSync(fd);
        stream.end();
        return;
      }
      const chunk = Buffer.from(buf.subarray(0, read));
      stream.write({
        $type: "speechkit.stt.v3.StreamingRequest",
        chunk: { $type: "speechkit.stt.v3.AudioChunk", data: chunk },
      });
      pos += read;
      setImmediate(next);
    };
    next();
  });
}

function wordsToSentences(words) {
  const lines = [];
  let current = { start: 0, text: "" };
  for (const w of words) {
    const startSec = w.startMs / 1000;
    if (!current.text) current.start = startSec;
    current.text += (current.text ? " " : "") + w.word;
    if (w.word.match(/[.!?]$/) || current.text.split(" ").length > 25) {
      lines.push({ ...current });
      current = { start: 0, text: "" };
    }
  }
  if (current.text) lines.push(current);
  return lines;
}

function fmtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

(async () => {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const v of VIDEOS) {
    if (!fs.existsSync(v.file)) {
      console.log(`SKIP: ${v.file} topilmadi`);
      continue;
    }
    console.log(`\n=== ${v.slug} ===`);
    console.log(`Video: ${v.file}`);
    console.log(`Hajm: ${(fs.statSync(v.file).size / 1024 / 1024).toFixed(1)} MB`);

    const startTs = Date.now();
    let pcmPath = null;
    try {
      pcmPath = mp4ToPcm(v.file);
      console.log(`  Yandex STT'ga yuborilmoqda...`);
      const words = await transcribePcmStream(pcmPath);
      const lines = wordsToSentences(words);

      const durationSec = words.length ? words[words.length - 1].startMs / 1000 : 0;
      const elapsed = ((Date.now() - startTs) / 1000).toFixed(0);
      console.log(
        `  ✓ tugadi: ${words.length} so'z, ${lines.length} ta jumla, ` +
          `video uzunligi ${fmtTime(durationSec)}, ishladi ${elapsed}s`
      );

      const wordsJson = path.join(OUTPUT_DIR, `${v.slug}-words.json`);
      const linesJson = path.join(OUTPUT_DIR, `${v.slug}-lines.json`);
      const md = path.join(OUTPUT_DIR, `${v.slug}.md`);
      const plain = path.join(OUTPUT_DIR, `${v.slug}.txt`);

      fs.writeFileSync(wordsJson, JSON.stringify(words, null, 2));
      fs.writeFileSync(linesJson, JSON.stringify(lines, null, 2));

      let mdContent = `# ${v.slug}\n\n`;
      mdContent += `Video: ${path.basename(v.file)}\n`;
      mdContent += `Davomiyligi: ${fmtTime(durationSec)}\n`;
      mdContent += `So'zlar: ${words.length}\n`;
      mdContent += `Transkript olingan: ${new Date().toISOString()}\n\n`;
      mdContent += `---\n\n`;
      for (const l of lines) {
        mdContent += `**[${fmtTime(l.start)}]** ${l.text}\n\n`;
      }
      fs.writeFileSync(md, mdContent);

      const plainContent = lines.map((l) => l.text).join(" ");
      fs.writeFileSync(plain, plainContent);

      console.log(`  saqlandi: ${OUTPUT_DIR}/${v.slug}.{md,txt,words.json,lines.json}`);
    } catch (err) {
      console.error(`  ✗ xatolik: ${err.message}`);
    } finally {
      if (pcmPath && fs.existsSync(pcmPath)) {
        try { fs.unlinkSync(pcmPath); } catch {}
      }
    }
  }

  console.log(`\n✅ Hammasi tugadi: ${OUTPUT_DIR}`);
})();
