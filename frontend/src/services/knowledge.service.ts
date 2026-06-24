import api from "./api";
import { ApiResponse, ObjectionLibrary, SmartTracker } from "../types";

export const knowledgeService = {
  // Objection library
  async getObjections(): Promise<{ library: ObjectionLibrary | null; updatedAt: string | null }> {
    const { data } = await api.get<ApiResponse<{ library: ObjectionLibrary | null; updatedAt: string | null }>>(
      "/knowledge/objections"
    );
    return data.data;
  },

  async refreshObjections(): Promise<void> {
    await api.post("/knowledge/objections/refresh");
  },

  // Smart Trackers
  async getTrackers(): Promise<{ trackers: SmartTracker[] }> {
    const { data } = await api.get<ApiResponse<{ trackers: SmartTracker[] }>>("/knowledge/trackers");
    return data.data;
  },

  async createTracker(payload: { name: string; description: string }): Promise<SmartTracker> {
    const { data } = await api.post<ApiResponse<SmartTracker>>("/knowledge/trackers", payload);
    return data.data;
  },

  async deleteTracker(id: string): Promise<void> {
    await api.delete(`/knowledge/trackers/${id}`);
  },
};
