import api from "./api";
import { ApiResponse, LeadJourneyData } from "../types";

export interface LeadSearchResult {
  leadId: number | null;
  phoneNumber: string | null;
  statusName: string | null;
  pipelineName: string | null;
  managerName: string | null;
  lastCallAt: string | null;
  isSale: boolean;
}

export const leadsService = {
  async getJourney(leadId: number | string): Promise<LeadJourneyData> {
    const { data } = await api.get<ApiResponse<LeadJourneyData>>(`/leads/${leadId}/journey`);
    return data.data;
  },

  async search(params: { phone?: string; q?: string }): Promise<{ count: number; leads: LeadSearchResult[] }> {
    const query = new URLSearchParams();
    if (params.phone) query.append("phone", params.phone);
    if (params.q) query.append("q", params.q);
    const { data } = await api.get<ApiResponse<{ count: number; leads: LeadSearchResult[] }>>(
      `/leads/search?${query.toString()}`
    );
    return data.data;
  },
};
