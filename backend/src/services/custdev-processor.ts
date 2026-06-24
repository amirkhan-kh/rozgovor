// Custdev interview audio pipeline — PHASE 1 (online):
// 1. ffmpeg → PCM 16kHz mono
// 2. Yandex STT v3 → word-level transkript + jumlalar
// 3. status = "processing" bo'lib qoladi, transcription yoziladi
//
// Gemini 2.5 Pro tahlil (savol-javob ajratish + aiSummary) PHASE 2 — batch:
// `src/services/custdev-batch.ts` faqat Vertex AI batch prediction orqali ishlaydi.
// CLAUDE.md: "reanalyze/backfill faqat Vertex AI batch, online loop taqiq".
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { custdevPrisma as prisma } from "../utils/custdev-prisma";
import { transcribeMediaFile } from "./yandex-stt";
import { getFileBuffer, getKeyFromUrl } from "./storage";

const PRO_MODEL = "gemini-3-flash-preview";
const FLASH_MODEL = "gemini-3-flash-preview";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "global",
  });
}

/**
 * Yandex STT mono audioda per-word diarization bermaydi — faqat aralash so'zlar.
 * Gemini Flash bilan kontekstdan (salom-alik, o'z ismini aytish, savol-javob) rolni ajratamiz:
 *   [MM:SS] Menejer: ...
 *   [MM:SS] Mijoz: ...
 *
 * Input: STT dan kelgan `[MM:SS] matn` formatidagi satrlar
 * Output: Menejer/Mijoz bilan yorliqlangan strukturani string sifatida qaytaradi.
 *
 * Agar diarization muvaffaqiyatsiz bo'lsa, original transkriptni qaytaradi (graceful degrade).
 */
export async function diarizeTranscript(rawTranscript: string): Promise<string> {
  if (!rawTranscript.trim()) return rawTranscript;

  const ai = getAI();
  const prompt = `Sen mijoz-menejer qo'ng'iroqlarini rol bo'yicha ajratuvchisan. Quyidagi qo'ng'iroq transkripti Yandex STT dan olingan va mono kanal bo'lgani uchun ikkala rol aralashib yotadi.

─── KONTEKST ───
Bu "Enter shifo" klinikasi menejeri va klinika mijozi o'rtasidagi qo'ng'iroq. Menejer klinikadan qo'ng'iroq qilib, mijoz bilan (feedback) savol-javob o'tkazadi.

KIM MENEJER (aniqlash uchun):
- "Assalomu alaykum, ismim [ism], enter shifo klinikasidan..." deydi
- Savol beradi ("yoshingiz nechchida", "qayerdan eshitdingiz", "qanday muammo bilan kelgandingiz")
- Ko'p gapiradi, strukturalangan savollar

KIM MIJOZ (aniqlash uchun):
- "aha", "ha", "eshitaman" kabi qisqa javoblar
- Shaxsiy ma'lumot beradi (yoshi, shug'ullanish turi, muammo)
- Narx, davolash haqida fikr bildiradi

─── KIRISH TRANSKRIPT ───
${rawTranscript.substring(0, 100000)}

─── VAZIFA ───
Transkriptni Menejer/Mijoz bo'yicha qayta formatlab ber. Har satr:

[MM:SS] Menejer: <shu rol aytgan matn>
[MM:SS] Mijoz: <shu rol aytgan matn>

QOIDALAR:
1. Har bitta rol o'zgarishi uchun alohida satr yoz
2. Timestamp'ni saqla — yangi satr yaratayotganda oldingi [MM:SS] dan o'zgartirma, estimate qil
3. Matnni o'z aynan yozilishida qoldir, faqat rolni ajrat (gapni tuzatma)
4. "aha", "hmm", "ha" kabi qisqa tasdiqlash so'zlarini oldingi satrga qo'shma — mijoz javobi sifatida alohida satr qilib ko'rsat
5. Javob FAQAT strukturani qaytar, boshqa matn YO'Q
6. Markdown fence ishlatma

─── JAVOB ───`;

  try {
    const res = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 32768,
      },
    });
    const text = (res.text || "").trim();
    if (!text) return rawTranscript;
    // Clean up markdown fence agar Flash ilova qilsa
    const cleaned = text
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    // Sanity check: kamida bitta "Menejer:" yoki "Mijoz:" bo'lishi kerak
    if (!/Menejer:|Mijoz:/i.test(cleaned)) return rawTranscript;
    return cleaned;
  } catch (err) {
    console.error(
      `[custdev-processor] diarization xatosi:`,
      (err as Error).message
    );
    return rawTranscript;
  }
}

/**
 * Yandex URL (https://...yandexcloud.net/...) yoki to'liq http URL bo'lsa ham
 * fayl buffer sifatida o'qiydi.
 */
async function downloadAudioToTmp(audioUrl: string): Promise<string> {
  const ext = path.extname(new URL(audioUrl).pathname).replace(/\?.*$/, "") || ".mp3";
  const tmpPath = path.join(os.tmpdir(), `custdev-${randomUUID()}${ext}`);

  // Yandex S3 via aws-sdk — storage.ts dan
  if (audioUrl.includes("yandexcloud.net") || !audioUrl.startsWith("http")) {
    const key = getKeyFromUrl(audioUrl);
    const buf = await getFileBuffer(key);
    fs.writeFileSync(tmpPath, buf);
    return tmpPath;
  }

  // Tashqi URL (hozircha ishlatilmaydi, lekin ehtiyot uchun)
  const resp = await axios.get(audioUrl, {
    responseType: "arraybuffer",
    timeout: 120000,
    validateStatus: () => true,
  });
  if (resp.status >= 400) throw new Error(`Audio fetch failed: ${resp.status}`);
  fs.writeFileSync(tmpPath, Buffer.from(resp.data));
  return tmpPath;
}

/**
 * Barcha completed intervyu summarylar asosida Custdev.aiSummary yaratadi.
 * Batch pipeline (custdev-batch.ts) ham, manual qo'ng'iroq ham shu funksiyani chaqiradi.
 *
 * Bu funksiya BATCH pipeline'dan so'ng ishga tushadi — aggregate summary bitta qisqa
 * Pro online call bilan yangilanadi. Batch job har safar 10+ daqiqa kutishi mumkin,
 * aggregate esa faqat qisqa cross-interview xulosa (2 KB) bo'lgani uchun online
 * chaqiruv ham maqbul.
 */
async function recomputeCustdevAggregateSummary(custdevId: string): Promise<void> {
  const custdev = await prisma.custdev.findUnique({
    where: { id: custdevId },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      interviews: {
        where: { status: "completed" },
        include: {
          answers: true,
        },
      },
    },
  });

  if (!custdev) return;
  if (custdev.interviews.length === 0) {
    await prisma.custdev.update({
      where: { id: custdevId },
      data: { aiSummary: null },
    });
    return;
  }

  if (custdev.interviews.length < 1) return;

  const ai = getAI();

  const questionsText = custdev.questions.map((q, i) => `Q${i + 1}: ${q.text}`).join("\n");

  const interviewsBlock = custdev.interviews
    .map((iv, idx) => {
      const perQ = custdev.questions
        .map((q, qi) => {
          const a = iv.answers.find((ans) => ans.questionId === q.id);
          return `  Q${qi + 1}: ${a?.answer || "(javob yo'q)"}`;
        })
        .join("\n");
      return `— Intervyu #${idx + 1} (${iv.createdAt.toISOString().split("T")[0]}) —\nSummary: ${
        iv.aiSummary || "(yo'q)"
      }\n${perQ}`;
    })
    .join("\n\n");

  const prompt = `Sen Customer Development tahlil ekspertisan. Kompaniya bir nechta mijoz bilan intervyu o'tkazgan. Vazifa: barcha intervyularni solishtirib, kesuvchi (cross-interview) xulosa tayyorlash.

─── CUSTDEV LOYIHASI ───
Sarlavha: ${custdev.title}
${custdev.description ? `Tavsif: ${custdev.description}\n` : ""}
─── SAVOLLAR ───
${questionsText}

─── INTERVYULAR (${custdev.interviews.length} ta) ───
${interviewsBlock.substring(0, 60000)}

─── VAZIFA ───
Quyidagi bo'limlardan iborat qisqa markdown tahlil yozing (4-8 jumla, ortiqcha so'z yo'q):

**Umumiy trend:** hamma intervyularda takrorlangan fikrlar/og'riqlar
**Asosiy ehtiyoj:** mijozlarning eng aniq ehtiyoji
**Farqli fikrlar:** qayerda mijozlar kelisha olmagan
**Amaliy tavsiya:** kompaniya uchun keyingi qadam

FAQAT markdown matni qaytaring, JSON emas.`;

  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 2048,
    },
  });

  const summary = (response.text || "").trim();
  await prisma.custdev.update({
    where: { id: custdevId },
    data: { aiSummary: summary || null },
  });
}

/**
 * PHASE 1 — audio fayldan transkripsiya olish. Gemini tahlil PHASE 2 (batch)'da.
 *
 * State machine:
 *   pending → processing (STT ishlamoqda)
 *   processing + transcription=NULL → STT ishlamoqda
 *   processing + transcription IS NOT NULL → PHASE 2 (batch) kutmoqda
 *   completed → batch tugadi, javoblar + aiSummary yozildi
 *   failed → xato
 *
 * Frontend spinnerni "pending" yoki "processing" uchun ko'rsatadi — batch tugagunga qadar
 * spinner aylanaveradi (bu istalgan holat).
 */
export async function processInterview(interviewId: string): Promise<void> {
  const iv = await prisma.custdevInterview.findUnique({
    where: { id: interviewId },
    include: {
      custdev: {
        select: { id: true, title: true, description: true },
      },
    },
  });

  if (!iv) {
    console.error(`[custdev-processor] interview ${interviewId} topilmadi`);
    return;
  }

  console.log(`[custdev-processor] ${interviewId} STT boshlandi`);

  let localPath: string | null = null;
  try {
    await prisma.custdevInterview.update({
      where: { id: interviewId },
      data: { status: "processing", errorMessage: null },
    });

    // 1. Audio ni tmp ga yuklab olish
    localPath = await downloadAudioToTmp(iv.audioUrl);
    console.log(`[custdev-processor] ${interviewId} audio yuklandi: ${localPath}`);

    // 2. Yandex STT — word-level transkripsiya
    const { words, lines } = await transcribeMediaFile(localPath);
    if (words.length === 0) {
      throw new Error("STT bo'sh natija qaytardi");
    }
    const lastWord = words[words.length - 1];
    const durationSec = Math.ceil(lastWord.endMs / 1000);
    const plainText = lines
      .map((l) => {
        const mm = Math.floor(l.start / 60);
        const ss = Math.floor(l.start % 60);
        return `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}] ${l.text}`;
      })
      .join("\n");
    console.log(
      `[custdev-processor] ${interviewId} STT tugadi: ${words.length} so'z, ${lines.length} jumla`
    );

    // 3. Diarization — Yandex mono audioda rol bermaydi, Gemini Flash bilan Mijoz/Menejer ajratamiz
    console.log(`[custdev-processor] ${interviewId} diarization boshlandi`);
    const diarized = await diarizeTranscript(plainText);
    const diarizedOk = diarized !== plainText;
    console.log(
      `[custdev-processor] ${interviewId} diarization ${diarizedOk ? "tugadi" : "muvaffaqiyatsiz, raw matn saqlanadi"}`
    );

    // 4. Transkripsiyani yozib qo'yamiz. Status "processing" qoladi — keyingi
    // batch job transcription IS NOT NULL ni topib, Gemini tahlilini bajaradi.
    await prisma.custdevInterview.update({
      where: { id: interviewId },
      data: {
        transcription: diarized,
        durationSec,
        status: "processing",
        errorMessage: null,
      },
    });

    console.log(
      `[custdev-processor] ${interviewId} ✓ PHASE 1 done — batch tahlil kutmoqda`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[custdev-processor] ${interviewId} ✗ FAILED:`, msg);
    await prisma.custdevInterview.update({
      where: { id: interviewId },
      data: { status: "failed", errorMessage: msg },
    });
  } finally {
    if (localPath) {
      try {
        fs.unlinkSync(localPath);
      } catch {}
    }
  }
}

/**
 * Background'da ishga tushirish — upload response'ni bloklamaydi.
 */
export function triggerProcessInterview(interviewId: string): void {
  setImmediate(() => {
    processInterview(interviewId).catch((err) => {
      console.error(`[custdev-processor] unhandled error ${interviewId}:`, err);
    });
  });
}

export { recomputeCustdevAggregateSummary };
