import api from "./api";
import { ApiResponse, CriteriaCategory, Criteria } from "../types";

export const criteriaService = {
  async getAll(): Promise<CriteriaCategory[]> {
    const { data } = await api.get<ApiResponse<CriteriaCategory[]>>("/criteria");
    return data.data;
  },

  async createCategory(payload: {
    name: string;
    description?: string;
  }): Promise<CriteriaCategory> {
    const { data } = await api.post<ApiResponse<CriteriaCategory>>(
      "/criteria/categories",
      payload
    );
    return data.data;
  },

  async updateCategory(
    id: string,
    payload: { name: string; description?: string }
  ): Promise<CriteriaCategory> {
    const { data } = await api.put<ApiResponse<CriteriaCategory>>(
      `/criteria/categories/${id}`,
      payload
    );
    return data.data;
  },

  async deleteCategory(id: string): Promise<void> {
    await api.delete(`/criteria/categories/${id}`);
  },

  async createCriteria(payload: {
    categoryId: string;
    name: string;
    description: string;
    weight: number;
  }): Promise<Criteria> {
    const { data } = await api.post<ApiResponse<Criteria>>("/criteria", payload);
    return data.data;
  },

  async updateCriteria(
    id: string,
    payload: { name: string; description: string; weight: number }
  ): Promise<Criteria> {
    const { data } = await api.put<ApiResponse<Criteria>>(
      `/criteria/${id}`,
      payload
    );
    return data.data;
  },

  async deleteCriteria(id: string): Promise<void> {
    await api.delete(`/criteria/${id}`);
  },

  async reorder(ids: string[], type: "criteria" | "category" = "criteria"): Promise<void> {
    await api.post("/criteria/reorder", { ids, type });
  },
};
