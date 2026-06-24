import api from "./api";
import { ApiResponse } from "../types";

interface ManagerWeakness {
  id: string;
  name: string;
  totalFiles: number;
  totalAnalyses: number;
  avgScore: number;
  avgCriteria: Record<string, number>;
  weakCriteria: [string, number][];
  topErrors: [string, number][];
  topObjections: [string, number][];
  lossPoints: string[];
}

interface AdviceResponse {
  managerName: string;
  avgScore: number;
  weakCriteria: [string, number][];
  topErrors: [string, number][];
  advice: string;
}

interface TrainingResponse {
  managerName: string;
  focus: string;
  training: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatResponse {
  reply: string;
}

interface ChatSession {
  id: string;
  title: string;
  managerId: string | null;
  messages: string; // JSON string
  createdAt: string;
  updatedAt: string;
}

export const coachService = {
  async getOverview(): Promise<ManagerWeakness[]> {
    const { data } = await api.get<ApiResponse<ManagerWeakness[]>>("/coach/overview");
    return data.data;
  },

  async chat(messages: ChatMessage[], managerId?: string): Promise<ChatResponse> {
    const { data } = await api.post<ApiResponse<ChatResponse>>("/coach/chat", { messages, managerId });
    return data.data;
  },

  // Chat history
  async getSessions(): Promise<ChatSession[]> {
    const { data } = await api.get<ApiResponse<ChatSession[]>>("/coach/sessions");
    return data.data;
  },
  async getSession(id: string): Promise<ChatSession> {
    const { data } = await api.get<ApiResponse<ChatSession>>(`/coach/sessions/${id}`);
    return data.data;
  },
  async createSession(managerId?: string): Promise<ChatSession> {
    const { data } = await api.post<ApiResponse<ChatSession>>("/coach/sessions", { managerId });
    return data.data;
  },
  async updateSession(id: string, updates: { messages?: ChatMessage[]; title?: string; managerId?: string }): Promise<void> {
    await api.put(`/coach/sessions/${id}`, updates);
  },
  async deleteSession(id: string): Promise<void> {
    await api.delete(`/coach/sessions/${id}`);
  },
};

export type { ChatSession };

export type { ManagerWeakness, AdviceResponse, TrainingResponse };
