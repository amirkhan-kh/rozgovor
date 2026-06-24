import api from "./api";
import { ApiResponse } from "../types";

export interface ClientSummary {
  id: string;
  phoneNumber: string;
  name: string | null;
  age: number | null;
  gender: string | null;
  region: string | null;
  pipelineId: number | null;
  pipelineName: string | null;
  sourceId: string | null;
  sourceName: string | null;
  callsAnalyzed: number;
  lastCallAt: string | null;
  interests: string[];
  fears: string[];
  decisionTimeDays: number | null;
}

export interface ClientTopItem {
  value: string;
  count: number;
}

export interface ClientDetail extends ClientSummary {
  bitrixLeadIds: number[];
  topQuestions: ClientTopItem[];
  topObjections: ClientTopItem[];
  firstSeenAt: string;
  updatedAt: string;
}

export interface ClientCall {
  id: string;
  callDate: string | null;
  duration: number | null;
  managerName: string | null;
  summary: string | null;
  overallScore: number | null;
}

export interface ClientsResponse {
  total: number;
  page: number;
  perPage: number;
  rows: ClientSummary[];
}

export interface ClientFiltersResponse {
  regions: { value: string; count: number }[];
  pipelines: { id: number; name: string; count: number }[];
  sources: { id: string; name: string; count: number }[];
}

export interface ClientDetailResponse {
  client: ClientDetail;
  calls: ClientCall[];
}

export interface ClientsListParams {
  search?: string;
  region?: string;
  gender?: string;
  pipelineId?: number;
  sourceId?: string;
  page?: number;
  perPage?: number;
}

export interface ClientInsightsParams {
  region?: string;
  gender?: string;
  pipelineId?: number;
  sourceId?: string;
  search?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SectionInsight {
  summary: string;
  recommendation: string;
}

// Narrative summary + recommendation juftliklari.
// Eski versiya string qaytargan bo'lishi mumkin (cache) — frontend ikkalasini ham qo'llab-quvvatlaydi.
export type InsightSection = SectionInsight | string;

export interface ClientAiNarrative {
  interests: InsightSection;
  fears: InsightSection;
  questions: InsightSection;
  objections: InsightSection;
  decisionTime: InsightSection;
}

export interface ClientInsights {
  total: number;
  gender: {
    male: number;
    female: number;
    unknown: number;
    malePercent: number;
    femalePercent: number;
  };
  ageDistribution: { label: string; count: number; percent: number }[];
  avgAge: number | null;
  avgDecisionTimeDays: number | null;
  avgCallsPerClient: number;
  topRegions: { value: string; count: number; percent: number }[];
  topPipelines: { value: string; count: number; percent: number }[];
  topSources: { value: string; count: number; percent: number }[];
  topInterests: { value: string; count: number }[];
  topFears: { value: string; count: number }[];
  topQuestions: { value: string; count: number }[];
  topObjections: { value: string; count: number }[];
  aiNarrative: ClientAiNarrative | null;
}

export interface ClientAiNarrativeResponse {
  aiNarrative: ClientAiNarrative | null;
  cached: boolean;
}

export const clientsService = {
  async list(params: ClientsListParams = {}): Promise<ClientsResponse> {
    const { data } = await api.get<ApiResponse<ClientsResponse>>("/clients", {
      params,
    });
    return data.data;
  },
  async filters(): Promise<ClientFiltersResponse> {
    const { data } = await api.get<ApiResponse<ClientFiltersResponse>>(
      "/clients/filters"
    );
    return data.data;
  },
  async insights(params: ClientInsightsParams = {}): Promise<ClientInsights> {
    const { data } = await api.get<ApiResponse<ClientInsights>>(
      "/clients/insights",
      { params }
    );
    return data.data;
  },
  async aiNarrative(params: ClientInsightsParams = {}): Promise<ClientAiNarrativeResponse> {
    const { data } = await api.get<ApiResponse<ClientAiNarrativeResponse>>(
      "/clients/insights/ai",
      { params }
    );
    return data.data;
  },
  async getOne(id: string): Promise<ClientDetailResponse> {
    const { data } = await api.get<ApiResponse<ClientDetailResponse>>(
      `/clients/${id}`
    );
    return data.data;
  },
};
