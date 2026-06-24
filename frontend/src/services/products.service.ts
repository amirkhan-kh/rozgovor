import api from "./api";

export interface ProductListItem {
  id: string;
  name: string;
  bitrixEnumId?: string | null;
  description?: string | null;
  knowledgeBase?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    documents: number;
    leads: number;
    salesLeads: number;
    audioFiles: number;
  };
}

export interface ProductDetail extends ProductListItem {
  documents: Array<{
    id: string;
    filename: string;
    fileType: string;
    size: number;
    summary?: string | null;
    createdAt: string;
    reportStatus: string;
  }>;
}

export interface ProductWithStats {
  id: string;
  name: string;
  sales: {
    lid: number;
    konv: number;
    sotuv: number;
    summa: number;
    dailyTrend: { date: string; count: number }[];
  };
  audit: {
    score: number;
    totalDuration: number;
    avgDuration: number;
    audioCount: number;
    deals: string;
    criteria: Record<string, number>;
  };
}

export const productsService = {
  async withStats(period: "today" | "week" | "month" | "all" = "month"): Promise<ProductWithStats[]> {
    const r = await api.get("/products/with-stats", { params: { period } });
    return r.data.data;
  },
  async list(): Promise<ProductListItem[]> {
    const r = await api.get("/products");
    return r.data.data;
  },
  async get(id: string): Promise<ProductDetail> {
    const r = await api.get(`/products/${id}`);
    return r.data.data;
  },
  async update(id: string, payload: Partial<{ name: string; description: string; knowledgeBase: string; isActive: boolean }>): Promise<ProductListItem> {
    const r = await api.patch(`/products/${id}`, payload);
    return r.data.data;
  },
};
