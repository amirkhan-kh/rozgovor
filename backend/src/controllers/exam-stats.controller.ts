/**
 * Exam Stats controller — leaderboard, progress, manager dashboard.
 */
import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

/**
 * GET /api/exam-stats/leaderboard?period=week|month|all
 * Kompaniyadagi sotuvchilar reytingi.
 */
export async function leaderboard(req: Request, res: Response): Promise<void> {
  try {
    const period = (req.query.period as string) || "all";

    // Hozircha faqat SalespersonStats'dan o'rtacha olamiz (butun davr)
    const stats = await prisma.salespersonStats.findMany({
      where: { companyId: req.companyId!, completedExams: { gt: 0 } },
      include: {
        salesperson: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: [{ averageScore: "desc" }, { completedExams: "desc" }],
      take: 50,
    });

    // Hafta yoki oy tanlangan bo'lsa, weeklyScores'dan filter
    const now = new Date();
    const weekKey = getIsoWeekKey(now);
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const rows = stats
      .filter((s) => s.salesperson?.isActive !== false)
      .map((s, i) => {
        const weekly: Array<{ week: string; avg: number; count: number }> =
          (s.weeklyScores as any) || [];

        let periodAvg = s.averageScore;
        let periodCount = s.completedExams;

        if (period === "week") {
          const w = weekly.find((x) => x.week === weekKey);
          periodAvg = w?.avg || 0;
          periodCount = w?.count || 0;
        } else if (period === "month") {
          const m = weekly.filter((x) => x.week.startsWith(monthKey.split("-")[0]) && x.week.includes(`-W`));
          // Oddiy taqribiy: oy ichidagi haftalar
          const monthWeeks = weekly.slice(-4);
          if (monthWeeks.length > 0) {
            const totalCount = monthWeeks.reduce((a, b) => a + b.count, 0);
            const weighted = monthWeeks.reduce((a, b) => a + b.avg * b.count, 0);
            periodAvg = totalCount > 0 ? weighted / totalCount : 0;
            periodCount = totalCount;
          } else {
            periodAvg = 0;
            periodCount = 0;
          }
        }

        return {
          rank: i + 1,
          salespersonId: s.salespersonId,
          name: s.salesperson?.name || "Noma'lum",
          averageScore: Math.round(periodAvg),
          bestScore: s.bestScore,
          totalExams: periodCount,
          streak: s.streak,
          lastExamAt: s.lastExamAt,
        };
      })
      .filter((r) => r.totalExams > 0)
      .sort((a, b) => b.averageScore - a.averageScore)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    success(res, { period, rows });
  } catch (err: any) {
    console.error("[exam-stats] leaderboard:", err?.message || err);
    error(res, "Leaderboard xatosi");
  }
}

/**
 * GET /api/exam-stats/progress?salespersonId=...
 * Sotuvchining haftalik o'sish grafigi va statistikasi.
 */
export async function progress(req: Request, res: Response): Promise<void> {
  try {
    const salespersonId = (req.query.salespersonId as string) || req.managerId;
    if (!salespersonId) { error(res, "salespersonId kerak", 400); return; }

    const stats = await prisma.salespersonStats.findUnique({
      where: { salespersonId },
      include: { salesperson: { select: { id: true, name: true } } },
    });

    if (!stats) {
      success(res, {
        salesperson: null,
        totalExams: 0,
        averageScore: 0,
        bestScore: 0,
        streak: 0,
        weeklyScores: [],
        weakCriteria: [],
        strongCriteria: [],
        scenarioStats: {},
      });
      return;
    }

    const recent = await prisma.examSession.findMany({
      where: {
        salespersonId,
        companyId: req.companyId!,
        status: "completed",
      },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: {
        id: true,
        overallScore: true,
        completedAt: true,
        duration: true,
        scenario: { select: { name: true, difficulty: true, icon: true } },
      },
    });

    success(res, {
      salesperson: stats.salesperson,
      totalExams: stats.totalExams,
      completedExams: stats.completedExams,
      averageScore: Math.round(stats.averageScore),
      bestScore: stats.bestScore,
      streak: stats.streak,
      lastExamAt: stats.lastExamAt,
      weeklyScores: stats.weeklyScores || [],
      weakCriteria: stats.weakCriteria || [],
      strongCriteria: stats.strongCriteria || [],
      scenarioStats: stats.scenarioStats || {},
      recentExams: recent,
    });
  } catch (err: any) {
    console.error("[exam-stats] progress:", err?.message || err);
    error(res, "Progress xatosi");
  }
}

/**
 * GET /api/exam-stats/manager-dashboard
 * Menejer uchun — barcha sotuvchilarning zaif mezonlari, jamoa o'rtachasi, heatmap.
 */
export async function managerDashboard(req: Request, res: Response): Promise<void> {
  try {
    const stats = await prisma.salespersonStats.findMany({
      where: { companyId: req.companyId! },
      include: { salesperson: { select: { id: true, name: true, isActive: true } } },
    });

    const activeStats = stats.filter((s) => s.salesperson?.isActive !== false);

    // Jamoa o'rtachasi
    const teamAvg =
      activeStats.length > 0
        ? activeStats.reduce((a, b) => a + b.averageScore * b.completedExams, 0) /
          Math.max(1, activeStats.reduce((a, b) => a + b.completedExams, 0))
        : 0;
    const totalExams = activeStats.reduce((a, b) => a + b.completedExams, 0);

    // Heatmap: sotuvchi × mezon
    type CritMap = Record<string, { score: number; count: number }>;
    const criteriaByPerson: Record<string, CritMap> = {};

    // Oxirgi 30 kunlik imtihonlar — har bir mezonning o'rtachasi
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const sessions = await prisma.examSession.findMany({
      where: {
        companyId: req.companyId!,
        status: "completed",
        completedAt: { gte: since },
      },
      select: {
        salespersonId: true,
        criteria: true,
        errors: true,
      },
    });

    const errorCounts: Record<string, number> = {};

    for (const s of sessions) {
      const cr = (s.criteria as Record<string, { score: number }>) || {};
      if (!criteriaByPerson[s.salespersonId]) criteriaByPerson[s.salespersonId] = {};
      for (const [name, val] of Object.entries(cr)) {
        const cur = criteriaByPerson[s.salespersonId][name] || { score: 0, count: 0 };
        cur.score += val.score || 0;
        cur.count += 1;
        criteriaByPerson[s.salespersonId][name] = cur;
      }
      const errs = (s.errors as Array<{ type: string }>) || [];
      for (const e of errs) errorCounts[e.type] = (errorCounts[e.type] || 0) + 1;
    }

    const heatmap = activeStats.map((s) => {
      const cm = criteriaByPerson[s.salespersonId] || {};
      const criteria: Record<string, number> = {};
      for (const [name, v] of Object.entries(cm)) {
        criteria[name] = v.count > 0 ? Math.round(v.score / v.count) : 0;
      }
      return {
        salespersonId: s.salespersonId,
        name: s.salesperson?.name || "Noma'lum",
        averageScore: Math.round(s.averageScore),
        completedExams: s.completedExams,
        criteria,
        weakCriteria: s.weakCriteria || [],
      };
    });

    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    success(res, {
      teamAverage: Math.round(teamAvg),
      totalSalespeople: activeStats.length,
      totalExams,
      heatmap,
      topErrors,
    });
  } catch (err: any) {
    console.error("[exam-stats] managerDashboard:", err?.message || err);
    error(res, "Dashboard xatosi");
  }
}

function getIsoWeekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
