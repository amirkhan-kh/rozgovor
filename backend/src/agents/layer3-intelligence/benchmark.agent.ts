/**
 * Benchmark Agent — Layer 3: Intelligence
 *
 * Maqsad: Jamoa statistikasini hisoblash — o'rtacha ball, conversion rate,
 * xato distributsiyasi, har menejer uchun percentile.
 *
 * Nega kerak: Strategist va Coach agentlar aniq dalil bilan ishlaydi —
 * "jamoaning 58% shu xatoni qiladi, Davron 0%". Bu statistika realtime
 * bo'lishi kerak, cache'langan 1 hafta oldingi ma'lumot emas.
 *
 * Model: AI YO'Q — faqat SQL + TypeScript. Tez va arzon.
 * Cache: 1 soat (tez-tez qayta hisoblamaslik uchun)
 */

import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

interface BenchmarkInput {
  companyId: string;
  lookbackDays?: number;
}

interface ErrorDistribution {
  type: string;
  count: number;
  teamPercent: number; // menejerlarning qanchasi shu xatoni qiladi
  managersWithError: number;
  topPerformerHasIt: boolean;
}

interface ManagerPercentile {
  managerId: string;
  managerName: string;
  avgScore: number;
  conversionRate: number;
  rank: number;
  totalManagers: number;
  strongCriteria: string[];
  weakCriteria: string[];
}

interface BenchmarkOutput {
  companyId: string;
  lookbackDays: number;
  teamStats: {
    totalCalls: number;
    totalManagers: number;
    avgScore: number;
    avgConversion: number;
    surrenderRate: number;
    openEndingRate: number;
  };
  errorDistribution: ErrorDistribution[];
  managerPercentiles: ManagerPercentile[];
  computedAt: Date;
}

// Module-level cache — 1 soatga
const cache = new Map<string, { output: BenchmarkOutput; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

export class BenchmarkAgent extends BaseAgent<BenchmarkInput, BenchmarkOutput> {
  readonly metadata: AgentMetadata = {
    id: "benchmark",
    name: "Benchmark Agent",
    layer: "layer3-intelligence",
    version: "1.0.0",
    description:
      "Jamoa statistikasi, xato distributsiyasi va menejerlar percentileni realtime hisoblaydi",
  };

  protected async run(input: BenchmarkInput, _ctx: AgentContext): Promise<BenchmarkOutput> {
    const lookbackDays = input.lookbackDays ?? 30;
    const cacheKey = `${input.companyId}:${lookbackDays}`;

    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.info(`[benchmark] cache hit ${cacheKey}`);
      return cached.output;
    }

    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const analyses = await prisma.analysis.findMany({
      where: {
        audioFile: { companyId: input.companyId },
        createdAt: { gte: since },
      },
      select: {
        overallScore: true,
        criteria: true,
        errors: true,
        audioFile: {
          select: {
            id: true,
            isSale: true,
            managerId: true,
            manager: { select: { name: true } },
          },
        },
      },
    });

    if (analyses.length === 0) {
      const empty: BenchmarkOutput = {
        companyId: input.companyId,
        lookbackDays,
        teamStats: {
          totalCalls: 0,
          totalManagers: 0,
          avgScore: 0,
          avgConversion: 0,
          surrenderRate: 0,
          openEndingRate: 0,
        },
        errorDistribution: [],
        managerPercentiles: [],
        computedAt: new Date(),
      };
      cache.set(cacheKey, { output: empty, expiresAt: Date.now() + CACHE_TTL_MS });
      return empty;
    }

    // ─── Team stats ────────────────────────────────────────────────────
    const totalCalls = analyses.length;
    const avgScore =
      analyses.reduce((s, a) => s + a.overallScore, 0) / Math.max(totalCalls, 1);
    const salesCount = analyses.filter((a) => a.audioFile.isSale === true).length;
    const avgConversion = (salesCount / Math.max(totalCalls, 1)) * 100;

    let surrenderCount = 0;
    let openEndingCount = 0;
    const errorsByType: Record<string, Set<string>> = {};
    const errorCounts: Record<string, number> = {};

    for (const a of analyses) {
      const errs = Array.isArray(a.errors) ? (a.errors as Array<{ type: string }>) : [];
      const mgrId = a.audioFile.managerId || "unknown";

      for (const e of errs) {
        errorCounts[e.type] = (errorCounts[e.type] || 0) + 1;
        if (!errorsByType[e.type]) errorsByType[e.type] = new Set();
        errorsByType[e.type].add(mgrId);

        if (e.type.toLowerCase().includes("taslim") || e.type.includes("E'tiroz")) {
          surrenderCount++;
        }
        if (e.type.toLowerCase().includes("yakun") || e.type.toLowerCase().includes("ending")) {
          openEndingCount++;
        }
      }
    }

    const managerIds = new Set(analyses.map((a) => a.audioFile.managerId).filter(Boolean));
    const totalManagers = managerIds.size;

    // ─── Error distribution ───────────────────────────────────────────
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { topPerformerPlaybook: true },
    });
    const topPerformerIds = new Set<string>();
    const playbook = company?.topPerformerPlaybook as any;
    if (playbook?.byConversion?.managerId) topPerformerIds.add(playbook.byConversion.managerId);
    if (playbook?.byVolume?.managerId) topPerformerIds.add(playbook.byVolume.managerId);
    if (playbook?.balanced?.managerId) topPerformerIds.add(playbook.balanced.managerId);

    const errorDistribution: ErrorDistribution[] = Object.entries(errorCounts)
      .map(([type, count]) => {
        const withErr = errorsByType[type] || new Set();
        const topHasIt = Array.from(topPerformerIds).some((id) => withErr.has(id));
        return {
          type,
          count,
          managersWithError: withErr.size,
          teamPercent:
            totalManagers > 0 ? Math.round((withErr.size / totalManagers) * 100) : 0,
          topPerformerHasIt: topHasIt,
        };
      })
      .sort((a, b) => b.count - a.count);

    // ─── Manager percentiles ──────────────────────────────────────────
    const byManager: Record<
      string,
      { scores: number[]; sales: number; total: number; name: string; criteria: Record<string, number[]> }
    > = {};
    for (const a of analyses) {
      const id = a.audioFile.managerId;
      if (!id) continue;
      if (!byManager[id]) {
        byManager[id] = {
          scores: [],
          sales: 0,
          total: 0,
          name: a.audioFile.manager?.name || "Noma'lum",
          criteria: {},
        };
      }
      byManager[id].scores.push(a.overallScore);
      byManager[id].total++;
      if (a.audioFile.isSale === true) byManager[id].sales++;

      const criteria = a.criteria as Record<string, { score: number }>;
      for (const [name, val] of Object.entries(criteria || {})) {
        if (!byManager[id].criteria[name]) byManager[id].criteria[name] = [];
        byManager[id].criteria[name].push(val.score);
      }
    }

    const managerPercentiles: ManagerPercentile[] = Object.entries(byManager)
      .map(([id, data]) => {
        const avg = data.scores.reduce((s, x) => s + x, 0) / data.scores.length;
        const conv = (data.sales / Math.max(data.total, 1)) * 100;
        const criteriaAvgs = Object.entries(data.criteria).map(([name, scores]) => ({
          name,
          avg: scores.reduce((s, x) => s + x, 0) / scores.length,
        }));
        const sorted = [...criteriaAvgs].sort((a, b) => b.avg - a.avg);
        return {
          managerId: id,
          managerName: data.name,
          avgScore: Math.round(avg),
          conversionRate: Math.round(conv * 10) / 10,
          rank: 0, // keyingi bosqichda to'ldiriladi
          totalManagers,
          strongCriteria: sorted.slice(0, 2).map((c) => c.name),
          weakCriteria: sorted.slice(-2).map((c) => c.name),
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore)
      .map((m, i) => ({ ...m, rank: i + 1 }));

    const output: BenchmarkOutput = {
      companyId: input.companyId,
      lookbackDays,
      teamStats: {
        totalCalls,
        totalManagers,
        avgScore: Math.round(avgScore),
        avgConversion: Math.round(avgConversion * 10) / 10,
        surrenderRate:
          totalCalls > 0 ? Math.round((surrenderCount / totalCalls) * 100) : 0,
        openEndingRate:
          totalCalls > 0 ? Math.round((openEndingCount / totalCalls) * 100) : 0,
      },
      errorDistribution,
      managerPercentiles,
      computedAt: new Date(),
    };

    cache.set(cacheKey, { output, expiresAt: Date.now() + CACHE_TTL_MS });
    return output;
  }

  /**
   * Testlar va manual refresh uchun cache'ni tozalash.
   */
  static clearCache(): void {
    cache.clear();
  }
}

export const benchmarkAgent = new BenchmarkAgent();
