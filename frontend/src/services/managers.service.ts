import api from "./api";
import { ApiResponse, Manager, ManagerGrowthCard } from "../types";

interface ManagerWithCount extends Manager {
  _count: { audioFiles: number };
  totalCalls?: number;
  analyzedCalls?: number;
  sales?: number;
  avgScore?: number;
  conversionRate?: number;
  birinchiQongiroq?: number;
  qayta?: number;
  boshqa?: number;
}

interface ManagerDetail extends ManagerWithCount {
  totalCalls: number;
  analyzedCalls: number;
  sales: number;
  avgScore: number;
  conversionRate: number;
  birinchiQongiroq: number;
  qayta: number;
  boshqa: number;
  audioCount: number;
}

export const managersService = {
  async getAll(): Promise<ManagerWithCount[]> {
    const { data } = await api.get<ApiResponse<ManagerWithCount[]>>("/managers");
    return data.data;
  },

  async syncFromBitrix(): Promise<{
    fetched: number;
    used: number;
    upserted: number;
    reactivated: number;
    deactivated: number;
  }> {
    const { data } = await api.post<
      ApiResponse<{
        fetched: number;
        used: number;
        upserted: number;
        reactivated: number;
        deactivated: number;
      }>
    >("/managers/sync-bitrix");
    return data.data;
  },

  async create(payload: {
    name: string; email: string; password?: string;
    canViewDashboard?: boolean; canViewAll?: boolean;
  }): Promise<Manager> {
    const { data } = await api.post<ApiResponse<Manager>>("/managers", payload);
    return data.data;
  },

  async update(
    id: string,
    payload: {
      name?: string; email?: string; password?: string;
      canViewDashboard?: boolean; canViewAll?: boolean;
    }
  ): Promise<Manager> {
    const { data } = await api.put<ApiResponse<Manager>>(
      `/managers/${id}`,
      payload
    );
    return data.data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/managers/${id}`);
  },

  async archive(id: string): Promise<Manager> {
    const { data } = await api.put<ApiResponse<Manager>>(
      `/managers/${id}/archive`
    );
    return data.data;
  },

  async getDetail(
    id: string,
    params?: { period?: string; dateFrom?: string; dateTo?: string },
  ): Promise<ManagerDetail> {
    const query = new URLSearchParams();
    if (params?.period) query.set("period", params.period);
    if (params?.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params?.dateTo) query.set("dateTo", params.dateTo);
    const qs = query.toString();
    const { data } = await api.get<ApiResponse<ManagerDetail>>(
      `/managers/${id}/detail${qs ? `?${qs}` : ""}`,
    );
    return data.data;
  },

  async getGrowthCard(id: string, days = 30): Promise<ManagerGrowthCard> {
    const { data } = await api.get<ApiResponse<ManagerGrowthCard>>(
      `/managers/${id}/growth-card?days=${days}`
    );
    return data.data;
  },

  async getAudit(params: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    pipelineIds?: string;
    sourceIds?: string;
    search?: string;
  } = {}): Promise<ManagersAuditResponse> {
    const query = new URLSearchParams();
    if (params.period) query.set("period", params.period);
    if (params.dateFrom) query.set("dateFrom", params.dateFrom);
    if (params.dateTo) query.set("dateTo", params.dateTo);
    if (params.category) query.set("category", params.category);
    if (params.pipelineIds) query.set("pipelineIds", params.pipelineIds);
    if (params.sourceIds) query.set("sourceIds", params.sourceIds);
    if (params.search) query.set("search", params.search);
    const qs = query.toString();
    const { data } = await api.get<ApiResponse<ManagersAuditResponse>>(
      `/managers/audit${qs ? `?${qs}` : ""}`
    );
    return data.data;
  },
};

export interface ManagerAuditCard {
  managerId: string;
  managerName: string;
  role: string | null;
  photoUrl: string | null;
  callCount: number;
  dealCount: number;
  totalTalkTime: number;
  avgTalkTime: number;
  overallScore: number;
  criteriaScores: { name: string; score: number }[];
}

export interface ManagersAuditResponse {
  period: { key: string; from: string | null; to: string | null };
  category: string;
  managers: ManagerAuditCard[];
}
