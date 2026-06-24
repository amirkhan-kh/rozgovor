import api from "./api";
import { ApiResponse } from "../types";

interface Summary {
  id: string;
  companyId: string;
  type: string;
  periodFrom: string;
  periodTo: string;
  status: string;
  content: string | null;
  createdAt: string;
}

export const summariesService = {
  async getAll(): Promise<Summary[]> {
    const { data } = await api.get<ApiResponse<Summary[]>>("/summaries");
    return data.data;
  },

  async generate(payload: {
    type: string;
    periodFrom: string;
    periodTo: string;
  }): Promise<Summary> {
    const { data } = await api.post<ApiResponse<Summary>>(
      "/summaries/generate",
      payload
    );
    return data.data;
  },

  async getOne(id: string): Promise<Summary> {
    const { data } = await api.get<ApiResponse<Summary>>(`/summaries/${id}`);
    return data.data;
  },

  async delete(id: string): Promise<void> {
    await api.delete(`/summaries/${id}`);
  },
};

export type { Summary };
