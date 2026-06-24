/**
 * Agents Controller — yangi agent tizimining HTTP yuzasi.
 *
 * Bu controller faqat yangi agent endpointlarini ochadi. Eski coach/funnel/managers
 * controllerlariga tegilmaydi — backward compatibility saqlanadi.
 *
 * Endpointlar:
 * - GET  /agents/strategy/:managerId      — haftalik strategiyani o'qish
 * - POST /agents/strategy/:managerId      — qayta generatsiya qilish
 * - GET  /agents/progress/:managerId      — oxirgi progress snapshot
 * - GET  /agents/benchmark                — jamoa statistikasi
 * - GET  /agents/golden-moments/:managerId — yutuqli daqiqalar
 */

import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { strategistAgent } from "../agents/layer3-intelligence/strategist.agent";
import { benchmarkAgent } from "../agents/layer3-intelligence/benchmark.agent";
import { progressAgent } from "../agents/layer4-delivery/progress.agent";
import { feedbackAgent } from "../agents/layer4-delivery/feedback.agent";
import { trainerAgent, TrainerAgent } from "../agents/layer4-delivery/trainer.agent";
import { rivalAgent } from "../agents/layer5-advanced/rival.agent";
import { redAlertAgent } from "../agents/layer5-advanced/red-alert.agent";
import { knowledgeDistillerAgent } from "../agents/layer5-advanced/knowledge-distiller.agent";

/* ─── Weekly Strategy ─────────────────────────────────────────────── */

export const getWeeklyStrategy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const strategy = await prisma.weeklyStrategy.findFirst({
      where: { managerId, companyId: req.companyId },
      orderBy: { weekOf: "desc" },
    });
    if (!strategy) {
      success(res, null);
      return;
    }
    success(res, strategy);
  } catch (err) {
    error(res, "Strategiyani olishda xatolik");
  }
};

export const generateWeeklyStrategy = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const result = await strategistAgent.execute(
      { managerId, companyId: req.companyId! },
      { companyId: req.companyId!, managerId },
    );
    if (!result.success) {
      error(res, result.error || "Strategiya yaratishda xatolik");
      return;
    }
    success(res, result.data);
  } catch (err: any) {
    console.error("generateWeeklyStrategy error:", err?.message || err);
    error(res, "Strategist agent ishga tushmadi");
  }
};

/* ─── Progress ─────────────────────────────────────────────────────── */

export const getManagerProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const history = await prisma.managerProgress.findMany({
      where: { managerId },
      orderBy: { snapshotDate: "desc" },
      take: 12, // oxirgi 3 oy
    });
    success(res, history);
  } catch (err) {
    error(res, "Progress olishda xatolik");
  }
};

export const refreshManagerProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const result = await progressAgent.execute(
      { managerId, companyId: req.companyId! },
      { companyId: req.companyId!, managerId },
    );
    if (!result.success) {
      error(res, result.error || "Progress yangilashda xatolik");
      return;
    }
    success(res, result.data);
  } catch (err: any) {
    error(res, "Progress agent ishga tushmadi");
  }
};

/* ─── Benchmark ────────────────────────────────────────────────────── */

export const getBenchmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await benchmarkAgent.execute(
      { companyId: req.companyId!, lookbackDays: 30 },
      { companyId: req.companyId! },
    );
    if (!result.success) {
      error(res, result.error || "Benchmark olishda xatolik");
      return;
    }
    success(res, result.data);
  } catch (err: any) {
    error(res, "Benchmark agent ishga tushmadi");
  }
};

/* ─── Golden Moments ──────────────────────────────────────────────── */

export const getGoldenMoments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const moments = await prisma.goldenMoment.findMany({
      where: { managerId, companyId: req.companyId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    success(res, moments);
  } catch (err) {
    error(res, "Golden moments olishda xatolik");
  }
};

/* ─── Feedback (👍/👎 on coach output) ────────────────────────────── */

export const submitFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      managerId,
      chatSessionId,
      messageIndex,
      rating,
      reason,
      transcriptContext,
      coachOutput,
    } = req.body;

    if (!rating || !coachOutput) {
      error(res, "rating va coachOutput majburiy", 400);
      return;
    }

    const result = await feedbackAgent.execute(
      {
        companyId: req.companyId!,
        managerId: managerId || undefined,
        chatSessionId: chatSessionId || null,
        messageIndex: messageIndex ?? 0,
        rating,
        reason,
        transcriptContext,
        coachOutput,
      },
      { companyId: req.companyId!, managerId },
    );

    if (!result.success) {
      error(res, result.error || "Feedback saqlashda xatolik");
      return;
    }
    success(res, result.data);
  } catch (err: any) {
    error(res, "Feedback saqlashda xatolik");
  }
};

export const getFeedbackStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await feedbackAgent.getStats(req.companyId!, 30);
    success(res, stats);
  } catch (err) {
    error(res, "Statistika olishda xatolik");
  }
};

export const reviewFeedback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reviewResult } = req.body; // "approved" | "rejected"

    if (!["approved", "rejected"].includes(reviewResult)) {
      error(res, "reviewResult approved yoki rejected bo'lishi kerak", 400);
      return;
    }

    const updated = await prisma.coachFeedback.update({
      where: { id },
      data: {
        reviewed: true,
        reviewResult,
        reviewedAt: new Date(),
      },
    });
    success(res, updated);
  } catch (err) {
    error(res, "Review saqlashda xatolik");
  }
};

/* ─── Trainer (Practice Mode) ─────────────────────────────────────── */

export const getTrainerScenarios = async (_req: Request, res: Response): Promise<void> => {
  try {
    success(res, TrainerAgent.getScenarios());
  } catch (err) {
    error(res, "Ssenariylar olishda xatolik");
  }
};

/**
 * Menejerning joriy haftalik strategiyasi asosida Trainer uchun
 * dinamik ssenariylar ro'yxatini qaytaradi (Strategist → Trainer zanjiri).
 */
export const getStrategyBasedScenarios = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { managerId } = req.params;
    const strategy = await prisma.weeklyStrategy.findFirst({
      where: { managerId, companyId: req.companyId },
      orderBy: { weekOf: "desc" },
    });

    if (!strategy) {
      success(res, { scenarios: TrainerAgent.getScenarios(), dynamic: false });
      return;
    }

    // Strategy.weeklyGoals yangi formatda FocusArea[] yoki eski WeeklyGoal[]
    const rawGoals = (strategy.weeklyGoals as Array<any>) || [];
    const dynamicScenarios: Array<ReturnType<typeof TrainerAgent.buildScenarioFromStrategy>> = [];

    if (rawGoals.length > 0 && rawGoals[0]?.area) {
      // Yangi format
      for (let fi = 0; fi < rawGoals.length; fi++) {
        const fa = rawGoals[fi];
        const exercises = Array.isArray(fa.practiceExercises) ? fa.practiceExercises : [];
        for (let ei = 0; ei < exercises.length; ei++) {
          const ex = exercises[ei];
          dynamicScenarios.push(
            TrainerAgent.buildScenarioFromStrategy(
              fa.area,
              ex.title || fa.area,
              ex.difficulty || "medium",
              `${fi}-${ei}`, // unique suffix — dublikat ID oldini oladi
            ),
          );
        }
      }
    }

    // Dedupikatsiya — bir xil title bo'lgan senariylarni bitta qoldiramiz
    const seen = new Set<string>();
    const uniqueScenarios = dynamicScenarios.filter((s) => {
      const key = (s.title || "").trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Agar dinamik scenariylar yo'q bo'lsa — default'larga qaytish
    if (uniqueScenarios.length === 0) {
      success(res, { scenarios: TrainerAgent.getScenarios(), dynamic: false });
      return;
    }

    success(res, { scenarios: uniqueScenarios, dynamic: true });
  } catch (err) {
    error(res, "Strategiyadan ssenariylar yaratishda xatolik");
  }
};

export const submitPracticeAudio = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const { scenarioId, audioBase64, fileName, attemptNumber, customScenario } = req.body;

    if (!scenarioId || !audioBase64) {
      error(res, "scenarioId va audioBase64 majburiy", 400);
      return;
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    const result = await trainerAgent.execute(
      {
        managerId,
        companyId: req.companyId!,
        scenarioId,
        audioBuffer,
        fileName: fileName || "practice.webm",
        attemptNumber: attemptNumber ?? 1,
        customScenario,
      },
      { companyId: req.companyId!, managerId },
    );

    if (!result.success) {
      error(res, result.error || "Trainer ishga tushmadi");
      return;
    }
    success(res, result.data);
  } catch (err: any) {
    console.error("submitPracticeAudio error:", err?.message || err);
    error(res, "Practice sessiyada xatolik");
  }
};

export const getPracticeHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const history = await prisma.practiceSession.findMany({
      where: { managerId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    success(res, history);
  } catch (err) {
    error(res, "Practice tarixini olishda xatolik");
  }
};

/* ─── Layer 5: Advanced Agents ────────────────────────────────────── */

export const listCompetitors = async (req: Request, res: Response): Promise<void> => {
  try {
    const list = await prisma.competitor.findMany({
      where: { companyId: req.companyId },
      orderBy: { lastUpdated: "desc" },
    });
    success(res, list);
  } catch (err) {
    error(res, "Raqobatchilarni olishda xatolik");
  }
};

export const analyzeCompetitor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { competitorName, context } = req.body;
    if (!competitorName) {
      error(res, "competitorName majburiy", 400);
      return;
    }
    const result = await rivalAgent.execute(
      { companyId: req.companyId!, competitorName, context },
      { companyId: req.companyId! },
    );
    if (!result.success) {
      error(res, result.error || "Rival agent ishga tushmadi");
      return;
    }
    success(res, result.data);
  } catch (err: any) {
    error(res, "Raqobatchi tahlilida xatolik");
  }
};

export const deleteCompetitor = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const existing = await prisma.competitor.findFirst({
      where: { id, companyId: req.companyId },
    });
    if (!existing) {
      error(res, "Raqobatchi topilmadi", 404);
      return;
    }
    await prisma.competitor.delete({ where: { id } });
    success(res, { deleted: true });
  } catch (err) {
    error(res, "Raqobatchini o'chirishda xatolik");
  }
};

export const getRedAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const alerts = await prisma.redAlert.findMany({
      where: { companyId: req.companyId, acknowledged: false },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    success(res, alerts);
  } catch (err) {
    error(res, "Red-Alert olishda xatolik");
  }
};

export const acknowledgeRedAlert = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updated = await prisma.redAlert.update({
      where: { id },
      data: { acknowledged: true, resolvedAt: new Date() },
    });
    success(res, updated);
  } catch (err) {
    error(res, "Red-Alert tasdiqlashda xatolik");
  }
};

export const scanRedAlerts = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await redAlertAgent.execute(
      { companyId: req.companyId! },
      { companyId: req.companyId! },
    );
    if (!result.success) {
      error(res, result.error || "Red-Alert scan ishga tushmadi");
      return;
    }
    success(res, result.data);
  } catch (err) {
    error(res, "Red-Alert scan xatolik");
  }
};

export const getTodayLesson = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lesson = await prisma.dailyLesson.findUnique({
      where: { companyId_date: { companyId: req.companyId!, date: today } },
    });
    success(res, lesson);
  } catch (err) {
    error(res, "Kunlik darsni olishda xatolik");
  }
};

export const generateTodayLesson = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await knowledgeDistillerAgent.execute(
      { companyId: req.companyId! },
      { companyId: req.companyId! },
    );
    if (!result.success) {
      error(res, result.error || "Dars yaratishda xatolik");
      return;
    }
    success(res, result.data);
  } catch (err) {
    error(res, "Distiller agent ishga tushmadi");
  }
};
