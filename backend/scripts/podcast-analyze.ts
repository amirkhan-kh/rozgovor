// Podcast pipeline: STT → Diarization → Pro analysis (batch).
//
// Audio: ../../podcast/youtube-YFjVMuVM4aI.mp3
// Output:
//   ../../podcast/_words.json (Yandex STT raw words)
//   ../../podcast/_lines.json (sentence-grouped lines)
//   ../../podcast/transkisosiya-dizaration.md (Muhamadali / Akmal Payziyev rollar bilan)
//   ../../podcast/tahlil.md (10 bo'limli chuqur tahlil)
//
// Resumable: agar oraliq fayllar mavjud bo'lsa, mos bosqichdan davom etadi.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import * as https from "https";
import AWS from "aws-sdk";
import { GoogleGenAI } from "@google/genai";
import { JobServiceClient } from "@google-cloud/aiplatform";
import { Storage } from "@google-cloud/storage";

require("dotenv").config();

const PODCAST_DIR = path.resolve(__dirname, "../../../podcast");
const AUDIO_PATH = path.join(PODCAST_DIR, "youtube-YFjVMuVM4aI.mp3");

const WORDS_PATH = path.join(PODCAST_DIR, "_words.json");
const LINES_PATH = path.join(PODCAST_DIR, "_lines.json");
const DIARIZATION_PATH = path.join(PODCAST_DIR, "transkisosiya-dizaration.md");
const ANALYSIS_PATH = path.join(PODCAST_DIR, "tahlil.md");
const STATE_PATH = path.join(PODCAST_DIR, "_state.json");

const YANDEX_API_KEY = process.env.YANDEX_API_KEY!;
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID!;
const YANDEX_BUCKET = process.env.YANDEX_BUCKET || "sales-ai-storage";

const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-central1";
const GCS_BUCKET = "big-quanta-469517-h6-salesai-stt";

interface SttWord {
  word: string;
  startMs: number;
  endMs: number;
}
interface SttLine {
  text: string;
  start: number;
  end: number;
}

interface State {
  oggKey?: string;
  sttOperationId?: string;
  diarized?: boolean;
  batchJobName?: string;
  batchOutputPrefix?: string;
}

function loadState(): State {
  if (fs.existsSync(STATE_PATH)) {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  }
  return {};
}
function saveState(s: State) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2));
}

const yandexS3 = new AWS.S3({
  endpoint: process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net",
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  httpOptions: { timeout: 600000, connectTimeout: 60000 },
  maxRetries: 5,
});

// ─── STEP 1: mp3 → ogg opus ───────────────────────────────────────────
function mp3ToOgg(mp3Path: string): string {
  const oggPath = path.join(os.tmpdir(), `podcast-${randomUUID()}.ogg`);
  console.log(`[stt] ffmpeg ${path.basename(mp3Path)} → ogg opus`);
  execSync(
    `ffmpeg -y -i "${mp3Path}" -vn -c:a libopus -b:a 48k -ar 48000 -ac 1 "${oggPath}" 2>/dev/null`,
    { maxBuffer: 1024 * 1024 * 1024 }
  );
  return oggPath;
}

async function uploadOggToYandex(buf: Buffer, key: string): Promise<string> {
  console.log(`[stt] Yandex S3 upload (${(buf.length / 1024 / 1024).toFixed(1)} MB) → ${key}`);
  await yandexS3.putObject({ Bucket: YANDEX_BUCKET, Key: key, Body: buf }).promise();
  return `https://storage.yandexcloud.net/${YANDEX_BUCKET}/${key}`;
}

async function submitDeferredSTT(s3Uri: string): Promise<string> {
  const body = JSON.stringify({
    config: {
      specification: {
        languageCode: "uz-UZ",
        model: "general",
        audioEncoding: "OGG_OPUS",
        sampleRateHertz: 48000,
        audioChannelCount: 1,
        rawResults: true,
      },
    },
    audio: { uri: s3Uri },
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "transcribe.api.cloud.yandex.net",
        path: "/speech/stt/v2/longRunningRecognize",
        method: "POST",
        headers: {
          Authorization: `Api-Key ${YANDEX_API_KEY}`,
          "x-folder-id": YANDEX_FOLDER_ID,
          "Content-Type": "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.id) resolve(parsed.id);
            else reject(new Error(parsed.message || JSON.stringify(parsed)));
          } catch {
            reject(new Error(data));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function checkSTT(operationId: string): Promise<{ done: boolean; words?: SttWord[]; error?: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "operation.api.cloud.yandex.net",
        path: `/operations/${operationId}`,
        method: "GET",
        headers: { Authorization: `Api-Key ${YANDEX_API_KEY}` },
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const result = JSON.parse(data);
            if (!result.done) return resolve({ done: false });
            if (result.error) {
              return resolve({ done: true, error: result.error.message || JSON.stringify(result.error) });
            }
            const words: SttWord[] = [];
            const chunks = result.response?.chunks || [];
            for (const chunk of chunks) {
              for (const alt of chunk.alternatives || []) {
                for (const w of alt.words || []) {
                  const parseTs = (t: string): number => {
                    if (!t) return 0;
                    const v = parseFloat(t.replace("s", ""));
                    return isFinite(v) ? Math.round(v * 1000) : 0;
                  };
                  words.push({
                    word: w.word || "",
                    startMs: parseTs(w.startTime),
                    endMs: parseTs(w.endTime),
                  });
                }
              }
            }
            resolve({ done: true, words });
          } catch {
            resolve({ done: false });
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function wordsToLines(words: SttWord[]): SttLine[] {
  const lines: SttLine[] = [];
  let cur: SttLine = { start: 0, end: 0, text: "" };
  for (const w of words) {
    const startSec = w.startMs / 1000;
    const endSec = w.endMs / 1000;
    if (!cur.text) cur.start = startSec;
    cur.end = endSec;
    cur.text += (cur.text ? " " : "") + w.word;
    if (w.word.match(/[.!?]$/) || cur.text.split(" ").length > 30) {
      lines.push({ ...cur });
      cur = { start: 0, end: 0, text: "" };
    }
  }
  if (cur.text) lines.push(cur);
  return lines;
}

// ─── STEP 2: Diarization (Gemini 2.5 Pro online) ──────────────────────
function fmtTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function diarizePro(lines: SttLine[]): Promise<string> {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: VERTEX_PROJECT,
    location: VERTEX_LOCATION,
  });

  const transcript = lines
    .map((l) => `[${fmtTimestamp(l.start)}] ${l.text}`)
    .join("\n");

  const prompt = `Sen Uzbek tilidagi podcast transkriptini ROL bo'yicha ajratuvchi mutaxassissan.

PODCAST: "AI'ni loyihalarga integratsiya qilish: real tajriba va strategiyalar"

ROLLAR (faqat shu ikkitasi):
1. **Muhamadali** — podcast boshlovchisi/host. U podcastni "Tak unda boshladik" so'zlari bilan ochadi.
2. **Akmal Payziyev** — mehmon. AI integratsiyasi mutaxassisi.

VAZIFA:
Quyidagi STT transkriptini o'qib, har bir gap qaysi rolga tegishli ekanligini aniqla.
NATIJA — Markdown formatida, har bir blok shu ko'rinishda:

\`\`\`
**[HH:MM:SS] Muhamadali:**
Gap matni...

**[HH:MM:SS] Akmal Payziyev:**
Javob matni...
\`\`\`

QOIDALAR:
- Har bir blok timestampi shu spiker birinchi gapirgan vaqtdan boshlansin.
- Bir spiker uzun gapirsa, uni bir blok qilib birlashtiring (ya'ni bir spiker → bir paragraf).
- Spiker o'zgarsa — yangi blok.
- STT xatolarini tabiy uzbekchaga to'g'rilang (lekin ma'noni o'zgartirmang).
- Punctuation va katta-kichik harflarni Uzbek qoidalariga moslashtiring.
- Hech qanday ma'lumot QO'SHMANG, TAVSIYA QILMANG, IZOH BERMANG. Faqat transkript.

──────── TRANSKRIPT ────────
${transcript}
──────── TRANSKRIPT TUGADI ────────

NATIJA (faqat markdown, hech narsa qo'shmang):`;

  console.log(`[diarize] Pro online (input ~${(prompt.length / 1024).toFixed(1)} KB)`);
  const startTs = Date.now();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.1,
      maxOutputTokens: 65000,
      thinkingConfig: { thinkingBudget: -1 },
    },
  });

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`[diarize] tugadi (${elapsed}s)`);

  let text = (response.text || "").trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return text;
}

// ─── STEP 3: Analysis (Vertex AI Pro batch) ───────────────────────────
const ANALYSIS_PROMPT_TEMPLATE = (transcript: string) => `Sen Uzbek tilidagi AI/IT podcastlarni tahlil qiluvchi yuqori malakali ekspertsan.

PODCAST: "AI'ni loyihalarga integratsiya qilish: real tajriba va strategiyalar"
ISHTIROKCHILAR: Muhamadali (host) va Akmal Payziyev (AI mutaxassis mehmon)

VAZIFA:
Quyidagi diarizatsiya qilingan transkriptni o'qib, MIJOZ KO'Z OLDIDA ASOS BO'LADIGAN
chuqur va aniq markdown tahlil tayyorla. Hech qanday gallyutsinatsiya bo'lmasin —
har bir gap transkriptga tayanishi kerak. Agar bironta bo'limga ma'lumot yetarli
emas bo'lsa — "Transkriptda yetarli ma'lumot yo'q" deb yoz, lekin TUYDIRMA.

NATIJA — toza Markdown:

# 🎙️ Podcast tahlili

## 📌 Podcast mavzusi
(2-4 jumla — podcast nima haqida ekanini aniq tushuntir)

## 🔭 Podcast yo'nalishlari
(Bullet list — qaysi yo'nalishlar/sub-mavzular qamralgan, har biri 1 qator)

## 🤖 Podcastdagi AI haqida fikrlar
(Asosiy AI'ga qoyilgan fikr/ta'riflar — kim qachon nima degan, sitatalar bilan)

## 🌊 AI ning ta'siri
(Biznes, jamiyat, ish jarayonlari, kompaniyalar — qanday ta'siri muhokama qilingan)

## 🛠️ Tajribalar
(Akmal Payziyev va Muhamadalining real tajribalari, case study, projects, misollar)

## 🎯 Strategiyalar
(AI integratsiyasi uchun aniq taklif/strategiya — qadam-baqadam yondashuvlar)

## ⭐ Muhim joylar
(Eng kuchli, esda qoladigan, sitata sifatida ishlatilishi mumkin bo'lgan momentlar — har biri timestamp bilan agar mumkin bo'lsa)

## 🔗 Integratsiya
(AI'ni real loyihalarga qanday integratsiya qilish — qanday boshlash, qanday vositalar, qanday qiyinchiliklar, qanday yechimlar)

## 📚 Chuqur xulosa
(Mijoz shu xulosani o'qib BUTUN podcastning mohiyatini, asosiy tezislarini, har bir ishtirokchi qarashini va nimaga kelishganini to'liq tushunadigan darajada — kamida 600-800 so'z. Faktlar, sitatalar, real misollar bilan.)

## 💡 Qisqa xulosa
(3-5 jumla — eng asosiy 2-3 fikrni qisqa qilib aytib bering)

──────── DIARIZATSIYA QILINGAN TRANSKRIPT ────────
${transcript}
──────── TRANSKRIPT TUGADI ────────

QAT'IY QOIDALAR:
1. Sitatalarni "..." ichida bering, kim aytganini ko'rsating: "Akmal Payziyev: ..."
2. Hech qachon ma'lumot O'YLAB CHIQARMANG. Faqat transkriptdagi gaplarga tayaning.
3. Markdown formatlash to'g'ri bo'lsin (## sarlavha, **bold**, - bullet, va h.k.)
4. Uzbek tilida (lotin yozuvi).
5. JSON emas, markdown qaytaring.

NATIJA (faqat markdown matni):`;

async function runAnalysisBatch(diarizedTranscript: string, state: State): Promise<string> {
  const storage = new Storage();
  const bucket = storage.bucket(GCS_BUCKET);
  const jobClient = new JobServiceClient({
    apiEndpoint: "us-central1-aiplatform.googleapis.com",
  });

  // Reuse existing batch job if state has it
  let jobName = state.batchJobName;
  let outputPrefix = state.batchOutputPrefix;

  if (!jobName) {
    const prompt = ANALYSIS_PROMPT_TEMPLATE(diarizedTranscript);
    console.log(`[analyze] Prompt size: ${(prompt.length / 1024).toFixed(1)} KB`);

    const request = {
      request: {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 65000,
          thinkingConfig: { thinkingBudget: -1 },
        },
      },
    };

    const ts = Date.now();
    const inputFile = `podcast-batch/input-${ts}.jsonl`;
    outputPrefix = `podcast-batch/output-${ts}/`;

    await bucket.file(inputFile).save(JSON.stringify(request));
    console.log(`[analyze] JSONL uploaded: gs://${GCS_BUCKET}/${inputFile}`);

    const [createdJob] = await jobClient.createBatchPredictionJob({
      parent: `projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}`,
      batchPredictionJob: {
        displayName: `podcast-pro-${ts}`,
        model: "publishers/google/models/gemini-2.5-pro",
        inputConfig: {
          instancesFormat: "jsonl",
          gcsSource: { uris: [`gs://${GCS_BUCKET}/${inputFile}`] },
        },
        outputConfig: {
          predictionsFormat: "jsonl",
          gcsDestination: { outputUriPrefix: `gs://${GCS_BUCKET}/${outputPrefix}` },
        },
      },
    });

    jobName = createdJob.name!;
    state.batchJobName = jobName;
    state.batchOutputPrefix = outputPrefix;
    saveState(state);
    console.log(`[analyze] Batch job: ${jobName}`);
  } else {
    console.log(`[analyze] Resume batch job: ${jobName}`);
  }

  // Poll
  const MAX = 240; // 240 * 30s = 2 hours
  for (let i = 0; i < MAX; i++) {
    await new Promise((r) => setTimeout(r, 30000));
    const [job] = await jobClient.getBatchPredictionJob({ name: jobName });
    if (i % 2 === 0) console.log(`[analyze] state: ${job.state}`);
    if (job.state === "JOB_STATE_SUCCEEDED") break;
    if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") {
      throw new Error(`Pro batch failed: ${JSON.stringify(job.error)}`);
    }
    if (i === MAX - 1) throw new Error("Timeout waiting for batch");
  }

  await new Promise((r) => setTimeout(r, 5000));
  const [files] = await bucket.getFiles({ prefix: outputPrefix });
  const predFile =
    files.find((f) => f.name.endsWith("predictions.jsonl")) ||
    files.find((f) => f.name.includes("predictions"));
  if (!predFile) {
    throw new Error(`Predictions file not found under ${outputPrefix}`);
  }

  const [content] = await predFile.download();
  const lines = content.toString().split("\n").filter((l) => l.trim());
  const parsed = JSON.parse(lines[0]);
  const candidates = parsed.response?.candidates || [];
  const text = candidates[0]?.content?.parts?.[0]?.text || "";
  if (!text) {
    throw new Error(`No text in batch response: ${JSON.stringify(parsed).substring(0, 500)}`);
  }

  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  return cleaned;
}

// ─── MAIN ──────────────────────────────────────────────────────────────
(async () => {
  if (!fs.existsSync(AUDIO_PATH)) {
    console.error(`Audio fayl topilmadi: ${AUDIO_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(PODCAST_DIR)) fs.mkdirSync(PODCAST_DIR, { recursive: true });

  const state = loadState();

  // ─── STT bosqichi ───
  let words: SttWord[];
  if (fs.existsSync(WORDS_PATH)) {
    console.log(`[stt] Cached: ${WORDS_PATH}`);
    words = JSON.parse(fs.readFileSync(WORDS_PATH, "utf8"));
  } else {
    if (!state.sttOperationId) {
      const oggPath = mp3ToOgg(AUDIO_PATH);
      const oggBuf = fs.readFileSync(oggPath);
      const oggKey = `podcast-stt/youtube-YFjVMuVM4aI-${Date.now()}.ogg`;
      const s3Uri = await uploadOggToYandex(oggBuf, oggKey);
      try { fs.unlinkSync(oggPath); } catch {}

      const opId = await submitDeferredSTT(s3Uri);
      state.sttOperationId = opId;
      state.oggKey = oggKey;
      saveState(state);
      console.log(`[stt] Operation: ${opId}`);
    } else {
      console.log(`[stt] Resume STT operation: ${state.sttOperationId}`);
    }

    // Poll
    let result: { done: boolean; words?: SttWord[]; error?: string } | null = null;
    while (true) {
      result = await checkSTT(state.sttOperationId);
      if (result.done) break;
      console.log(`[stt] poll → not done, sleeping 30s…`);
      await new Promise((r) => setTimeout(r, 30000));
    }
    if (result.error) {
      throw new Error(`Yandex STT error: ${result.error}`);
    }
    words = result.words || [];
    if (words.length === 0) throw new Error("STT returned 0 words");
    fs.writeFileSync(WORDS_PATH, JSON.stringify(words, null, 2));
    console.log(`[stt] ${words.length} so'z saqlandi → ${WORDS_PATH}`);
  }

  let lines: SttLine[];
  if (fs.existsSync(LINES_PATH)) {
    lines = JSON.parse(fs.readFileSync(LINES_PATH, "utf8"));
  } else {
    lines = wordsToLines(words);
    fs.writeFileSync(LINES_PATH, JSON.stringify(lines, null, 2));
    console.log(`[stt] ${lines.length} jumla → ${LINES_PATH}`);
  }
  const durationSec = lines.length ? lines[lines.length - 1].end : 0;
  console.log(`[stt] Davomiyligi: ${fmtTimestamp(durationSec)}`);

  // ─── Diarization ───
  let diarized: string;
  if (fs.existsSync(DIARIZATION_PATH)) {
    console.log(`[diarize] Cached: ${DIARIZATION_PATH}`);
    diarized = fs.readFileSync(DIARIZATION_PATH, "utf8");
  } else {
    diarized = await diarizePro(lines);
    fs.writeFileSync(DIARIZATION_PATH, diarized);
    console.log(`[diarize] saqlandi → ${DIARIZATION_PATH} (${(diarized.length / 1024).toFixed(1)} KB)`);
  }

  // ─── Analysis (Vertex Pro batch) ───
  if (fs.existsSync(ANALYSIS_PATH)) {
    console.log(`[analyze] Cached: ${ANALYSIS_PATH} — skip`);
  } else {
    const analysis = await runAnalysisBatch(diarized, state);
    fs.writeFileSync(ANALYSIS_PATH, analysis);
    console.log(`[analyze] saqlandi → ${ANALYSIS_PATH} (${(analysis.length / 1024).toFixed(1)} KB)`);
  }

  console.log(`\n✅ Yakunlandi:\n  ${DIARIZATION_PATH}\n  ${ANALYSIS_PATH}`);
})().catch((e) => {
  console.error("Pipeline xatolik:", e);
  process.exit(1);
});
