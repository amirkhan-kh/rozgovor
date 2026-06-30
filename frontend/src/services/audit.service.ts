import api from "./api";
import { ApiResponse } from "../types";

export interface AuditKpis {
  totalCalls: number;
  outgoing: number;
  incoming: number;
  firstCallCount: number;
  repeatCallCount: number;
  avgDurationSec: number;
  totalDurationSec: number;
  avgTimeToContactHours: number;
  contactSampleCount: number;
  totalLeadsCount?: number;
  noConversationCount?: number;
  noLeadCount?: number;
}

export interface AuditOverview {
  period: {
    key: string;
    from: string | null;
    to: string | null;
  };
  kpis: AuditKpis;
}

export interface AuditOverviewParams {
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  managerId?: string;
  managerIds?: string;
  pipelines?: string;
  sourceIds?: string;
  minDurationSec?: number;
}

export type LostVerdictStatus = "right" | "wrong" | "unclear";

export interface LostVerdicts {
  total: number;
  breakdown: { key: LostVerdictStatus; label: string; count: number }[];
}

export const auditService = {
  async getOverview(params: AuditOverviewParams = {}): Promise<AuditOverview> {
    const { data } = await api.get<ApiResponse<AuditOverview>>(
      "/audit/overview",
      { params }
    );
    return data.data;
  },

  async getLostVerdicts(params: AuditOverviewParams = {}): Promise<LostVerdicts> {
    const { data } = await api.get<ApiResponse<LostVerdicts>>(
      "/audit/lost-verdicts",
      { params }
    );
    return data.data;
  },
};
