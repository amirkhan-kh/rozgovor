import api from "./api";
import { ApiResponse } from "../types";

interface AmoStatus {
  connected: boolean;
  domain: string | null;
  expiresAt: string | null;
}

export const amocrmService = {
  async getStatus(): Promise<AmoStatus> {
    const { data } = await api.get<ApiResponse<AmoStatus>>("/amocrm/status");
    return data.data;
  },

  async getAuthUrl(domain: string): Promise<string> {
    const { data } = await api.get<ApiResponse<{ url: string }>>(
      `/amocrm/auth?domain=${domain}`
    );
    return data.data.url;
  },

  async sync(dateFrom?: string): Promise<{ synced: number; total: number }> {
    const { data } = await api.post<ApiResponse<{ synced: number; total: number }>>(
      "/amocrm/sync",
      { dateFrom }
    );
    return data.data;
  },

  async disconnect(): Promise<void> {
    await api.delete("/amocrm/disconnect");
  },
};
