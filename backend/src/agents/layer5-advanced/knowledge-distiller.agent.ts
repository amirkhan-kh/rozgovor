/**
 * Knowledge-Distiller Agent — Layer 5: Advanced
 *
 * Maqsad: Har kuni butun tizimdan (Validator, Pattern Miner, Benchmark,
 * Strategist, Red-Alert) eng muhim 1 ta darsni chiqarib, menejerlarga
 * 30 soniyalik "Bugungi dars" tarzida yetkazish.
 *
 * Nega kerak: Menejerlar ma'lumot ko'pligidan charchamasligi uchun —
 * har kuni bitta aniq, bir lahzada qo'llanadigan saboq.
 *
 * Ritm: Har kuni ertalab 08:00 (scheduler)
 * Output: DailyLesson jadvaliga yoziladi + keyinroq TTS audio
 * Model: Gemini 2.5 Pro
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

const DISTILLER_MODEL = "gemini-2.5-pro";

interface DistillerInput {
  companyId: string;
  date?: Date;
}

interface DistillerOutput {
  id: string;
  date: Date;
  title: string;
  summary: string;
}

export class KnowledgeDistillerAgent extends BaseAgent<DistillerInput, DistillerOutput> {
  readonly metadata: AgentMetadata = {
    id: "knowledge-distiller",
    name: "Knowledge-Distiller Agent",
    layer: "layer5-advanced",
    version: "1.0.0",
    description:
      "Har kuni butun tizimdan eng muhim 1 ta darsni chiqaradi — 30 soniyalik micro-learning",
    model: DISTILLER_MODEL,
    dependencies: ["benchmark", "pattern-miner", "validator"],
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

  protected async run(input: DistillerInput, _ctx: AgentContext): Promise<DistillerOutput> {
    const date = input.date ?? this.normalizeDate(new Date());

    // Idempotency — agar bugungi dars allaqachon bor bo'lsa, qaytaring
    const existing = await prisma.dailyLesson.findUnique({
      where: { companyId_date: { companyId: input.companyId, date } },
    });
    if (existing) {
      return {
        id: existing.id,
        date: existing.date,
        title: existing.title,
        summary: existing.summary,
      };
    }

    // Kecha ichidagi ma'lumot
    const yesterday = new Date(date);
    yesterday.setDate(yesterday.getDate() - 1);

    // 1. Eng ko'p xato (Validator tozalagan)
    const yesterdayAnalyses = await prisma.analysis.findMany({
      where: {
        audioFile: { companyId: input.companyId },
        createdAt: { gte: yesterday, lt: date },
      },
      select: {
        errors: true,
        cleanedAnalysis: { select: { cleanedErrors: true } },
      },
    });

    const errorCounts: Record<string, number> = {};
    for (const a of yesterdayAnalyses) {
      const errs = a.cleanedAnalysis
        ? ((a.cleanedAnalysis.cleanedErrors as Array<{ type: string }>) || [])
        : ((a.errors as Array<{ type: string }>) || []);
      for (const e of errs) {
        errorCounts[e.type] = (errorCounts[e.type] || 0) + 1;
      }
    }
    const topError = Object.entries(errorCounts).sort((a, b) => b[1] - a[1])[0];

    // 2. Top performer playbook (eng yaxshi ustoz iqtiboslari)
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { topPerformerPlaybook: true },
    });
    const playbook = company?.topPerformerPlaybook as any;
    const topPerformer = playbook?.byConversion;
    const technique = topPerformer?.techniques?.[0];

    // 3. Eng yangi golden moment
    const recentGolden = await prisma.goldenMoment.findFirst({
      where: { companyId: input.companyId, createdAt: { gte: yesterday } },
      orderBy: { createdAt: "desc" },
    });

    // Ma'lumot yo'q bo'lsa — bo'sh dars
    if (!topError && !technique && !recentGolden) {
      const fallback = await prisma.dailyLesson.create({
        data: {
          companyId: input.companyId,
          date,
          title: "Bugun — kuzatuv kuni",
          summary:
            "Kecha tahlil uchun yetarli ma'lumot yo'q edi. Bugun ko'p qo'ng'iroq qiling va ertaga biz sizga aniq saboq beramiz.",
          sourceData: {} as unknown as object,
        },
      });
      return {
        id: fallback.id,
        date: fallback.date,
        title: fallback.title,
        summary: fallback.summary,
      };
    }

    const prompt = `Sen sotuv jamoasining "bosh murabbiysi". Har kuni ertalab menejerlarga 30 soniyalik micro-learning dars berasan.

KECHA TIZIM YIG'GAN MA'LUMOT:
${topError ? `- Eng ko'p xato: "${topError[0]}" (${topError[1]} marta)` : ""}
${technique ? `- Sifat ustasining texnikasi: ${technique.name} — misol: "${technique.example}"` : ""}
${recentGolden ? `- Oltin daqiqa topildi: ${recentGolden.technique} — "${recentGolden.quote}"` : ""}

VAZIFANG:
Bitta aniq, qisqa dars bering:
1. Sarlavha — 5-8 so'z, jalb qiluvchi
2. Summary — 3-5 jumla, 30-60 so'z oralig'ida (30 soniyada o'qiladigan)
3. Bitta aniq harakat bering — "bugun shuni sinab ko'ring"
4. O'zbek tilida, samimiy ustoz tilida

JAVOB FAQAT JSON:
{
  "title": "Narxni qiymatdan oldin ayting",
  "summary": "Kecha jamoa eng ko'p 'Qimmat' e'tirozida taslim bo'ldi. Davron esa narxni aytishdan oldin qiymat uchun 30 soniya gap beradi. Bugun sinab ko'ring: narxni aytishdan oldin 'Biz sizga X emas, balki Y sotayapmiz' deb boshlanng."
}`;

    const response = await this.client.models.generateContent({
      model: DISTILLER_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.4,
        maxOutputTokens: 512,
        responseMimeType: "application/json",
      },
    });

    const raw = response.text || "";
    let parsed: any = null;
    try {
      parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, ""));
    } catch {
      parsed = {
        title: "Kechangi dars",
        summary: "Kecha eng ko'p uchragan muammoni keling birga tuzataylik.",
      };
    }

    const saved = await prisma.dailyLesson.create({
      data: {
        companyId: input.companyId,
        date,
        title: String(parsed.title || "Bugungi dars"),
        summary: String(parsed.summary || ""),
        sourceData: {
          topError: topError ? { type: topError[0], count: topError[1] } : null,
          technique: technique?.name || null,
          goldenMoment: recentGolden?.technique || null,
        } as unknown as object,
      },
    });

    this.logger.info(
      `[distiller] ${input.companyId} ${date.toISOString().slice(0, 10)}: "${saved.title}"`,
    );

    return {
      id: saved.id,
      date: saved.date,
      title: saved.title,
      summary: saved.summary,
    };
  }

  private normalizeDate(d: Date): Date {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  }
}

export const knowledgeDistillerAgent = new KnowledgeDistillerAgent();
