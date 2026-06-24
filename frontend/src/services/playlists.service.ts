import api from "./api";
import { ApiResponse, PlaylistDefinition, PlaylistItem } from "../types";

export const playlistsService = {
  async getDefinitions(): Promise<{ playlists: PlaylistDefinition[] }> {
    const { data } = await api.get<ApiResponse<{ playlists: PlaylistDefinition[] }>>("/playlists");
    return data.data;
  },

  async getItems(key: string, managerId?: string, limit = 30): Promise<{ key: string; items: PlaylistItem[]; total: number }> {
    const params = new URLSearchParams();
    if (managerId) params.append("managerId", managerId);
    params.append("limit", String(limit));
    const { data } = await api.get<ApiResponse<{ key: string; items: PlaylistItem[]; total: number }>>(
      `/playlists/${key}?${params.toString()}`
    );
    return data.data;
  },
};
