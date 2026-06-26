import api from "./api";
import { ApiResponse } from "../types";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  percent: number;
}
export interface FunnelStatus {
  statusId: string | null;
  name: string;
  count: number;
  bucket: string;
}
export interface FunnelReport {
  total: number;
  stages: FunnelStage[];
  byStatus: FunnelStatus[];
}

export interface NewNoAnswer {
  newCount: number;
  noAnswerCount: number;
  newStageTotal: number;
  noAnswerPercent: number;
  note: string;
}

export interface ResponseTime {
  totalLeads: number;
  inHoursLeads: number;
  offHoursLeads: number;
  offHoursPercent: number;
  responseTime: { respondedLeads: number; avgMinutes: number | null; medianMinutes: number | null };
  offHoursResponseTime: { respondedLeads: number; avgMinutes: number | null };
  workHours: string;
  note: string;
}

const qs = (range?: { dateFrom?: string; dateTo?: string }) => {
  const p = new URLSearchParams();
  if (range?.dateFrom) p.append("dateFrom", range.dateFrom);
  if (range?.dateTo) p.append("dateTo", range.dateTo);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const analyticsService = {
  async funnel(range?: { dateFrom?: string; dateTo?: string }): Promise<FunnelReport> {
    const { data } = await api.get<ApiResponse<FunnelReport>>(`/analytics/funnel${qs(range)}`);
    return data.data;
  },
  async newNoAnswer(range?: { dateFrom?: string; dateTo?: string }): Promise<NewNoAnswer> {
    const { data } = await api.get<ApiResponse<NewNoAnswer>>(`/analytics/new-noanswer${qs(range)}`);
    return data.data;
  },
  async responseTime(range?: { dateFrom?: string; dateTo?: string }): Promise<ResponseTime> {
    const { data } = await api.get<ApiResponse<ResponseTime>>(`/analytics/response-time${qs(range)}`);
    return data.data;
  },
};
