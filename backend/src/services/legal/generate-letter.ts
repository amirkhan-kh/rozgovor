/**
 * Javob xati generator — tool-calling loop bilan.
 *
 * Oqim:
 *   1. Keys konteksti yig'iladi (chat, evidence, attachments, knowledge).
 *   2. Birinchi navbatda Gemini Pro tool-calling rejimida ishlaydi —
 *      clientPhone bo'lsa getAudiosByPhone, searchLeads, getAudioTranscripts,
 *      searchKnowledge'ni o'zi chaqirib, audio transkriptlarini yig'adi.
 *      Yangi topilgan dalillar LegalEvidence'ga ham yoziladi.
 *   3. Yetarli kontekst yig'ilgach, AI'dan strukturalangan JSON xat formatida
 *      javob qaytarish so'raladi (responseMimeType: application/json).
 */

import { GoogleGenAI, type Content, type FunctionCall } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { SMART_ADVOKAT_PROMPT } from "./system-prompt";
import { legalToolDeclarations, dispatchTool } from "./tools";

const PRO_MODEL = "gemini-2.5-pro";
const MAX_TOOL_ITERATIONS = 6;

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

export interface LetterSection {
  title: string;
  paragraphs: string[];
}

export interface JavobXati {
  date: string;
  city: string;
  recipient: string[];
  refNumber: string | null;
  title: string;
  intro: string;
  sections: LetterSection[];
  conclusion: { title: string; paragraphs: string[] };
  attachments: string[];
  signature: { role: string; name: string };
}

const VISION_LETTERHEAD = {
  brandName: "Vision School",
  subtitle: "IELTS & English Mastery Academy — \"Vision Academy\" NTM (eski nomi — \"D SH SH ZIYO\" NTM)",
  phone: "+998 95 510 15 15",
  address:
    "Toshkent shahar, Olmazor tumani, Farobiy tor Dutorchi ko'chasi, 9-D uy",
  inn: "305719452",
  director: "Sh. Quvondiqov",
};

const LETTER_SCHEMA_HINT = `JSON formatida JAVOB qaytaring (faqat JSON):
{
  "date": "2026-yil 22 aprel",
  "city": "Toshkent shahri",
  "recipient": ["...","..."],
  "refNumber": "03/07-6505-son murojaatiga javob" | null,
  "title": "JAVOB XATI",
  "intro": "...",
  "sections": [{"title":"1. ...","paragraphs":["..."]}],
  "conclusion": {"title":"XULOSA","paragraphs":["..."]},
  "attachments": ["..."],
  "signature": {"role":"...","name":"F.I.SH."}
}`;

export async function generateLetter(
  caseId: string,
  companyId: string,
): Promise<{ letter: JavobXati; letterhead: typeof VISION_LETTERHEAD }> {
  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, companyId },
    include: { company: true },
  });
  if (!legalCase) throw new Error("Keys topilmadi");

  const [messages, evidence, attachments, knowledge] = await Promise.all([
    prisma.legalMessage.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.legalEvidence.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.legalAttachment.findMany({
      where: { caseId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.legalKnowledge.findMany({ where: { companyId } }),
  ]);

  const companyName = legalCase.company.name || "Kompaniya";

  const chatTranscript = messages
    .filter((m) => m.role !== "tool")
    .slice(-20)
    .map(
      (m) =>
        `[${m.role === "user" ? "FOYDALANUVCHI" : "AI"}]\n${m.content.slice(0, 4000)}`,
    )
    .join("\n\n---\n\n");

  const evidenceBlock = evidence
    .slice(0, 30)
    .map((e) => `• [${e.type}] ${e.summary.slice(0, 400)}`)
    .join("\n");

  const attachmentsBlock = attachments
    .map((a) => `• ${a.filename} (${a.mimeType})`)
    .join("\n");

  const knowledgeBlock = knowledge
    .slice(0, 15)
    .map((k) => `• [${k.category}] ${k.title}\n${k.content.slice(0, 1500)}`)
    .join("\n\n");

  const todayStr = new Date().toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const baseContext = `KOMPANIYA: ${companyName}
KEYS: ${legalCase.title}
MIJOZ: ${legalCase.clientName || "—"} (telefon: ${legalCase.clientPhone || "—"})
ORGAN: ${legalCase.authority || "—"}
BUGUNGI SANA: ${todayStr}

═══ CHAT TARIXI ═══
${chatTranscript || "(bo'sh)"}

═══ ALLAQACHON YIG'ILGAN DALILLAR ═══
${evidenceBlock || "(bo'sh)"}

═══ BIRIKTIRMALAR ═══
${attachmentsBlock || "(bo'sh)"}

═══ KOMPANIYA BILIM BAZASI ═══
${knowledgeBlock || "(bo'sh)"}`;

  const investigationPrompt = `${baseContext}

═══ VAZIFA — 1-BOSQICH: TADQIQOT ═══
Sen rasmiy JAVOB XATI tuzasan. Lekin oldin barcha mavjud dalillarni yig'ib ol:

1. Agar mijoz telefon raqami berilgan bo'lsa — getAudiosByPhone tool'ini chaqir
   (barcha voronkalardagi audio'lar uchun). Audio transkriptlardan sotuvchining
   va'dalari va mijozning haqiqiy gaplarini topib ol.
2. Telefon yo'q bo'lsa, mijoz ismi bo'lsa — searchLeads, keyin getAudioTranscripts.
3. Kerak bo'lsa searchKnowledge orqali kompaniya hujjatlarini (oferta, litsenziya)
   tekshir.

Tool natijalaridan keyin tahlil qil: shartnoma raqami, sana, summa, sotuvchi
nima va'da bergan, mijoz haqiqiy sababini nima deb aytgan. Tool natijalari
allaqachon yetarli bo'lsa yoki tool kerak bo'lmasa — to'g'ridan-to'g'ri
"DALILLAR YIG'ILDI" deb javob ber. Hozir matn yozma — keyingi bosqichda yozasan.`;

  const ai = getAI();
  const contents: Content[] = [
    { role: "user", parts: [{ text: investigationPrompt }] },
  ];

  // ─── Tool-calling loop — audio'larni va lidlarni yig'ish ──────────────
  const collectedToolResults: Array<{ name: string; summary: string }> = [];
  let iter = 0;
  while (iter < MAX_TOOL_ITERATIONS) {
    iter++;
    const resp = await ai.models.generateContent({
      model: PRO_MODEL,
      contents,
      config: {
        systemInstruction: SMART_ADVOKAT_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 4096,
        tools: [{ functionDeclarations: legalToolDeclarations }],
      },
    });

    const fnCalls: FunctionCall[] = resp.functionCalls || [];
    if (fnCalls.length === 0) break;

    contents.push({
      role: "model",
      parts: fnCalls.map((fc) => ({
        functionCall: { name: fc.name || "", args: fc.args || {} },
      })),
    });

    const responseParts = [];
    for (const fc of fnCalls) {
      const name = fc.name || "";
      const args = (fc.args || {}) as Record<string, unknown>;
      const result = await dispatchTool(name, args, { companyId });

      // Auto-evidence yozish — chat-engine'dagi mantiqning soddalashtirilgan nusxasi
      try {
        if (name === "getAudioTranscripts" || name === "getAudiosByPhone") {
          const audios =
            (result as { audios?: Array<{ id: string; fileName?: string; transcript?: string; pipeline?: string }> }).audios ||
            [];
          for (const a of audios.slice(0, 10)) {
            await prisma.legalEvidence.create({
              data: {
                caseId,
                type: "audio-transcript",
                source: a.id,
                summary: `Audio${a.pipeline ? ` [${a.pipeline}]` : ""}: ${a.fileName || a.id} — ${(a.transcript || "").slice(0, 400)}`,
                rawData: a as object,
              },
            });
          }
          collectedToolResults.push({
            name,
            summary: `${audios.length} ta audio topildi`,
          });
        } else if (name === "searchKnowledge") {
          const items =
            (result as { items?: Array<{ id: string; title: string; snippet?: string }> }).items || [];
          collectedToolResults.push({
            name,
            summary: `${items.length} ta hujjat topildi`,
          });
        } else if (name === "searchLeads") {
          const leads = (result as { leads?: unknown[] }).leads || [];
          collectedToolResults.push({
            name,
            summary: `${leads.length} ta lid topildi`,
          });
        }
      } catch (e) {
        console.error("[legal/letter] evidence write error:", (e as Error).message);
      }

      responseParts.push({ functionResponse: { name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  // ─── 2-bosqich: JSON formatda xat tuzish ──────────────────────────────
  // Yangi yig'ilgan audio dalillarni qayta o'qib, prompt'ga qo'shamiz
  const enrichedEvidence = await prisma.legalEvidence.findMany({
    where: { caseId },
    orderBy: { createdAt: "asc" },
  });
  const enrichedEvidenceBlock = enrichedEvidence
    .slice(0, 50)
    .map((e) => `• [${e.type}] ${e.summary.slice(0, 600)}`)
    .join("\n");

  const finalPrompt = `${baseContext.replace(evidenceBlock || "(bo'sh)", enrichedEvidenceBlock || "(bo'sh)")}

═══ TOOL TADQIQOT NATIJALARI ═══
${collectedToolResults.map((t) => `• ${t.name}: ${t.summary}`).join("\n") || "(qo'shimcha tool chaqirilmadi)"}

═══ VAZIFA — 2-BOSQICH: RASMIY XAT TUZISH ═══
Endi yuqoridagi BUTUN kontekst (chat + audio transkriptlar + biriktirmalar +
kompaniya bilim bazasi) asosida rasmiy JAVOB XATI tuzing.

QOIDALAR:
1. Sana — bugungi: ${todayStr}.
2. Recipient blok — keys.organ asosida: "raqobat-qomitasi" → O'zR Raqobatni
   rivojlantirish va iste'molchilar huquqlarini himoya qilish qo'mitasi
   tegishli hududiy boshqarmasiga; "sud" → tegishli tuman sudi; "uchastkovoy"
   → tuman IIB; "direct" yoki bo'sh → mijozga to'g'ridan-to'g'ri.
3. Sections — kamida 4-5 ta numbered bo'lim. Misol: shartnoma fakti / xizmat
   ko'rsatish / mijozning haqiqiy sababi / kompaniya pozitsiyasi / to'lov.
4. Audio transkriptlardagi muhim iqtiboslarni vaqt belgisi bilan keltiring.
5. Har faktda aniq raqam, sana, summa, modda. Hech qachon to'qib chiqarmang.
6. XULOSA — kompaniya o'z majburiyatlarini bajarganligi va tinch hal qilishga
   tayyorligi haqida.
7. Ilova ro'yxati — biriktirmalardan + chat'da eslatilgan hujjatlardan.
8. Imzo — name: "${VISION_LETTERHEAD.director}", role: "\\"${VISION_LETTERHEAD.brandName}\\" rahbari".

${LETTER_SCHEMA_HINT}

DIQQAT: faqat JSON. To'g'ri parse qilinadigan bo'lsin.`;

  const finalResp = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
    config: {
      systemInstruction: SMART_ADVOKAT_PROMPT,
      temperature: 0.2,
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const raw = finalResp.text || "";
  let parsed: JavobXati;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("AI JSON qaytarmadi");
    parsed = JSON.parse(m[0]);
  }

  if (!parsed.title) parsed.title = "JAVOB XATI";
  if (!parsed.city) parsed.city = "Toshkent shahri";
  if (!Array.isArray(parsed.sections)) parsed.sections = [];
  if (!parsed.conclusion)
    parsed.conclusion = { title: "XULOSA", paragraphs: [] };
  if (!Array.isArray(parsed.attachments)) parsed.attachments = [];
  if (!parsed.signature)
    parsed.signature = {
      role: `"${VISION_LETTERHEAD.brandName}" rahbari`,
      name: VISION_LETTERHEAD.director,
    };

  return { letter: parsed, letterhead: VISION_LETTERHEAD };
}
