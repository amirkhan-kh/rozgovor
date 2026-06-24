/**
 * Feedback Agent — Layer 4: Delivery
 *
 * Maqsad: Menejerlar Coach javoblariga bergan 👍/👎 fikrlarini yig'ish va
 * taxlil qilish. Noto'g'ri maslahatlarni aniqlab, tizimni yaxshilashga olib keladi.
 *
 * Nima qiladi:
 * 1. Har feedbackni DB'ga saqlaydi (rating, sabab, coach javobi)
 * 2. 👎 lar to'planganda trendni ko'rsatadi (qaysi xato turi, qaysi menejer ko'p ishlatadi)
 * 3. Admin panel uchun feedback statistikasi beradi
 * 4. Kelajakda: tasdiqlangan correction'lar promptga kontratasodif misol sifatida qo'shiladi
 *
 * Model: AI YO'Q — oddiy SQL aggregation
 * Ritm: Realtime (menejer bosganda) + kunlik review
 */

import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

interface FeedbackInput {
  companyId: string;
  managerId?: string;
  chatSessionId?: string | null;
  messageIndex?: number;
  rating: "up" | "down";
  reason?: string;
  transcriptContext?: string;
  coachOutput: string;
}

interface FeedbackOutput {
  id: string;
  rating: "up" | "down";
  saved: boolean;
}

export class FeedbackAgent extends BaseAgent<FeedbackInput, FeedbackOutput> {
  readonly metadata: AgentMetadata = {
    id: "feedback",
    name: "Feedback Agent",
    layer: "layer4-delivery",
    version: "1.0.0",
    description:
      "Menejerlar Coach javoblariga bergan 👍/👎 fikrlarini yig'ib, tizimni yaxshilash uchun analiz qiladi",
  };

  protected async run(input: FeedbackInput, _ctx: AgentContext): Promise<FeedbackOutput> {
    if (!["up", "down"].includes(input.rating)) {
      throw new Error(`Invalid rating: ${input.rating}`);
    }

    const saved = await prisma.coachFeedback.create({
      data: {
        companyId: input.companyId,
        managerId: input.managerId || null,
        chatSessionId: input.chatSessionId || null,
        messageIndex: input.messageIndex ?? 0,
        rating: input.rating,
        reason: input.reason || null,
        transcriptContext: input.transcriptContext || null,
        coachOutput: input.coachOutput,
      },
    });

    this.logger.info(
      `[feedback] ${input.rating === "up" ? "👍" : "👎"} ${saved.id} from ${input.managerId || "anon"}`,
    );

    return {
      id: saved.id,
      rating: input.rating,
      saved: true,
    };
  }

  /**
   * Admin panel uchun feedback statistikasini qaytaradi.
   */
  async getStats(companyId: string, lookbackDays = 30): Promise<{
    total: number;
    positive: number;
    negative: number;
    positiveRate: number;
    pendingReview: number;
    recentNegatives: Array<{
      id: string;
      reason: string | null;
      coachOutput: string;
      createdAt: Date;
    }>;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const all = await prisma.coachFeedback.findMany({
      where: { companyId, createdAt: { gte: since } },
      select: {
        id: true,
        rating: true,
        reason: true,
        coachOutput: true,
        reviewed: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const positive = all.filter((f) => f.rating === "up").length;
    const negative = all.filter((f) => f.rating === "down").length;
    const pendingReview = all.filter((f) => f.rating === "down" && !f.reviewed).length;

    const recentNegatives = all
      .filter((f) => f.rating === "down")
      .slice(0, 10)
      .map((f) => ({
        id: f.id,
        reason: f.reason,
        coachOutput: f.coachOutput.slice(0, 500),
        createdAt: f.createdAt,
      }));

    return {
      total: all.length,
      positive,
      negative,
      positiveRate: all.length > 0 ? Math.round((positive / all.length) * 100) : 0,
      pendingReview,
      recentNegatives,
    };
  }
}

export const feedbackAgent = new FeedbackAgent();
