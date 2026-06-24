import api from "./api";

export interface ExamScenario {
  id: string;
  code: string;
  name: string;
  description: string;
  difficulty: "easy" | "medium" | "hard";
  icon: string;
  category?: "sotuv" | "qayta";
}

export interface ExamTurnResponse {
  salespersonText: string;
  clientMessage: string;
  audioBase64: string;
}

export interface ExamStartResponse {
  sessionId: string;
  scenario: { id: string; code: string; name: string; difficulty: string };
  clientMessage: string;
  audioBase64: string;
  clientName?: string | null;
  clientAge?: number | null;
  clientGender?: "male" | "female" | null;
  weakestCriterion?: { name: string; score: number; comment?: string };
  auditAudioId?: string;
}

export interface AutoExamPersonaPublic {
  age: number;
  gender: "male" | "female";
  name: string;
  interests: string[];
  fears: string[];
  mainQuestion?: string | null;
  mainObjection?: string | null;
}

export interface AutoExamPlanPublic {
  auditAudioId: string;
  weakestCriterion: { name: string; score: number; comment?: string };
  persona: AutoExamPersonaPublic;
  scenario: {
    name: string;
    description: string;
    difficulty: "easy" | "medium" | "hard";
    icon: string;
  };
}

export interface AutoExamPreview {
  examEnabled: boolean;
  plan: AutoExamPlanPublic | null;
  reason?: "disabled" | "no_analysis";
}

export interface ExamResult {
  sessionId: string;
  status: string;
  overallScore: number;
  criteria: Record<string, { score: number; comment: string }>;
  errors: Array<{ type: string; description: string; bookRef?: string }>;
  winPoints: Array<{ description: string; bookRef?: string }>;
  coaching: Array<{
    mistake: string;
    advice: string;
    bookChapter: string;
    bookQuote: string;
  }>;
  summary: string;
  duration?: number;
  messages: Array<{ role: "salesperson" | "client"; text: string; ts: number }>;
  examOutcome?: "passed" | "failed" | "retry" | null;
  attemptsLeft?: number;
  targetScore?: number | null;
}

export const voiceExamService = {
  async listScenarios(): Promise<ExamScenario[]> {
    const r = await api.get("/voice-exam/scenarios");
    return r.data.data;
  },

  async start(): Promise<ExamStartResponse> {
    const r = await api.post("/voice-exam/start");
    return r.data.data;
  },

  async getPending(): Promise<{
    examEnabled: boolean;
    pending: {
      scenario: ExamScenario;
      age: number | null;
      gender: "male" | "female" | null;
      name: string | null;
      assignedAt: string;
    } | null;
  }> {
    const r = await api.get("/voice-exam/pending");
    return r.data.data;
  },

  async previewAuto(): Promise<AutoExamPreview> {
    const r = await api.get("/voice-exam/auto/preview");
    return r.data.data;
  },

  async sendTurn(sessionId: string, audioBlob: Blob): Promise<ExamTurnResponse> {
    const fd = new FormData();
    fd.append("audio", audioBlob, "turn.webm");
    const r = await api.post(`/voice-exam/${sessionId}/turn`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return r.data.data;
  },

  async finish(sessionId: string): Promise<ExamResult> {
    const r = await api.post(`/voice-exam/${sessionId}/finish`);
    return r.data.data;
  },

  async abandon(sessionId: string): Promise<void> {
    await api.post(`/voice-exam/${sessionId}/abandon`);
  },

  async getResult(sessionId: string): Promise<ExamResult> {
    const r = await api.get(`/voice-exam/${sessionId}`);
    return r.data.data;
  },

  async history(salespersonId?: string): Promise<any[]> {
    const r = await api.get("/voice-exam/history", {
      params: salespersonId ? { salespersonId } : {},
    });
    return r.data.data;
  },

  async getLiveToken(sessionId: string): Promise<{ token: string; model: string; expiresAt: string }> {
    const r = await api.post(`/voice-exam/${sessionId}/live-token`);
    return r.data.data;
  },

  async saveLiveTurn(sessionId: string, role: "salesperson" | "client", text: string): Promise<void> {
    await api.post(`/voice-exam/${sessionId}/save-turn`, { role, text });
  },
};

export const examAdminService = {
  async getManagers(): Promise<any[]> {
    const r = await api.get("/voice-exam/admin/managers");
    return r.data.data;
  },
  async toggleAccess(managerId: string, enabled: boolean): Promise<void> {
    await api.post("/voice-exam/admin/toggle", { managerId, enabled });
  },
  async assign(payload: {
    managerId: string;
    scenarioId: string;
    clientAge?: number;
    clientGender?: "male" | "female";
    clientName?: string;
    targetScore?: number;
    maxAttempts?: number;
  }): Promise<void> {
    await api.post("/voice-exam/admin/assign", payload);
  },
  async unassign(managerId: string): Promise<void> {
    await api.delete(`/voice-exam/admin/assign/${managerId}`);
  },
  async assignAuto(managerId: string, targetScore?: number, maxAttempts?: number): Promise<{
    scenario: { id: string; code: string; name: string; icon: string; difficulty: string };
    clientAge: number;
    clientGender: "male" | "female";
    clientName: string;
    reason: string;
    basedOnAudio: { id: string; mezonScore: number; mezonName: string } | null;
    targetScore: number;
    maxAttempts: number;
  }> {
    const r = await api.post("/voice-exam/admin/assign-auto", { managerId, targetScore, maxAttempts });
    return r.data.data;
  },
  async updateTarget(managerId: string, targetScore: number, maxAttempts?: number): Promise<void> {
    await api.post("/voice-exam/admin/assign-target", { managerId, targetScore, maxAttempts });
  },
};

export const examStatsService = {
  async leaderboard(period: "week" | "month" | "all" = "all") {
    const r = await api.get("/exam-stats/leaderboard", { params: { period } });
    const data = r.data.data;
    return Array.isArray(data) ? data : (data?.rows || []);
  },
  async progress(salespersonId?: string) {
    const r = await api.get("/exam-stats/progress", {
      params: salespersonId ? { salespersonId } : {},
    });
    return r.data.data;
  },
  async managerDashboard() {
    const r = await api.get("/exam-stats/manager-dashboard");
    return r.data.data;
  },
};

export const featurePermissionsService = {
  async me(): Promise<{ role: string; features: Record<string, boolean> }> {
    const r = await api.get("/feature-permissions/me");
    return r.data.data;
  },
  async list() {
    const r = await api.get("/feature-permissions");
    return r.data.data;
  },
  async set(feature: string, role: string, enabled: boolean) {
    await api.put("/feature-permissions", { feature, role, enabled });
  },
};
