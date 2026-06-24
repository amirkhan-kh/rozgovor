import api from "./api";

const adminApi = {
  async login(username: string, password: string) {
    const { data } = await api.post("/admin/login", { username, password });
    return data.data;
  },
  async getMe() {
    const { data } = await api.get("/admin/me");
    return data.data;
  },
  async getCompanies() {
    const { data } = await api.get("/admin/companies");
    return data.data;
  },
  async createCompany(payload: {
    name: string;
    username: string;
    password: string;
    totalLimitHours?: number;
    managerLimit?: number;
  }) {
    const { data } = await api.post("/admin/companies", payload);
    return data.data;
  },
  async updateCompany(id: string, payload: any) {
    const { data } = await api.put(`/admin/companies/${id}`, payload);
    return data.data;
  },
  async toggleCompany(id: string) {
    const { data } = await api.put(`/admin/companies/${id}/toggle`);
    return data.data;
  },
  async deleteCompany(id: string) {
    const { data } = await api.delete(`/admin/companies/${id}`);
    return data.data;
  },
  async getCompanyDetail(id: string) {
    const { data } = await api.get(`/admin/companies/${id}`);
    return data.data;
  },
  async setAmoCrm(id: string, payload: any) {
    const { data } = await api.post(`/admin/companies/${id}/amocrm`, payload);
    return data.data;
  },
  async exchangeAmoCrmToken(id: string, payload: {
    domain: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authorizationCode: string;
  }) {
    const { data } = await api.post(`/admin/companies/${id}/amocrm/exchange-token`, payload);
    return data.data;
  },
};

export default adminApi;
