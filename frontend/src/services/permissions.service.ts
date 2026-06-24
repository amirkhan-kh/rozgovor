import api from "./api";
import { ApiResponse } from "../types";

export type PageKey =
  | "sales"
  | "audit"
  | "clients"
  | "managers"
  | "rating"
  | "lessons"
  | "audio"
  | "custdev"
  | "scenario"
  | "rivals"
  | "profile";

export type ActionMatrix = Record<string, boolean>;
export type PermissionMatrix = Record<PageKey, ActionMatrix>;

export interface MyPermissionsResponse {
  role: "boss" | "rop" | "manager" | "company";
  matrix: PermissionMatrix;
  isSuperAdmin: boolean;
}

export interface ManagerPermissionsResponse {
  manager: { id: string; name: string; email: string; role: "boss" | "rop" | "manager" };
  matrix: PermissionMatrix;
  overrides: Array<{ pageKey: string; actionKey: string | null; allowed: boolean }>;
}

export interface RolesDefaultsResponse {
  pages: readonly PageKey[];
  actions: Record<PageKey, readonly string[]>;
  defaults: Record<"boss" | "rop" | "manager", PermissionMatrix>;
}

export interface ManagersByRoleResponse {
  role: "boss" | "rop" | "manager";
  managers: Array<{ id: string; name: string; email: string; role: "boss" | "rop" | "manager" }>;
}

export interface PermissionEntry {
  pageKey: string;
  actionKey?: string | null;
  allowed: boolean | null; // null → default'ga qaytarish
}

export const permissionsService = {
  async getMyPermissions(): Promise<MyPermissionsResponse> {
    const { data } = await api.get<ApiResponse<MyPermissionsResponse>>("/permissions/me");
    return data.data;
  },

  async getRolesDefaults(): Promise<RolesDefaultsResponse> {
    const { data } = await api.get<ApiResponse<RolesDefaultsResponse>>("/permissions/roles");
    return data.data;
  },

  async getManagersByRole(role: "rop" | "manager"): Promise<ManagersByRoleResponse> {
    const { data } = await api.get<ApiResponse<ManagersByRoleResponse>>(
      `/permissions/managers?role=${role}`
    );
    return data.data;
  },

  async getManagerPermissions(managerId: string): Promise<ManagerPermissionsResponse> {
    const { data } = await api.get<ApiResponse<ManagerPermissionsResponse>>(
      `/permissions/${managerId}`
    );
    return data.data;
  },

  async updateManagerPermissions(
    managerId: string,
    entries: PermissionEntry[]
  ): Promise<ManagerPermissionsResponse> {
    const { data } = await api.put<ApiResponse<ManagerPermissionsResponse>>(
      `/permissions/${managerId}`,
      { entries }
    );
    return data.data;
  },

  async bulkUpdateManagerPermissions(
    managerIds: string[],
    entries: PermissionEntry[]
  ): Promise<{ updated: number }> {
    const { data } = await api.put<ApiResponse<{ updated: number }>>(
      `/permissions/bulk`,
      { managerIds, entries }
    );
    return data.data;
  },
};
