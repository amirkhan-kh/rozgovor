import api from "./api";
import { ApiResponse } from "../types";

interface SalesPlans {
  daily: number;
  weekly: number;
  monthly: number;
}

interface PlanFact {
  daily: { plan: number; fact: number; percent: number };
  weekly: { plan: number; fact: number; percent: number };
  monthly: { plan: number; fact: number; percent: number };
}

interface TalkTarget {
  dailyMinutes: number;
}

interface ManagerTalkStat {
  id: string;
  name: string;
  actualMinutes: number;
  targetMinutes: number;
  percent: number;
}

interface TalkStats {
  target: number;
  managers: ManagerTalkStat[];
}

interface DailyTalkDay {
  date: string;
  actualMinutes: number;
  targetMinutes: number;
  percent: number;
}

interface DailyTalkManager {
  managerId: string;
  name: string;
  days: DailyTalkDay[];
  totalActualMinutes: number;
  totalTargetMinutes: number;
}

interface DailyTalkTrend {
  target: number;
  workStartHour?: number;
  workEndHour?: number;
  days: string[];
  managers: DailyTalkManager[];
}

interface ScheduleDay {
  id: string;
  managerId: string;
  date: string;
  status: number;
  note: string | null;
}

interface ManagerScheduleData {
  id: string;
  name: string;
  days: ScheduleDay[];
}

export const plansService = {
  // Sales plans
  async getSalesPlans(): Promise<SalesPlans> {
    const { data } = await api.get<ApiResponse<SalesPlans>>("/plans/sales-plans");
    return data.data;
  },
  async saveSalesPlans(plans: Partial<SalesPlans>): Promise<void> {
    await api.put("/plans/sales-plans", plans);
  },
  async getPlanFact(): Promise<PlanFact> {
    const { data } = await api.get<ApiResponse<PlanFact>>("/plans/plan-fact");
    return data.data;
  },

  // Talk target
  async getTalkTarget(): Promise<TalkTarget> {
    const { data } = await api.get<ApiResponse<TalkTarget>>("/plans/talk-target");
    return data.data;
  },
  async saveTalkTarget(dailyMinutes: number, workStartHour?: number, workEndHour?: number): Promise<void> {
    await api.put("/plans/talk-target", { dailyMinutes, workStartHour, workEndHour });
  },
  async getTalkStats(date?: string): Promise<TalkStats> {
    const params = date ? `?date=${date}` : "";
    const { data } = await api.get<ApiResponse<TalkStats>>(`/plans/talk-stats${params}`);
    return data.data;
  },
  async getDailyTalkTrend(filters?: {
    period?: string;
    dateFrom?: string;
    dateTo?: string;
    managerId?: string;
    managerIds?: string;
  }): Promise<DailyTalkTrend> {
    const params = new URLSearchParams();
    if (filters?.period) params.append("period", filters.period);
    if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom);
    if (filters?.dateTo) params.append("dateTo", filters.dateTo);
    if (filters?.managerId) params.append("managerId", filters.managerId);
    if (filters?.managerIds) params.append("managerIds", filters.managerIds);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const { data } = await api.get<ApiResponse<DailyTalkTrend>>(
      `/plans/talk-stats-daily-trend${qs}`
    );
    return data.data;
  },

  // Schedule
  async getAllSchedules(month?: string): Promise<ManagerScheduleData[]> {
    const params = month ? `?month=${month}` : "";
    const { data } = await api.get<ApiResponse<ManagerScheduleData[]>>(`/plans/schedule${params}`);
    return data.data;
  },
  async getSchedule(managerId: string, month?: string): Promise<ScheduleDay[]> {
    const params = month ? `?month=${month}` : "";
    const { data } = await api.get<ApiResponse<ScheduleDay[]>>(`/plans/schedule/${managerId}${params}`);
    return data.data;
  },
  async updateScheduleDay(managerId: string, date: string, status: number, note?: string): Promise<void> {
    await api.put(`/plans/schedule/${managerId}`, { date, status, note });
  },
};

export type { SalesPlans, PlanFact, TalkTarget, TalkStats, ManagerTalkStat, ScheduleDay, ManagerScheduleData, DailyTalkTrend, DailyTalkManager, DailyTalkDay };
