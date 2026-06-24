/**
 * Rival Agent — Layer 5: Advanced
 *
 * Maqsad: Menejerni raqobatchilarning argumentlariga qarshi tayyorlash.
 *
 * Ishlash tartibi:
 *   Bosqich 1 — Google Search grounding bilan raqobatchini o'rganadi (real-time)
 *   Bosqich 2 — Pro JSON mode orqali strukturali ma'lumot (strengths/weaknesses/counterArgs)
 *
 * Counter-arguments normalized — string yoki {objection, response} object bo'lsa ham
 * frontend uchun bitta string ko'rinishida saqlanadi.
 *
 * Model: Gemini 2.5 Pro (search grounding uchun qo'llab-quvvatlaydi)
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { safeParseJson } from "../../utils/json-repair";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

const RIVAL_MODEL = "gemini-2.5-pro";

interface RivalInput {
  companyId: string;
  competitorName: string;
  context?: string;
}

interface RivalOutput {
  competitorId: string;
  name: string;
  strengths: string[];
  weaknesses: string[];
  counterArgs: string[];
  researchSources?: string[];
}

export class RivalAgent extends BaseAgent<RivalInput, RivalOutput> {
  readonly metadata: AgentMetadata = {
    id: "rival",
    name: "Rival Agent",
    layer: "layer5-advanced",
    version: "2.0.0",
    description:
      "Raqobatchilar haqida real-time Google Search bilan counter-argumentlar tayyorlaydi",
    model: RIVAL_MODEL,
  };

  private client: GoogleGenAI;

  constructor() {
    super();
    this.client = new GoogleGenAI({
      vertexai: true,
      project: process.env.VERTEX_PROJECT || "",
      location: process.env.VERTEX_LOCATION || "us-central1",
    });
  }

  protected async run(input: RivalInput, _ctx: AgentContext): Promise<RivalOutput> {
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { courseInfo: true, name: true },
    });
    if (!company) throw new Error(`Company not found: ${input.companyId}`);

    // ─── Bosqich 1: Google Search orqali real-time research ─────────────
    const research = await this.researchCompetitor(input.competitorName, input.context);

    // ─── Bosqich 2: Pro JSON mode orqali tahlilni strukturalash ─────────
    const prompt = this.buildPrompt(
      company.name,
      company.courseInfo || "",
      input.competitorName,
      input.context,
      research.text,
    );

    const response = await this.client.models.generateContent({
      model: RIVAL_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 16384,
        responseMimeType: "application/json",
      },
    });

    const raw = response.text || "";
    const parsed = safeParseJson(raw);
    if (!parsed) {
      this.logger.error(
        `[Rival] JSON parse fail. Response length: ${raw.length}. First 500: ${raw.slice(0, 500)}`,
      );
      throw new Error(
        `Rival agent JSON parsing failed — ${raw.length === 0 ? "bo'sh javob (ehtimol safety filter yoki grounding xato)" : "javob yaroqsiz"}`,
      );
    }

    const strengths = this.normalizeStringArray(parsed.strengths);
    const weaknesses = this.normalizeStringArray(parsed.weaknesses);
    const counterArgs = this.normalizeCounterArgs(parsed.counterArgs);

    // ─── Upsert ─────────────────────────────────────────────────────────
    const existing = await prisma.competitor.findFirst({
      where: { companyId: input.companyId, name: input.competitorName },
      select: { id: true },
    });

    const saved = existing
      ? await prisma.competitor.update({
          where: { id: existing.id },
          data: {
            strengths: strengths as unknown as object,
            weaknesses: weaknesses as unknown as object,
            counterArgs: counterArgs as unknown as object,
            lastUpdated: new Date(),
          },
        })
      : await prisma.competitor.create({
          data: {
            companyId: input.companyId,
            name: input.competitorName,
            strengths: strengths as unknown as object,
            weaknesses: weaknesses as unknown as object,
            counterArgs: counterArgs as unknown as object,
          },
        });

    return {
      competitorId: saved.id,
      name: input.competitorName,
      strengths,
      weaknesses,
      counterArgs,
      researchSources: research.sources,
    };
  }

  /**
   * Bosqich 1: Google Search grounding bilan multi-source tadqiqot.
   *
   * Gemini 2.5 Pro + googleSearch tool butun internetni (Google, Yandex natijalarida
   * ham ko'rinadi, Facebook page'lar, Instagram, Telegram, YouTube, veb-saytlar,
   * forum sharhlari) tahlil qiladi. Bitta tool — lekin qamrovi keng.
   *
   * Prompt explicit ravishda social/ad manbalarga yo'naltiriladi.
   */
  private async researchCompetitor(
    competitorName: string,
    context?: string,
  ): Promise<{ text: string; sources: string[] }> {
    try {
      const researchPrompt = `Quyidagi raqobatchi kompaniya/xizmat haqida O'ZBEKISTON bozori kontekstida chuqur tadqiqot o'tkaz: "${competitorName}"
${context ? `Kontekst: ${context}` : ""}

Ma'lumotni quyidagi MANBALARDAN yig':
1. Rasmiy veb-sayt (agar bor bo'lsa)
2. Instagram profili — obunachilar soni, postlar, reklamalar
3. Facebook sahifasi va Facebook Ads — ular qaysi reklamalarni ishlatmoqda
4. Telegram kanal yoki bot — mijozlar bilan qanday ishlaydi
5. YouTube kanal — kontent sifati, video ko'rilgan soni
6. Mijoz sharhlari (Google Maps, Otzovik, forumlar, ijtimoiy tarmoq izohlari)
7. TikTok profili (agar bor bo'lsa)
8. Yangiliklar saytlari, intervyular, matbuot chiqishlari

ANIQ MA'LUMOT BER:
- Asoschilari va asosiy o'qituvchilar (shaxsiy brendlari)
- Kompaniya qachon ishga tushgan, necha yillik
- Asosiy kurslar va xizmatlar — nechtasi, qaysi turda
- Narx oraliqlari (agar ochiq bo'lsa) — o'zbek so'mi yoki dollar
- Ijtimoiy tarmoqlarda auditoriya (jami obunachilar, eng ommabop post)
- Reklama strategiyasi (Facebook/Instagram Ads ko'rsatkichlari)
- Mijoz sharhlari (ijobiy va salbiy) — iqtiboslar bilan
- Raqobat afzalliklari (ular nima bilan ajralib turadi)
- Muvaffaqiyatsizliklari (shikoyatlar, mijoz ketishi sabablari)

O'zbek tilida 300–600 so'zli batafsil tadqiqot yoz. FAQAT HAQIQIY FAKTLAR — topilmagan narsani "ma'lumot yo'q" deb belgila, taxmin qilma.`;

      const response = await this.client.models.generateContent({
        model: RIVAL_MODEL,
        contents: [{ role: "user", parts: [{ text: researchPrompt }] }],
        config: {
          temperature: 0.2,
          maxOutputTokens: 4096,
          tools: [{ googleSearch: {} } as any],
        },
      });

      const text = response.text || "";

      // Grounding metadata'dan manbalarni yig'amiz
      const candidate = (response as any).candidates?.[0];
      const groundingChunks = candidate?.groundingMetadata?.groundingChunks || [];
      const webSearchQueries: string[] =
        candidate?.groundingMetadata?.webSearchQueries || [];

      const sources: string[] = groundingChunks
        .map((c: any) => c?.web?.uri || c?.retrievedContext?.uri)
        .filter(Boolean)
        .slice(0, 20);

      this.logger.info(
        `[Rival] Research "${competitorName}": ${text.length} belgi, ${sources.length} manba, ${webSearchQueries.length} qidiruv`,
      );
      if (webSearchQueries.length > 0) {
        this.logger.info(`[Rival] Qidiruvlar: ${webSearchQueries.join(" | ")}`);
      }

      return { text, sources };
    } catch (e: any) {
      this.logger.warn(
        `[Rival] Search grounding xato (fallback-ga o'tadi): ${e?.message?.slice(0, 100)}`,
      );
      return { text: "", sources: [] };
    }
  }

  private buildPrompt(
    ourName: string,
    courseInfo: string,
    competitorName: string,
    context?: string,
    research?: string,
  ): string {
    return `Sen sotuv strategiyasi bo'yicha mutaxassis. Bizning kompaniya va raqobatchini taqqoslaysan.

BIZNING KOMPANIYA: ${ourName}
${courseInfo ? `BIZNING XIZMATIMIZ:\n${courseInfo.slice(0, 2000)}\n` : ""}

RAQOBATCHI: ${competitorName}
${context ? `QO'SHIMCHA KONTEKST: ${context}` : ""}
${research ? `\nQIDIRUV NATIJALARI (real-time):\n${research}\n` : ""}

VAZIFANG:
1. Raqobatchining 3–5 ta kuchli tomonini top — ular sizga qiyin keladigan argumentlar
2. Raqobatchining 3–5 ta zaif tomonini top — siz ulardan yaxshi bo'lgan joylar
3. 5 ta counter-argument yoz — menejer aniq qanday so'z bilan javob berishi kerak

MUHIM: counterArgs elementlari FAQAT STRING bo'lsin — obyekt emas. Har element
bitta to'liq jumla bo'lsin, ichida ham e'tiroz, ham javob matni bo'lsin.

JAVOB FAQAT JSON (boshqa hech narsa):
{
  "strengths": ["kuchli tomon 1", "kuchli tomon 2", ...],
  "weaknesses": ["zaif tomon 1", "zaif tomon 2", ...],
  "counterArgs": [
    "Agar mijoz 'sizda qimmat, ${competitorName}da arzonroq' desa: 'Ha, narxda farq bor, lekin bizda...'",
    "Agar mijoz '${competitorName}ning asoschisi mashhur' desa: 'To'g'ri, lekin bizda...'",
    "..."
  ]
}`;
  }

  /** String array: elementlar object bo'lsa ham readable string ga o'tadi */
  private normalizeStringArray(arr: any): string[] {
    if (!Array.isArray(arr)) return [];
    return arr.map((item) => this.toReadableString(item)).filter((s) => s.length > 0);
  }

  /** Counter args — object ("objection/response") bo'lsa ham string qiladi */
  private normalizeCounterArgs(arr: any): string[] {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        // Tipik shakllar: {objection, response} | {if, then} | {situation, answer}
        const obj = item as Record<string, unknown>;
        const keys = Object.keys(obj);
        // Objection/response shakl
        const objKey = keys.find((k) => /objection|if|situation|question|e.?tiroz|mijoz/i.test(k));
        const respKey = keys.find((k) =>
          /response|then|answer|javob/i.test(k),
        );
        if (objKey && respKey) {
          return `Agar mijoz "${String(obj[objKey])}" desa: "${String(obj[respKey])}"`;
        }
        // Faqat bitta meaningful string key
        const values = Object.values(obj).filter((v) => typeof v === "string" && v.length > 0);
        if (values.length === 1) return String(values[0]);
        if (values.length > 1) return values.map(String).join(" — ");
        return "";
      })
      .filter((s) => s.length > 0);
  }

  /** Har qanday qiymatni o'qilishi mumkin string ga aylantiradi */
  private toReadableString(item: any): string {
    if (typeof item === "string") return item;
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    if (!item) return "";
    if (typeof item === "object") {
      const values = Object.values(item).filter((v) => typeof v === "string");
      if (values.length > 0) return values.join(" — ");
      return "";
    }
    return String(item);
  }
}

export const rivalAgent = new RivalAgent();
