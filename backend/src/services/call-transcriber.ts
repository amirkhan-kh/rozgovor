import { GoogleGenAI } from "@google/genai";
import * as grpc from "@grpc/grpc-js";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { RecognizerClient } from "@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt_service";
import {
  StreamingRequest,
  StreamingResponse,
  RawAudio_AudioEncoding,
} from "@yandex-cloud/nodejs-sdk/dist/generated/yandex/cloud/ai/stt/v3/stt";
import { transcribeBufferDeferred } from "./yandex-stt-deferred";

// Flash 3 migration toggle for diarize/refiner (ENV: USE_FLASH_3_REFINER=1)
const USE_FLASH_3_REFINER = process.env.USE_FLASH_3_REFINER === "1";
const REFINER_MODEL = USE_FLASH_3_REFINER
  ? "gemini-3-flash-preview"
  : "gemini-2.5-flash";
const REFINER_LOCATION = USE_FLASH_3_REFINER
  ? "global"
  : (process.env.VERTEX_LOCATION || "us-central1");
const YANDEX_API_KEY = process.env.YANDEX_API_KEY || "";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: REFINER_LOCATION,
  });
}

// Yandex v3 gRPC streaming STT — so'z darajasida timing bilan
async function transcribeYandexV3(pcmBuffer: Buffer): Promise<Array<{ word: string; startMs: number }>> {
  return new Promise((resolve, reject) => {
    const client = new RecognizerClient(
      "stt.api.cloud.yandex.net:443",
      grpc.credentials.createSsl()
    );
    const metadata = new grpc.Metadata();
    metadata.set("authorization", `Api-Key ${YANDEX_API_KEY}`);

    const stream = client.recognizeStreaming(metadata);
    const allWords: Array<{ word: string; startMs: number }> = [];

    stream.on("data", (response: StreamingResponse) => {
      if (response.finalRefinement?.normalizedText?.alternatives) {
        for (const alt of response.finalRefinement.normalizedText.alternatives) {
          for (const w of alt.words || []) {
            allWords.push({
              word: w.text || "",
              startMs: Number(w.startTimeMs || 0),
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

// Audioni PCM 16kHz mono ga o'girib Yandex STT ga uzatish
async function sttWithYandex(audioBuffer: Buffer, fileExt: string): Promise<Array<{ text: string; start: number }>> {
  const tmpDir = os.tmpdir();
  const uid = randomUUID();
  const srcPath = path.join(tmpDir, `stt-${uid}.${fileExt}`);
  const pcmPath = path.join(tmpDir, `stt-${uid}.pcm`);

  try {
    fs.writeFileSync(srcPath, audioBuffer);
    execSync(
      `ffmpeg -y -i "${srcPath}" -ac 1 -ar 16000 -af "loudnorm=I=-16:LRA=11:TP=-1.5" -f s16le "${pcmPath}" 2>/dev/null`
    );
    const pcmBuf = fs.readFileSync(pcmPath);

    const words = await transcribeYandexV3(pcmBuf);

    // So'zlarni jumlalarga birlashtirish
    const lines: Array<{ text: string; start: number }> = [];
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
  } finally {
    try { fs.unlinkSync(srcPath); } catch {}
    try { fs.unlinkSync(pcmPath); } catch {}
  }
}

// Gemini Pro — audio + STT bilan diarization va matnni tahrirlash
async function refineWithGemini(
  audioBuffer: Buffer,
  fileName: string,
  sttLines: Array<{ text: string; start: number }>,
  managerName: string
): Promise<Array<{ speaker: string; text: string; start: number }>> {
  const ai = getAI();

  const sttText = sttLines
    .map((l) => {
      const mm = Math.floor(l.start / 60);
      const ss = Math.floor(l.start % 60);
      return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}] ${l.text}`;
    })
    .join("\n");

  const ext = fileName.split(".").pop()?.toLowerCase() || "mp3";
  const mimeMap: Record<string, string> = {
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
    m4a: "audio/mp4", webm: "audio/webm",
  };
  const mimeType = mimeMap[ext] || "audio/mpeg";
  const base64 = audioBuffer.toString("base64");

  const prompt = `You are an expert audio analysis and diarization specialist. I will provide you with:
1. The original audio file (LISTEN to it to identify voices)
2. STT transcription from Yandex SpeechKit v3 with accurate timestamps

This is an OUTGOING B2C sales call (Uzbekistan).
The MANAGER is "${managerName}" — the seller calling OUT to the customer.

CALL FLOW (important context):
- The manager calls the client (outgoing call)
- The call usually starts with RINGING for 3-15 seconds
- The CLIENT picks up first and says "Alo" (they are answering the call)
- Then the MANAGER introduces themselves: "Alo, assalomu alaykum... [brand]..."
- So the FIRST "Alo" is almost always from the CLIENT, then manager greets

Your job:
1. LISTEN to the audio to identify voices (manager vs client by voice tone)
2. Use STT timestamps as ground truth — they are accurate
3. If audio starts with ringing, include a "system" segment at timestamp 00:00
4. Assign each phrase to correct speaker based on VOICE + call flow context
5. Fix STT errors while preserving the EXACT meaning
6. Timestamps MUST be in "MM:SS" format (2 digit minutes : 2 digit seconds)
7. KEEP the timestamps from STT — do NOT shift them

STT Output:
${sttText}

Return JSON with segments array. Each timestamp must be in MM:SS format.`;

  const result = await Promise.race([
    ai.models.generateContent({
      model: REFINER_MODEL,
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: prompt },
        ],
      }],
      config: {
        temperature: 0,
        maxOutputTokens: 65536,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            segments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  speaker: { type: "string", enum: ["manager", "client", "system"] },
                  text: { type: "string" },
                  timestamp: { type: "string", description: "MM:SS format (e.g., 00:14)" },
                },
                required: ["speaker", "text", "timestamp"],
              },
            },
          },
          required: ["segments"],
        },
      } as any,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Refine timeout: 5 min")), 300000)
    ),
  ]);

  const finishReason = (result as any)?.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    console.warn(
      `[Transcribe] ${fileName}: Gemini refine MAX_TOKENS — natija qisqartirilgan bo'lishi mumkin (uzun audio)`,
    );
  }
  const parsed = JSON.parse(result.text || "{}");
  const segments = (parsed.segments || []) as Array<{
    speaker: string;
    text: string;
    timestamp: string;
  }>;

  return segments.map((s) => {
    // Timestamp MM:SS yoki HH:MM:SS formatlarini qo'llab-quvvatlash
    const parts = s.timestamp.split(":").map((p) => parseInt(p) || 0);
    let start = 0;
    if (parts.length === 3) {
      start = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      start = parts[0] * 60 + parts[1];
    } else {
      start = parts[0] || 0;
    }
    return { speaker: s.speaker, text: s.text, start };
  });
}

/**
 * Diarization xato qilib menejer va mijoz rollarini almashtirib qo'ygan
 * holatlarni avtomatik tuzatadi.
 *
 * Heuristika: agar "client" segmentlarida menejer o'zini tanishtirayotgan
 * pattern topilsa ("ismim {firstName}", "men {firstName}", "{firstName}
 * ... kompaniyalaridan"), va aksincha "manager" segmentlarida bunaqa yo'q
 * bo'lsa — barcha rollar almashtiriladi.
 */
export function autoFixSwappedRoles(
  segments: Array<{ speaker: string; text: string; start: number }>,
  managerName: string,
  fileName: string = "",
): Array<{ speaker: string; text: string; start: number }> {
  if (!managerName || segments.length === 0) return segments;

  const firstName = managerName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstName || firstName.length < 2) return segments;

  const introPatterns: RegExp[] = [
    new RegExp(`\\bismim\\s+${firstName}\\b`, "i"),
    new RegExp(`\\bmen\\s+${firstName}\\b`, "i"),
    new RegExp(`\\bmen\\s+\\w+\\s+${firstName}\\b`, "i"),
    new RegExp(`\\b${firstName}\\b.{0,40}(tanish|kompaniya|bo['’]limidan)`, "i"),
  ];

  let clientHasIntro = 0;
  let managerHasIntro = 0;
  for (const s of segments) {
    if (s.speaker !== "client" && s.speaker !== "manager") continue;
    const matches = introPatterns.some((re) => re.test(s.text));
    if (!matches) continue;
    if (s.speaker === "client") clientHasIntro += 1;
    else managerHasIntro += 1;
  }

  if (clientHasIntro > managerHasIntro) {
    console.warn(
      `[Transcribe] ${fileName}: ROLE SWAP detected (client=${clientHasIntro} intros, manager=${managerHasIntro}). Almashtiramiz.`,
    );
    return segments.map((s) => ({
      ...s,
      speaker:
        s.speaker === "client"
          ? "manager"
          : s.speaker === "manager"
          ? "client"
          : s.speaker,
    }));
  }

  return segments;
}

/**
 * Gibrid transkripsiya: Yandex STT v3 + Gemini Flash (diarization + refinement)
 *
 * 1. Audio PCM 16kHz ga o'giriladi (ffmpeg)
 * 2. Yandex SpeechKit v3 gRPC streaming bilan so'z darajasida STT
 * 3. Gemini Flash matnni tahrirlab, speakerlarni ajratadi
 */
export const transcribeAudio = async (
  buffer: Buffer,
  fileName: string,
  managerName: string = "Menejer",
  _audioDurationSec: number = 0,
  useDeferred: boolean = false
): Promise<string> => {
  try {
    console.log(`[Transcribe] ${fileName}, manager: ${managerName}, mode: ${useDeferred ? "deferred" : "streaming"}`);

    // 1. Yandex STT — sotuv qo'ng'iroqlari uchun deferred (~4× arzon),
    //    imtihon/trainer interactive — streaming.
    const fileExt = fileName.split(".").pop()?.toLowerCase() || "mp3";
    const sttLines = useDeferred
      ? await transcribeBufferDeferred(buffer, fileExt)
      : await sttWithYandex(buffer, fileExt);
    console.log(`[Transcribe] Yandex STT: ${sttLines.length} qator`);

    if (sttLines.length === 0) {
      return "SUHBAT YO'Q: Qo'ng'iroq ulanmagan";
    }

    // 2. Gemini Flash diarization + refinement (audio + STT birga)
    let segments = await refineWithGemini(buffer, fileName, sttLines, managerName);
    console.log(`[Transcribe] Refined: ${segments.length} segment`);

    // 2b) Role-swap detector — agar "client" segmentida menejer o'zini
    //     tanishtirgan bo'lsa ("ismim {firstName}"), barcha rollarni almashtiramiz.
    segments = autoFixSwappedRoles(segments, managerName, fileName);

    // Suhbat yo'q
    const realSegments = segments.filter((s) => s.speaker !== "system");
    if (realSegments.length === 0) {
      return "SUHBAT YO'Q: Qo'ng'iroq ulanmagan";
    }

    // Format
    const speakerMap: Record<string, string> = {
      manager: "Menejer",
      client: "Mijoz",
      system: "Tizim",
    };
    const transcription = segments
      .filter((s) => s.text && s.text.trim().length > 0)
      .map((s) => {
        const speaker = speakerMap[s.speaker] || s.speaker;
        const mm = Math.floor(s.start / 60);
        const ss = Math.floor(s.start % 60);
        const mmss = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
        return `[${mmss}] ${speaker}: ${s.text}`;
      })
      .join("\n");

    return transcription || "Transkripsiya bo'sh";
  } catch (err: any) {
    const errMsg = err?.message || JSON.stringify(err) || "";
    // 429 — rate limit, kutib qayta urinish
    if (errMsg.includes("429") || errMsg.includes("Resource exhausted")) {
      console.log("[Transcribe] 429 — 60s kutib qayta urinish...");
      await new Promise((r) => setTimeout(r, 60000));
      return transcribeAudio(buffer, fileName, managerName, _audioDurationSec, useDeferred);
    }
    console.error("[Transcribe] Error:", errMsg.substring(0, 200));
    throw new Error("Audio transkripsiya qilishda xatolik yuz berdi");
  }
};
