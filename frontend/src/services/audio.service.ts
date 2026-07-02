import api from "./api";
import { API_BASE_URL } from "./apiBase";
import { ApiResponse, AudioFile, PaginatedResponse, ChatMessage } from "../types";

interface AudioFilters {
  page?: number;
  limit?: number;
  managerId?: string;
  managerIds?: string;
  category?: string;
  status?: string;
  period?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  showNoConversation?: string;
  pipeline?: string;
  minDurationSec?: string;
  rejectionReason?: string;
}

export const audioService = {
  async getAll(filters: AudioFilters = {}): Promise<PaginatedResponse<AudioFile>> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, String(value));
    });
    const { data } = await api.get<ApiResponse<PaginatedResponse<AudioFile>>>(
      `/audio?${params.toString()}`
    );
    return data.data;
  },

  async getOne(id: string): Promise<AudioFile> {
    const { data } = await api.get<ApiResponse<AudioFile>>(`/audio/${id}`);
    return data.data;
  },

  async upload(
    formData: FormData,
    onProgress?: (percent: number) => void
  ): Promise<AudioFile> {
    const { data } = await api.post<ApiResponse<AudioFile>>(
      "/audio/upload",
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (event) => {
          if (event.total && onProgress) {
            const percent = Math.round((event.loaded * 100) / event.total);
            onProgress(percent);
          }
        },
      }
    );
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/audio/${id}`);
  },

  async chat(
    id: string,
    message: string,
    chatHistory: ChatMessage[]
  ): Promise<string> {
    const { data } = await api.post<ApiResponse<{ response: string }>>(
      `/audio/${id}/chat`,
      { message, chatHistory }
    );
    return data.data.response;
  },

  async getTranscription(
    id: string
  ): Promise<{ transcription: string; fileName: string }> {
    const { data } = await api.get<
      ApiResponse<{ transcription: string; fileName: string }>
    >(`/audio/${id}/transcription`);
    return data.data;
  },

  async analyzeOne(id: string): Promise<{ message: string; id: string }> {
    const { data } = await api.post<ApiResponse<{ message: string; id: string }>>(
      `/audio/${id}/analyze`
    );
    return data.data;
  },

  async overrideJudge(
    id: string,
    skipped: boolean
  ): Promise<{ judgeSkipped: boolean; judgeReason: string | null; judgeOverridden: boolean }> {
    const { data } = await api.patch<
      ApiResponse<{ judgeSkipped: boolean; judgeReason: string | null; judgeOverridden: boolean }>
    >(`/audio/${id}/judge-override`, { skipped });
    return data.data;
  },

  async createShareLink(id: string): Promise<{ token: string }> {
    const { data } = await api.post<ApiResponse<{ token: string }>>(
      `/audio/${id}/share`
    );
    return data.data;
  },

  async revokeShareLink(id: string): Promise<void> {
    await api.delete(`/audio/${id}/share`);
  },

  async getSharedAudio(token: string): Promise<AudioFile> {
    // PUBLIC endpoint — auth yo'q
    const { data } = await api.get<ApiResponse<AudioFile>>(
      `/public/audio/${token}`
    );
    return data.data;
  },

  // <audio> elementi header yubora olmaydi → token query param bilan stream.
  // Backend authMiddleware req.query.token ni qabul qiladi; Yandex'dan range bilan uzatadi.
  streamUrl(id: string): string {
    const token = localStorage.getItem("token") || "";
    return `${API_BASE_URL}/audio/${id}/stream?token=${encodeURIComponent(token)}`;
  },

  publicStreamUrl(token: string): string {
    return `${API_BASE_URL}/public/audio/${token}/stream`;
  },

  async analyzeBulk(ids: string[]): Promise<{ message: string; count: number; ids: string[] }> {
    const { data } = await api.post<ApiResponse<{ message: string; count: number; ids: string[] }>>(
      "/audio/analyze-bulk",
      { ids }
    );
    return data.data;
  },

  async backfill(): Promise<{ message: string; processed: number }> {
    const { data } = await api.post<ApiResponse<{ message: string; processed: number }>>(
      "/audio/backfill"
    );
    return data.data;
  },

  async getProgress(): Promise<{
    total: number; done: number; pending: number; processing: number;
    error: number; no_conversation: number; analyzed: number; percent: number;
  }> {
    const { data } = await api.get<ApiResponse<any>>("/audio/progress");
    return data.data;
  },

  async updateTranscription(id: string, transcription: string): Promise<void> {
    await api.put(`/audio/${id}/transcription`, { transcription });
  },

  async syncAmoCrm(dateFrom?: string, dateTo?: string): Promise<any> {
    const { data } = await api.post<ApiResponse<any>>("/amocrm/sync", { dateFrom, dateTo });
    return data.data;
  },

  async stopAnalysis(): Promise<void> {
    await api.post("/audio/stop-analysis");
  },

  async getSyncStatus(): Promise<{ running: boolean; page: number; synced: number; total: number; errors: number }> {
    const { data } = await api.get<ApiResponse<any>>("/amocrm/sync-status");
    return data.data;
  },
};
