/**
 * Universal fayldan matn chiqaruvchi — Yuridik AI uchun.
 *
 * Qo'llab-quvvatlanadi:
 *   txt/md       → to'g'ridan-to'g'ri (utf8)
 *   docx         → JSZip orqali word/document.xml dan <w:t>
 *   pptx         → JSZip orqali ppt/slides/slide*.xml dan <a:t>
 *   pdf, image   → Gemini 2.5 Flash inlineData (OCR)
 *   fallback     → Flash
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import JSZip from "jszip";
import { GoogleGenAI } from "@google/genai";

const FLASH_MODEL = "gemini-2.5-flash";
const MAX_OUTPUT_CHARS = 30000;
// Gemini inlineData limiti — taxminan 20MB. Kattaroq bo'lsa video'ni audio'ga
// aylantiramiz (ffmpeg). Bu ham backup chegara — agar ffmpeg yo'q bo'lsa
// inline'ga tushadi, lekin xato bermaydi.
const MAX_INLINE_BYTES = 18 * 1024 * 1024;

const runFfmpeg = (args: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => {
      err += d.toString();
    });
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`)),
    );
  });

// Video buferdan audio (mp3, 16kHz mono, 64kbps) ajratadi.
// Gemini Flash uchun audio'gina yetarli — vizualni ko'rmaydi.
const extractAudioFromVideo = async (
  videoBuffer: Buffer,
  videoExt: string,
): Promise<Buffer> => {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "legal-av-"));
  const inPath = path.join(tmpDir, `in.${videoExt || "mp4"}`);
  const outPath = path.join(tmpDir, "out.mp3");
  try {
    await fs.promises.writeFile(inPath, videoBuffer);
    await runFfmpeg([
      "-y",
      "-i",
      inPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ab",
      "64k",
      "-ar",
      "16000",
      "-ac",
      "1",
      outPath,
    ]);
    return await fs.promises.readFile(outPath);
  } finally {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
};

export interface ExtractResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  method: "native" | "flash";
}

const ext = (filename: string): string => {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
};

const stripXmlTags = (xml: string): string =>
  xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const extractFromDocx = async (buffer: Buffer): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = zip.file("word/document.xml");
  if (!docXml) return "";
  const xml = await docXml.async("string");
  // Paragraf chegaralarini saqlash uchun </w:p> ni \n ga almashtir
  const withBreaks = xml.replace(/<\/w:p>/g, "\n").replace(/<w:tab\/?>/g, "\t");
  return stripXmlTags(withBreaks);
};

const extractFromPptx = async (buffer: Buffer): Promise<string> => {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort();
  const parts: string[] = [];
  for (const f of slideFiles) {
    const xml = await zip.file(f)!.async("string");
    const withBreaks = xml.replace(/<\/a:p>/g, "\n");
    const text = stripXmlTags(withBreaks);
    if (text.trim()) parts.push(`--- ${f} ---\n${text}`);
  }
  return parts.join("\n\n");
};

const extractWithFlash = async (
  buffer: Buffer,
  mimeType: string,
  isAv: boolean = false,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> => {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
  const prompt = isAv
    ? "Quyidagi audio/video'ni to'liq transkripsiya qil (O'zbek/Rus/aralash). " +
      "Har bir gapni vaqt belgisi bilan: [MM:SS] formatida yoz. " +
      "Video bo'lsa — muhim vizual hodisalarni ham qisqacha tasvirla " +
      "(masalan: 'mijoz darsda qatnashayotgani ko'rinadi'). Faqat tarkib — sharhsiz."
    : "Quyidagi hujjatdan barcha matnni to'liq chiqar (OCR + tarkib). " +
      "Sarlavhalar, sanalar, raqamlar, imzolar — hammasini saqla. " +
      "Faqat hujjatdagi matn — sharhsiz. Bir nechta sahifa bo'lsa --- bilan ajrat.";
  const response = await ai.models.generateContent({
    model: FLASH_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: buffer.toString("base64") } },
        ],
      },
    ],
    config: { temperature: 0, maxOutputTokens: isAv ? 16384 : 8192 },
  });
  const text = response.text || "";
  const usage = (response.usageMetadata || {}) as {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  return {
    text,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
  };
};

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractResult> {
  const e = ext(filename);

  // Plain text formatlari — to'g'ridan-to'g'ri
  if (
    e === "txt" ||
    e === "md" ||
    e === "markdown" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown"
  ) {
    const text = buffer.toString("utf8").slice(0, MAX_OUTPUT_CHARS);
    return { text, inputTokens: 0, outputTokens: 0, method: "native" };
  }

  // DOCX
  if (
    e === "docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const text = (await extractFromDocx(buffer)).slice(0, MAX_OUTPUT_CHARS);
    return { text, inputTokens: 0, outputTokens: 0, method: "native" };
  }

  // PPTX
  if (
    e === "pptx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    const text = (await extractFromPptx(buffer)).slice(0, MAX_OUTPUT_CHARS);
    return { text, inputTokens: 0, outputTokens: 0, method: "native" };
  }

  // PDF / rasm / audio / video / boshqa — Gemini Flash (multimodal)
  // mimeType ba'zan noto'g'ri (octet-stream) keladi — extension bo'yicha to'g'irla
  let mt = mimeType;
  if (!mt || mt === "application/octet-stream") {
    if (e === "pdf") mt = "application/pdf";
    else if (e === "png") mt = "image/png";
    else if (e === "jpg" || e === "jpeg") mt = "image/jpeg";
    else if (e === "webp") mt = "image/webp";
    else if (e === "mp3") mt = "audio/mpeg";
    else if (e === "m4a") mt = "audio/mp4";
    else if (e === "wav") mt = "audio/wav";
    else if (e === "ogg" || e === "oga") mt = "audio/ogg";
    else if (e === "mp4") mt = "video/mp4";
    else if (e === "mov") mt = "video/quicktime";
    else if (e === "webm") mt = "video/webm";
    else mt = "application/pdf";
  }
  // Audio/video → transkripsiya + tasvir, PDF/rasm → OCR
  const isAv = mt.startsWith("audio/") || mt.startsWith("video/");
  const isVideo = mt.startsWith("video/");

  // Video kattaroq bo'lsa (yoki har doim) ffmpeg orqali audio'ga aylantirib,
  // Flash'ga yuboramiz — chunki Flash inlineData limiti ~20MB. Screen
  // recording'lar odatda 50–200MB bo'ladi, lekin tovushi 1–5MB.
  if (isVideo && buffer.length > MAX_INLINE_BYTES) {
    try {
      const audioBuf = await extractAudioFromVideo(buffer, e || "mp4");
      const flash = await extractWithFlash(audioBuf, "audio/mpeg", true);
      return {
        text: flash.text.slice(0, MAX_OUTPUT_CHARS),
        inputTokens: flash.inputTokens,
        outputTokens: flash.outputTokens,
        method: "flash",
      };
    } catch (err) {
      // ffmpeg yo'q yoki xato — eski yo'l bilan urinib ko'ramiz (ehtimol
      // server xatosi qaytaradi, lekin diagnostika uchun)
      console.warn(
        `[file-extractor] Video → audio extraction failed (${(err as Error).message}); falling back to inline.`,
      );
    }
  }

  const flash = await extractWithFlash(buffer, mt, isAv);
  return {
    text: flash.text.slice(0, MAX_OUTPUT_CHARS),
    inputTokens: flash.inputTokens,
    outputTokens: flash.outputTokens,
    method: "flash",
  };
}
