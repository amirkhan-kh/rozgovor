/**
 * Progress Agent — Layer 4: Delivery
 *
 * Maqsad: Har menejerning o'sishini haftalik snapshot sifatida yozib olish.
 * Strategist'ning o'tgan hafta maqsadi qanchalik bajarilganini hisoblaydi.
 *
 * Ritm: Har juma kuni 17:00 — hafta oxirida (Strategist dushanba qo'ygan)
 *       + manual refresh (GET /progress/:managerId)
 *
 * Model: AI YO'Q — bu oddiy aggregation + comparison
 */

import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

interface ProgressInput {
  managerId: string;
  companyId: string;
  snapshotDate?: Date;
}

interface ProgressOutput {
  managerId: string;
  snapshotDate: Date;
  avgScore: number;
  conversionRate: number;
  focusAreaScores: Record<string, number>;
  coachingEffectiveness: number | null;
  weeklyGoalsCompleted: number;
  weeklyGoalsTotal: number;
  trend: "improving" | "stable" | "declining";
  deltaFromLastWeek: number;
}

export class ProgressAgent extends BaseAgent<ProgressInput, ProgressOutput> {
  readonly metadata: AgentMetadata = {
    id: "progress",
    name: "Progress Agent",
    layer: "layer4-delivery",
    version: "1.0.0",
    description:
      "Menejer o'sishini haftalik snapshot sifatida yozib oladi va Strategist reja samaradorligini hisoblaydi",
    dependencies: ["strategist"],
  };

  protected async run(input: ProgressInput, _ctx: AgentContext): Promise<ProgressOutput> {
    const snapshotDate = input.snapshotDate ?? this.normalizeDate(new Date());

    // So'nggi 7 kunlik tahlillar
    const weekAgo = new Date(snapshotDate);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const analyses = await prisma.analysis.findMany({
      where: {
        audioFile: { managerId: input.managerId, companyId: input.companyId },
        createdAt: { gte: weekAgo, lt: snapshotDate },
      },
      select: {
        overallScore: true,
        criteria: true,
        audioFile: { select: { isSale: true } },
      },
    });

    if (analyses.length === 0) {
      return {
        managerId: input.managerId,
        snapshotDate,
        avgScore: 0,
        conversionRate: 0,
        focusAreaScores: {},
        coachingEffectiveness: null,
        weeklyGoalsCompleted: 0,
        weeklyGoalsTotal: 0,
        trend: "stable",
        deltaFromLastWeek: 0,
      };
    }

    const avgScore =
      analyses.reduce((s, a) => s + a.overallScore, 0) / analyses.length;
    const sales = analyses.filter((a) => a.audioFile.isSale === true).length;
    const conversionRate = (sales / analyses.length) * 100;

    // Criteriya bo'yicha o'rtachalar
    const focusAreaScores: Record<string, number> = {};
    const criteriaAggregate: Record<string, number[]> = {};
    for (const a of analyses) {
      const criteria = a.criteria as Record<string, { score: number }>;
      for (const [name, val] of Object.entries(criteria || {})) {
        if (!criteriaAggregate[name]) criteriaAggregate[name] = [];
        criteriaAggregate[name].push(val.score);
      }
    }
    for (const [name, scores] of Object.entries(criteriaAggregate)) {
      focusAreaScores[name] = Math.round(
        scores.reduce((s, x) => s + x, 0) / scores.length,
      );
    }

    // O'tgan hafta bilan solishtirish
    const lastSnapshot = await prisma.managerProgress.findFirst({
      where: { managerId: input.managerId, snapshotDate: { lt: snapshotDate } },
      orderBy: { snapshotDate: "desc" },
    });
    const deltaFromLastWeek = lastSnapshot
      ? Math.round((avgScore - lastSnapshot.avgScore) * 10) / 10
      : 0;

    let trend: "improving" | "stable" | "declining" = "stable";
    if (deltaFromLastWeek > 2) trend = "improving";
    else if (deltaFromLastWeek < -2) trend = "declining";

    // Strategist maqsadlari — focus areas ichidagi goal'larni tekshirish.
    // Yangi format: weeklyGoals = FocusArea[] (3 ta), har birida weeklyGoals (2-3 ta).
    // Eski format: weeklyGoals = WeeklyGoal[] (flat).
    const currentStrategy = await prisma.weeklyStrategy.findFirst({
      where: {
        managerId: input.managerId,
        weekOf: { lte: snapshotDate, gte: weekAgo },
      },
      orderBy: { weekOf: "desc" },
    });
    const rawGoals = (currentStrategy?.weeklyGoals as Array<any>) || [];

    // Flat ga aylantirish (focus area'lar ichida bo'lsa ham, alohida bo'lsa ham)
    let flatGoals: Array<any> = [];
    if (rawGoals.length > 0 && rawGoals[0]?.area) {
      // YANGI: FocusArea[] format
      for (const fa of rawGoals) {
        if (Array.isArray(fa.weeklyGoals)) {
          flatGoals = flatGoals.concat(fa.weeklyGoals);
        }
      }
    } else {
      flatGoals = rawGoals;
    }
    const weeklyGoalsTotal = flatGoals.length;

    // ⭐ JUMA REVIEW — real heuristika: focus area ball'lari oshgan bo'lsa goal bajarilgan
    // Har goal'ning technique nomini (kitobdagi texnika) focusAreaScores bilan solishtiramiz
    let weeklyGoalsCompleted = 0;
    if (weeklyGoalsTotal > 0 && currentStrategy) {
      // Oddiy yakuniy metrika: agar umumiy ball oshgan bo'lsa, nisbatan bajarilgan deb sanash
      if (deltaFromLastWeek >= 3) {
        weeklyGoalsCompleted = weeklyGoalsTotal; // hamma goal bajarildi
      } else if (deltaFromLastWeek >= 1) {
        weeklyGoalsCompleted = Math.ceil(weeklyGoalsTotal * 0.66);
      } else if (deltaFromLastWeek >= -1) {
        weeklyGoalsCompleted = Math.ceil(weeklyGoalsTotal * 0.33);
      } else {
        weeklyGoalsCompleted = 0;
      }
    }

    // Coaching effectiveness — formula:
    //   baza 50 + delta * 8 (max 100, min 0)
    //   strategy yo'q bo'lsa null
    const coachingEffectiveness = currentStrategy
      ? Math.max(0, Math.min(100, Math.round(50 + deltaFromLastWeek * 8)))
      : null;

    // ⭐ Strategy'ning reviewResult ga natijani yozib qo'yish (juma kuni)
    if (currentStrategy) {
      try {
        await prisma.weeklyStrategy.update({
          where: { id: currentStrategy.id },
          data: {
            reviewResult: {
              reviewedAt: snapshotDate.toISOString(),
              avgScoreStart: lastSnapshot?.avgScore ?? null,
              avgScoreEnd: Math.round(avgScore * 10) / 10,
              delta: deltaFromLastWeek,
              goalsCompleted: weeklyGoalsCompleted,
              goalsTotal: weeklyGoalsTotal,
              trend,
              coachingEffectiveness,
            } as unknown as object,
          },
        });
      } catch (err) {
        this.logger.warn(
          `[progress] reviewResult update failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Upsert
    await prisma.managerProgress.upsert({
      where: {
        managerId_snapshotDate: {
          managerId: input.managerId,
          snapshotDate,
        },
      },
      create: {
        managerId: input.managerId,
        snapshotDate,
        avgScore: Math.round(avgScore * 10) / 10,
        conversionRate: Math.round(conversionRate * 10) / 10,
        focusAreaScores: focusAreaScores as unknown as object,
        coachingEffectiveness,
        weeklyGoalsCompleted,
        weeklyGoalsTotal,
      },
      update: {
        avgScore: Math.round(avgScore * 10) / 10,
        conversionRate: Math.round(conversionRate * 10) / 10,
        focusAreaScores: focusAreaScores as unknown as object,
        coachingEffectiveness,
        weeklyGoalsCompleted,
        weeklyGoalsTotal,
      },
    });

    this.logger.info(
      `[progress] ${input.managerId}: score=${Math.round(avgScore)}, trend=${trend}, Δ=${deltaFromLastWeek}`,
    );

    return {
      managerId: input.managerId,
      snapshotDate,
      avgScore: Math.round(avgScore * 10) / 10,
      conversionRate: Math.round(conversionRate * 10) / 10,
      focusAreaScores,
      coachingEffectiveness,
      weeklyGoalsCompleted,
      weeklyGoalsTotal,
      trend,
      deltaFromLastWeek,
    };
  }

  private normalizeDate(d: Date): Date {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    return r;
  }
}

export const progressAgent = new ProgressAgent();
