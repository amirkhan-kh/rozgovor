import api from "./api";

export interface PipelineStats {
  name: string;
  totalCalls: number;
  analyzedCalls: number;
  sotuv: number;
  birinchiQongiroq: number;
  qayta: number;
  boshqa: number;
  avgScore: number;
  conversionRate: number;
  isArchived: boolean;
}

export const voronkaService = {
  async getAll(showArchived?: boolean): Promise<PipelineStats[]> {
    const params = showArchived ? "?showArchived=true" : "";
    const { data } = await api.get(`/voronka${params}`);
    return data.data;
  },
  async getDetail(name: string): Promise<any> {
    const { data } = await api.get(`/voronka/${encodeURIComponent(name)}`);
    return data.data;
  },
  async getCriteria(name: string, filters?: any): Promise<any> {
    const params = new URLSearchParams(filters || {}).toString();
    const { data } = await api.get(`/voronka/${encodeURIComponent(name)}/criteria?${params}`);
    return data.data;
  },
  async getErrors(name: string, filters?: any): Promise<any> {
    const params = new URLSearchParams(filters || {}).toString();
    const { data } = await api.get(`/voronka/${encodeURIComponent(name)}/errors?${params}`);
    return data.data;
  },
  async toggleArchive(name: string): Promise<{ name: string; isArchived: boolean }> {
    const { data } = await api.put(`/voronka/${encodeURIComponent(name)}/archive`);
    return data.data;
  },
};
