import api from "./api";
import { ApiResponse } from "../types";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  percent: number;
}
export interface FunnelStatus {
  statusId: string | null;
  name: string;
  count: number;
  bucket: string;
}
export interface FunnelReport {
  total: number;
  stages: FunnelStage[];
  byStatus: FunnelStatus[];
}

export interface NewNoAnswer {
  newCount: number;
  noAnswerCount: number;
  newStageTotal: number;
  noAnswerPercent: number;
  note: string;
}

export interface ResponseTime {
  totalLeads: number;
  inHoursLeads: number;
  offHoursLeads: number;
  offHoursPercent: number;
  responseTime: { respondedLeads: number; avgMinutes: number | null; medianMinutes: number | null };
  offHoursResponseTime: { respondedLeads: number; avgMinutes: number | null };
  workHours: string;
  note: string;
}

const qs = (range?: { dateFrom?: string; dateTo?: string }) => {
  const p = new URLSearchParams();
  if (range?.dateFrom) p.append("dateFrom", range.dateFrom);
  if (range?.dateTo) p.append("dateTo", range.dateTo);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export interface TransferManager {
  managerId: string;
  name: string;
  photo: string | null;
  given: number;
  received: number;
  net: number;
}
export interface TransferFlow {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  count: number;
}
export interface TransferRecent {
  phone: string;
  fromName: string;
  toName: string;
  at: string;
}
export interface LeadTransferReport {
  total: number;
  managersInvolved: number;
  uniqueLeads: number;
  topGiver: { name: string; count: number } | null;
  topReceiver: { name: string; count: number } | null;
  perManager: TransferManager[];
  flows: TransferFlow[];
  recent: TransferRecent[];
  note: string;
}

export interface QualityMonth {
  month: string;
  label: string;
  year: number;
  total?: number;
  sifatsizCount: number;
  sifatsizPct?: number;
  qaytaCount: number;
  qaytaPct?: number;
}
export interface QualityTrendReport {
  mode: "cohort" | "transition";
  months: QualityMonth[];
  latest: QualityMonth | null;
  delta: { sifatsiz: number; qayta: number } | null;
  note: string;
}

// ── #14 AI vs CRM stage mismatch ──
export interface StageMismatchFlag {
  audioFileId: string;
  phone: string | null;
  managerName: string;
  managerPhoto: string | null;
  heatScore: number;
  statusName: string | null;
  outcome: string;
  type: "hot_but_lost" | "cold_but_won";
  callDate: string | null;
}
export interface StageMismatchManager {
  managerId: string;
  name: string;
  photo: string | null;
  analyzed: number;
  hotButLost: number;
  coldButWon: number;
  mismatchPct: number;
}
export interface StageMismatchReport {
  analyzed: number;
  hotButLost: number;
  coldButWon: number;
  mismatchTotal: number;
  mismatchPct: number;
  byManager: StageMismatchManager[];
  flags: StageMismatchFlag[];
  thresholds: { hot: number; cold: number };
  note: string;
}

// ── #16 per-manager response time ──
export interface RtManager {
  managerId: string;
  name: string;
  photo: string | null;
  leads: number;
  respondedLeads: number;
  avgMinutes: number | null;
  medianMinutes: number | null;
}
export interface ResponseTimeByManagerReport {
  managers: number;
  companyAvgMinutes: number | null;
  companyMedianMinutes: number | null;
  fastest: RtManager | null;
  slowest: RtManager | null;
  byManager: RtManager[];
  note: string;
}

// ── #17 transfer time ──
export interface TransferTimeReport {
  transfers: number;
  avgHours: number | null;
  medianHours: number | null;
  within1h: number;
  within1hPct: number;
  within24h: number;
  over24h: number;
  buckets: { key: string; label: string; count: number }[];
  note: string;
}

// ── #19 PBX mapping ──
export interface PbxRow {
  managerId: string;
  bitrixUserId: string | null;
  name: string;
  photo: string | null;
  department: string | null;
  role: string;
  isActive: boolean;
  callActivities: number;
}
export interface PbxMappingReport {
  total: number;
  mapped: number;
  rows: PbxRow[];
  note: string;
}

// ── #21 + #22 presentations ──
export interface PresentationMgr {
  managerId: string;
  name: string;
  photo: string | null;
  candidates: number;
  suspicious: number;
}
export interface SuspiciousCall {
  audioFileId: string;
  phone: string | null;
  managerName: string;
  managerPhoto: string | null;
  durationSec: number;
  score: number;
  callDate: string | null;
}
export interface PresentationsReport {
  totalCalls: number;
  candidateCount: number;
  candidatePct: number;
  avgCandidateMinutes: number | null;
  suspiciousCount: number;
  suspiciousPct: number;
  byManager: PresentationMgr[];
  suspiciousList: SuspiciousCall[];
  thresholds: { presentMinutes: number; fakeScoreMax: number };
  note: string;
}

// ── #23 + #24 + #25 + #27 payments ──
export interface OverdueDeal {
  leadId: number;
  contactName: string | null;
  contactPhone: string | null;
  price: number;
  statusName: string | null;
  managerName: string;
  managerPhoto: string | null;
  agreedPaymentDate: string | null;
  daysOverdue: number;
}
export interface PaymentAnalyticsReport {
  paymentSpeed: {
    sales: number;
    within1: number;
    within3: number;
    within7: number;
    within3Pct: number;
    within7Pct: number;
    avgDays: number | null;
    medianDays: number | null;
    buckets: { key: string; label: string; count: number }[];
  };
  partialConversion: { total: number; won: number; open: number; failed: number; conversionPct: number };
  futureDateConversion: { total: number; won: number; open: number; failed: number; conversionPct: number; datePassedUnpaid: number };
  overdue: { count: number; totalAmount: number; list: OverdueDeal[] };
  note: string;
}

// ── #29 + #30 call attempts ──
export interface CallAttemptsReport {
  pickupRate: {
    attemptedLeads: number;
    answeredLeads: number;
    pickupPct: number;
    avgAttempts: number | null;
    buckets: { key: string; label: string; count: number }[];
  };
  noContactChain: {
    total: number;
    stages: { key: string; label: string; count: number }[];
    noAnswerPct: number;
    unreachablePct: number;
  };
  note: string;
}

// ── #12 wrong number ──
export interface WrongNumberMonth { month: string; label: string; year: number; total: number; wrong: number; pct: number }
export interface WrongNumberSource { sourceId: string; sourceName: string; wrong: number; total: number; pct: number }
export interface WrongNumberReport {
  total: number; wrong: number; wrongPct: number;
  months: WrongNumberMonth[]; delta: number; alert: boolean;
  bySource: WrongNumberSource[]; note: string;
}

// ── #9 + #10 reason breakdown ──
export interface ReasonItem { name: string; count: number; pct: number }
export interface ReasonGroup { total: number; reasons: ReasonItem[] }
export interface ReasonBreakdownReport {
  sifatsiz: ReasonGroup; qayta: ReasonGroup; dealFailed: ReasonGroup; note: string;
}

// ── #13 objection trend ──
export interface ObjectionMonth { month: string; label: string; year: number; total: number; narx: number; [k: string]: number | string }
export interface ObjectionCat { type: string; count: number; pct: number }
export interface ObjectionTrendReport {
  months: ObjectionMonth[]; categories: ObjectionCat[];
  narxLastPct: number; narxDelta: number; priceAlert: boolean; note: string;
}

// ── #3 AI costs ──
export interface AiCostManager { managerId: string; name: string; photo: string | null; costUsd: number }
export interface AiCostsReport {
  totalCostUsd: number;
  byComponent: { stt: number; flash: number; pro: number };
  analyzedCalls: number; avgPerCallUsd: number;
  byManager: AiCostManager[];
  limits: { plan: string; totalLimitHours: number; usedHours: number; usedPct: number; audioLimitPerManager: number | null; totalAudio: number };
  note: string;
}

// ── #31 advice ──
export interface AdviceItem {
  metric: string; current: number; previous: number; deltaPct: number | null;
  direction: "up" | "down"; severity: "high" | "medium" | "low";
  cause: string; recommendation: string;
}
export interface AdviceReport {
  period: { current: string; previous: string };
  metrics: { current: { leads: number; sales: number; sifPct: number; conv: number }; previous: { leads: number; sales: number; sifPct: number; conv: number } };
  items: AdviceItem[]; healthy: boolean; note: string;
}

export const analyticsService = {
  async wrongNumber(range?: { dateFrom?: string; dateTo?: string }): Promise<WrongNumberReport> {
    const { data } = await api.get<ApiResponse<WrongNumberReport>>(`/analytics/wrong-number${qs(range)}`);
    return data.data;
  },
  async reasonBreakdown(range?: { dateFrom?: string; dateTo?: string }): Promise<ReasonBreakdownReport> {
    const { data } = await api.get<ApiResponse<ReasonBreakdownReport>>(`/analytics/reason-breakdown${qs(range)}`);
    return data.data;
  },
  async objectionTrend(range?: { dateFrom?: string; dateTo?: string }): Promise<ObjectionTrendReport> {
    const { data } = await api.get<ApiResponse<ObjectionTrendReport>>(`/analytics/objection-trend${qs(range)}`);
    return data.data;
  },
  async aiCosts(range?: { dateFrom?: string; dateTo?: string }): Promise<AiCostsReport> {
    const { data } = await api.get<ApiResponse<AiCostsReport>>(`/analytics/ai-costs${qs(range)}`);
    return data.data;
  },
  async advice(): Promise<AdviceReport> {
    const { data } = await api.get<ApiResponse<AdviceReport>>(`/analytics/advice`);
    return data.data;
  },
  async stageMismatch(range?: { dateFrom?: string; dateTo?: string }): Promise<StageMismatchReport> {
    const { data } = await api.get<ApiResponse<StageMismatchReport>>(`/analytics/stage-mismatch${qs(range)}`);
    return data.data;
  },
  async responseTimeByManager(range?: { dateFrom?: string; dateTo?: string }): Promise<ResponseTimeByManagerReport> {
    const { data } = await api.get<ApiResponse<ResponseTimeByManagerReport>>(`/analytics/response-time-by-manager${qs(range)}`);
    return data.data;
  },
  async transferTime(range?: { dateFrom?: string; dateTo?: string }): Promise<TransferTimeReport> {
    const { data } = await api.get<ApiResponse<TransferTimeReport>>(`/analytics/transfer-time${qs(range)}`);
    return data.data;
  },
  async pbxMapping(): Promise<PbxMappingReport> {
    const { data } = await api.get<ApiResponse<PbxMappingReport>>(`/analytics/pbx-mapping`);
    return data.data;
  },
  async presentations(range?: { dateFrom?: string; dateTo?: string }): Promise<PresentationsReport> {
    const { data } = await api.get<ApiResponse<PresentationsReport>>(`/analytics/presentations${qs(range)}`);
    return data.data;
  },
  async payments(range?: { dateFrom?: string; dateTo?: string }): Promise<PaymentAnalyticsReport> {
    const { data } = await api.get<ApiResponse<PaymentAnalyticsReport>>(`/analytics/payments${qs(range)}`);
    return data.data;
  },
  async callAttempts(range?: { dateFrom?: string; dateTo?: string }): Promise<CallAttemptsReport> {
    const { data } = await api.get<ApiResponse<CallAttemptsReport>>(`/analytics/call-attempts${qs(range)}`);
    return data.data;
  },
  async qualityTrend(params?: { mode?: "cohort" | "transition"; dateFrom?: string; dateTo?: string; managerIds?: string }): Promise<QualityTrendReport> {
    const p = new URLSearchParams();
    if (params?.mode) p.append("mode", params.mode);
    if (params?.dateFrom) p.append("dateFrom", params.dateFrom);
    if (params?.dateTo) p.append("dateTo", params.dateTo);
    if (params?.managerIds) p.append("managerIds", params.managerIds);
    const s = p.toString();
    const { data } = await api.get<ApiResponse<QualityTrendReport>>(`/analytics/quality-trend${s ? `?${s}` : ""}`);
    return data.data;
  },
  async leadTransfers(params?: { dateFrom?: string; dateTo?: string; managerIds?: string }): Promise<LeadTransferReport> {
    const p = new URLSearchParams();
    if (params?.dateFrom) p.append("dateFrom", params.dateFrom);
    if (params?.dateTo) p.append("dateTo", params.dateTo);
    if (params?.managerIds) p.append("managerIds", params.managerIds);
    const s = p.toString();
    const { data } = await api.get<ApiResponse<LeadTransferReport>>(`/analytics/lead-transfers${s ? `?${s}` : ""}`);
    return data.data;
  },
  async funnel(range?: { dateFrom?: string; dateTo?: string }): Promise<FunnelReport> {
    const { data } = await api.get<ApiResponse<FunnelReport>>(`/analytics/funnel${qs(range)}`);
    return data.data;
  },
  async newNoAnswer(range?: { dateFrom?: string; dateTo?: string }): Promise<NewNoAnswer> {
    const { data } = await api.get<ApiResponse<NewNoAnswer>>(`/analytics/new-noanswer${qs(range)}`);
    return data.data;
  },
  async responseTime(range?: { dateFrom?: string; dateTo?: string }): Promise<ResponseTime> {
    const { data } = await api.get<ApiResponse<ResponseTime>>(`/analytics/response-time${qs(range)}`);
    return data.data;
  },
};
