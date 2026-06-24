import api from "./api";
import { ApiResponse } from "../types";

export interface SalesKpis {
  leadCount: number;
  qualifiedLeadCount: number;    // Bitrix Lead.isConverted (Kval lid)
  qualifiedLeadRate: number;     // kval / jami × 100
  salesCount: number;
  conversionRate: number;        // sotuv / kval × 100
  totalRevenue: number;
  avgCheck: number;              // tushum / sotuv
  partialPaymentCount: number;   // davrda isPartialPayment=true bo'lgan dealar soni
  partialPaymentRevenue: number; // qisman to'lov summasi (UZS)
}

export interface SalesCycle {
  avgDays: number;
  minDays: number;
  maxDays: number;
  sampleCount: number;
}

export interface SalesTimeToContact {
  avgHours: number;
  totalLeadsCount: number;
  contactedLeadsCount: number;
}

export interface SalesByManagerPrev {
  leadCount: number;
  qualifiedLeadCount: number;
  salesCount: number;
  revenue: number;
  conversionRate: number;
}

export interface SalesByManager {
  managerId: string;
  managerName: string;
  role: string | null;
  leadCount: number;
  qualifiedLeadCount: number;
  salesCount: number;
  revenue: number;
  conversionRate: number;
  salesSharePercent: number;
  previous: SalesByManagerPrev | null;
}

export interface BreakdownItem {
  name: string;
  count: number;
}

export interface SalesForecast {
  projectedSales: number;
  projectedRevenue: number;
  planTarget: number | null;
  fulfillmentPct: number | null;
  daysElapsed: number;
  totalDays: number;
  remainingDays: number;
  avgDailySales: number;
  avgDailyRevenue: number;
  planType: "daily" | "weekly" | "monthly" | null;
}

export interface SalesOverview {
  period: {
    key: string;
    from: string | null;
    to: string | null;
  };
  kpis: SalesKpis;
  forecast: SalesForecast | null;
  previousKpis: SalesKpis | null;
  previousPeriod: {
    from: string | null;
    to: string | null;
  } | null;
  cycle: SalesCycle;
  timeToContact: SalesTimeToContact;
  byManager: SalesByManager[];
  leadBreakdown: BreakdownItem[];
  rejectionBreakdown: BreakdownItem[];
}

export interface SalesOverviewParams {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  pipelineIds?: string; // "0,50,64" comma-separated
  managerIds?: string;  // "bitrix_10,bitrix_34"
  sourceIds?: string;   // "PARTNER,CALL,WEBFORM"
  /** Manager nomi bo'yicha qidirish — faqat /sales/managers endpointida */
  search?: string;
}

export interface Pipeline {
  id: number;
  name: string;
  dealCount: number;
}

export interface SalesSource {
  id: string;
  name: string;
  leadCount: number;
}

export interface SalesTaskStats {
  totalOpen: number;
  overdue: number;
  today: number;
  dealsWithoutTask: number;
  openDeals: number;
}

export interface ManagerSalesCard {
  managerId: string;
  managerName: string;
  role: string | null;
  photoUrl: string | null;
  leadCount: number;
  qualifiedLeadCount: number;
  salesCount: number;
  revenue: number;
  conversionRate: number;
  overallScore: number;
  sparkline: { date: string; count: number }[];
  funnel: { lead: number; qualified: number; sale: number };
}

export interface KelishilganTolovDeal {
  id: string;
  title: string;
  agreedPaymentDate: string;
  price: number;
  pipelineName: string | null;
  manager: string | null;
}

export interface KelishilganTolovResponse {
  count: number;
  amount: number;
  period: { from: string | null; to: string | null };
  deals: KelishilganTolovDeal[];
}

export interface ManagersSalesResponse {
  period: { key: string; from: string | null; to: string | null };
  managers: ManagerSalesCard[];
}

export const salesService = {
  async getOverview(params: SalesOverviewParams = {}): Promise<SalesOverview> {
    const { data } = await api.get<ApiResponse<SalesOverview>>("/sales/overview", {
      params,
    });
    return data.data;
  },
  async getTaskStats(params: SalesOverviewParams = {}): Promise<SalesTaskStats> {
    const { data } = await api.get<ApiResponse<SalesTaskStats>>("/sales/task-stats", {
      params,
    });
    return data.data;
  },
  async getManagers(
    params: SalesOverviewParams = {}
  ): Promise<ManagersSalesResponse> {
    const { data } = await api.get<ApiResponse<ManagersSalesResponse>>(
      "/sales/managers",
      { params }
    );
    return data.data;
  },
  async getPipelines(): Promise<Pipeline[]> {
    const { data } = await api.get<ApiResponse<{ pipelines: Pipeline[] }>>(
      "/sales/pipelines"
    );
    return data.data.pipelines;
  },
  async getSources(): Promise<SalesSource[]> {
    const { data } = await api.get<ApiResponse<{ sources: SalesSource[] }>>(
      "/sales/sources"
    );
    return data.data.sources;
  },
  async getKelishilganTolov(
    params: SalesOverviewParams = {}
  ): Promise<KelishilganTolovResponse> {
    const { data } = await api.get<ApiResponse<KelishilganTolovResponse>>(
      "/sales/kelishilgan-tolov",
      { params }
    );
    return data.data;
  },
  async getKpiLeadsList(
    kind: "lid" | "qualified" | "sotuv",
    params: SalesOverviewParams = {}
  ): Promise<KpiLeadsListResponse> {
    const { data } = await api.get<ApiResponse<KpiLeadsListResponse>>(
      "/sales/leads-list",
      { params: { ...params, kind } }
    );
    return data.data;
  },
  async getTaskList(
    kind: "total" | "overdue" | "today" | "noTask",
    params: SalesOverviewParams = {}
  ): Promise<TaskListResponse> {
    const { data } = await api.get<ApiResponse<TaskListResponse>>(
      "/sales/task-list",
      { params: { ...params, kind } }
    );
    return data.data;
  },
};

export interface TaskItem {
  id: string;
  title: string;
  statusName: string | null;
  date: string | null;
  manager: string | null;
  managerPhotoUrl: string | null;
  type: "deal" | "activity";
  ownerId?: string | null;
}

export interface TaskListResponse {
  kind: "total" | "overdue" | "today" | "noTask";
  count: number;
  items: TaskItem[];
}

export interface KpiLeadItem {
  id: string;
  title: string;
  clientPhone?: string | null;
  statusName?: string | null;
  pipelineName?: string | null;
  opportunity?: number;
  price?: number;
  date: string | null;
  sourceName: string | null;
  manager: string | null;
  managerPhotoUrl: string | null;
  isConverted?: boolean;
}

export interface KpiLeadsListResponse {
  kind: "lid" | "qualified" | "sotuv";
  count: number;
  totalAmount?: number;
  items: KpiLeadItem[];
}
