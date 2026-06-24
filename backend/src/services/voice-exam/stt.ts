/**
 * Yandex SpeechKit STT — o'zbek tilida matn tanib olish.
 *
 * Push-to-talk rejim: foydalanuvchi 3-15 soniya gapiradi → audio buffer kelgach
 * sync rekognisiyaga yuboriladi. Uzunroq bo'lsa, 28s chunklarga bo'linadi.
 */
import axios from "axios";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { randomBytes } from "crypto";

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";
const STT_URL =
  "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?lang=uz-UZ&format=lpcm&sampleRateHertz=16000&topic=general";

const CHUNK_SEC = 28;
const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM

/**
 * Yandex sync STT — bitta chunk (< 30s, < 1 MB).
 */
async function transcribeChunk(pcm: Buffer): Promise<string> {
  if (!YANDEX_API_KEY) throw new Error("YANDEX_API_KEY o'rnatilmagan");
  const resp = await axios.post(STT_URL, pcm, {
    headers: {
      Authorization: `Api-Key ${YANDEX_API_KEY}`,
      "Content-Type": "audio/x-pcm",
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 30_000,
  });
  return (resp.data?.result || "").trim();
}

/**
 * Bitta audio buferni (har qanday format — webm/ogg/mp3) 16kHz mono LPCM'ga o'tkazib, Yandex STT'ga yuboradi.
 * Uzun bo'lsa chunklarga bo'ladi.
 *
 * @returns to'liq matn
 */
export async function transcribeAudio(input: Buffer, inputFormat: string = "webm"): Promise<string> {
  const tmp = path.join(os.tmpdir(), `exam-stt-${randomBytes(6).toString("hex")}`);
  fs.mkdirSync(tmp, { recursive: true });

  const inPath = path.join(tmp, `in.${inputFormat}`);
  const pcmPath = path.join(tmp, "in.pcm");

  try {
    fs.writeFileSync(inPath, input);
    execSync(`ffmpeg -y -i "${inPath}" -ac 1 -ar ${SAMPLE_RATE} -f s16le "${pcmPath}"`, {
      stdio: "ignore",
    });

    const pcm = fs.readFileSync(pcmPath);
    if (pcm.length === 0) return "";

    const chunkBytes = CHUNK_SEC * SAMPLE_RATE * BYTES_PER_SAMPLE;
    const parts: string[] = [];
    for (let i = 0; i < pcm.length; i += chunkBytes) {
      const chunk = pcm.slice(i, Math.min(i + chunkBytes, pcm.length));
      const text = await transcribeChunk(chunk);
      if (text) parts.push(text);
    }
    return parts.join(" ").trim();
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Audio davomiyligini (soniyada) qaytaradi. Baholash/statistika uchun.
 */
export function getAudioDurationSec(pcm: Buffer): number {
  return pcm.length / (SAMPLE_RATE * BYTES_PER_SAMPLE);
}
