import api from "./api";
import { ApiResponse, Rating } from "../types";

export interface SalesLeaderboardRow {
  managerId: string;
  managerName: string;
  role: string | null;
  photoUrl: string | null;
  plan: number;
  fakt: number;
  salesCount: number;
  revenue: number;
  conversion: number;
  todayCount: number;
  percent: number;
  kpiPercent: number;
  kpiAmount: number;
}

export interface SalesLeaderboardResponse {
  mode: "count" | "amount";
  period: { key: string; from: string; to: string };
  planType: "daily" | "weekly" | "monthly";
  rows: SalesLeaderboardRow[];
}

export const ratingService = {
  async getRating(
    period = "month",
    dateFrom?: string,
    dateTo?: string
  ): Promise<Rating[]> {
    let url = `/rating?period=${period}`;
    if (period === "custom" && dateFrom && dateTo) {
      url += `&dateFrom=${dateFrom}&dateTo=${dateTo}`;
    }
    const { data } = await api.get<ApiResponse<Rating[]>>(url);
    return data.data;
  },

  async getSalesLeaderboard(
    period = "month",
    dateFrom?: string,
    dateTo?: string
  ): Promise<SalesLeaderboardResponse> {
    const params = new URLSearchParams({ period });
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    const { data } = await api.get<ApiResponse<SalesLeaderboardResponse>>(
      `/rating/sales?${params.toString()}`
    );
    return data.data;
  },

  async getSalesPlanMode(): Promise<"count" | "amount"> {
    const { data } = await api.get<ApiResponse<{ mode: "count" | "amount" }>>(
      "/rating/sales-mode"
    );
    return data.data.mode;
  },

  async setSalesPlanMode(mode: "count" | "amount"): Promise<void> {
    await api.put("/rating/sales-mode", { mode });
  },

  async setManagerSalesPlan(
    managerId: string,
    type: "daily" | "weekly" | "monthly",
    target: number
  ): Promise<void> {
    await api.put(`/rating/sales-plan/${managerId}?type=${type}`, { target });
  },

  async setManagerKpi(managerId: string, kpiPercent: number): Promise<void> {
    await api.put(`/rating/manager-kpi/${managerId}`, { kpiPercent });
  },
};
