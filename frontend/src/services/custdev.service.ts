// Custdev (Customer Development) API service
// Backend: /api/custdev/* endpointlar bilan ishlaydi
import api from "./api";
import { ApiResponse } from "../types";

export type CustdevInterviewStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface CustdevListItem {
  id: string;
  title: string;
  description: string | null;
  aiSummary: string | null;
  createdAt: string;
  updatedAt: string;
  questionCount: number;
  interviewCount: number;
}

export interface CustdevQuestion {
  id: string;
  text: string;
  section: string | null;
  sortOrder: number;
}

export interface CustdevInterviewSummary {
  id: string;
  audioUrl: string;
  durationSec: number | null;
  status: CustdevInterviewStatus;
  aiSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustdevDetail {
  id: string;
  companyId: string;
  title: string;
  description: string | null;
  aiSummary: string | null;
  createdAt: string;
  updatedAt: string;
  questions: CustdevQuestion[];
  interviews: CustdevInterviewSummary[];
}

export interface CustdevAnswer {
  id: string;
  questionId: string;
  interviewId: string;
  answer: string;
  timestamp: number | null;
}

export interface CustdevInterviewQuestionAnswer {
  id: string;
  text: string;
  sortOrder: number;
  answer: CustdevAnswer | null;
}

export interface CustdevInterviewDetail {
  id: string;
  custdevId: string;
  custdevTitle: string;
  audioUrl: string;
  durationSec: number | null;
  status: CustdevInterviewStatus;
  transcription: string | null;
  aiSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  questions: CustdevInterviewQuestionAnswer[];
}

export const custdevService = {
  async list(): Promise<CustdevListItem[]> {
    const { data } = await api.get<ApiResponse<CustdevListItem[]>>("/custdev");
    return data.data;
  },

  async get(id: string): Promise<CustdevDetail> {
    const { data } = await api.get<ApiResponse<CustdevDetail>>(`/custdev/${id}`);
    return data.data;
  },

  async create(payload: {
    title: string;
    description?: string;
    questions?: string[];
  }): Promise<CustdevDetail> {
    const { data } = await api.post<ApiResponse<CustdevDetail>>(
      "/custdev",
      payload
    );
    return data.data;
  },

  async update(
    id: string,
    patch: { title?: string; description?: string | null }
  ): Promise<{ id: string }> {
    const { data } = await api.put<ApiResponse<{ id: string }>>(
      `/custdev/${id}`,
      patch
    );
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/custdev/${id}`);
  },

  // ─── Savollar ─────────────────────────────────────────────
  async addQuestion(id: string, text: string): Promise<CustdevQuestion> {
    const { data } = await api.post<ApiResponse<CustdevQuestion>>(
      `/custdev/${id}/questions`,
      { text }
    );
    return data.data;
  },

  async reorderQuestions(
    id: string,
    orderedIds: string[]
  ): Promise<{ reordered: number }> {
    const { data } = await api.put<ApiResponse<{ reordered: number }>>(
      `/custdev/${id}/questions/reorder`,
      { orderedIds }
    );
    return data.data;
  },

  async updateQuestion(
    qid: string,
    text: string
  ): Promise<CustdevQuestion> {
    const { data } = await api.put<ApiResponse<CustdevQuestion>>(
      `/custdev/questions/${qid}`,
      { text }
    );
    return data.data;
  },

  async deleteQuestion(qid: string): Promise<void> {
    await api.delete(`/custdev/questions/${qid}`);
  },

  // ─── Intervyular ─────────────────────────────────────────
  async uploadInterview(
    id: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<{ id: string; audioUrl: string; status: CustdevInterviewStatus }> {
    const formData = new FormData();
    formData.append("audio", file);
    const { data } = await api.post<
      ApiResponse<{
        id: string;
        audioUrl: string;
        status: CustdevInterviewStatus;
      }>
    >(`/custdev/${id}/interviews`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (e.total && onProgress)
          onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
    return data.data;
  },

  async getInterview(iid: string): Promise<CustdevInterviewDetail> {
    const { data } = await api.get<ApiResponse<CustdevInterviewDetail>>(
      `/custdev/interviews/${iid}`
    );
    return data.data;
  },

  async deleteInterview(iid: string): Promise<void> {
    await api.delete(`/custdev/interviews/${iid}`);
  },
};
