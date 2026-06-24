import api from "./api";
import { AuthResponse, ApiResponse } from "../types";

export const authService = {
  async login(username: string, password: string): Promise<AuthResponse> {
    const { data } = await api.post<ApiResponse<AuthResponse>>("/auth/login", {
      username,
      password,
    });
    return data.data;
  },

  async getMe(): Promise<any> {
    const { data } = await api.get<ApiResponse<any>>("/auth/me");
    return data.data;
  },
};
