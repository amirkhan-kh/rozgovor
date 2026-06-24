// Yandex STT v3 streaming — reusable utility
// Fayldan yoki buferdan PCM oqim yuborib, word-level timestamplar oladi
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import * as grpc from "@grpc/grpc-js";
import { RecognizerClient } from "@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt_service";
import {
  RawAudio_AudioEncoding,
} from "@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt";

export interface SttWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface SttLine {
  text: string;
  start: number; // seconds
}

const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";

/**
 * Media fayldan (mp4, mp3, ogg, wav) PCM 16kHz mono chiqaradi.
 * Katta fayllar uchun — bufer emas, fayl qaytaradi (memory-safe).
 * Ixtiyoriy: loudnorm filter (true bo'lsa, ovoz normallashadi — past sifatli yozuv uchun).
 */
export function extractPcm(
  mediaPath: string,
  opts: { normalize?: boolean } = {}
): string {
  const pcmPath = path.join(os.tmpdir(), `yandex-stt-${randomUUID()}.pcm`);
  const filter = opts.normalize
    ? `-af "loudnorm=I=-16:LRA=11:TP=-1.5"`
    : "";
  execSync(
    `ffmpeg -y -i "${mediaPath}" -vn -ac 1 -ar 16000 ${filter} -f s16le "${pcmPath}" 2>/dev/null`,
    { maxBuffer: 1024 * 1024 * 1024 }
  );
  return pcmPath;
}

/**
 * PCM fayldan Yandex STT ga oqim yuboradi — word-level timestamplar qaytaradi.
 * Katta fayllar uchun fayldan chunk-chunk o'qiydi (memory-safe).
 */
export function transcribePcmFile(pcmPath: string): Promise<SttWord[]> {
  if (!YANDEX_API_KEY) {
    return Promise.reject(new Error("YANDEX_API_KEY environment muhitida yo'q"));
  }

  return new Promise((resolve, reject) => {
    const client = new RecognizerClient(
      "stt.api.cloud.yandex.net:443",
      grpc.credentials.createSsl()
    );
    const metadata = new grpc.Metadata();
    metadata.set("authorization", `Api-Key ${YANDEX_API_KEY}`);

    const stream = client.recognizeStreaming(metadata);
    const words: SttWord[] = [];

    stream.on("data", (response: any) => {
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
      }
    });

    stream.on("error", reject);
    stream.on("end", () => {
      const seen = new Set<string>();
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
    } as any);

    const fd = fs.openSync(pcmPath, "r");
    const stats = fs.fstatSync(fd);
    const total = stats.size;
    const CHUNK = 32 * 1024;
    const buf = Buffer.alloc(CHUNK);
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
      } as any);
      pos += read;
      setImmediate(next);
    };
    next();
  });
}

/**
 * So'zlarni jumlalarga birlashtiradi. Har jumla — 25 so'zdan oshmaydi
 * yoki .!? bilan tugaydi.
 */
export function wordsToLines(words: SttWord[]): SttLine[] {
  const lines: SttLine[] = [];
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

/**
 * To'liq pipeline: media fayl → word-level transkript
 * Foydalanuvchi pcm faylni o'chirib yuborishni esdan chiqarmaydi — function o'zi tozalaydi.
 */
export async function transcribeMediaFile(
  mediaPath: string,
  opts: { normalize?: boolean } = {}
): Promise<{ words: SttWord[]; lines: SttLine[] }> {
  const pcmPath = extractPcm(mediaPath, opts);
  try {
    const words = await transcribePcmFile(pcmPath);
    const lines = wordsToLines(words);
    return { words, lines };
  } finally {
    try { fs.unlinkSync(pcmPath); } catch {}
  }
}
