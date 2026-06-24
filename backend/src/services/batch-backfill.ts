/**
 * Batch Backfill v2 — Production pipeline
 *
 * Stage 1: Yandex v3 gRPC streaming (parallel 5 at a time, throttled)
 * Stage 2: Gemini 2.5 Flash BATCH prediction (one job for all audios)
 * Stage 3: Gemini 2.5 Pro BATCH prediction (one job for all transcriptions)
 *
 * Design goals:
 * - Avoid quota limits (throttled parallelism + batch APIs)
 * - Resume-friendly: checkpoints at each stage
 * - Deferred-friendly: single batch jobs take 15-25 min
 */
import * as fs from "fs";
import * as path from "path";
import { execSync, exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
import * as grpc from "@grpc/grpc-js";
import { Storage } from "@google-cloud/storage";
import { JobServiceClient } from "@google-cloud/aiplatform";
import { prisma } from "../utils/prisma";
import { safeParseJson } from "../utils/json-repair";
import { recordAudioCost } from "./cost-tracker";
import { runStage4_JudgeBatch } from "./judge-batch";
import axios from "axios";
import * as httpMod from "http";
import * as httpsMod from "https";
import { getFileBuffer, getKeyFromUrl } from "./storage";

// Keep-alive agentlar — onlinepbx/bitrix CDN connection reuse muammolarini yechadi
const keepAliveHttps = new httpsMod.Agent({
  keepAlive: true,
  maxSockets: 5,
  maxFreeSockets: 3,
  timeout: 60000,
});
const keepAliveHttp = new httpMod.Agent({
  keepAlive: true,
  maxSockets: 5,
});

// Audio URL'dan buffer olish — tashqi URL (Bitrix) bo'lsa axios, aks holda S3
async function fetchAudioBuffer(fileUrl: string, attempt: number = 1): Promise<Buffer> {
  const isExternalUrl =
    /^https?:\/\//.test(fileUrl) &&
    !fileUrl.includes("yandexcloud.net");
  if (isExternalUrl) {
    try {
      const resp = await axios.get(fileUrl, {
        responseType: "arraybuffer",
        timeout: 60000,
        httpsAgent: keepAliveHttps,
        httpAgent: keepAliveHttp,
        headers: {
          "User-Agent": "Mozilla/5.0 SalesAi/1.0",
          Connection: "keep-alive",
        },
        validateStatus: () => true,
      });
      if (resp.status >= 400) {
        throw new Error(`External audio fetch failed: ${resp.status}`);
      }
      return Buffer.from(resp.data);
    } catch (err: any) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        return fetchAudioBuffer(fileUrl, attempt + 1);
      }
      throw err;
    }
  }
  const key = getKeyFromUrl(fileUrl);
  return getFileBuffer(key);
}
import {
  getCriteriaPrompt,
  applyAnalysisFallbacks,
  buildAnalysisPrompt,
  buildAnalysisPromptV2,
} from "./call-analyzer";

import { RecognizerClient } from "@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt_service";
import {
  StreamingRequest,
  StreamingResponse,
  RawAudio_AudioEncoding,
} from "@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt";

import AWS from "aws-sdk";
import https from "https";

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "AQVNzJY66YR6RQ9jA1UZW-uYbgaMCtrk8OpcR-4m";
const YANDEX_FOLDER_ID = process.env.YANDEX_FOLDER_ID || "b1g2pqsf7rl50fkdr84t";
const YANDEX_BUCKET_STT = process.env.YANDEX_BUCKET || "sales-ai-storage";
const PROJECT_ID = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const LOCATION = process.env.VERTEX_LOCATION || "us-central1";
const BUCKET = process.env.GCS_BATCH_BUCKET || "salesai-vision-stt";

// Flash 3 batch migration toggle
const USE_FLASH_3_BATCH = process.env.USE_FLASH_3_BATCH === "1";
const BATCH_LOCATION = USE_FLASH_3_BATCH ? "global" : LOCATION;
const BATCH_API_ENDPOINT = USE_FLASH_3_BATCH
  ? "aiplatform.googleapis.com"
  : `${LOCATION}-aiplatform.googleapis.com`;
const BATCH_MODEL_FLASH = USE_FLASH_3_BATCH
  ? "publishers/google/models/gemini-3-flash-preview"
  : "publishers/google/models/gemini-2.5-flash";
// Stage 3 ham Flash 3 (Pro 2.5 = Flash 3 sifati, 5x arzon)
const BATCH_MODEL_STAGE3 = USE_FLASH_3_BATCH
  ? "publishers/google/models/gemini-3-flash-preview"
  : "publishers/google/models/gemini-2.5-pro";

const YANDEX_PARALLEL = 15;
const YANDEX_DELAY_MS = 100;
const CHECKPOINT_DIR = "/tmp/salesai-batch-checkpoint";

// Yandex S3 client
const yandexS3 = new AWS.S3({
  endpoint: process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net",
  accessKeyId: process.env.YANDEX_STORAGE_KEY_ID,
  secretAccessKey: process.env.YANDEX_STORAGE_SECRET,
  region: "ru-central1",
  s3ForcePathStyle: true,
  httpOptions: { timeout: 600000, connectTimeout: 60000 },
  maxRetries: 5,
});

interface Word {
  word: string;
  startMs: number;
  endMs: number;
}

interface AudioMeta {
  id: string;
  fileName: string;
  fileUrl: string;
  duration: number | null;
  managerName: string;
  category: string | null;
  words?: Word[];
  transcription?: string;
}

const running = new Map<string, boolean>();
const progress = new Map<string, { total: number; processed: number; stage: string }>();

export const getBatchProgress = (companyId: string) => {
  return progress.get(companyId) || { total: 0, processed: 0, stage: "idle" };
};

export const stopBatchBackfill = (companyId: string) => {
  running.set(companyId, false);
};

// === STAGE 1: Yandex v3 gRPC STT (parallel) ===
async function transcribeYandexV3(pcmBuffer: Buffer): Promise<Word[]> {
  return new Promise((resolve, reject) => {
    const client = new RecognizerClient(
      "stt.api.cloud.yandex.net:443",
      grpc.credentials.createSsl()
    );
    const metadata = new grpc.Metadata();
    metadata.set("authorization", `Api-Key ${YANDEX_API_KEY}`);

    const stream = client.recognizeStreaming(metadata);
    const allWords: Word[] = [];

    stream.on("data", (response: StreamingResponse) => {
      if (response.finalRefinement?.normalizedText?.alternatives) {
        for (const alt of response.finalRefinement.normalizedText.alternatives) {
          for (const w of alt.words || []) {
            allWords.push({
              word: w.text || "",
              startMs: Number(w.startTimeMs || 0),
              endMs: Number(w.endTimeMs || 0),
            });
          }
        }
      }
    });

    stream.on("error", reject);
    stream.on("end", () => {
      const seen = new Set<string>();
      const unique = allWords.filter((w) => {
        const key = `${w.startMs}-${w.word}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      resolve(unique);
    });

    const sessionOptions: StreamingRequest = {
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
    } as any;

    stream.write(sessionOptions);

    const CHUNK_SIZE = 32 * 1024;
    let offset = 0;
    const sendNext = () => {
      if (offset >= pcmBuffer.length) {
        stream.end();
        return;
      }
      const chunk = pcmBuffer.slice(offset, Math.min(offset + CHUNK_SIZE, pcmBuffer.length));
      stream.write({
        $type: "speechkit.stt.v3.StreamingRequest",
        chunk: { $type: "speechkit.stt.v3.AudioChunk", data: chunk },
      } as any);
      offset += CHUNK_SIZE;
      setImmediate(sendNext);
    };
    sendNext();
  });
}

// === Yandex Deferred (longRunningRecognize) STT ===
async function uploadToYandexS3(buffer: Buffer, key: string): Promise<string> {
  await yandexS3.putObject({
    Bucket: YANDEX_BUCKET_STT,
    Key: key,
    Body: buffer,
  }).promise();
  return `https://storage.yandexcloud.net/${YANDEX_BUCKET_STT}/${key}`;
}

async function submitDeferredSTT(s3Uri: string, mp3Mode = false): Promise<string> {
  const specification: any = {
    languageCode: "uz-UZ",
    model: "general",
    audioChannelCount: 1,
    rawResults: true,
  };
  if (mp3Mode) {
    specification.audioEncoding = "MP3";
  } else {
    specification.audioEncoding = "OGG_OPUS";
    specification.sampleRateHertz = 48000;
  }
  const body = JSON.stringify({
    config: { specification },
    audio: { uri: s3Uri },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "transcribe.api.cloud.yandex.net",
      path: "/speech/stt/v2/longRunningRecognize",
      method: "POST",
      headers: {
        Authorization: `Api-Key ${YANDEX_API_KEY}`,
        "x-folder-id": YANDEX_FOLDER_ID,
        "Content-Type": "application/json",
      },
    }, (res) => {
      let data = "";
      res.on("data", (d) => data += d);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.id) resolve(parsed.id);
          else reject(new Error(parsed.message || JSON.stringify(parsed)));
        } catch { reject(new Error(data)); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function pollDeferredSTT(operationId: string, maxAttempts = 120): Promise<Word[]> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const result = await new Promise<any>((resolve, reject) => {
      const req = https.request({
        hostname: "operation.api.cloud.yandex.net",
        path: `/operations/${operationId}`,
        method: "GET",
        headers: { Authorization: `Api-Key ${YANDEX_API_KEY}` },
      }, (res) => {
        let data = "";
        res.on("data", (d) => data += d);
        res.on("end", () => {
          try { resolve(JSON.parse(data)); } catch { resolve({}); }
        });
      });
      req.on("error", reject);
      req.end();
    });

    if (result.done) {
      const words: Word[] = [];
      const chunks = result.response?.chunks || [];
      for (const chunk of chunks) {
        for (const alt of chunk.alternatives || []) {
          for (const w of alt.words || []) {
            words.push({
              word: w.word || "",
              startMs: parseInt(w.startTime?.replace("s", "").replace(".", "") || "0"),
              endMs: parseInt(w.endTime?.replace("s", "").replace(".", "") || "0"),
            });
          }
        }
      }
      return words;
    }
    if (result.error) throw new Error(result.error.message || "STT failed");
  }
  throw new Error("STT polling timeout");
}

// Fallback: v3 streaming (agar deferred ishlamasa)
async function processOneSTT_streaming(audio: AudioMeta, tmpDir: string): Promise<Word[]> {
  const mp3Path = path.join(tmpDir, `${audio.id}.mp3`);
  const pcmPath = path.join(tmpDir, `${audio.id}.pcm`);
  try {
    const buffer = await fetchAudioBuffer(audio.fileUrl);
    fs.writeFileSync(mp3Path, buffer);
    execSync(`ffmpeg -y -i "${mp3Path}" -ac 1 -ar 16000 -af "loudnorm=I=-16:LRA=11:TP=-1.5" -f s16le "${pcmPath}" 2>/dev/null`);
    const pcmBuf = fs.readFileSync(pcmPath);
    const words = await transcribeYandexV3(pcmBuf);
    try { fs.unlinkSync(mp3Path); fs.unlinkSync(pcmPath); } catch {}
    return words;
  } catch (err) {
    console.error(`[STT] ${audio.fileName}:`, (err as Error).message?.substring(0, 100));
    return [];
  }
}

// Yandex STT quota: 500 submits/hour. 8s gap = 450/hour (safe under limit).
const STT_SUBMIT_INTERVAL_MS = 8000;

async function runStage1_STT(audios: AudioMeta[], companyId: string): Promise<void> {
  console.log(`[Stage 1] Yandex Deferred STT: ${audios.length} audios`);
  const tmpDir = `/tmp/salesai-batch-${companyId}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  // RESUME: agar stage1 checkpoint mavjud bo'lsa va barcha audiolar unda bo'lsa, STT'ni o'tkazib yuboramiz.
  try {
    const ckpPath = path.join(CHECKPOINT_DIR, `${companyId}-stage1.json`);
    if (fs.existsSync(ckpPath)) {
      const ckp = JSON.parse(fs.readFileSync(ckpPath, "utf8")) as Array<{ id: string; words?: Word[] }>;
      const wordsMap = new Map(ckp.map((c) => [c.id, c.words]));
      const missing = audios.filter((a) => !wordsMap.has(a.id));
      if (missing.length === 0) {
        let resumed = 0;
        for (const a of audios) {
          const w = wordsMap.get(a.id);
          if (w) { a.words = w; resumed++; }
        }
        console.log(`[Stage 1] RESUMED from checkpoint — ${resumed}/${audios.length} audios (STT skip)`);
        return;
      } else {
        console.log(`[Stage 1] Checkpoint mavjud, lekin ${missing.length} ta yangi audio bor — to'liq STT`);
      }
    }
  } catch (e: any) {
    console.error(`[Stage 1] Checkpoint load fail: ${e?.message?.substring(0, 80)} — to'liq STT`);
  }

  // 1. Build S3 URIs for STT.
  // Fast path: agar fayl allaqachon Yandex S3'da .mp3 sifatida bo'lsa — re-upload qilmaymiz,
  // to'g'ridan-to'g'ri existing URI'ni Yandex STT'ga beramiz (MP3 encoding bilan).
  // Fallback: external URL / boshqa format — buffer'ni olib MP3 sifatida S3'ga yuklab qo'yamiz.
  console.log(`[Stage 1] Preparing S3 URIs (fast path if .mp3 on Yandex)...`);
  const uploads: Array<{ audio: AudioMeta; s3Uri: string; mp3Mode: boolean }> = [];
  const UPLOAD_PARALLEL = Math.min(YANDEX_PARALLEL, 15);
  let uploadIdx = 0;
  let uploadDone = 0;
  let fastCount = 0;
  let uploadCount = 0;
  async function uploadWorker() {
    while (running.get(companyId)) {
      const i = uploadIdx++;
      if (i >= audios.length) return;
      const audio = audios[i];
      try {
        const url = audio.fileUrl || "";
        const isYandexMp3 =
          url.includes("yandexcloud.net") &&
          url.toLowerCase().endsWith(".mp3");
        if (isYandexMp3) {
          uploads.push({ audio, s3Uri: url, mp3Mode: true });
          fastCount++;
        } else {
          // Fallback — fayl tashqi URL yoki boshqa format. Buffer'ni olamiz va MP3 sifatida saqlaymiz.
          const buffer = await fetchAudioBuffer(audio.fileUrl);
          const s3Key = `stt-batch/${companyId}/${audio.id}.mp3`;
          const s3Uri = await uploadToYandexS3(buffer, s3Key);
          uploads.push({ audio, s3Uri, mp3Mode: true });
          uploadCount++;
        }
      } catch (e: any) {
        console.error(`[Stage 1] Prepare fail ${audio.fileName}: ${e?.message?.substring(0, 80)}`);
      }
      uploadDone++;
      if (uploadDone % 50 === 0 || uploadDone === audios.length) {
        console.log(`[Stage 1] Prepared ${uploadDone}/${audios.length} (fast=${fastCount}, upload=${uploadCount})`);
      }
    }
  }
  await Promise.all(Array(UPLOAD_PARALLEL).fill(0).map(uploadWorker));
  console.log(`[Stage 1] Ready ${uploads.length}/${audios.length} (fast=${fastCount}, uploaded=${uploadCount})`);

  // 2. Submit all deferred STT jobs — paced at STT_SUBMIT_INTERVAL_MS to stay under 500/hour limit.
  // On 429 / quota error: exponential backoff (wait the full hour, else retry next iteration).
  console.log(`[Stage 1] Submitting deferred STT jobs (pace=${STT_SUBMIT_INTERVAL_MS}ms = ~${Math.floor(3600000/STT_SUBMIT_INTERVAL_MS)}/hour)...`);
  const jobs: Array<{ audio: AudioMeta; opId: string }> = [];
  let fallbackCount = 0;
  for (let i = 0; i < uploads.length; i++) {
    if (!running.get(companyId)) break;
    const startedAt = Date.now();
    let submittedOk = false;
    try {
      const opId = await submitDeferredSTT(uploads[i].s3Uri, uploads[i].mp3Mode);
      jobs.push({ audio: uploads[i].audio, opId });
      submittedOk = true;
    } catch (e: any) {
      const msg = e?.message || "";
      const isQuota = /limit on requests|exceeded|429|RESOURCE_EXHAUSTED/i.test(msg);
      if (isQuota) {
        // Back off: wait ~10 min then retry SAME index
        console.error(`[Stage 1] Quota hit — waiting 10 min: ${msg.substring(0, 80)}`);
        await new Promise((r) => setTimeout(r, 10 * 60 * 1000));
        i--; // retry current
        continue;
      } else {
        console.error(`[Stage 1] Deferred fail, using streaming: ${msg.substring(0, 60)}`);
        try {
          uploads[i].audio.words = await processOneSTT_streaming(uploads[i].audio, tmpDir);
          fallbackCount++;
        } catch (e2: any) {
          console.error(`[Stage 1] Streaming fallback also failed: ${e2?.message?.substring(0, 60)}`);
        }
      }
    }
    // Rate limiting — enforce minimum interval only after successful submit
    if (submittedOk) {
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, STT_SUBMIT_INTERVAL_MS - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    if ((i + 1) % 20 === 0) console.log(`[Stage 1] Submitted ${i + 1}/${uploads.length}`);
  }
  console.log(`[Stage 1] Submitted ${jobs.length} deferred, ${fallbackCount} streaming fallback`);

  // 3. Poll all jobs for results (parallel)
  console.log(`[Stage 1] Polling results (parallel=${YANDEX_PARALLEL})...`);
  let completed = 0;
  let pollIdx = 0;
  async function pollWorker() {
    while (running.get(companyId)) {
      const i = pollIdx++;
      if (i >= jobs.length) return;
      const job = jobs[i];
      try {
        job.audio.words = await pollDeferredSTT(job.opId);
      } catch (e: any) {
        console.error(`[Stage 1] Poll fail ${job.audio.fileName}: ${e?.message?.substring(0, 60)}`);
        job.audio.words = await processOneSTT_streaming(job.audio, tmpDir);
      }
      completed++;
      progress.set(companyId, { total: audios.length, processed: completed, stage: "stt" });
      if (completed % 10 === 0 || completed === jobs.length) {
        console.log(`[Stage 1] Polled ${completed}/${jobs.length}`);
      }
    }
  }
  await Promise.all(Array(YANDEX_PARALLEL).fill(0).map(pollWorker));
  console.log(`[Stage 1] Done: ${completed}/${jobs.length} deferred + ${fallbackCount} streaming`);

  // Xarajat yozish — STT (deferred batch)
  for (const job of jobs) {
    if (!job.audio.words || job.audio.words.length === 0) continue;
    const dur = job.audio.duration || 0;
    if (dur <= 0) continue;
    void recordAudioCost({
      audioFileId: job.audio.id,
      companyId,
      stt: { mode: "batch", durationSec: dur, provider: "yandex" },
    });
  }

  // Checkpoint saqlash
  const checkpoint = audios.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    duration: a.duration,
    managerName: a.managerName,
    wordsCount: a.words?.length || 0,
    words: a.words,
  }));
  fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(CHECKPOINT_DIR, `${companyId}-stage1.json`),
    JSON.stringify(checkpoint, null, 2)
  );
  console.log(`[Stage 1] Checkpoint saved`);
}

// === STAGE 2: Flash BATCH prediction (diarization + refinement) ===
async function runStage2_FlashBatch(
  audios: AudioMeta[],
  companyId: string
): Promise<void> {
  console.log(`[Stage 2] Flash BATCH: ${audios.length} audios`);
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);

  // Har audio uchun prompt yaratish
  const requests: any[] = [];
  for (const audio of audios) {
    if (!audio.words || audio.words.length === 0) continue;

    const yandexAnchors = audio.words
      .map((w) => {
        const mm = Math.floor(w.startMs / 60000);
        const ss = Math.floor((w.startMs % 60000) / 1000);
        return `${w.word}[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}]`;
      })
      .join(" ");

    const prompt = `You are an EXPERT audio transcription and diarization specialist for Uzbek sales calls. Produce a PERFECT Uzbek transcription using Yandex STT word timings as anchors.

CONTEXT:
- Company: B2C sales (Uzbekistan)
- Manager: "${audio.managerName}"
- Audio duration: ${audio.duration || 0}s
- Call type: OUTGOING sales call

CALL FLOW:
1. Ringing (0-10s, NO SPEECH)
2. Client answers "Alo"
3. Manager greets

DOMAIN VOCAB (spell correctly):
- Brand: brand names
- Levels: intermediate, upper-intermediate, B1, B2, C1
- Skills: speaking, reading, writing, listening
- Products: placement test, intensiv kurs, onlayn/oflayn, praktika, fokus, strategiya
- Tech: Telegram, Android, iPhone, link, login, parol, Zoom
- Uzbek fillers: ha, xo'p, mayli, bo'ldi, shunaqa, albatta

STRICT RULES:
1. LISTEN to audio — Yandex text may have errors
2. If Yandex gives gibberish (e.g. "plastikiga", "spid", "chekingiz"), WRITE what you hear
3. NEVER invent sentences. Skip unclear sections.
4. Fix brand names: "brand", "IELTS"
5. Timestamp = first word's [MM:SS] from Yandex anchors
6. CALL OPENING: First "Alo" = CLIENT answering. Manager may say "Alo" back or go straight to greeting. TWO "Alo"s in a row usually means: client+manager. LISTEN to voice to distinguish.
7. NEVER output two consecutive segments with the same speaker AND similar short text (e.g. "Alo" twice, "Aha" twice). Merge them or assign the second to the OTHER speaker based on voice.
8. MERGE consecutive same-speaker segments into ONE longer segment. Do NOT split a single speaker's continuous speech.
9. Skip words before the first real "Alo" (ringing/hallucinations)
10. Short acknowledgments ("Aha", "Ha", "Uhu") alone in a segment — only include if clearly heard, and attribute to listener (the one NOT speaking)
11. Return EXACT audioId in response
12. CRITICAL — FULL COVERAGE: The Yandex anchors below cover the ENTIRE audio (${audio.duration || 0}s). Your output MUST diarize the FULL conversation from start to end. Do NOT stop after a few minutes. Every group of consecutive Yandex words = one or more segments.

YANDEX WORD ANCHORS:
${yandexAnchors}

AUDIO ID: ${audio.id}

Return JSON with "audioId" and "segments" array.`;

    requests.push({
      request: {
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { mimeType: "audio/mpeg", fileUri: `gs://${BUCKET}/backfill/${audio.id}.mp3` } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 32768, // Uzun audiolar (20+ daq) uchun katta limit
          responseMimeType: "application/json",
        },
      },
    });
  }

  if (requests.length === 0) {
    console.log("[Stage 2] No requests");
    return;
  }

  // Upload audios to GCS (Flash batch fileData kerak)
  // Audio compression: 32kbps MP3 — 2-3x kichik file, sifat tahlil uchun yetadi
  console.log(`[Stage 2] Uploading ${audios.length} compressed audios to GCS...`);
  const UPLOAD_PARALLEL = 20;
  let uploaded = 0;
  const tmpDir = `/tmp/salesai-compress-${companyId}`;
  fs.mkdirSync(tmpDir, { recursive: true });

  for (let i = 0; i < audios.length; i += UPLOAD_PARALLEL) {
    if (!running.get(companyId)) break;
    const group = audios.slice(i, i + UPLOAD_PARALLEL);
    await Promise.all(
      group.map(async (a) => {
        try {
          const buffer = await fetchAudioBuffer(a.fileUrl);
          // Gemini Flash batch GCS URI qabul qiladi; fayl hajmi chegarasi yo'q → kompressiya shart emas.
          // MP3'ni to'g'ridan-to'g'ri Yandex S3 → GCS ga ko'chiramiz.
          await bucket.file(`backfill/${a.id}.mp3`).save(buffer, { contentType: "audio/mpeg" });
          uploaded++;
        } catch (e) {
          console.error(`[Upload] ${a.fileName}:`, (e as Error).message?.substring(0, 300));
        }
      })
    );
    progress.set(companyId, {
      total: audios.length,
      processed: uploaded,
      stage: "upload",
    });
  }
  console.log(`[Stage 2] Uploaded ${uploaded}/${audios.length}`);

  // JSONL yozish
  const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
  const inputFile = `backfill-batch/flash-input-${Date.now()}.jsonl`;
  await bucket.file(inputFile).save(jsonl);
  console.log(`[Stage 2] JSONL uploaded: ${requests.length} requests`);

  // Batch job (Flash 3 / Flash 2.5 toggle bilan)
  const jobClient = new JobServiceClient({
    apiEndpoint: BATCH_API_ENDPOINT,
  });
  const outputPrefix = `backfill-batch/flash-output-${Date.now()}/`;

  const [createdJob] = await jobClient.createBatchPredictionJob({
    parent: `projects/${PROJECT_ID}/locations/${BATCH_LOCATION}`,
    batchPredictionJob: {
      displayName: `v2-flash-${companyId}-${Date.now()}`,
      model: BATCH_MODEL_FLASH,
      inputConfig: {
        instancesFormat: "jsonl",
        gcsSource: { uris: [`gs://${BUCKET}/${inputFile}`] },
      },
      outputConfig: {
        predictionsFormat: "jsonl",
        gcsDestination: { outputUriPrefix: `gs://${BUCKET}/${outputPrefix}` },
      },
    },
  });

  console.log(`[Stage 2] Job created: ${createdJob.name}`);
  progress.set(companyId, {
    total: audios.length,
    processed: 0,
    stage: "flash-batch-waiting",
  });

  // Poll — up to 4 hours (long enough for big Flash batches)
  const MAX_ATTEMPTS = 960; // 960 * 15s = 4 hours
  let attempts = 0;
  let succeeded = false;
  while (attempts < MAX_ATTEMPTS) {
    if (!running.get(companyId)) break;
    await new Promise((r) => setTimeout(r, 15000));
    const [job] = await jobClient.getBatchPredictionJob({ name: createdJob.name });
    if (attempts % 4 === 0) console.log(`[Stage 2] ${job.state}`);
    if (job.state === "JOB_STATE_SUCCEEDED") {
      succeeded = true;
      break;
    }
    if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") {
      throw new Error(`Flash batch failed: ${JSON.stringify(job.error)}`);
    }
    attempts++;
  }
  if (!succeeded) {
    throw new Error(
      `Flash batch polling timed out after ${MAX_ATTEMPTS} attempts. Job: ${createdJob.name}. Run recover-flash-and-run-pro.ts to recover.`
    );
  }

  // Wait briefly for predictions file to be flushed to GCS
  await new Promise((r) => setTimeout(r, 5000));

  // Read results — search recursively for predictions.jsonl in subfolders
  const [files] = await bucket.getFiles({ prefix: outputPrefix });
  const predFile =
    files.find((f) => f.name.endsWith("predictions.jsonl")) ||
    files.find((f) => f.name.includes("predictions"));
  if (!predFile) {
    throw new Error(
      `Flash predictions not found under ${outputPrefix}. Files: ${files.map((f) => f.name).join(", ")}`
    );
  }

  const [content] = await predFile.download();
  const outLines = content.toString().split("\n").filter((l) => l.trim());

  const audioMap = new Map(audios.map((a) => [a.id, a]));

  function mapSpeaker(s: string): string {
    const lower = (s || "").toLowerCase();
    if (lower === "manager" || lower === "menejer") return "Menejer";
    if (lower === "client" || lower === "mijoz") return "Mijoz";
    if (lower === "system" || lower === "tizim") return "Tizim";
    return "Menejer";
  }

  function toMmSs(rawTs: string): string {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(rawTs)) {
      const parts = rawTs.split(":").map((p) => parseInt(p));
      let totalSec: number;
      if (parts.length === 3) totalSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else totalSec = parts[0] * 60 + parts[1];
      const mm = Math.floor(totalSec / 60);
      const ss = totalSec % 60;
      return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
    const n = parseFloat(rawTs);
    if (isFinite(n)) {
      const mm = Math.floor(n / 60);
      const ss = Math.floor(n % 60);
      return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    }
    return rawTs;
  }

  // Robust regex parser that handles Gemini's varying JSON formats:
  //  - field order variations (speaker/start/text vs start/end/speaker/text)
  //  - timestamp field names (timestamp, start, startTime, time)
  //  - numeric timestamps (14.0) vs string ("00:14")
  //  - optional end field
  //  - unescaped quotes in text values
  const blockPattern = /\{([\s\S]*?"text"\s*:\s*"[\s\S]*?")\s*\}\s*(?=,|\])/g;

  // Vertex AI batch line order = audio order. Flash 3 echo qilmaydi → index fallback.
  for (let lineIdx = 0; lineIdx < outLines.length; lineIdx++) {
    const line = outLines[lineIdx];
    try {
      const parsed = JSON.parse(line);
      const text =
        parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) continue;

      const reqText = parsed.request?.contents?.[0]?.parts?.find((p: any) => p.text)?.text || "";
      const aidFromResp = text.match(/"audioId"\s*:\s*"([^"]+)"/);
      const aidFromReq = reqText.match(/AUDIO ID:\s*([a-z0-9]+)/);
      const audioId =
        (aidFromResp && aidFromResp[1]) ||
        (aidFromReq && aidFromReq[1]) ||
        audios[lineIdx]?.id ||
        null;
      if (!audioId) continue;

      // Cost tracking — Flash batch
      const usage = parsed.response?.usageMetadata;
      const inTok = usage?.promptTokenCount || 0;
      const outTok = usage?.candidatesTokenCount || 0;
      const flashAudio = audios.find((a) => a.id === audioId);
      if (flashAudio && (inTok > 0 || outTok > 0)) {
        void recordAudioCost({
          audioFileId: flashAudio.id,
          companyId,
          flash: {
            mode: "batch",
            inputTokens: inTok,
            outputTokens: outTok,
            audioSec: flashAudio.duration || undefined,
          },
        });
      }
      const audio = audioMap.get(audioId);
      if (!audio) continue;

      const segments: Array<{ speaker: string; timestamp: string; text: string }> = [];
      let m: RegExpExecArray | null;
      blockPattern.lastIndex = 0;
      while ((m = blockPattern.exec(text)) !== null) {
        const block = m[1];
        const speakerM = block.match(/"speaker"\s*:\s*"([^"]+)"/);
        const tsM = block.match(/"(?:timestamp|start|startTime|time)"\s*:\s*(?:"([^"]+)"|([\d.]+))/);
        const textM = block.match(/"text"\s*:\s*"([\s\S]*)"$/);
        if (!speakerM || !textM || !tsM) continue;
        const rawTs = tsM[1] || tsM[2] || "00:00";
        segments.push({
          speaker: speakerM[1],
          timestamp: toMmSs(rawTs),
          text: textM[1].replace(/\\"/g, '"').replace(/\\n/g, " ").trim(),
        });
      }
      if (segments.length === 0) continue;

      // Post-process: consecutive duplicate segmentlarni birlashtirish
      // Flash ba'zan bir xil speaker + bir xil/qisqa matnni ikki marta qaytaradi
      // ("Alo", "Aha" kabi qisqa javoblarda)
      const deduped: Array<{ speaker: string; timestamp: string; text: string }> = [];
      for (const s of segments) {
        if (!s.text || !s.text.trim() || !s.timestamp) continue;
        const sp = mapSpeaker(s.speaker);
        const normalized = s.text.trim().toLowerCase().replace(/[.,!?]+$/g, "");
        const prev = deduped[deduped.length - 1];
        if (prev) {
          const prevNorm = prev.text.trim().toLowerCase().replace(/[.,!?]+$/g, "");
          // Bir xil speaker, bir xil (yoki prefix) matn — merge (eng erta timestamp saqlanadi)
          if (mapSpeaker(prev.speaker) === sp && (prevNorm === normalized || prevNorm.includes(normalized) || normalized.includes(prevNorm))) {
            // Skip — avvalgi segmentga qo'shib qo'yamiz
            if (normalized.length > prevNorm.length) prev.text = s.text;
            continue;
          }
          // Bir xil speaker + 2 soniya ichida — kengaytirish
          const toSec = (ts: string) => { const [m, se] = ts.split(":").map(Number); return m * 60 + se; };
          if (mapSpeaker(prev.speaker) === sp && toSec(s.timestamp) - toSec(prev.timestamp) <= 2 && s.text.length < 20 && prev.text.length < 20) {
            prev.text = `${prev.text} ${s.text}`.trim();
            continue;
          }
        }
        deduped.push({ speaker: sp, timestamp: s.timestamp, text: s.text });
      }

      const outLinesArr: string[] = [];
      let firstTs = 0;
      if (deduped[0]?.timestamp) {
        const parts = deduped[0].timestamp.split(":");
        firstTs = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      }
      if (firstTs > 2) outLinesArr.push(`[00:00] Tizim: (ringing)`);
      for (const s of deduped) {
        outLinesArr.push(`[${s.timestamp}] ${s.speaker}: ${s.text}`);
      }

      // Coverage check: agar Flash output audio davomiyligining yarmidan
      // kam qoplagan bo'lsa (uzun audiolarda Flash ba'zan erta to'xtaydi),
      // Yandex anchorslarini xom holda ishlatamiz — diarization yo'q,
      // lekin to'liq qamrov bor.
      const lastSeg = deduped[deduped.length - 1];
      const lastSegSec = lastSeg
        ? (() => {
            const p = lastSeg.timestamp.split(":");
            return parseInt(p[0]) * 60 + parseInt(p[1]);
          })()
        : 0;
      const audioDur = audio.duration || 0;
      const coverageOk = audioDur === 0 || lastSegSec >= audioDur * 0.5;
      if (!coverageOk && audio.words && audio.words.length > 0) {
        console.warn(
          `[Stage 2] ${audioId}: Flash kam qopladi (${lastSegSec}s / ${audioDur}s) — Yandex xom anchorslarga fallback`,
        );
        const lines: Array<{ start: number; text: string }> = [];
        let cur = { start: 0, text: "" };
        for (const w of audio.words) {
          const startSec = w.startMs / 1000;
          if (!cur.text) cur.start = startSec;
          cur.text += (cur.text ? " " : "") + w.word;
          if (w.word.match(/[.!?]$/) || cur.text.split(" ").length > 25) {
            lines.push({ ...cur });
            cur = { start: 0, text: "" };
          }
        }
        if (cur.text) lines.push(cur);

        outLinesArr.length = 0;
        if (lines[0]?.start && lines[0].start > 2) {
          outLinesArr.push(`[00:00] Tizim: (ringing)`);
        }
        for (const l of lines) {
          const mm = Math.floor(l.start / 60);
          const ss = Math.floor(l.start % 60);
          const ts = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
          outLinesArr.push(`[${ts}] Menejer: ${l.text}`);
        }
      }

      audio.transcription = outLinesArr.join("\n");
      await prisma.audioFile.update({
        where: { id: audioId },
        data: { transcription: audio.transcription },
      });
    } catch (e) {
      console.error("[Stage 2 parse]", (e as Error).message?.substring(0, 80));
    }
  }

  // GCS audio fayllarini tozalash
  console.log(`[Stage 2] Cleanup GCS audios...`);
  for (const a of audios) {
    try {
      await bucket.file(`backfill/${a.id}.mp3`).delete();
    } catch {}
  }

  console.log(
    `[Stage 2] Done: ${audios.filter((a) => a.transcription).length}/${audios.length}`
  );
}

// === STAGE 3: Pro BATCH analysis ===
export async function runStage3_ProBatch(
  audios: AudioMeta[],
  companyId: string
): Promise<void> {
  console.log(`[Stage 3] Pro BATCH: ${audios.length} audios`);
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);

  // Har kategoriya uchun criteriani alohida olib kelamiz —
  // sotuv 8 mezon, qayta qo'ng'iroq alohida 5–8 mezon, boshqa 1 ta umumiy.
  // Avval bug bo'lgan: hardcoded "sotuv" — qayta calls sotuv mezoni bilan
  // tahlilga tushib, JSON kalitlari noto'g'ri saqlanardi.
  const criteriaByCategory: Record<
    string,
    { text: string; names: string[] }
  > = {};
  for (const cat of ["sotuv", "qayta", "boshqa"]) {
    const { text, criteriaNames } = await getCriteriaPrompt(companyId, cat);
    criteriaByCategory[cat] = { text, names: criteriaNames };
  }

  // Multi-product: har audio uchun productId orqali dinamik bilim.
  // Yo'q bo'lsa fallback Company.courseInfo. compact-course-info.txt — eski yo'l.
  const { getKnowledgeForAudio } = await import("./product-knowledge");

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { topPerformerPlaybook: true },
  });
  const playbook = (company?.topPerformerPlaybook as any) || null;

  const USE_PROMPT_V2_BATCH = process.env.USE_PROMPT_V2 !== "0";

  const V1_SYSTEM_INSTRUCTION = `Sen professional sotuvchi tahlilchisi. MUHIM QOIDALAR:
1. Javob FAQAT toza JSON bo'lishi kerak — hech qanday kirish matni yo'q
2. Markdown fence (\`\`\`json) ishlatma — faqat { bilan boshla, } bilan tugat`;

  const requests: any[] = [];
  for (const audio of audios) {
    if (!audio.transcription) continue;

    const cat = audio.category || "sotuv";
    const cInfo = criteriaByCategory[cat] || criteriaByCategory["sotuv"];

    // Har audio uchun alohida dinamik knowledge — productId orqali
    const courseInfo = await getKnowledgeForAudio(audio.id);

    if (USE_PROMPT_V2_BATCH) {
      const { systemInstruction, userMessage, responseSchema } = buildAnalysisPromptV2(
        audio.transcription,
        cInfo.names,
        cat,
        courseInfo,
        playbook,
        null,
      );
      const taggedUserMessage = `[AUDIO_ID: ${audio.id}]\n\n${userMessage}`;
      requests.push({
        request: {
          contents: [{ role: "user", parts: [{ text: taggedUserMessage }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 32768,
            responseMimeType: "application/json",
            responseSchema,
          },
        },
      });
    } else {
      const corePrompt = buildAnalysisPrompt(
        audio.transcription,
        cInfo.text,
        cat,
        cInfo.names,
        courseInfo,
        playbook,
      );
      const prompt = `[AUDIO_ID: ${audio.id}]\n\n${corePrompt}`;
      requests.push({
        request: {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: V1_SYSTEM_INSTRUCTION }] },
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 32768,
            responseMimeType: "application/json",
          },
        },
      });
    }
  }

  if (requests.length === 0) return;

  const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
  const inputFile = `backfill-batch/pro-input-${Date.now()}.jsonl`;
  await bucket.file(inputFile).save(jsonl);
  console.log(`[Stage 3] ${requests.length} requests uploaded`);

  const jobClient = new JobServiceClient({
    apiEndpoint: BATCH_API_ENDPOINT,
  });
  const outputPrefix = `backfill-batch/pro-output-${Date.now()}/`;

  const [createdJob] = await jobClient.createBatchPredictionJob({
    parent: `projects/${PROJECT_ID}/locations/${BATCH_LOCATION}`,
    batchPredictionJob: {
      displayName: USE_FLASH_3_BATCH ? `v3-flash-stage3-${companyId}-${Date.now()}` : `v2-pro-${companyId}-${Date.now()}`,
      model: BATCH_MODEL_STAGE3,
      inputConfig: {
        instancesFormat: "jsonl",
        gcsSource: { uris: [`gs://${BUCKET}/${inputFile}`] },
      },
      outputConfig: {
        predictionsFormat: "jsonl",
        gcsDestination: { outputUriPrefix: `gs://${BUCKET}/${outputPrefix}` },
      },
    },
  });

  console.log(`[Stage 3] Job: ${createdJob.name}`);
  progress.set(companyId, {
    total: audios.length,
    processed: 0,
    stage: "pro-batch-waiting",
  });

  // Poll — up to 4 hours (long enough for big Pro batches)
  const MAX_PRO_ATTEMPTS = 960;
  let attempts = 0;
  let proSucceeded = false;
  while (attempts < MAX_PRO_ATTEMPTS) {
    if (!running.get(companyId)) break;
    await new Promise((r) => setTimeout(r, 15000));
    const [job] = await jobClient.getBatchPredictionJob({ name: createdJob.name });
    if (attempts % 4 === 0) console.log(`[Stage 3] ${job.state}`);
    if (job.state === "JOB_STATE_SUCCEEDED") {
      proSucceeded = true;
      break;
    }
    if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") {
      throw new Error(`Pro batch failed: ${JSON.stringify(job.error)}`);
    }
    attempts++;
  }
  if (!proSucceeded) {
    throw new Error(
      `Pro batch polling timed out. Job: ${createdJob.name}. Run run-pro-batch.ts to recover.`
    );
  }

  // Wait briefly for predictions file to be flushed to GCS
  await new Promise((r) => setTimeout(r, 5000));

  const [files] = await bucket.getFiles({ prefix: outputPrefix });
  const predFile =
    files.find((f) => f.name.endsWith("predictions.jsonl")) ||
    files.find((f) => f.name.includes("predictions"));
  if (!predFile) {
    throw new Error(
      `Pro predictions not found under ${outputPrefix}. Files: ${files.map((f) => f.name).join(", ")}`
    );
  }

  const [content] = await predFile.download();
  const outLines = content.toString().split("\n").filter((l) => l.trim());

  let saved = 0;
  // Vertex AI batch line order = audio order. Flash 3 echo qilmaydi → index fallback.
  for (let lineIdx = 0; lineIdx < outLines.length; lineIdx++) {
    const line = outLines[lineIdx];
    try {
      const parsed = JSON.parse(line);
      const rawText =
        parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
        parsed.response?.text ||
        "";
      if (!rawText) continue;

      const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
      const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const m2 = reqText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
      const fallbackParsed = safeParseJson<any>(rawText);
      const audioId =
        (m1 && m1[1]) ||
        (m2 && m2[1]) ||
        fallbackParsed?.audioId ||
        audios[lineIdx]?.id ||
        null;
      if (!audioId) continue;

      // Cost tracking — Pro batch
      const usage = parsed.response?.usageMetadata;
      const inTok = usage?.promptTokenCount || 0;
      const outTok = usage?.candidatesTokenCount || 0;
      if (inTok > 0 || outTok > 0) {
        void recordAudioCost({
          audioFileId: audioId,
          companyId,
          pro: {
            mode: "batch",
            inputTokens: inTok,
            outputTokens: outTok,
          },
        });
      }

      // Asl audio transcription bilan
      const audio = await prisma.audioFile.findUnique({
        where: { id: audioId },
        select: { transcription: true },
      });

      // To'liq fallbacklar bilan — barcha 21 maydon
      let result;
      try {
        result = applyAnalysisFallbacks(rawText, audio?.transcription || "");
      } catch (e) {
        console.error(`[Stage 3 parse] ${audioId}: ${(e as Error).message?.substring(0, 80)}`);
        continue;
      }

      const fu = result.followupSignal;
      let followupDeadline: Date | null = null;
      if (fu?.requiresFollowup && fu.suggestedDeadlineDays > 0) {
        followupDeadline = new Date();
        followupDeadline.setDate(followupDeadline.getDate() + fu.suggestedDeadlineDays);
      }

      const data = {
        summary: result.summary,
        overallScore: result.overallScore,
        leadQuality: result.leadQuality,
        leadScore: result.leadScore,
        criteria: JSON.parse(JSON.stringify(result.criteria || {})) as any,
        errors: JSON.parse(JSON.stringify(result.errors || [])) as any,
        winPoints: JSON.parse(JSON.stringify(result.winPoints || [])) as any,
        lossPoints: JSON.parse(JSON.stringify(result.lossPoints || [])) as any,
        objections: JSON.parse(JSON.stringify(result.objectionsList || [])) as any,
        managerSpeech: result.managerSpeechPercent || 50,
        clientSpeech: result.clientSpeechPercent || 50,
        coachingInsights: JSON.parse(JSON.stringify(result.coachingInsights || {})) as any,
        requiresFollowup: fu?.requiresFollowup || false,
        followupReason: fu?.followupReason || null,
        followupPhrase: fu?.followupPhrase || null,
        followupDeadline,
        followupCompleted: false,
        promises: result.promises ? (JSON.parse(JSON.stringify(result.promises)) as any) : null,
        qualification: result.qualification
          ? (JSON.parse(JSON.stringify(result.qualification)) as any)
          : null,
        callStructure: result.callStructure
          ? (JSON.parse(JSON.stringify(result.callStructure)) as any)
          : null,
        questionsData: result.questions
          ? (JSON.parse(JSON.stringify(result.questions)) as any)
          : null,
        closeAttempts: result.closeAttempts
          ? (JSON.parse(JSON.stringify(result.closeAttempts)) as any)
          : null,
        voiceOfCustomer: result.voiceOfCustomer
          ? (JSON.parse(JSON.stringify(result.voiceOfCustomer)) as any)
          : null,
        clientProfile: (result as any).clientProfile
          ? (JSON.parse(JSON.stringify((result as any).clientProfile)) as any)
          : null,
      };

      await prisma.analysis.upsert({
        where: { audioFileId: audioId },
        create: { audioFileId: audioId, ...data },
        update: data,
      });
      await prisma.audioFile.update({
        where: { id: audioId },
        data: { status: "done" },
      });
      // Mijoz profilini aggregate qilish (xatoliklar asosiy flow'ni to'xtatmaydi)
      try {
        const { aggregateClientFromAnalysis } = await import("./client-profiler");
        await aggregateClientFromAnalysis(audioId);
      } catch (err) {
        console.error("[client-profiler] batch aggregation error:", (err as Error).message);
      }
      saved++;
    } catch (e) {
      console.error("[Stage 3 parse]", (e as Error).message?.substring(0, 80));
    }
  }

  console.log(`[Stage 3] Saved ${saved}/${outLines.length}`);
}

// === MAIN ===
export async function runBatchBackfill(
  companyId: string,
  options: { limit?: number } = {}
): Promise<number> {
  running.set(companyId, true);

  try {
    const activeManagers = await prisma.manager.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    const activeIds = activeManagers.map((m) => m.id);

    // Filter: 1-qo'ng'iroq (sotuv) >= 180s, qayta >= 120s — qisqa audiolar
    // avtomatik "no_conversation" qilinadi (Yandex billing'ni shishirmaslik uchun).
    await prisma.audioFile.updateMany({
      where: {
        companyId,
        status: "pending",
        managerId: { in: activeIds },
        OR: [
          { AND: [{ category: { in: ["sotuv", "1-qo'ng'iroq"] } }, { duration: { lt: 180 } }] },
          { AND: [{ category: "qayta" }, { duration: { lt: 120 } }] },
          { duration: null },
        ],
      },
      data: { status: "no_conversation" },
    });

    // Faqat hali tahlil bo'lmagan audiolar — transcription bor bo'lsa, qayta
    // STT'ga yubormaymiz (Yandex billing'ni shishirtirmaslik uchun). "error"
    // audiolar avtomatik qayta urinmaydi — admin qo'lda "Tahlil qilish" bossa
    // status="pending" qiladi. "processing" — orphaned, admin tekshirsin.
    const pending = await prisma.audioFile.findMany({
      where: {
        companyId,
        status: "pending",
        managerId: { in: activeIds },
        transcription: null,
      },
      include: { manager: { select: { name: true } } },
      // Eng davomli audiolarni birinchi tanlaymiz — suhbat bo'lish ehtimoli yuqori
      orderBy: options.limit
        ? [{ duration: "desc" }, { createdAt: "desc" }]
        : { createdAt: "asc" },
      ...(options.limit ? { take: options.limit } : {}),
    });

    console.log(`[V2 Backfill] ${pending.length} fayl topildi`);
    progress.set(companyId, { total: pending.length, processed: 0, stage: "init" });

    if (pending.length === 0) return 0;

    const audios: AudioMeta[] = pending.map((p) => ({
      id: p.id,
      fileName: p.fileName,
      fileUrl: p.fileUrl,
      duration: p.duration,
      managerName: p.manager?.name || "Menejer",
      category: p.category,
    }));

    await prisma.audioFile.updateMany({
      where: { id: { in: audios.map((a) => a.id) } },
      data: { status: "processing" },
    });

    // STAGE 1: Yandex STT parallel
    await runStage1_STT(audios, companyId);
    if (!running.get(companyId)) return 0;

    // Only keep audios that got words
    const withWords = audios.filter((a) => a.words && a.words.length > 0);
    console.log(`[V2] ${withWords.length} audios have STT words`);

    // Empty STT — audio jim/shovqin/voicemail → no_conversation
    const emptyAudios = audios.filter((a) => !a.words || a.words.length === 0);
    if (emptyAudios.length > 0) {
      console.log(`[V2] ${emptyAudios.length} audios have empty STT — marking as no_conversation`);
      await prisma.audioFile.updateMany({
        where: { id: { in: emptyAudios.map((a) => a.id) } },
        data: {
          status: "no_conversation",
          transcription: "SUHBAT YO'Q: STT bo'sh natija qaytardi",
        },
      });
    }

    // STAGE 2: Flash batch diarization
    await runStage2_FlashBatch(withWords, companyId);
    if (!running.get(companyId)) return 0;

    // Only keep audios that got transcription
    const withTrans = withWords.filter((a) => a.transcription);
    console.log(`[V2] ${withTrans.length} audios transcribed`);

    // STAGE 3: Pro batch analysis
    await runStage3_ProBatch(withTrans, companyId);
    if (!running.get(companyId)) return 0;

    // STAGE 4: Sud Agent batch — past balli/shubhali tahlillarni AI judge bilan filter
    try {
      await runStage4_JudgeBatch(withTrans.map((a) => a.id), companyId);
    } catch (err) {
      console.error("[Stage 4 judge] error:", (err as Error).message);
    }

    progress.set(companyId, {
      total: pending.length,
      processed: withTrans.length,
      stage: "done",
    });

    console.log(`[V2 Backfill] DONE: ${withTrans.length}/${pending.length}`);
    return withTrans.length;
  } finally {
    running.set(companyId, false);
  }
}
