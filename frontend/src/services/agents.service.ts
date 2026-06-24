import api from "./api";
import { ApiResponse } from "../types";

/* ─── Types ─────────────────────────────────────────────────────── */

export interface WeeklyGoal {
  goal: string;
  target: string;
  measure: string;
  technique: string;
  example: string;
}

export interface PracticeExercise {
  scenarioId: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
}

export interface FocusArea {
  priority: 1 | 2 | 3;
  area: string;
  reason: string;
  weeklyGoals: WeeklyGoal[];
  practiceExercises: PracticeExercise[];
}

export interface WeeklyStrategy {
  id: string;
  managerId: string;
  weekOf: string;
  // 1-darajali focus area (backward compat)
  focusArea: string;
  reason: string;
  // `weeklyGoals` DB da 3 ta focus area ni saqlaydi (Json)
  weeklyGoals: FocusArea[] | WeeklyGoal[];
  practiceExercises: PracticeExercise[];
  status: "active" | "completed" | "skipped";
  createdAt: string;
  reviewResult?: Record<string, unknown> | null;
}

export interface ManagerProgress {
  id: string;
  managerId: string;
  snapshotDate: string;
  avgScore: number;
  conversionRate: number;
  focusAreaScores: Record<string, number>;
  coachingEffectiveness: number | null;
  weeklyGoalsCompleted: number;
  weeklyGoalsTotal: number;
}

export interface BenchmarkStats {
  teamStats: {
    totalCalls: number;
    totalManagers: number;
    avgScore: number;
    avgConversion: number;
    surrenderRate: number;
    openEndingRate: number;
  };
  errorDistribution: Array<{
    type: string;
    count: number;
    teamPercent: number;
    managersWithError: number;
    topPerformerHasIt: boolean;
  }>;
  managerPercentiles: Array<{
    managerId: string;
    managerName: string;
    avgScore: number;
    conversionRate: number;
    rank: number;
    totalManagers: number;
    strongCriteria: string[];
    weakCriteria: string[];
  }>;
}

export interface GoldenMoment {
  id: string;
  managerId: string;
  audioFileId: string;
  timestamp: string;
  technique: string;
  quote: string;
  whyItWorked: string;
  replicable: boolean;
  createdAt: string;
}

/* ─── Service ───────────────────────────────────────────────────── */

export interface TrainerScenario {
  id: string;
  title: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  idealResponse?: string;
}

export interface TrainerEvaluation {
  tone: number;
  speed: number;
  technique: number;
  content: number;
  score: number;
  notes: string;
}

export interface TrainerResult {
  sessionId: string;
  scenario: TrainerScenario;
  userTranscript: string;
  evaluation: TrainerEvaluation;
  feedback: string;
}

export interface PracticeSession {
  id: string;
  managerId: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioPrompt: string;
  userTranscript: string;
  evaluation: TrainerEvaluation;
  feedback: string;
  attemptNumber: number;
  createdAt: string;
}

export interface RedAlert {
  id: string;
  companyId: string;
  managerId: string;
  leadId: string | null;
  audioFileIds: string[];
  riskLevel: "medium" | "high" | "critical";
  reason: string;
  suggestion: string;
  acknowledged: boolean;
  createdAt: string;
}

export interface DailyLesson {
  id: string;
  companyId: string;
  date: string;
  title: string;
  summary: string;
  audioUrl: string | null;
  createdAt: string;
}

export interface Competitor {
  id: string;
  companyId: string;
  name: string;
  strengths: string[];
  weaknesses: string[];
  counterArgs: string[];
  pricingInfo: string | null;
  lastUpdated: string;
}

export interface CoachFeedbackPayload {
  managerId?: string;
  chatSessionId?: string | null;
  messageIndex?: number;
  rating: "up" | "down";
  reason?: string;
  transcriptContext?: string;
  coachOutput: string;
}

export interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
  pendingReview: number;
  recentNegatives: Array<{
    id: string;
    reason: string | null;
    coachOutput: string;
    createdAt: string;
  }>;
}

export const agentsService = {
  async getWeeklyStrategy(managerId: string): Promise<WeeklyStrategy | null> {
    const { data } = await api.get<ApiResponse<WeeklyStrategy | null>>(
      `/agents/strategy/${managerId}`,
    );
    return data.data;
  },

  async generateWeeklyStrategy(managerId: string): Promise<WeeklyStrategy> {
    const { data } = await api.post<ApiResponse<WeeklyStrategy>>(
      `/agents/strategy/${managerId}`,
    );
    return data.data;
  },

  async getProgress(managerId: string): Promise<ManagerProgress[]> {
    const { data } = await api.get<ApiResponse<ManagerProgress[]>>(
      `/agents/progress/${managerId}`,
    );
    return data.data;
  },

  async refreshProgress(managerId: string): Promise<ManagerProgress> {
    const { data } = await api.post<ApiResponse<ManagerProgress>>(
      `/agents/progress/${managerId}/refresh`,
    );
    return data.data;
  },

  async getBenchmark(): Promise<BenchmarkStats> {
    const { data } = await api.get<ApiResponse<BenchmarkStats>>("/agents/benchmark");
    return data.data;
  },

  async getGoldenMoments(managerId: string): Promise<GoldenMoment[]> {
    const { data } = await api.get<ApiResponse<GoldenMoment[]>>(
      `/agents/golden-moments/${managerId}`,
    );
    return data.data;
  },

  async submitFeedback(payload: CoachFeedbackPayload): Promise<{ id: string; rating: "up" | "down" }> {
    const { data } = await api.post<ApiResponse<{ id: string; rating: "up" | "down"; saved: boolean }>>(
      `/agents/feedback`,
      payload,
    );
    return { id: data.data.id, rating: data.data.rating };
  },

  async getFeedbackStats(): Promise<FeedbackStats> {
    const { data } = await api.get<ApiResponse<FeedbackStats>>("/agents/feedback/stats");
    return data.data;
  },

  async getTrainerScenarios(): Promise<TrainerScenario[]> {
    const { data } = await api.get<ApiResponse<TrainerScenario[]>>("/agents/trainer/scenarios");
    return data.data;
  },

  /**
   * Strategist bergan focus areas asosida dinamik ssenariylar ro'yxatini oladi.
   * Agar strategiya bo'lmasa, default ro'yxatga qaytadi.
   */
  async getStrategyBasedScenarios(
    managerId: string,
  ): Promise<{ scenarios: TrainerScenario[]; dynamic: boolean }> {
    const { data } = await api.get<ApiResponse<{ scenarios: TrainerScenario[]; dynamic: boolean }>>(
      `/agents/trainer/scenarios/${managerId}`,
    );
    return data.data;
  },

  async submitPractice(
    managerId: string,
    payload: {
      scenarioId: string;
      audioBase64: string;
      fileName: string;
      attemptNumber?: number;
      customScenario?: {
        title: string;
        category?: string;
        difficulty?: "easy" | "medium" | "hard";
        prompt: string;
        idealResponse?: string;
      };
    },
  ): Promise<TrainerResult> {
    const { data } = await api.post<ApiResponse<TrainerResult>>(
      `/agents/trainer/practice/${managerId}`,
      payload,
    );
    return data.data;
  },

  async getPracticeHistory(managerId: string): Promise<PracticeSession[]> {
    const { data } = await api.get<ApiResponse<PracticeSession[]>>(
      `/agents/trainer/history/${managerId}`,
    );
    return data.data;
  },

  /* ─── Layer 5: Advanced Agents ───────────────────────────────── */

  // Red-Alert
  async getRedAlerts(): Promise<RedAlert[]> {
    const { data } = await api.get<ApiResponse<RedAlert[]>>("/agents/red-alerts");
    return data.data;
  },

  async acknowledgeRedAlert(id: string): Promise<void> {
    await api.put(`/agents/red-alerts/${id}/ack`);
  },

  async scanRedAlerts(): Promise<{ newlyCreated: number }> {
    const { data } = await api.post<ApiResponse<{ newlyCreated: number }>>(
      "/agents/red-alerts/scan",
    );
    return data.data;
  },

  // Daily Lesson
  async getTodayLesson(): Promise<DailyLesson | null> {
    const { data } = await api.get<ApiResponse<DailyLesson | null>>("/agents/daily-lesson");
    return data.data;
  },

  async generateTodayLesson(): Promise<DailyLesson> {
    const { data } = await api.post<ApiResponse<DailyLesson>>("/agents/daily-lesson");
    return data.data;
  },

  // Rival (Competitors)
  async listCompetitors(): Promise<Competitor[]> {
    const { data } = await api.get<ApiResponse<Competitor[]>>("/agents/rival/competitors");
    return data.data;
  },

  async analyzeCompetitor(competitorName: string, context?: string): Promise<Competitor> {
    const { data } = await api.post<ApiResponse<Competitor>>("/agents/rival/analyze", {
      competitorName,
      context,
    });
    return data.data;
  },

  async deleteCompetitor(id: string): Promise<void> {
    await api.delete(`/agents/rival/competitors/${id}`);
  },
};
