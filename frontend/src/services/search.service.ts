import api from "./api";
import { ApiResponse, ConversationSearchResult } from "../types";

export interface SearchParams {
  dateFrom?: string; // "YYYY-MM-DD" Tashkent local
  dateTo?: string;
  days?: number;
  limit?: number;
}

export const searchService = {
  async ask(
    question: string,
    params: SearchParams = {}
  ): Promise<ConversationSearchResult> {
    const qs = new URLSearchParams();
    if (params.dateFrom) qs.set("dateFrom", params.dateFrom);
    if (params.dateTo) qs.set("dateTo", params.dateTo);
    if (params.days) qs.set("days", String(params.days));
    if (params.limit) qs.set("limit", String(params.limit));
    const { data } = await api.post<ApiResponse<ConversationSearchResult>>(
      `/search?${qs.toString()}`,
      { question }
    );
    return data.data;
  },
};
