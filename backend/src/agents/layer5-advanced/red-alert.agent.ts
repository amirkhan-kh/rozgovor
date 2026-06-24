/**
 * Red-Alert Agent — Layer 5: Advanced
 *
 * Maqsad: Yo'qotilishi ehtimoli yuqori bo'lgan (at-risk) bitimlarni topish va
 * menejerga/rahbarga darhol signal berish.
 *
 * Qanday ishlaydi:
 * - Har 6 soatda ishlaydi (scheduler)
 * - Bir xil lead (leadId) bilan 3+ marta gaplashildi
 * - Hali ham aniq keyingi qadam aniqlanmagan
 * - Oxirgi qo'ng'iroq leadHeatScore past yoki openEnding=true
 * - Callback deadline o'tib ketgan bo'lsa → qizil signal
 *
 * Model: AI YO'Q (heuristika) + Flash tavsiya generatsiyasi
 * Notifikatsiya: Telegram (mavjud telegram.ts orqali) — keyinroq ulash mumkin
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

const ALERT_MODEL = "gemini-2.5-flash";

interface RedAlertInput {
  companyId: string;
}

interface RedAlertItem {
  managerId: string;
  leadId: string | null;
  audioFileIds: string[];
  riskLevel: "medium" | "high" | "critical";
  reason: string;
  suggestion: string;
}

interface RedAlertOutput {
  companyId: string;
  alerts: RedAlertItem[];
  newlyCreated: number;
}

export class RedAlertAgent extends BaseAgent<RedAlertInput, RedAlertOutput> {
  readonly metadata: AgentMetadata = {
    id: "red-alert",
    name: "Red-Alert Agent",
    layer: "layer5-advanced",
    version: "1.0.0",
    description:
      "Yo'qotilishi ehtimoli yuqori bo'lgan bitimlarni aniqlaydi va menejerlarga signal beradi",
    model: ALERT_MODEL,
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

  protected async run(input: RedAlertInput, _ctx: AgentContext): Promise<RedAlertOutput> {
    // Oxirgi 14 kun ichida bir xil leadId uchun 3+ qo'ng'iroq bo'lgan menejerlarni topish
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const recentCalls = await prisma.audioFile.findMany({
      where: {
        companyId: input.companyId,
        leadId: { not: null },
        createdAt: { gte: since },
        status: "done",
      },
      select: {
        id: true,
        leadId: true,
        managerId: true,
        isSale: true,
        createdAt: true,
        analysis: {
          select: {
            leadHeatScore: true,
            coachingInsights: true,
            followupDeadline: true,
            followupCompleted: true,
            requiresFollowup: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Lead ID bo'yicha guruhlash
    const byLead: Record<string, typeof recentCalls> = {};
    for (const c of recentCalls) {
      if (!c.leadId || c.isSale) continue; // sotilgan leadlar hisobga olinmaydi
      const key = String(c.leadId);
      if (!byLead[key]) byLead[key] = [];
      byLead[key].push(c);
    }

    const alerts: RedAlertItem[] = [];
    const now = Date.now();

    for (const [leadId, calls] of Object.entries(byLead)) {
      if (calls.length < 3) continue; // kamida 3 urinish

      const last = calls[0]; // eng yangisi
      const analysis = last.analysis;
      if (!analysis) continue;

      let riskLevel: "medium" | "high" | "critical" = "medium";
      let reason = "";

      // Heuristikalar
      if (
        analysis.followupDeadline &&
        analysis.followupDeadline.getTime() < now &&
        !analysis.followupCompleted
      ) {
        riskLevel = "critical";
        reason = `Callback deadline o'tib ketdi (${analysis.followupDeadline.toISOString().slice(0, 10)}), lekin menejer hali qo'ng'iroq qilmagan`;
      } else if (
        typeof analysis.leadHeatScore === "number" &&
        analysis.leadHeatScore < 40 &&
        calls.length >= 4
      ) {
        riskLevel = "high";
        reason = `${calls.length} ta qo'ng'iroq, lekin lead "sovuq" (heat score ${analysis.leadHeatScore}/100)`;
      } else if (calls.length >= 5) {
        riskLevel = "high";
        reason = `${calls.length} ta qo'ng'iroq, hali ham kelishuv yo'q`;
      } else {
        riskLevel = "medium";
        reason = `${calls.length} ta qo'ng'iroq, keyingi qadam noaniq`;
      }

      const suggestion = await this.buildSuggestion(calls.length, reason);

      alerts.push({
        managerId: last.managerId!,
        leadId,
        audioFileIds: calls.slice(0, 5).map((c) => c.id),
        riskLevel,
        reason,
        suggestion,
      });
    }

    // DB ga yozish (duplicatdan saqlanish uchun oxirgi 24 soat ichida xuddi shu leadId + managerId uchun yozuv bo'lsa, yangilamaymiz)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    let newlyCreated = 0;
    for (const a of alerts) {
      const existing = await prisma.redAlert.findFirst({
        where: {
          companyId: input.companyId,
          managerId: a.managerId,
          leadId: a.leadId,
          createdAt: { gte: yesterday },
        },
      });
      if (existing) continue;

      await prisma.redAlert.create({
        data: {
          companyId: input.companyId,
          managerId: a.managerId,
          leadId: a.leadId,
          audioFileIds: a.audioFileIds,
          riskLevel: a.riskLevel,
          reason: a.reason,
          suggestion: a.suggestion,
        },
      });
      newlyCreated++;
    }

    this.logger.info(
      `[red-alert] ${input.companyId}: ${alerts.length} potential, ${newlyCreated} newly created`,
    );

    return {
      companyId: input.companyId,
      alerts,
      newlyCreated,
    };
  }

  private async buildSuggestion(callCount: number, reason: string): Promise<string> {
    const prompt = `Sen sotuv koordinatori. Menejerga 1-2 jumlali aniq maslahat ber.

Vaziyat: ${reason}
Urinishlar soni: ${callCount}

Javob formati: o'zbek tilida, 1-2 jumla, aniq harakat bilan. Masalan: "Bugun qo'ng'iroq qiling va 'ha yoki yo'q' javobini oling — muzlashini to'xtating".

Faqat maslahat matni, boshqa hech nima yo'q.`;

    try {
      const response = await this.client.models.generateContent({
        model: ALERT_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: { temperature: 0.4, maxOutputTokens: 256 },
      });
      return (response.text || "").trim() || "Bugun aloqa qiling va kelishuvga keling";
    } catch {
      return "Bugun aloqa qiling va kelishuvga keling";
    }
  }
}

export const redAlertAgent = new RedAlertAgent();
