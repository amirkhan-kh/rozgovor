import api from "./api";
import { ApiResponse, Company } from "../types";

interface ProfileData extends Company {
  email?: string;
  usedMinutesToday: number;
  managersCount: number;
  activeManagers: number;
  inactiveManagers: number;
  voronkaCount?: number;
  totalAudioFiles?: number;
  totalAudioDuration?: number;
  analyzedAudioFiles?: number;
  analyzedAudioDuration?: number;
  excludedPipelines?: string[];
  courseInfo?: string;
}

interface NotificationSettings {
  telegramEnabled: boolean;
  sendEachAnalysis: boolean;
  dailySummaryEnabled: boolean;
}

export const profileService = {
  async getProfile(): Promise<ProfileData> {
    const { data } = await api.get<ApiResponse<ProfileData>>("/profile");
    return data.data;
  },

  async updateProfile(payload: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    courseInfo?: string;
  }): Promise<Company> {
    const { data } = await api.put<ApiResponse<Company>>("/profile", payload);
    return data.data;
  },

  async updateNotifications(payload: NotificationSettings): Promise<NotificationSettings> {
    const { data } = await api.put<ApiResponse<NotificationSettings>>(
      "/profile/notifications",
      payload
    );
    return data.data;
  },

  async connectTelegram(): Promise<{ link: string }> {
    const { data } = await api.post<ApiResponse<{ link: string }>>(
      "/profile/telegram/connect"
    );
    return data.data;
  },

  async disconnectTelegram(): Promise<void> {
    await api.delete("/profile/telegram/disconnect");
  },

  async updateExcludedPipelines(excludedPipelines: string[]): Promise<{ excludedPipelines: string[] }> {
    const { data } = await api.put<ApiResponse<{ excludedPipelines: string[] }>>(
      "/profile/excluded-pipelines",
      { excludedPipelines }
    );
    return data.data;
  },

  async changePassword(password: string): Promise<void> {
    await api.put("/profile/password", { password });
  },

  async getBotSchedule(): Promise<any> {
    const { data } = await api.get<ApiResponse<any>>("/profile/bot-schedule");
    return data.data;
  },

  async updateBotSchedule(payload: any): Promise<any> {
    const { data } = await api.put<ApiResponse<any>>("/profile/bot-schedule", payload);
    return data.data;
  },
};
