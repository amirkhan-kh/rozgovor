import api from "./api";
import { ApiResponse } from "../types";

// Bitrix activity turlari (asosiy)
//   1 — Meeting (uchrashuv)
//   2 — Call (qo'ng'iroq)
//   3 — Task (topshiriq)
//   4 — Email
//   5 — Other
export type ActivityTypeId = number;

export interface ActivityItem {
  id: string;
  bitrixId: string;
  subject: string | null;
  typeId: ActivityTypeId | null;
  ownerType: number | null;
  dealId: number | null;
  leadId: number | null;
  direction: number | null;
  priority: number | null;
  responsibleId: string | null;
  manager: {
    id: string;
    name: string;
    photoUrl: string | null;
  } | null;
  deadline: string | null;
  startTime: string | null;
  endTime: string | null;
  completed: boolean;
  status: number | null;
  createdBitrix: string | null;
  updatedBitrix: string | null;
}

export interface ActivitiesListResponse {
  count: number;
  activities: ActivityItem[];
}

export interface ActivitiesParams {
  pipelineIds?: string;
  managerIds?: string;
  sourceIds?: string;
  dateFrom?: string;
  dateTo?: string;
  completed?: "true" | "false";
}

export interface SyncResult {
  upserted: number;
  windowDays: number;
}

export const activitiesService = {
  async getAll(params: ActivitiesParams = {}): Promise<ActivitiesListResponse> {
    const { data } = await api.get<ApiResponse<ActivitiesListResponse>>(
      "/activities",
      { params }
    );
    return data.data;
  },
  async sync(days: number = 7): Promise<SyncResult> {
    const { data } = await api.post<ApiResponse<SyncResult>>(
      "/activities/sync",
      null,
      { params: { days } }
    );
    return data.data;
  },
};
