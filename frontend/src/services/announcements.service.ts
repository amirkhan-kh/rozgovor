import api from "./api";
import { ApiResponse } from "../types";

export type AnnouncementKind = "motivation" | "encouragement" | "celebration" | "announcement";

export interface Announcement {
  id: string;
  companyId: string;
  kind: AnnouncementKind;
  targetType: "manager" | "department" | "all";
  targetId: string | null;
  title: string | null;
  body: string;
  recipientIds: string[];
  isAI: boolean;
  createdById: string | null;
  createdByRole: string | null;
  sentToTelegram: boolean;
  createdAt: string;
  read?: boolean;
  shown?: boolean;
}

export const announcementsService = {
  async list(): Promise<Announcement[]> {
    const { data } = await api.get<ApiResponse<Announcement[]>>("/announcements");
    return data.data;
  },
  async getUnshown(): Promise<Announcement | null> {
    const { data } = await api.get<ApiResponse<Announcement | null>>("/announcements/unshown");
    return data.data;
  },
  async send(payload: {
    kind: AnnouncementKind;
    targetType: "manager" | "department" | "all";
    targetId?: string | null;
    title?: string;
    body: string;
    isAI?: boolean;
  }): Promise<{ id: string; recipients: number }> {
    const { data } = await api.post<ApiResponse<any>>("/announcements", payload);
    return data.data;
  },
  async aiGenerate(payload: {
    kind: AnnouncementKind;
    targetType: "manager" | "department" | "all";
    targetId?: string | null;
  }): Promise<{ body: string }> {
    const { data } = await api.post<ApiResponse<{ body: string }>>(
      "/announcements/ai-generate",
      payload,
    );
    return data.data;
  },
  async markShown(id: string): Promise<void> {
    await api.post(`/announcements/${id}/shown`);
  },
  async markRead(id: string): Promise<void> {
    await api.post(`/announcements/${id}/read`);
  },
};
