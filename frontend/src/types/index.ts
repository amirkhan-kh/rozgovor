export interface Company {
  id: string;
  name: string;
  username: string;
  plan: string;
  dailyLimit: number;
  telegramId: string | null;
  telegramEnabled: boolean;
  sendEachAnalysis: boolean;
  dailySummaryEnabled: boolean;
  createdAt: string;
}

export interface Manager {
  id: string;
  name: string;
  email: string;
  companyId: string;
  isActive: boolean;
  createdAt: string;
  audioFiles?: AudioFile[];
}

export interface AudioFile {
  id: string;
  fileName: string;
  fileUrl: string;
  managerId: string | null;
  manager?: Manager;
  companyId: string;
  phoneNumber: string | null;
  duration: number | null;
  category: string;
  status: "pending" | "processing" | "done" | "error" | "no_conversation" | "disconnected" | "transferred" | "too_short";
  transcription: string | null;
  analysis?: Analysis;
  crmLeadId: string | null;
  callDate: string | null;
  leadCreatedAt: string | null;
  firstContactAt: string | null;
  pipelineName: string | null;
  sourceId: string | null;
  sourceName: string | null;
  statusName: string | null;
  leadTags: string | null;
  leadId: number | null;
  isSale: boolean;
  createdAt: string;
  shareToken?: string | null;
  sharedAt?: string | null;
}

export interface CriteriaScore {
  score: number;
  comment: string;
}

export interface AnalysisError {
  type: string;
  description: string;
  timestamp: string;
}

export interface WinLossPoint {
  description: string;
  timestamp: string;
}

export interface Objection {
  type: string;
  count: number;
}

export interface CriticalMoment {
  timestamp: string;
  whatHappened: string;
  whatManagerDid: string;
  whatToDoInstead: string;
  technique: string;
}

export interface CoachingInsights {
  speechRatioAlert: boolean;
  surrenderedObjections: number;
  openEnding: boolean;
  criticalMoments: CriticalMoment[];
  topWin: string;
  quickFix: string;
  dealRiskScore: number;
}

// ─── Follow-up Signal (B2-2) ──────────────────────────────────────────────
export interface FollowupSignal {
  requiresFollowup: boolean;
  followupReason: string | null;
  followupPhrase: string | null;
  suggestedDeadlineDays: number;
}

// ─── Promise tracking (B2-9) ──────────────────────────────────────────────
export interface ManagerPromise {
  what: string;
  deadline: string;
  deadlineDays: number;
  timestamp: string;
  completed?: boolean;
}

// ─── MEDDIC/BANT (B3-4) ──────────────────────────────────────────────────
// SOPRANO — 7 bosqichli kashfiyot texnikasi
export interface SopranoStage {
  asked: boolean;
  value: string | null;
  evidence: string | null;
}
export interface DealQualification {
  situation: SopranoStage;
  experience: SopranoStage;
  problem: SopranoStage;
  decisionMaker: SopranoStage;
  alternatives: SopranoStage;
  nuances: SopranoStage;
  limits: SopranoStage;
  overallQualification: number;
}

// ─── Respect indicators (B3-10) ──────────────────────────────────────────
export interface RespectIndicators {
  ageAppropriateTone: number;
  noPrematureClosing: number;
  activeListening: number;
  respectScore: number;
  notes: string;
}

// ─── B4-1: Extended analysis fields ──────────────────────────────────────
export interface CallPhase {
  name: string;
  startTime: string;
  endTime: string;
  qualityScore: number;
  notes: string;
}
export interface CallStructure {
  phases: CallPhase[];
  totalDurationSec: number;
  structureScore: number;
}

export type SopranoCategory =
  | "situation"
  | "objective"
  | "problem"
  | "resources"
  | "alternatives"
  | "need"
  | "outcome"
  | null;
export interface QuestionItem {
  text: string;
  timestamp: string;
  type: "open" | "closed";
  sopranoCategory?: SopranoCategory;
  // Legacy — eski tahlillar uchun
  spinCategory?: "situation" | "problem" | "implication" | "need_payoff" | null;
}
export interface SopranoBreakdown {
  situation: number;
  objective: number;
  problem: number;
  resources: number;
  alternatives: number;
  need: number;
  outcome: number;
}
export interface QuestionsBreakdown {
  managerTotal: number;
  clientTotal: number;
  openCount: number;
  closedCount: number;
  sopranoBreakdown?: SopranoBreakdown;
  topManagerQuestions: QuestionItem[];
  topClientQuestions: QuestionItem[];
  questionQualityScore: number;
}

export interface CloseAttempt {
  timestamp: string;
  type: "soft" | "direct" | "trial" | "assumptive";
  phrase: string;
  clientResponse?: string;
  successful: boolean;
}
export interface CloseAttemptsBlock {
  attempts: CloseAttempt[];
  totalCount: number;
  quality: "none" | "weak" | "good" | "excellent";
  recommendation: string;
}

export interface VoiceOfCustomer {
  mainPain: string | null;
  expectations: string[];
  buyingCriteria: string[];
  competitorsMentioned: Array<{ name: string; context: string; timestamp: string }>;
  budgetHints: Array<{ phrase: string; timestamp: string; amount?: string }>;
  urgencySignals: string[];
}

export interface IntentSignal {
  phrase: string;
  timestamp: string;
  interpretation: string;
}
export interface IntentSignalsBlock {
  strong: IntentSignal[];
  weak: IntentSignal[];
  overallScore: number;
  trend: "growing" | "stable" | "declining";
}

export interface Analysis {
  id: string;
  audioFileId: string;
  summary: string;
  overallScore: number;
  leadQuality: "sovuq" | "iliq" | "issiq";
  leadScore: number;
  criteria: Record<string, CriteriaScore>;
  errors: AnalysisError[];
  winPoints: WinLossPoint[];
  lossPoints: WinLossPoint[];
  objections: Objection[];
  managerSpeech: number;
  clientSpeech: number;
  coachingInsights?: CoachingInsights;
  // Sud Agent (B5-1) — qisqa/yetarsiz qo'ng'iroqlar reytingga ta'sir qilmasligi
  judgeSkipped?: boolean;
  judgeReason?: string | null;
  judgeOverridden?: boolean;
  // Bosqich 2 + 3
  requiresFollowup?: boolean;
  followupReason?: string | null;
  followupPhrase?: string | null;
  followupDeadline?: string | null;
  followupCompleted?: boolean;
  promises?: ManagerPromise[];
  qualification?: DealQualification;
  respect?: RespectIndicators;
  leadHeatScore?: number | null;
  // B4-1 kengaytirilgan field'lar
  callStructure?: CallStructure | null;
  questionsData?: QuestionsBreakdown | null;
  closeAttempts?: CloseAttemptsBlock | null;
  voiceOfCustomer?: VoiceOfCustomer | null;
  intentSignals?: IntentSignalsBlock | null;
  // 🚩 Yo'qotilgan lid tahlili + manager haq/noxaq verdict (server biriktiradi)
  rejectionInfo?: RejectionInfo | null;
  createdAt: string;
}

// 🚩 Yo'qotilgan lid verdikti — CRM tegini transkript reallиги bilan solishtiradi
// (substance-based, e'tiroz-korzina emas). Backend `getRejectionInfo` biriktiradi.
export interface RejectionInfo {
  reason: string; // CRM teg matni, masalan "Noto'g'ri raqam"
  status: "right" | "wrong" | "unclear";
  verdictLabel: string; // "Manager haq" | "Manager noxaq" | "Aniqlab bo'lmadi"
  conclusion: string; // Umumiy xulosa — bitta konkret matn
  matchConfidence?: "id" | "phone";
  reasonSource?: "deal" | "lead"; // sabab manbasi: deal-close yoki intake JUNK teg
}

export interface ManagerGrowthCard {
  managerId: string;
  managerName: string;
  period: string;
  totalCalls: number;
  salesCount: number;
  qaScore: number;
  conversionRate: number;
  avgManagerSpeech: number;
  strengthAreas: string[];
  weakAreas: string[];
  mainIssue: string;
  quickFix: string;
  eliteGap: {
    topPerformerName: string;
    topPerformerConversion: number;
    topPerformerSales?: number;
    topPerformerCalls?: number;
    myConversion: number;
    gap: number;
    lostDealsEstimate?: number;
    mainDifference: string;
    topPerformerAvgSpeech: number;
    myAvgSpeech: number;
    differences?: string[];
    topTechniques?: Array<{ name: string; example: string; frequency?: string }>;
    keyPhrases?: string[];
    objectionResponses?: Array<{ objectionType: string; response: string }>;
    actionableSteps?: string[];
    closingStyle?: string;
  } | null;
  topLearning: {
    skill: string;
    currentScore: number;
    practiceScript: string;
    technique: string;
  } | null;
  weeklyProgress: Array<{ week: string; avgScore: number; conversion: number }>;
}

export interface FunnelLeakSolution {
  technique: string;
  steps: string[];
  example: string;
}

export interface FunnelLeakage {
  period: string;
  totalCalls: number;
  totalSales: number;
  conversionRate: number;
  funnelLeaks: {
    speechRatioViolations: {
      count: number;
      percent: number;
      title: string;
      problem: string;
      impact: string;
      worstManagers: Array<{ managerId: string; managerName: string; ratio: number }>;
      solution: FunnelLeakSolution;
    } | null;
    surrenderedObjections: {
      count: number;
      totalWithObjection: number;
      percent: number;
      title: string;
      problem: string;
      impact: string;
      byType: Array<{ type: string; surrendered: number; total: number }>;
      worstManagers: Array<{ managerId: string; managerName: string; surrendered: number; total: number; rate: number }>;
      estimatedLostDeals: number;
      solution: FunnelLeakSolution;
    } | null;
    openEndings: {
      count: number;
      percent: number;
      title: string;
      problem: string;
      impact: string;
      worstManagers: Array<{ managerId: string; managerName: string; count: number }>;
      estimatedLostDeals: number;
      solution: FunnelLeakSolution;
    } | null;
  };
  totalEstimatedLostDeals: number;
  insight: string;
}

export interface CriteriaCategory {
  id: string;
  name: string;
  description: string | null;
  companyId: string;
  criteria: Criteria[];
}

export interface Criteria {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  weight: number;
}

export interface DashboardStats {
  totalCalls: number;
  totalSynced: number;
  avgScore: number;
  topScore: { score: number; date: string };
  growthRate: number;
  avgDuration: number;
  totalDuration: number;
}

export interface Rating {
  manager: Manager;
  criteriaScore: number;
  overallScore: number;
  callsCount: number;
  sales: number;
}

export interface ManagerUser {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId: string;
  companyName: string;
  canViewDashboard: boolean;
  canViewAll: boolean;
  canViewRating: boolean;
  isActive: boolean;
  photoUrl?: string | null;
  customPhotoUrl?: string | null;
}

export interface AuthResponse {
  token: string;
  role: "company" | "manager";
  company?: Company;
  user?: ManagerUser;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// BOSQICH 2 + 3 — Eko sistema tiplari
// ═══════════════════════════════════════════════════════════════════════════

// ─── Re-engagement (B2-1) ────────────────────────────────────────────────
export type LeadHealthStatus = "healthy" | "risk" | "abandoned";

export interface LeadHealthRow {
  leadId: number;
  clientPhone: string | null;
  managerId: string | null;
  managerName: string | null;
  totalCalls: number;
  firstCallAt: string;
  lastCallAt: string;
  daysSinceLast: number;
  status: LeadHealthStatus;
  lastCallSummary?: string;
  followupReason?: string | null;
}

// ─── Lead Journey (B2-3 + B2-8) ──────────────────────────────────────────
export interface JourneyCall {
  audioFileId: string;
  callDate: string | null;
  managerName: string | null;
  duration: number | null;
  category: string;
  status: string;
  isSale: boolean;
  score: number | null;
  summary: string | null;
  leadQuality: string | null;
  requiresFollowup: boolean;
  followupCompleted: boolean;
  followupReason: string | null;
  followupPhrase: string | null;
  topObjections: Array<{ type: string; count: number }>;
  topErrors: Array<{ type: string }>;
  leadHeatScore: number | null;
  dealRiskScore: number | null;
  sentiment: "positive" | "neutral" | "negative";
}

export interface LeadJourneyData {
  leadId: number;
  clientPhone: string | null;
  companyId: string;
  currentStatusName: string | null;
  pipelineName: string | null;
  leadCreatedAt: string | null;
  saleClosedAt: string | null;
  isSale: boolean;
  saleAmount: number | null;
  totalCalls: number;
  firstCallAt: string | null;
  lastCallAt: string | null;
  daysSinceLast: number;
  calls: JourneyCall[];
  sentimentTrajectory: "improving" | "stable" | "declining";
  avgScoreTrend: number[];
  topObjections: Array<{ type: string; count: number }>;
  aiSummary: {
    whatClientWants: string;
    mainObjections: string[];
    currentStatus: string;
    nextAction: string;
    riskLevel: "low" | "medium" | "high";
  };
}

// ─── Objection Library (B2-4) ────────────────────────────────────────────
export interface ObjectionLibraryEntry {
  type: string;
  count: number;
  frequency: number;
  description: string;
  bestResponses: Array<{
    managerName: string;
    quote: string;
    callId: string;
    worked: boolean;
  }>;
  avoidResponses: Array<{
    quote: string;
    why: string;
  }>;
  technique: string;
}

export interface ObjectionLibrary {
  generatedAt: string;
  totalCallsAnalyzed: number;
  entries: ObjectionLibraryEntry[];
}

// ─── Smart Trackers (B3-5) ───────────────────────────────────────────────
export interface SmartTracker {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  hitCount?: number;
}

// ─── Playlists (B3-6) ────────────────────────────────────────────────────
export interface PlaylistDefinition {
  key: string;
  name: string;
  description: string;
  emoji: string;
}

export interface PlaylistItem {
  audioFileId: string;
  callDate: string | null;
  managerName: string | null;
  phoneNumber: string | null;
  duration: number | null;
  score: number | null;
  summary: string | null;
  isSale: boolean;
  topObjection: string | null;
}

// ─── Conversation Search (B3-8) ──────────────────────────────────────────
export interface ConversationSearchSource {
  audioFileId: string;
  callDate: string | null;
  managerName: string | null;
  clientPhone: string | null;
  clientName: string | null;
  context: string;
  clientQuote: string | null;
  managerResponse: string | null;
  suggestedSolution: string;
  timestamp: string | null; // "MM:SS"
  matchedRef: number;
}

export interface ConversationSearchStats {
  totalCalls: number;
  uniqueClients: number;
  uniqueManagers: number;
  topPhrases: Array<{ phrase: string; count: number }>;
}

export interface ConversationSearchResult {
  question: string;
  answer: string;
  sourceCount: number;
  stats: ConversationSearchStats;
  sources: ConversationSearchSource[];
}
