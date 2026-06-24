import api from "./api";
import { ApiResponse } from "../types";

// ─── Types ──────────────────────────────────────────────────────────
export type ManagerVideoStatus = "pending" | "generating" | "ready" | "failed";

export interface ManagerVideo {
  id: string;
  managerId: string;
  scenarioId: number;
  scenarioName: string;
  status: ManagerVideoStatus;
  errorMessage?: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  // Track 1
  musicUrl: string | null;
  musicStartSec: number | null;
  musicEndSec: number | null;
  musicVolume: number | null;
  // Track 2
  musicUrl2: string | null;
  musicStartSec2: number | null;
  musicEndSec2: number | null;
  musicVolume2: number | null;
  finalVideoUrl: string | null;
  finalMixedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MusicTrim {
  startSec: number;
  endSec: number;
  volume: number;
}

// ─── Service ────────────────────────────────────────────────────────
export const managerVideosService = {
  // Upload manager photo (triggers video generation eligibility)
  async uploadPhoto(
    managerId: string,
    file: File,
    onProgress?: (pct: number) => void
  ): Promise<{ customPhotoUrl: string; photoUrl: string }> {
    const formData = new FormData();
    formData.append("photo", file);
    const { data } = await api.post<ApiResponse<{ customPhotoUrl: string }>>(
      `/managers/${managerId}/photo`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }
    );
    // Backend `customPhotoUrl` qaytaradi; eski kod uchun `photoUrl` alias ham
    const url = data.data.customPhotoUrl;
    return { customPhotoUrl: url, photoUrl: url };
  },

  // Start generating 5 scenario videos from uploaded photo
  async generateVideos(managerId: string, extraPrompt?: string): Promise<{ videos: ManagerVideo[] }> {
    const { data } = await api.post<ApiResponse<{ videos: ManagerVideo[] }>>(
      `/managers/${managerId}/generate-videos`,
      extraPrompt?.trim() ? { extraPrompt: extraPrompt.trim() } : {}
    );
    return data.data;
  },

  // List manager's videos
  async listVideos(managerId: string): Promise<ManagerVideo[]> {
    const { data } = await api.get<ApiResponse<ManagerVideo[]>>(
      `/managers/${managerId}/videos`
    );
    return data.data;
  },

  // Single video detail
  async getVideo(videoId: string): Promise<ManagerVideo> {
    const { data } = await api.get<ApiResponse<ManagerVideo>>(
      `/manager-videos/${videoId}`
    );
    return data.data;
  },

  // Upload music file for this video (mp3/m4a/wav)
  async uploadMusic(
    videoId: string,
    file: File,
    track: 1 | 2 = 1,
    onProgress?: (pct: number) => void
  ): Promise<ManagerVideo> {
    const formData = new FormData();
    formData.append("music", file);
    const { data } = await api.post<ApiResponse<ManagerVideo>>(
      `/manager-videos/${videoId}/music?track=${track}`,
      formData,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      }
    );
    return data.data;
  },

  // Update music trim settings
  async setMusicTrim(videoId: string, trim: MusicTrim, track: 1 | 2 = 1): Promise<ManagerVideo> {
    const { data } = await api.put<ApiResponse<ManagerVideo>>(
      `/manager-videos/${videoId}/music?track=${track}`,
      { musicStartSec: trim.startSec, musicEndSec: trim.endSec, volume: trim.volume }
    );
    return data.data;
  },

  // Render final video (ffmpeg mix video + music)
  async renderFinal(videoId: string): Promise<ManagerVideo> {
    const { data } = await api.post<ApiResponse<ManagerVideo>>(
      `/manager-videos/${videoId}/render`
    );
    return data.data;
  },
};
