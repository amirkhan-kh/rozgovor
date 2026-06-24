/**
 * Smart-Advokat tool ta'riflari (Gemini function calling) va dispatcher.
 *
 * 3 ta tool:
 *   1. searchLeads        — SalesLead bo'yicha ism / telefon qidiruvi
 *   2. getAudioTranscripts — lid bilan bog'liq AudioFile transkriptlari
 *   3. searchKnowledge    — kompaniya yuridik bazasi (LegalKnowledge) qidiruvi
 */

import { Type, GoogleGenAI, type FunctionDeclaration } from "@google/genai";
import { prisma } from "../../utils/prisma";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

export const legalToolDeclarations: FunctionDeclaration[] = [
  {
    name: "searchLeads",
    description:
      "AmoCRM'dan kelgan SalesLead bazasidan mijozni ism yoki telefon raqami " +
      "bo'yicha qidiradi. Mijoz ismini yoki raqamini bersa shu tool bilan " +
      "uning lidlarini topish mumkin.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Mijoz ismi yoki telefon raqami (qisman ham bo'ladi).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "getAudioTranscripts",
    description:
      "Berilgan SalesLead.id (yoki AmoCRM lid raqami matn ko'rinishida) " +
      "bo'yicha o'sha lidga tegishli barcha audio qo'ng'iroqlarning STT " +
      "transkriptlarini qaytaradi. Sotuvchi va'da bergan narsalarni shu " +
      "transkriptlardan topish kerak.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        leadId: {
          type: Type.STRING,
          description:
            "SalesLead.id (cuid) — searchLeads natijasidan olinadi. Yoki " +
            "AmoCRM raqamli lid id (matn ko'rinishida) ham qabul qilinadi.",
        },
      },
      required: ["leadId"],
    },
  },
  {
    name: "getAudiosByPhone",
    description:
      "MUHIM: bitta mijoz turli voronkalarda (Sotuv / Retention / Reanimatsiya) " +
      "bir nechta lid'larga ega bo'lishi mumkin. Bu tool berilgan telefon raqam " +
      "bo'yicha kompaniyaning BARCHA voronkalaridan, barcha lid'lardan " +
      "transkripsiya qilingan audio'larni topadi va pipeline (voronka) bo'yicha " +
      "guruhlab qaytaradi. Refund/da'vo keyslarida birinchi navbatda shu tool'ni " +
      "ishlat — sotuvchi va retention manageri va'da bergan narsalar farqlanishi " +
      "mumkin.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        phone: {
          type: Type.STRING,
          description:
            "Telefon raqami (har qanday formatda — +998, 998, 99..., probellar bilan).",
        },
      },
      required: ["phone"],
    },
  },
  {
    name: "searchLawUz",
    description:
      "Lex.uz va boshqa O'zbekiston rasmiy davlat portallaridan eng so'nggi " +
      "tahrirdagi normativ-huquqiy hujjatlarni Google Search orqali real " +
      "vaqtda qidiradi. Modda raqami, qonun nomi yoki huquqiy savol berib " +
      "ishlatish mumkin. Bu tool natijasi internetdagi haqiqiy lex.uz " +
      "sahifalariga asoslangan — Gemini'ning eski training ma'lumotlariga " +
      "tayanmaydi. Iste'molchilar huquqlari, ta'lim qonuni, fuqarolik " +
      "kodeksining moddalari va h.k. bo'yicha BARCHA huquqiy faktlar shu " +
      "tool orqali tekshirilishi kerak.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            "Huquqiy savol yoki kalit so'z. Misol: \"O'zR Iste'molchilar " +
            "huquqlarini himoya qilish qonuni 5-modda\", \"ta'lim ofertasi " +
            "shartnomani bekor qilish\", \"fuqarolik kodeksi 388-modda\".",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "searchKnowledge",
    description:
      "Kompaniyaning yuklangan yuridik hujjatlar bazasidan (litsenziya, " +
      "oferta, shartnoma, ichki qoidalar) so'rov bo'yicha qidiradi.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: "Qidiruv so'zi (sarlavha yoki matnda qidiriladi).",
        },
      },
      required: ["query"],
    },
  },
];

// ─── Dispatcher ─────────────────────────────────────────────────────────

export interface ToolContext {
  companyId: string;
}

export type ToolResult = Record<string, unknown>;

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "searchLeads":
        return await searchLeads(String(args.query ?? ""), ctx);
      case "getAudioTranscripts":
        return await getAudioTranscripts(String(args.leadId ?? ""), ctx);
      case "getAudiosByPhone":
        return await getAudiosByPhone(String(args.phone ?? ""), ctx);
      case "searchKnowledge":
        return await searchKnowledge(String(args.query ?? ""), ctx);
      case "searchLawUz":
        return await searchLawUz(String(args.query ?? ""));
      default:
        return { error: `Noma'lum tool: ${name}` };
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
}

async function searchLeads(query: string, ctx: ToolContext): Promise<ToolResult> {
  const q = query.trim();
  if (!q) return { leads: [] };

  const leads = await prisma.salesLead.findMany({
    where: {
      companyId: ctx.companyId,
      OR: [
        { contactName: { contains: q, mode: "insensitive" } },
        { contactPhone: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { leadCreatedAt: "desc" },
    select: {
      id: true,
      leadId: true,
      contactName: true,
      contactPhone: true,
      statusName: true,
      pipelineName: true,
      isSale: true,
      leadCreatedAt: true,
    },
  });

  // Har lid uchun audio sonini hisoblash (AudioFile.leadId === SalesLead.leadId)
  const enriched = await Promise.all(
    leads.map(async (l) => {
      const audioCount = await prisma.audioFile.count({
        where: { companyId: ctx.companyId, leadId: l.leadId },
      });
      return {
        id: l.id,
        amocrmLeadId: l.leadId,
        name: l.contactName,
        phone: l.contactPhone,
        status: l.statusName,
        pipeline: l.pipelineName,
        isSale: l.isSale,
        createdAt: l.leadCreatedAt,
        audioCount,
      };
    }),
  );

  return { leads: enriched };
}

async function getAudioTranscripts(
  leadIdInput: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const v = leadIdInput.trim();
  if (!v) return { audios: [] };

  // SalesLead.id (cuid) yoki raqamli AmoCRM leadId qabul qilinadi.
  let amocrmLeadId: number | null = null;

  if (/^\d+$/.test(v)) {
    amocrmLeadId = parseInt(v, 10);
  } else {
    const sl = await prisma.salesLead.findFirst({
      where: { id: v, companyId: ctx.companyId },
      select: { leadId: true },
    });
    if (sl) amocrmLeadId = sl.leadId;
  }

  if (amocrmLeadId == null) {
    return { audios: [], note: "Lead topilmadi" };
  }

  const audios = await prisma.audioFile.findMany({
    where: {
      companyId: ctx.companyId,
      leadId: amocrmLeadId,
      transcription: { not: null },
    },
    orderBy: { callDate: "asc" },
    take: 20,
    select: {
      id: true,
      fileName: true,
      callDate: true,
      createdAt: true,
      duration: true,
      transcription: true,
      manager: { select: { name: true } },
    },
  });

  const result = audios
    .filter((a) => a.transcription && a.transcription.trim().length > 0)
    .map((a) => ({
      id: a.id,
      fileName: a.fileName,
      callDate: a.callDate ?? a.createdAt,
      duration: a.duration,
      manager: a.manager?.name ?? null,
      transcript: (a.transcription || "").slice(0, 8000),
      transcriptTruncated: (a.transcription || "").length > 8000,
    }));

  return { audios: result, total: result.length };
}

// Telefon raqamini oxirgi 9 raqamga normallashtiradi (mamlakat kodi bilan/siz)
function normalizePhone(p: string): string {
  return p.replace(/\D+/g, "").slice(-9);
}

async function getAudiosByPhone(
  phone: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const norm = normalizePhone(phone);
  if (norm.length < 7) {
    return { audios: [], note: "Telefon raqam juda qisqa" };
  }

  // SalesLead'larni telefon bo'yicha qidiramiz (oxirgi 9 raqam mosligi)
  const leads = await prisma.salesLead.findMany({
    where: {
      companyId: ctx.companyId,
      contactPhone: { contains: norm },
    },
    select: {
      id: true,
      leadId: true,
      contactName: true,
      contactPhone: true,
      statusName: true,
      pipelineName: true,
      isSale: true,
      leadCreatedAt: true,
    },
  });

  const amocrmLeadIds = leads.map((l) => l.leadId);

  // Audio'larni IKKI yo'l bilan qidiramiz: SalesLead.leadId orqali VA
  // AudioFile.phoneNumber to'g'ridan-to'g'ri (Retention/boshqa SalesLead'da
  // bo'lmagan lidlar uchun ham audio'larni topish uchun).
  const audios = await prisma.audioFile.findMany({
    where: {
      companyId: ctx.companyId,
      transcription: { not: null },
      OR: [
        ...(amocrmLeadIds.length > 0 ? [{ leadId: { in: amocrmLeadIds } }] : []),
        { phoneNumber: { contains: norm } },
      ],
    },
    orderBy: { callDate: "asc" },
    take: 50,
    select: {
      id: true,
      fileName: true,
      leadId: true,
      callDate: true,
      createdAt: true,
      duration: true,
      transcription: true,
      pipelineName: true,
      manager: { select: { name: true } },
    },
  });

  // amocrmLeadId → pipeline mapping
  const leadMap = new Map(leads.map((l) => [l.leadId, l]));

  const result = audios
    .filter((a) => a.transcription && a.transcription.trim().length > 0)
    .map((a) => {
      const lead = a.leadId != null ? leadMap.get(a.leadId) : undefined;
      return {
        id: a.id,
        fileName: a.fileName,
        callDate: a.callDate ?? a.createdAt,
        duration: a.duration,
        manager: a.manager?.name ?? null,
        pipeline: lead?.pipelineName || (a as { pipelineName?: string }).pipelineName || "Noma'lum",
        leadStatus: lead?.statusName || null,
        amocrmLeadId: a.leadId,
        transcript: (a.transcription || "").slice(0, 6000),
        transcriptTruncated: (a.transcription || "").length > 6000,
      };
    });

  // Pipeline (voronka) bo'yicha guruhlash
  const byPipeline: Record<string, number> = {};
  for (const a of result) {
    byPipeline[a.pipeline] = (byPipeline[a.pipeline] || 0) + 1;
  }

  return {
    audios: result,
    total: result.length,
    pipelines: Object.entries(byPipeline).map(([name, count]) => ({
      pipeline: name,
      audioCount: count,
    })),
    leadsFound: leads.map((l) => ({
      id: l.id,
      amocrmLeadId: l.leadId,
      name: l.contactName,
      phone: l.contactPhone,
      pipeline: l.pipelineName,
      status: l.statusName,
      isSale: l.isSale,
      createdAt: l.leadCreatedAt,
    })),
  };
}

async function searchKnowledge(
  query: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const q = query.trim();
  const where = q
    ? {
        companyId: ctx.companyId,
        OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { content: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : { companyId: ctx.companyId };

  const items = await prisma.legalKnowledge.findMany({
    where,
    take: 10,
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, category: true, content: true },
  });

  return {
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      category: i.category,
      snippet: (i.content || "").slice(0, 1500),
    })),
  };
}

// ─── searchLawUz — Google Search grounding via Gemini ────────────────────
// Real lex.uz (va boshqa rasmiy O'zR davlat portallari) ma'lumotlarini real
// vaqtda olib keladi. Gemini Flash + googleSearch grounding ishlatamiz.

async function searchLawUz(query: string): Promise<ToolResult> {
  const q = query.trim();
  if (!q) return { error: "Query bo'sh" };

  try {
    const ai = getAI();
    // site:lex.uz filter — Google Search natijalarini lex.uz bilan cheklaymiz.
    // Agar lex.uz'da bo'lmasa, boshqa rasmiy domen ham qabul qilinadi.
    const prompt = `O'zbekiston Respublikasi qonunchiligi bo'yicha quyidagi savol: "${q}"

Lex.uz va boshqa rasmiy davlat portallaridan (gov.uz, prokuratura.uz, mintrud.uz,
yuksaltirish.uz, soliq.uz va h.k.) eng so'nggi tahrirdagi normativ-huquqiy
hujjatlarga asoslangan holda javob ber. Har qanday iqtibosda:
- qonun yoki kodeks nomi (to'liq),
- modda raqami,
- qisqa matn iqtibosi,
- manba URL (lex.uz havolasi)
ko'rsatilsin. Agar qonun bekor qilingan yoki o'zgargan bo'lsa, albatta ogohlantir.
Javobni qisqa va aniq, rasmiy uslubda ber.`;

    const resp = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        tools: [{ googleSearch: {} }],
      },
    });

    const answer = resp.text || "";
    // Grounding metadata (manbalar)
    const grounding =
      ((resp as { candidates?: Array<{ groundingMetadata?: unknown }> }).candidates?.[0]
        ?.groundingMetadata as
        | {
            groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
          }
        | undefined) || undefined;
    const sources =
      grounding?.groundingChunks
        ?.map((c) => ({ title: c.web?.title || "", url: c.web?.uri || "" }))
        .filter((s) => s.url) || [];

    return {
      query: q,
      answer,
      sources: sources.slice(0, 8),
      sourceCount: sources.length,
    };
  } catch (err) {
    return { error: `Lex.uz qidiruvda xato: ${(err as Error).message}` };
  }
}
