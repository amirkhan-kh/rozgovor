import api from "./api";
import { ApiResponse, DashboardStats, FunnelLeakage } from "../types";

interface DashboardFilters {
  period?: string;
  managerId?: string;
  managerIds?: string;
  pipelines?: string;
  sourceIds?: string;
  productIds?: string;
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  pipeline?: string;
  minDurationSec?: number;
}

interface CriteriaGroup {
  team: Record<string, number>;
  managers: Record<string, Record<string, number>>;
}

interface CriteriaData {
  sotuv: CriteriaGroup;
  qayta: CriteriaGroup;
}

interface ErrorItem {
  type: string;
  description: string;
  timestamp: string;
  managerName: string;
  audioFileId: string;
}

interface ErrorSummaryEntry {
  type: string;
  count: number;
  percent: number;
  items?: ErrorItem[];
}

interface ManagerErrorSummary {
  managerId: string | null;
  managerName: string;
  total: number;
  types: ErrorSummaryEntry[];
}

interface ErrorData {
  total: number;
  summary: ErrorSummaryEntry[];
  managerSummary: ManagerErrorSummary[];
}

interface PagedItems<T> {
  items: T[];
  total: number;
}

interface ObjectionData {
  type: string;
  count: number;
  percent: number;
}

interface WinLossData {
  wins: Record<string, Array<{ description: string; timestamp: string; audioFileId: string }>>;
  losses: Record<string, Array<{ description: string; timestamp: string; audioFileId: string }>>;
  totalWins?: number;
  totalLosses?: number;
}

interface CallsTrendData {
  date: string;
  count?: number;
  analyzed?: number;
  synced?: number;
}

interface SpeechRatioData {
  team: { manager: number; client: number };
  managers: Array<{ name: string; manager: number; client: number }>;
}

interface CategoryStatsData {
  total: number;
  categories: Array<{ name: string; count: number }>;
}

interface SalesStatsData {
  total: number;
  managers: Array<{ name: string; count: number; percent: number }>;
}

interface SalesTrendData {
  date: string;
  count: number;
  cumulative: number;
}

const buildParams = (filters: DashboardFilters): string => {
  const params = new URLSearchParams();
  if (filters.period) params.append("period", filters.period);
  if (filters.managerId) params.append("managerId", filters.managerId);
  if (filters.managerIds) params.append("managerIds", filters.managerIds);
  if (filters.pipelines) params.append("pipelines", filters.pipelines);
  if (filters.sourceIds) params.append("sourceIds", filters.sourceIds);
  if (filters.productIds) params.append("productIds", filters.productIds);
  if (filters.dateFrom) params.append("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.append("dateTo", filters.dateTo);
  if (filters.category) params.append("category", filters.category);
  if (filters.pipeline) params.append("pipeline", filters.pipeline);
  if (filters.minDurationSec && filters.minDurationSec > 0) {
    params.append("minDurationSec", String(filters.minDurationSec));
  }
  return params.toString();
};

export const dashboardService = {
  async getStats(filters: DashboardFilters = {}): Promise<DashboardStats> {
    const { data } = await api.get<ApiResponse<DashboardStats>>(
      `/dashboard/stats?${buildParams(filters)}`
    );
    return data.data;
  },

  async getCriteria(filters: DashboardFilters = {}): Promise<CriteriaData> {
    const { data } = await api.get<ApiResponse<CriteriaData>>(
      `/dashboard/criteria?${buildParams(filters)}`
    );
    return data.data;
  },

  async getErrors(filters: DashboardFilters = {}): Promise<ErrorData> {
    const { data } = await api.get<ApiResponse<ErrorData>>(
      `/dashboard/errors?${buildParams(filters)}`
    );
    return data.data;
  },

  async getErrorItems(
    filters: DashboardFilters = {},
    opts: { type: string; managerId?: string; offset?: number; limit?: number }
  ): Promise<PagedItems<ErrorItem>> {
    const sp = new URLSearchParams(buildParams(filters));
    sp.set("type", opts.type);
    if (opts.managerId) sp.set("managerId", opts.managerId);
    sp.set("offset", String(opts.offset ?? 0));
    sp.set("limit", String(opts.limit ?? 20));
    const { data } = await api.get<ApiResponse<PagedItems<ErrorItem>>>(
      `/dashboard/errors/items?${sp.toString()}`
    );
    return data.data;
  },

  async getObjections(filters: DashboardFilters = {}): Promise<ObjectionData[]> {
    const { data } = await api.get<ApiResponse<ObjectionData[]>>(
      `/dashboard/objections?${buildParams(filters)}`
    );
    return data.data;
  },

  async getWinLoss(filters: DashboardFilters = {}): Promise<WinLossData> {
    const { data } = await api.get<ApiResponse<WinLossData>>(
      `/dashboard/win-loss?${buildParams(filters)}`
    );
    return data.data;
  },

  async getCallsTrend(filters: DashboardFilters = {}): Promise<CallsTrendData[]> {
    const { data } = await api.get<ApiResponse<CallsTrendData[]>>(
      `/dashboard/calls-trend?${buildParams(filters)}`
    );
    return data.data;
  },

  async getSpeechRatio(filters: DashboardFilters = {}): Promise<SpeechRatioData> {
    const { data } = await api.get<ApiResponse<SpeechRatioData>>(
      `/dashboard/speech-ratio?${buildParams(filters)}`
    );
    return data.data;
  },

  async getManagerDurations(filters: DashboardFilters = {}): Promise<Array<{ name: string; avgDuration: number; totalDuration: number; callsCount: number }>> {
    const { data } = await api.get<ApiResponse<Array<{ name: string; avgDuration: number; totalDuration: number; callsCount: number }>>>(
      `/dashboard/manager-durations?${buildParams(filters)}`
    );
    return data.data;
  },

  async getCategoryStats(filters: DashboardFilters = {}): Promise<CategoryStatsData> {
    const { data } = await api.get<ApiResponse<CategoryStatsData>>(
      `/dashboard/category-stats?${buildParams(filters)}`
    );
    return data.data;
  },

  async getSalesStats(filters: DashboardFilters = {}): Promise<SalesStatsData> {
    const { data } = await api.get<ApiResponse<SalesStatsData>>(
      `/dashboard/sales-stats?${buildParams(filters)}`
    );
    return data.data;
  },

  async getSalesTrend(filters: DashboardFilters = {}): Promise<SalesTrendData[]> {
    const { data } = await api.get<ApiResponse<SalesTrendData[]>>(
      `/dashboard/sales-trend?${buildParams(filters)}`
    );
    return data.data;
  },

  async getFunnelLeakage(days = 30): Promise<FunnelLeakage> {
    const { data } = await api.get<ApiResponse<FunnelLeakage>>(
      `/funnel/leakage?days=${days}`
    );
    return data.data;
  },
};

export type { CriteriaData, CriteriaGroup, ErrorData, ErrorItem, ErrorSummaryEntry, ManagerErrorSummary, PagedItems, ObjectionData, WinLossData, CallsTrendData, SpeechRatioData, CategoryStatsData, SalesStatsData, SalesTrendData, DashboardFilters };
