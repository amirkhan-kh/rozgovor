/**
 * Mavjud LegalCase.letterDraft (oxirgi generatsiya qilingan xat)'ni qabul qilib,
 * faqat AYTILGAN o'zgarishlarni qo'llaydi va yangi to'liq JavobXati JSON
 * qaytaradi. To'liq qaytadan tuzmaydi — bu generateLetter()'dan KO'RA tezroq
 * va qolgan kontentni AYNAN saqlaydi.
 *
 * Foydalanish:
 *   - Foydalanuvchi: "shu nomerni 95 510 15 15 ga o'zgartir" → faqat o'sha bandda
 *     o'zgarish.
 *   - Rasmga qizil aylana bilan markup → instruction'da OCR matnini berib yuborish.
 */
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import type { JavobXati } from "./generate-letter";

const PRO_MODEL = "gemini-2.5-pro";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

export interface EditLetterInput {
  caseId: string;
  companyId: string;
  instruction: string;
  // Foydalanuvchi rasm yuklagan bo'lsa, OCR matni (attachment-parser natijasi)
  attachmentText?: string;
  // Mavjud xatning JSON shakli — agar berilmasa, LegalCase.letterDraft (md)
  // dan oxirgi generatsiyaning JSON'ini qayta tiklash mumkin emas. Shuning
  // uchun controller raqamlangan JSON ni cache'da saqlashi yoki struct ni
  // qaytadan parse qilish kerak. Soddalik uchun: agar JSON yo'q bo'lsa, MD
  // matnini o'qib, undan JavobXati'ni LLM bilan tiklab olamiz.
  currentLetter?: JavobXati;
}

export interface EditLetterResult {
  letter: JavobXati;
  changes: string[]; // Qisqa "nima o'zgardi" ro'yxati
}

const EDIT_INSTRUCTION_PROMPT = `Sen rasmiy yuridik xatlarni MINIMAL DIFF bilan tahrirlovchi yordamchisan.

QOIDALAR (qat'iyan):
1. Mavjud xatning STRUKTURASINI VA MATNINI MAKSIMAL SAQLAB qol — faqat aytilgan
   joyni o'zgartir.
2. Bo'limlar soni, paragraf soni, dalillar ro'yxati — agar tegmasa, AYNAN bir xil
   qol.
3. Imlo / shaxs ismi / telefon raqami tuzatilishi — butun hujjat bo'ylab BARCHA
   uchragan o'rinlarda almashtir.
4. Manzil yoki qabul qiluvchini o'zgartirish so'ralsa — faqat \`recipient\` array'ni
   yangilab, qolgan matnni teginma.
5. Hech qachon yangi bo'lim QO'SHMA, mavjudini OLIB TASHLAMA — agar so'ralmasa.
6. JSON formatida JAVOB QAYTAR (faqat JSON):
{
  "letter": { ...to'liq JavobXati strukturasi... },
  "changes": ["O'zgarish 1", "O'zgarish 2"]
}

JavobXati schema:
{
  "date": "string",
  "city": "string",
  "recipient": ["string"],
  "refNumber": "string|null",
  "title": "string",
  "intro": "string",
  "sections": [{"title":"string","paragraphs":["string"]}],
  "conclusion": {"title":"string","paragraphs":["string"]},
  "attachments": ["string"],
  "signature": {"role":"string","name":"string"}
}`;

export async function editLetter(input: EditLetterInput): Promise<EditLetterResult> {
  const { caseId, companyId, instruction, attachmentText, currentLetter } = input;

  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, companyId },
    select: { id: true, letterDraft: true, clientName: true, clientPhone: true, title: true },
  });
  if (!legalCase) throw new Error("Keys topilmadi");

  if (!currentLetter && !legalCase.letterDraft) {
    throw new Error(
      "Hech qanday xat hali generatsiya qilinmagan. Avval \"Avtomatik tahlil\" tugmasini bosing.",
    );
  }

  const ai = getAI();

  // Agar JavobXati JSON yo'q bo'lsa — Markdown'dan struct'ni tiklash uchun avval
  // bitta yengil chaqiriq qilamiz (kichik token, faqat JSON parse).
  let baseLetter: JavobXati | null = currentLetter || null;

  if (!baseLetter && legalCase.letterDraft) {
    const reconstructPrompt = `Quyidagi rasmiy xat Markdown shaklida. Uni JavobXati JSON struct'iga o'tkazib ber (faqat JSON):

\`\`\`markdown
${legalCase.letterDraft.slice(0, 12000)}
\`\`\`

Schema:
{
  "date": "string", "city": "string", "recipient": ["string"], "refNumber": "string|null",
  "title": "string", "intro": "string",
  "sections": [{"title":"string","paragraphs":["string"]}],
  "conclusion": {"title":"string","paragraphs":["string"]},
  "attachments": ["string"], "signature": {"role":"string","name":"string"}
}`;
    const r = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: [{ role: "user", parts: [{ text: reconstructPrompt }] }],
      config: {
        temperature: 0,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });
    const txt = r.text || "";
    try {
      baseLetter = JSON.parse(txt) as JavobXati;
    } catch (_) {
      const m = txt.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("Mavjud xatni JSON'ga o'gira olmadik");
      baseLetter = JSON.parse(m[0]) as JavobXati;
    }
  }

  if (!baseLetter) throw new Error("Bazaviy xat topilmadi");

  // Asosiy edit chaqiruvi
  const editPrompt = `MAVJUD XAT (JSON):
${JSON.stringify(baseLetter, null, 2)}

═══ FOYDALANUVCHI INSTRUKSIYASI ═══
${instruction}

${attachmentText ? `═══ RASM/HUJJAT MATNI (OCR) ═══\n${attachmentText.slice(0, 6000)}\n` : ""}

═══ VAZIFA ═══
Yuqoridagi MAVJUD XAT'ni asos qilib ol va FAQAT instruksiyada aytilgan
o'zgarishlarni qo'lla. Qolgan barcha matn AYNAN bir xil bo'lib qolsin.

JSON qaytaring:
{ "letter": <yangilangan JavobXati>, "changes": ["nima o'zgardi 1", "..."] }`;

  const resp = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: "user", parts: [{ text: editPrompt }] }],
    config: {
      systemInstruction: EDIT_INSTRUCTION_PROMPT,
      temperature: 0.1,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const raw = resp.text || "";
  let parsed: { letter: JavobXati; changes?: string[] };
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI JSON qaytarmadi");
    parsed = JSON.parse(m[0]);
  }

  if (!parsed.letter) throw new Error("Tahrir natijasi bo'sh");

  // Soddalashtirilgan validatsiya — eski xat bilan struktura solishtirish
  if (!Array.isArray(parsed.letter.sections)) {
    parsed.letter.sections = baseLetter.sections;
  }
  if (!parsed.letter.conclusion) {
    parsed.letter.conclusion = baseLetter.conclusion;
  }
  if (!Array.isArray(parsed.letter.attachments)) {
    parsed.letter.attachments = baseLetter.attachments;
  }

  return {
    letter: parsed.letter,
    changes: Array.isArray(parsed.changes) ? parsed.changes : [],
  };
}
