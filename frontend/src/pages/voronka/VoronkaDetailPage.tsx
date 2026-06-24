import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import PipelineSettingsTab from "./PipelineSettingsTab";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import {
  ChevronLeft, ChevronRight, Search, Filter,
  LayoutGrid, List, AlertTriangle, RefreshCw, Play, Settings, Eye, EyeOff,
} from "lucide-react";
import Card from "../../components/ui/Card";
import WinLossBlock from "../dashboard/components/WinLossBlock";
import CallsTrendChart from "../dashboard/components/CallsTrendChart";
import SpeechRatioBlock from "../dashboard/components/SpeechRatioBlock";
import DurationBlock from "../dashboard/components/DurationBlock";
import SalesStatsBlock from "../dashboard/components/SalesStatsBlock";
import TrendChart from "../dashboard/components/TrendChart";
import CriteriaTeamChart from "../dashboard/components/CriteriaTeamChart";
import CriteriaManagersTable from "../dashboard/components/CriteriaManagersTable";
import CategoryStatsBlock from "../dashboard/components/CategoryStatsBlock";
import SalesTrendChart from "../dashboard/components/SalesTrendChart";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import { voronkaService } from "../../services/voronka.service";
import { dashboardService } from "../../services/dashboard.service";
import { audioService } from "../../services/audio.service";
import { managersService } from "../../services/managers.service";
import { AudioFile } from "../../types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const scoreColor = (score: number): string => {
  if (score >= 80) return "#2fcc6e";
  if (score >= 60) return "#e6a020";
  if (score >= 40) return "#d97706";
  return "#e64545";
};

const scoreLabel = (score: number): string => {
  if (score >= 80) return "A'lo";
  if (score >= 60) return "Yaxshi";
  if (score >= 40) return "O'rtacha";
  return "Past";
};

const statusBadge = (status: string) => {
  const map: Record<string, { variant: "default" | "warning" | "success" | "danger" | "info"; label: string }> = {
    pending: { variant: "default", label: "Kutilmoqda" },
    processing: { variant: "warning", label: "Tahlil qilinmoqda" },
    done: { variant: "success", label: "Tugallangan" },
    error: { variant: "danger", label: "Xatolik" },
    no_conversation: { variant: "info", label: "Suhbat yo'q" },
    disconnected: { variant: "warning", label: "Aloqa uzildi" },
    transferred: { variant: "info", label: "O'tkazildi" },
  };
  const s = map[status] || map.pending;
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

const categoryLabel = (cat: string): string => {
  const map: Record<string, string> = { sotuv: "1-Qo'ng'iroq", qayta: "Qayta qo'ng'iroq", boshqa: "Boshqa" };
  return map[cat] || cat;
};

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatDateTime = (date: string | null): string => {
  if (!date) return "—";
  return `${new Date(date).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" })} ${new Date(date).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
};

const isNoConversation = (audio: AudioFile) =>
  audio.status === "no_conversation" || audio.status === "disconnected" || audio.status === "transferred";

const formatResponseTime = (leadCreatedAt: string | null, firstContactAt: string | null): string => {
  if (!leadCreatedAt) return "—";
  if (!firstContactAt) return "Aloqa yo'q";
  const diff = new Date(firstContactAt).getTime() - new Date(leadCreatedAt).getTime();
  if (diff < 0) return "—";
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs} sek`;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} daq`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat ${mins % 60} daq`;
  const days = Math.floor(hours / 24);
  return `${days} kun ${hours % 24} soat`;
};

const canAnalyze = (audio: AudioFile) => audio.status === "pending" || audio.status === "error";

const leadBadge = (quality: string | undefined, leadScore: number | undefined) => {
  if (!quality || leadScore === undefined) return <span className="text-secondary">—</span>;
  const labelMap: Record<string, string> = { sovuq: "Sovuq", iliq: "Iliq", issiq: "Issiq" };
  const label = labelMap[quality] || quality;
  let bgColor = "bg-blue-500/20 text-blue-400";
  if (quality === "issiq") bgColor = "bg-emerald-500/20 text-emerald-400";
  else if (quality === "iliq") bgColor = leadScore >= 55 ? "bg-yellow-500/20 text-yellow-400" : "bg-orange-500/20 text-orange-400";
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${bgColor}`}>
      {leadScore}% ({label})
    </span>
  );
};

/* ------------------------------------------------------------------ */
/*  Tabs type                                                         */
/* ------------------------------------------------------------------ */

type Tab = "umumiy" | "tahlil" | "managers" | "audio" | "settings";

const TABS: { key: Tab; label: string }[] = [
  { key: "umumiy", label: "Umumiy" },
  { key: "tahlil", label: "Tahlil" },
  { key: "managers", label: "Menejerlar" },
  { key: "audio", label: "Audio fayllar" },
  { key: "settings", label: "Sozlamalar" },
];

/* Objection colors */
const OBJECTION_COLORS = ["#e64545", "#2fcc6e", "#e6a020", "#d97706", "#3b5ef5", "#9b59b6", "#1abc9c"];

/* ---- Section visibility ---- */
const VORONKA_SECTIONS = [
  { key: "kpi", label: "KPI kartalar", tab: "umumiy" },
  { key: "categories", label: "Kategoriyalar", tab: "umumiy" },
  { key: "managers_table", label: "Menejerlar jadvali", tab: "umumiy" },
  { key: "sales", label: "Savdo statistikasi", tab: "umumiy" },
  { key: "sales_trend", label: "Sotuvlar trendi", tab: "umumiy" },
  { key: "trend", label: "Jami faoliyat", tab: "umumiy" },
  { key: "criteria", label: "Mezonlar", tab: "umumiy" },
  { key: "managers_rating", label: "Menejerlar reytingi", tab: "umumiy" },
  { key: "criteria_chart", label: "Mezonlar grafigi", tab: "umumiy" },
  { key: "errors", label: "Xatolar", tab: "tahlil" },
  { key: "objections", label: "E'tirozlar", tab: "tahlil" },
  { key: "winloss", label: "G'alaba / Yo'qotish", tab: "tahlil" },
  { key: "calls_trend", label: "Qo'ng'iroqlar dinamikasi", tab: "tahlil" },
  { key: "speech", label: "Nutq nisbati", tab: "tahlil" },
  { key: "duration", label: "Davomiylik", tab: "tahlil" },
] as const;

const ALL_VORONKA_SECTION_KEYS = VORONKA_SECTIONS.map((s) => s.key);
const STORAGE_KEY_VORONKA = "voronkaDetailSections";

const loadVoronkaSections = (): string[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_VORONKA);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [...ALL_VORONKA_SECTION_KEYS];
};

const VoronkaSectionsDropdown: React.FC<{
  visibleSections: string[];
  setVisibleSections: (s: string[]) => void;
  activeTab: Tab;
}> = ({ visibleSections, setVisibleSections, activeTab }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (key: string) => {
    const next = visibleSections.includes(key)
      ? visibleSections.filter((k) => k !== key)
      : [...visibleSections, key];
    setVisibleSections(next);
    localStorage.setItem(STORAGE_KEY_VORONKA, JSON.stringify(next));
  };

  const filtered = VORONKA_SECTIONS.filter((s) => s.tab === activeTab);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2 text-secondary hover:text-white border border-border rounded-lg hover:bg-white/5 transition-colors"
        title="Sozlamalar"
      >
        <Settings size={18} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 w-64 bg-card border border-border rounded-xl shadow-2xl z-50 p-4 space-y-2">
          <h4 className="text-white font-semibold text-sm mb-3">
            {activeTab === "umumiy" ? "Umumiy" : "Tahlil"} bo'limlari
          </h4>
          {filtered.map((s) => (
            <label key={s.key} className="flex items-center gap-2 cursor-pointer text-sm text-secondary hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={visibleSections.includes(s.key)}
                onChange={() => toggle(s.key)}
                className="w-4 h-4 rounded border-border bg-primary accent-accent"
              />
              {s.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

const VoronkaDetailPage: React.FC = () => {
  const { name: rawName } = useParams<{ name: string }>();
  const pipelineName = rawName ? decodeURIComponent(rawName) : "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("umumiy");
  const [visibleSections, setVisibleSections] = useState<string[]>(loadVoronkaSections);

  /* ---- Mutations for audio actions ---- */
  const analyzeMutation = useMutation({
    mutationFn: (id: string) => audioService.analyzeOne(id),
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ["voronka-audio"] });
    },
    onError: () => toast.error("Tahlil qilishda xatolik"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => audioService.remove(id),
    onSuccess: () => {
      toast.success("Audio o'chirildi");
      queryClient.invalidateQueries({ queryKey: ["voronka-audio"] });
    },
    onError: () => toast.error("O'chirishda xatolik"),
  });

  /* ---- Data fetching for Umumiy & Tahlil ---- */

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ["voronka-detail", pipelineName],
    queryFn: () => voronkaService.getDetail(pipelineName),
    enabled: !!pipelineName,
  });

  const { data: criteriaData } = useQuery({
    queryKey: ["voronka-criteria", pipelineName],
    queryFn: () => voronkaService.getCriteria(pipelineName),
    enabled: !!pipelineName && (activeTab === "umumiy" || activeTab === "tahlil"),
  });

  const { data: errorsData } = useQuery({
    queryKey: ["voronka-errors", pipelineName],
    queryFn: () => voronkaService.getErrors(pipelineName),
    enabled: !!pipelineName && activeTab === "tahlil",
  });

  const pipelineFilters = { period: "month", pipeline: pipelineName };

  const { data: winLossData } = useQuery({
    queryKey: ["voronka-winloss", pipelineName],
    queryFn: () => dashboardService.getWinLoss(pipelineFilters),
    enabled: !!pipelineName && activeTab === "tahlil",
  });

  const { data: trendData } = useQuery({
    queryKey: ["voronka-trend", pipelineName],
    queryFn: () => dashboardService.getCallsTrend(pipelineFilters),
    enabled: !!pipelineName && activeTab === "tahlil",
  });

  const { data: speechData } = useQuery({
    queryKey: ["voronka-speech", pipelineName],
    queryFn: () => dashboardService.getSpeechRatio(pipelineFilters),
    enabled: !!pipelineName && activeTab === "tahlil",
  });

  const { data: statsData } = useQuery({
    queryKey: ["voronka-stats", pipelineName],
    queryFn: () => dashboardService.getStats(pipelineFilters),
    enabled: !!pipelineName && (activeTab === "tahlil" || activeTab === "umumiy"),
  });

  const { data: salesStatsData } = useQuery({
    queryKey: ["voronka-sales-stats", pipelineName],
    queryFn: () => dashboardService.getSalesStats(pipelineFilters),
    enabled: !!pipelineName && activeTab === "umumiy",
  });

  const { data: umumiyTrendData } = useQuery({
    queryKey: ["voronka-umumiy-trend", pipelineName],
    queryFn: () => dashboardService.getCallsTrend(pipelineFilters),
    enabled: !!pipelineName && activeTab === "umumiy",
  });

  const { data: umumiyCriteriaData } = useQuery({
    queryKey: ["voronka-umumiy-criteria", pipelineName],
    queryFn: () => dashboardService.getCriteria(pipelineFilters),
    enabled: !!pipelineName && activeTab === "umumiy",
  });

  const { data: categoryStatsData } = useQuery({
    queryKey: ["voronka-category-stats", pipelineName],
    queryFn: () => dashboardService.getCategoryStats(pipelineFilters),
    enabled: !!pipelineName && activeTab === "umumiy",
  });

  const { data: salesTrendData } = useQuery({
    queryKey: ["voronka-sales-trend", pipelineName],
    queryFn: () => dashboardService.getSalesTrend(pipelineFilters),
    enabled: !!pipelineName && activeTab === "umumiy",
  });

  const { data: managerDurationsData } = useQuery({
    queryKey: ["voronka-manager-durations", pipelineName],
    queryFn: () => dashboardService.getManagerDurations(pipelineFilters),
    enabled: !!pipelineName && (activeTab === "umumiy" || activeTab === "tahlil"),
  });

  /* ---- Audio tab state ---- */

  const [audioPage, setAudioPage] = useState(1);
  const [audioSearch, setAudioSearch] = useState("");
  const [audioManagerId, setAudioManagerId] = useState("");
  const [showAmount, setShowAmount] = useState(false);
  const [audioCategory, setAudioCategory] = useState("");
  const [audioStatus, setAudioStatus] = useState("");
  const [audioPeriod, setAudioPeriod] = useState("all");
  const [audioDateFrom, setAudioDateFrom] = useState("");
  const [audioDateTo, setAudioDateTo] = useState("");
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    return (localStorage.getItem("audioViewMode") as "table" | "card") || "card";
  });

  const [selectedAudioIds, setSelectedAudioIds] = useState<Set<string>>(new Set());

  const bulkAnalyzeMutation = useMutation({
    mutationFn: (ids: string[]) => audioService.analyzeBulk(ids),
    onSuccess: (result) => {
      toast.success(result.message);
      setSelectedAudioIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["voronka-audio"] });
    },
    onError: () => toast.error("Bulk tahlil xatolik"),
  });

  const syncPipelineMutation = useMutation({
    mutationFn: () => audioService.syncAmoCrm(),
    onSuccess: () => {
      toast.success("Voronka sinhronlashtirildi");
      queryClient.invalidateQueries({ queryKey: ["voronka-audio"] });
      queryClient.invalidateQueries({ queryKey: ["voronka-detail"] });
    },
    onError: () => toast.error("Sinhronlashda xatolik"),
  });

  const toggleAudioSelect = (id: string) => {
    setSelectedAudioIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllAudio = () => {
    if (!audioData?.data) return;
    const analyzableIds = audioData.data
      .filter((a: AudioFile) => canAnalyze(a))
      .map((a: AudioFile) => a.id);
    if (analyzableIds.length === 0) return;
    const allSelected = analyzableIds.every((id: string) => selectedAudioIds.has(id));
    setSelectedAudioIds(allSelected ? new Set() : new Set(analyzableIds));
  };

  const selectedAudioCount = selectedAudioIds.size;

  const activeFilterCount = [audioManagerId, audioCategory, audioStatus, audioPeriod !== "all" ? audioPeriod : ""].filter(Boolean).length;

  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  const { data: audioData, isLoading: audioLoading } = useQuery({
    queryKey: ["voronka-audio", pipelineName, audioPage, audioManagerId, audioCategory, audioStatus, audioPeriod, audioSearch, audioDateFrom, audioDateTo],
    queryFn: () =>
      audioService.getAll({
        page: audioPage,
        limit: 10,
        pipeline: pipelineName,
        managerId: audioManagerId,
        category: audioCategory,
        status: audioStatus,
        period: audioPeriod,
        search: audioSearch,
        ...(audioPeriod === "custom" && audioDateFrom ? { dateFrom: audioDateFrom } : {}),
        ...(audioPeriod === "custom" && audioDateTo ? { dateTo: audioDateTo } : {}),
      }),
    enabled: !!pipelineName && activeTab === "audio",
  });

  /* Close filter dropdown on outside click */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    };
    if (showFilter) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showFilter]);

  const resetAudioFilters = () => {
    setAudioManagerId("");
    setAudioCategory("");
    setAudioStatus("");
    setAudioPeriod("all");
    setAudioDateFrom("");
    setAudioDateTo("");
    setAudioPage(1);
  };

  const audioLimit = 10;
  const audioTotalPages = audioData?.totalPages || 1;
  const audioTotal = audioData?.total || 0;
  const audioStartItem = audioTotal > 0 ? (audioPage - 1) * audioLimit + 1 : 0;
  const audioEndItem = Math.min(audioPage * audioLimit, audioTotal);

  const getPageNumbers = (totalPages: number, current: number): (number | string)[] => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (current <= 3) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (current >= totalPages - 2) {
      pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", current - 1, current, current + 1, "...", totalPages);
    }
    return pages;
  };

  /* ---- Loading state ---- */

  if (detailLoading) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-3" />
          <Skeleton className="h-4 w-28" />
        </div>
        {/* Title */}
        <Skeleton className="h-8 w-48" />
        {/* Tabs */}
        <div className="flex gap-1 p-1 border rounded-xl" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-24" rounded="lg" />
          ))}
        </div>
        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-3 md:p-5 space-y-3" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="border rounded-xl p-3 md:p-5" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
              <Skeleton className="h-4 w-1/4 mb-2" />
              <Skeleton className="h-3 w-1/3 mb-4" />
              <Skeleton className="h-[200px] w-full" rounded="xl" />
            </div>
          ))}
        </div>
        {/* Table */}
        <div className="border rounded-xl p-3 md:p-5" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="flex gap-4" style={{ opacity: 1 - r * 0.12 }}>
                {Array.from({ length: 5 }).map((_, c) => (
                  <Skeleton key={c} className="h-4 flex-1" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---- Derived data ---- */

  const stats = detail || {};
  const managerBreakdown: Array<{
    name: string;
    calls: number;
    sales: number;
    salesPercent: number;
    avgScore: number;
  }> = detail?.managers || [];

  const objections: Array<{ type: string; count: number; percent: number }> = detail?.objections || [];

  /* Criteria chart data */
  const criteriaTeam: Record<string, number> = criteriaData?.team || {};
  const criteriaChartData = Object.entries(criteriaTeam).map(([name, score]) => ({
    name,
    score,
    fill: scoreColor(score),
  }));

  /* Errors summary */
  const errorsSummary: Array<{
    type: string;
    count: number;
    percent: number;
    items: Array<{ description: string; timestamp: string; managerName: string; audioFileId: string }>;
  }> = errorsData?.summary || [];

  return (
    <div className="space-y-6 pb-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/voronka" className="text-secondary hover:text-white transition-colors">
          Voronkalar
        </Link>
        <ChevronRight size={14} className="text-secondary" />
        <span className="text-white font-medium">{pipelineName}</span>
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-white">{pipelineName}</h1>

      {/* Toolbar: Tabs + Settings — sticky */}
      <div className="sticky top-14 md:top-16 z-30 py-2" style={{ backgroundColor: "var(--color-primary-bg)" }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex bg-card border border-border rounded-xl p-1 gap-1 overflow-x-auto flex-nowrap">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? "bg-accent"
                    : "text-secondary hover:text-white"
                }`}
                style={activeTab === tab.key ? { color: "#ffffff" } : undefined}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {(activeTab === "umumiy" || activeTab === "tahlil") && (
            <div className="flex items-center gap-2">
              <VoronkaSectionsDropdown visibleSections={visibleSections} setVisibleSections={setVisibleSections} activeTab={activeTab} />
            </div>
          )}
        </div>
      </div>

      {/* ==================== UMUMIY TAB ==================== */}
      {activeTab === "umumiy" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          {visibleSections.includes("kpi") && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5 md:gap-4">
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <div className="flex items-center gap-1.5 text-xs text-secondary mb-1">
                  Sotuv summasi
                  <button onClick={() => setShowAmount(!showAmount)} className="hover:opacity-70">
                    {showAmount ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <div className="text-xl md:text-3xl font-bold" style={{ color: "var(--text-primary, #fff)" }}>
                  {showAmount ? `${(stats.totalSaleAmount ?? 0).toLocaleString()}` : "••••••••"}
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <div className="text-xs text-secondary mb-1">Tahlil qilingan</div>
                <div className="text-xl md:text-3xl font-bold text-accent">{stats.analyzedCalls ?? 0}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <div className="text-xs text-secondary mb-1">O'rtacha ball</div>
                <div
                  className="text-xl md:text-3xl font-bold"
                  style={{
                    color:
                      (stats.avgScore ?? 0) >= 70
                        ? "#2fcc6e"
                        : (stats.avgScore ?? 0) >= 50
                        ? "#e6a020"
                        : "#e64545",
                  }}
                >
                  {stats.avgScore ?? 0}%
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <div className="text-xs text-secondary mb-1">Sotuv</div>
                <div className="text-xl md:text-3xl font-bold text-success">
                  {(detail?.categories || []).find((c: any) => c.name === "Sotuv")?.count ?? 0}
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <div className="text-xs text-secondary mb-1">Sotuv konversiya %</div>
                <div className="text-xl md:text-3xl font-bold text-accent">{stats.conversionRate ?? 0}%</div>
              </div>
            </div>
          )}

          {/* Category Breakdown */}
          {visibleSections.includes("categories") && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Kategoriyalar</h3>
              <p className="text-sm text-secondary mb-4">Qo'ng'iroq turlari bo'yicha taqsimot</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-4">
                {["1-Qo'ng'iroq", "Qayta qo'ng'iroq", "Sotuv", "Boshqa"].map((name) => {
                  const cat = (detail?.categories || []).find((c: any) => c.name === name);
                  const colors: Record<string, string> = { "1-Qo'ng'iroq": "#3b5ef5", "Qayta qo'ng'iroq": "#e6a020", "Sotuv": "#2fcc6e", "Boshqa": "#7c7c9a" };
                  return (
                    <div key={name} className="bg-card border border-border rounded-xl p-3 md:p-5">
                      <div className="text-xs text-secondary mb-1">{name}</div>
                      <div className="text-2xl font-bold" style={{ color: colors[name] }}>{cat?.count ?? 0}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Manager Breakdown Table */}
          {visibleSections.includes("managers_table") && managerBreakdown.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Menejerlar</h3>
              <p className="text-sm text-secondary mb-4">Voronka bo'yicha menejer ko'rsatkichlari</p>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-3 px-4 text-xs text-secondary font-medium">Menejer</th>
                        <th className="text-left py-3 px-4 text-xs text-secondary font-medium">Qo'ng'iroqlar</th>
                        <th className="text-left py-3 px-4 text-xs text-secondary font-medium">Sotuv</th>
                        <th className="text-left py-3 px-4 text-xs text-secondary font-medium">Sotuv %</th>
                        <th className="text-left py-3 px-4 text-xs text-secondary font-medium">O'rtacha ball</th>
                      </tr>
                    </thead>
                    <tbody>
                      {managerBreakdown.map((mgr, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-white/[0.02]">
                          <td className="py-3 px-4 text-sm text-white font-medium">{mgr.name}</td>
                          <td className="py-3 px-4 text-sm text-secondary">{mgr.calls}</td>
                          <td className="py-3 px-4 text-sm text-success">{mgr.sales}</td>
                          <td className="py-3 px-4 text-sm">
                            <span
                              className="font-medium"
                              style={{
                                color: mgr.salesPercent >= 30 ? "#2fcc6e" : mgr.salesPercent >= 15 ? "#e6a020" : "#e64545",
                              }}
                            >
                              {mgr.salesPercent}%
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <span
                              className="font-medium"
                              style={{ color: scoreColor(mgr.avgScore) }}
                            >
                              {mgr.avgScore}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Kategoriyalar */}
          {visibleSections.includes("categories") && categoryStatsData && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Kategoriyalar</h3>
              <p className="text-sm text-secondary mb-4">Qo'ng'iroq turlari</p>
              <CategoryStatsBlock data={categoryStatsData} />
            </div>
          )}

          {/* Savdo statistikasi */}
          {visibleSections.includes("sales") && salesStatsData && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Savdo statistikasi</h3>
              <p className="text-sm text-secondary mb-4">CRM dan sotuvlar</p>
              <SalesStatsBlock data={salesStatsData} />
            </div>
          )}

          {/* Sotuvlar trendi */}
          {visibleSections.includes("sales_trend") && salesTrendData && salesTrendData.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Sotuvlar trendi</h3>
              <p className="text-sm text-secondary mb-4">Kunlik sotuvlar va umumiy o'sish</p>
              <SalesTrendChart data={salesTrendData} />
            </div>
          )}

          {/* Jami faoliyat sahifasi — TrendChart */}
          {visibleSections.includes("trend") && (
            <TrendChart stats={statsData} trendData={umumiyTrendData || []} />
          )}

          {/* Mezonlarga rioya qilishi */}
          {visibleSections.includes("criteria") && umumiyCriteriaData && <CriteriaTeamChart data={umumiyCriteriaData} />}

          {/* Menejerlar reytingi */}
          {visibleSections.includes("managers_rating") && umumiyCriteriaData && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Menejerlar reytingi</h3>
              <p className="text-sm text-secondary mb-4">Mezonlar bo'yicha</p>
              <CriteriaManagersTable data={umumiyCriteriaData} />
            </div>
          )}
        </div>
      )}

      {/* ==================== TAHLIL TAB ==================== */}
      {activeTab === "tahlil" && (
        <div className="space-y-6">
          {/* Criteria Bar Chart */}
          {visibleSections.includes("criteria_chart") && criteriaChartData.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden">
              <h3 className="text-lg font-semibold text-white mb-0.5">
                Mezonlarga rioya qilishi
              </h3>
              <p className="text-sm text-secondary mb-5">
                {pipelineName} voronkasidagi mezonlar
              </p>

              <ResponsiveContainer width="100%" height={criteriaChartData.length * 48 + 40}>
                <BarChart
                  data={criteriaChartData}
                  layout="vertical"
                  barSize={24}
                  margin={{ left: 10, right: 20, top: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    stroke="#7c7c9a"
                    tick={{ fontSize: 11, fill: "#7c7c9a" }}
                    axisLine={{ stroke: "#27272a" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="transparent"
                    width={200}
                    tick={{ fontSize: 12, fill: "#d1d5db" }}
                    reversed
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--chart-tooltip-bg, #1a1a2e)",
                      border: "1px solid var(--chart-tooltip-border, #2d2d4e)",
                      borderRadius: "10px",
                      color: "var(--chart-tooltip-text, #fff)",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "var(--chart-tooltip-text, #fff)" }}
                    labelStyle={{ color: "#9ca3af" }}
                    cursor={{ fill: "rgba(79, 110, 247, 0.1)" }}
                    formatter={(value: number) => [`${value}% — ${scoreLabel(value)}`, "Ball"]}
                  />
                  <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                    {criteriaChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Legend */}
              <div className="flex flex-wrap gap-5 mt-5 pt-4 border-t border-border">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#2fcc6e" }} />
                  <span className="text-xs text-secondary">A'lo (80-100)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#e6a020" }} />
                  <span className="text-xs text-secondary">Yaxshi (60-79)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#d97706" }} />
                  <span className="text-xs text-secondary">O'rtacha (40-59)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#e64545" }} />
                  <span className="text-xs text-secondary">Past (0-39)</span>
                </div>
              </div>
            </div>
          )}

          {/* Errors List */}
          {visibleSections.includes("errors") && errorsSummary.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Xatolar ro'yxati</h3>
              <p className="text-sm text-secondary mb-4">Aniqlangan xatoliklar va tavsiyalar</p>
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {errorsSummary
                    .filter((e) => e.count > 0)
                    .map((entry) => (
                      <ErrorAccordion key={entry.type} entry={entry} />
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Objections */}
          {visibleSections.includes("objections") && objections.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">E'tirozlar</h3>
              <p className="text-sm text-secondary mb-4">Mijoz e'tirozlari taqsimoti</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Donut chart */}
                <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden">
                  <h4 className="text-sm font-semibold text-white mb-1">
                    E'tirozlar taqsimoti ({objections.reduce((s, o) => s + o.count, 0)})
                  </h4>
                  <p className="text-xs text-secondary mb-4">Teg bo'yicha foiz</p>
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={objections.map((o, i) => ({
                          name: o.type,
                          value: o.count,
                          color: OBJECTION_COLORS[i % OBJECTION_COLORS.length],
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={105}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                      >
                        {objections.map((_, i) => (
                          <Cell key={i} fill={OBJECTION_COLORS[i % OBJECTION_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--chart-tooltip-bg, #1a1a2e)",
                          border: "1px solid var(--chart-tooltip-border, #2d2d4e)",
                          borderRadius: "10px",
                          color: "var(--chart-tooltip-text, #fff)",
                        }}
                        itemStyle={{ color: "var(--chart-tooltip-text, #fff)" }}
                        labelStyle={{ color: "#9ca3af" }}
                        formatter={(value: number, name: string) => {
                          const item = objections.find((o) => o.type === name);
                          return [`${value} ta (${item?.percent ?? 0}%)`, name];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center mt-3">
                    {objections.map((o, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div
                          className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: OBJECTION_COLORS[i % OBJECTION_COLORS.length] }}
                        />
                        <span className="text-xs text-secondary">
                          {o.type} ({o.percent}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Objections list */}
                <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                  <h4 className="text-sm font-semibold text-white mb-1">E'tirozlar ro'yxati</h4>
                  <p className="text-xs text-secondary mb-4">Turi bo'yicha guruhlangan</p>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {objections.map((obj, i) => (
                      <div key={i} className="flex items-center justify-between py-2.5 px-4 border border-border rounded-lg hover:bg-primary/30 transition-colors">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: OBJECTION_COLORS[i % OBJECTION_COLORS.length] }}
                          />
                          <span className="text-sm text-white">{obj.type}</span>
                          <span className="text-xs text-secondary">({obj.count} ta)</span>
                        </div>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded"
                          style={{
                            color: OBJECTION_COLORS[i % OBJECTION_COLORS.length],
                            backgroundColor: OBJECTION_COLORS[i % OBJECTION_COLORS.length] + "18",
                          }}
                        >
                          {obj.percent}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* G'alaba / Yo'qotish */}
          {visibleSections.includes("winloss") && winLossData && <WinLossBlock data={winLossData} />}

          {/* Qo'ng'iroqlar dinamikasi */}
          {visibleSections.includes("calls_trend") && trendData && trendData.length > 0 && <CallsTrendChart data={trendData} />}

          {/* Nutq nisbati */}
          {visibleSections.includes("speech") && speechData && <SpeechRatioBlock data={speechData} />}

          {/* Qo'ng'iroq davomiyligi */}
          {visibleSections.includes("duration") && statsData && <DurationBlock stats={statsData} managerDurations={managerDurationsData} />}

          {/* Empty state */}
          {criteriaChartData.length === 0 && errorsSummary.length === 0 && objections.length === 0 && !winLossData && !trendData && !speechData && !statsData && (
            <div className="flex items-center justify-center h-[30vh]">
              <p className="text-secondary">Tahlil ma'lumotlari topilmadi</p>
            </div>
          )}
        </div>
      )}

      {/* ==================== MENEJERLAR TAB ==================== */}
      {activeTab === "managers" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Menejerlar</h3>
            <p className="text-sm text-secondary mb-4">
              {pipelineName} voronkasidagi menejerlar va ularning ko'rsatkichlari
            </p>
          </div>

          {managerBreakdown.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {managerBreakdown.map((mgr, i) => (
                <div
                  key={i}
                  className="bg-card border border-border rounded-xl p-3 md:p-5 hover:border-accent/50 transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center text-accent text-sm font-bold">
                      {mgr.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" style={{ color: "var(--text-primary, #fff)" }}>
                        {mgr.name}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="space-y-2 text-sm text-secondary">
                    <div className="flex justify-between">
                      <span>Qo'ng'iroqlar soni</span>
                      <span className="text-white font-medium">{mgr.calls}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sotuv soni</span>
                      <span className="text-success font-medium">{mgr.sales}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sotuv %</span>
                      <span
                        className="font-medium"
                        style={{
                          color: mgr.salesPercent >= 30 ? "#2fcc6e" : mgr.salesPercent >= 15 ? "#e6a020" : "#e64545",
                        }}
                      >
                        {mgr.salesPercent}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>O'rtacha ball</span>
                      <span
                        className="font-medium"
                        style={{ color: scoreColor(mgr.avgScore) }}
                      >
                        {mgr.avgScore}%
                      </span>
                    </div>
                  </div>

                  {/* Score bar */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="w-full h-2 rounded-full bg-primary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${mgr.avgScore}%`,
                          backgroundColor: scoreColor(mgr.avgScore).replace("text-", "").includes("#") ? scoreColor(mgr.avgScore) : undefined,
                          background: scoreColor(mgr.avgScore),
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-[30vh]">
              <p className="text-secondary">Bu voronkada menejerlar topilmadi</p>
            </div>
          )}
        </div>
      )}

      {/* ==================== AUDIO FAYLLAR TAB ==================== */}
      {activeTab === "audio" && (
        <Card>
          {/* Search + Filter + View toggle bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {/* Table / Card toggle */}
            <div className="flex bg-primary border border-border rounded-lg p-0.5 mr-auto">
              <button
                onClick={() => { setViewMode("table"); localStorage.setItem("audioViewMode", "table"); }}
                className={`p-1.5 rounded transition-colors ${viewMode === "table" ? "bg-accent" : "text-secondary hover:text-white"}`}
                style={viewMode === "table" ? { color: "#ffffff" } : undefined}
                title="Jadval"
              >
                <List size={16} />
              </button>
              <button
                onClick={() => { setViewMode("card"); localStorage.setItem("audioViewMode", "card"); }}
                className={`p-1.5 rounded transition-colors ${viewMode === "card" ? "bg-accent" : "text-secondary hover:text-white"}`}
                style={viewMode === "card" ? { color: "#ffffff" } : undefined}
                title="Kartalar"
              >
                <LayoutGrid size={16} />
              </button>
            </div>

            {/* Action buttons — AudioFilesPage stili */}
            <button
              onClick={() => {
                if (!audioData?.data) return;
                const pendingIds = audioData.data
                  .filter((a: AudioFile) => canAnalyze(a))
                  .map((a: AudioFile) => a.id);
                if (pendingIds.length === 0) {
                  toast("Tahlil qilinadigan audio yo'q", { icon: "\u2139\uFE0F" });
                  return;
                }
                bulkAnalyzeMutation.mutate(pendingIds);
              }}
              disabled={bulkAnalyzeMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-border hover:bg-border/80 transition-colors disabled:opacity-50"
              style={{ color: "var(--text-primary, #fff)" }}
            >
              <Play size={14} />
              Barchasini tahlil
            </button>
            <button
              onClick={() => syncPipelineMutation.mutate()}
              disabled={syncPipelineMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl bg-border hover:bg-border/80 transition-colors disabled:opacity-50"
              style={{ color: "var(--text-primary, #fff)" }}
            >
              <RefreshCw size={14} className={syncPipelineMutation.isPending ? "animate-spin" : ""} />
              Sinhronlash
            </button>

            <div className="relative flex-1 min-w-[120px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input
                type="text"
                placeholder="Qidirish"
                value={audioSearch}
                onChange={(e) => { setAudioSearch(e.target.value); setAudioPage(1); }}
                className="w-full pl-10 pr-4 py-2 bg-primary border border-border rounded-lg text-white text-sm placeholder-secondary focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Filter button */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowFilter(!showFilter)}
                className="relative p-2 text-secondary hover:text-white border border-border rounded-lg hover:bg-white/5 transition-colors"
              >
                <Filter size={18} />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Filter dropdown */}
              {showFilter && createPortal(
                <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:right-4 md:left-auto md:top-32 md:w-72 bg-card border-t md:border border-border rounded-t-2xl md:rounded-xl shadow-2xl z-[9999] p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center justify-between">
                    <h4 className="text-white font-semibold text-sm">Filtrlar</h4>
                    <button onClick={resetAudioFilters} className="text-accent text-xs hover:underline">
                      Qayta o'rnatish
                    </button>
                  </div>

                  {/* Holati */}
                  <div>
                    <label className="block text-xs text-secondary mb-1.5">Holati</label>
                    <select
                      value={audioStatus}
                      onChange={(e) => { setAudioStatus(e.target.value); setAudioPage(1); }}
                      className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm"
                    >
                      <option value="">Barchasi</option>
                      <option value="pending">Kutilmoqda</option>
                      <option value="processing">Tahlil qilinmoqda</option>
                      <option value="done">Tugallangan</option>
                      <option value="no_conversation">Suhbat yo'q</option>
                      <option value="disconnected">Aloqa uzildi</option>
                      <option value="transferred">O'tkazildi</option>
                      <option value="error">Xatolik</option>
                    </select>
                  </div>

                  {/* Menejer */}
                  <div>
                    <label className="block text-xs text-secondary mb-1.5">Menejer</label>
                    <select
                      value={audioManagerId}
                      onChange={(e) => { setAudioManagerId(e.target.value); setAudioPage(1); }}
                      className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm"
                    >
                      <option value="">Barchasi</option>
                      {(managers || []).filter((m: any) => m.isActive).map((m: any) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Kategoriya */}
                  <div>
                    <label className="block text-xs text-secondary mb-1.5">Kategoriya</label>
                    <select
                      value={audioCategory}
                      onChange={(e) => { setAudioCategory(e.target.value); setAudioPage(1); }}
                      className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm"
                    >
                      <option value="">Barchasi</option>
                      <option value="sotuv">1-Qo'ng'iroq</option>
                      <option value="qayta">Qayta qo'ng'iroq</option>
                      <option value="boshqa">Boshqa</option>
                    </select>
                  </div>

                  {/* Davr */}
                  <div>
                    <label className="block text-xs text-secondary mb-1.5">Davr</label>
                    <select
                      value={audioPeriod}
                      onChange={(e) => { setAudioPeriod(e.target.value); setAudioPage(1); }}
                      className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm"
                    >
                      <option value="today">Bugun</option>
                      <option value="yesterday">Kecha</option>
                      <option value="week">Bu hafta</option>
                      <option value="month">Bu oy</option>
                      <option value="quarter">Bu chorak</option>
                      <option value="year">Bu yil</option>
                      <option value="custom">Boshqa</option>
                    </select>
                  </div>

                  {audioPeriod === "custom" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-secondary mb-1.5">Dan</label>
                        <input type="date" value={audioDateFrom} onChange={(e) => { setAudioDateFrom(e.target.value); setAudioPage(1); }}
                          className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-secondary mb-1.5">Gacha</label>
                        <input type="date" value={audioDateTo} onChange={(e) => { setAudioDateTo(e.target.value); setAudioPage(1); }}
                          className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm" />
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setShowFilter(false)}
                    className="w-full py-2 bg-accent text-sm font-medium rounded-lg hover:bg-accent/80 transition-colors"
                    style={{ color: "#ffffff" }}
                  >
                    Filtrlarni qo'llash
                  </button>
                </div>,
                document.body
              )}
            </div>
          </div>

          {/* Bulk actions — tanlangan */}
          {selectedAudioCount > 0 && (
            <div className="flex items-center gap-4 border border-accent/30 rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: "rgba(59,94,245,0.08)" }}>
              <span className="text-sm" style={{ color: "var(--text-primary, #fff)" }}>{selectedAudioCount} ta audio tanlandi</span>
              <button
                onClick={() => bulkAnalyzeMutation.mutate(Array.from(selectedAudioIds))}
                disabled={bulkAnalyzeMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-accent hover:bg-accent/80 transition-colors disabled:opacity-50"
                style={{ color: "#ffffff" }}
              >
                <Play size={14} />
                {bulkAnalyzeMutation.isPending ? "Tahlil qilinmoqda..." : "Tahlil qilish"}
              </button>
              <button onClick={() => setSelectedAudioIds(new Set())} className="text-sm ml-auto" style={{ color: "#7c7c9a" }}>
                Bekor qilish
              </button>
            </div>
          )}

          {/* Audio Content */}
          {audioLoading ? (
            <div className="space-y-3">
              {/* Table header */}
              <div className="flex gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 flex-1" />
                ))}
              </div>
              {Array.from({ length: 5 }).map((_, r) => (
                <div key={r} className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)", opacity: 1 - r * 0.12 }}>
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-16" rounded="full" />
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
              {/* Pagination */}
              <div className="flex items-center justify-between pt-3">
                <Skeleton className="h-4 w-40" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-8" rounded="lg" />
                  <Skeleton className="h-8 w-8" rounded="lg" />
                  <Skeleton className="h-8 w-8" rounded="lg" />
                </div>
              </div>
            </div>
          ) : (
            <>
              {viewMode === "table" ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 px-3 w-8">
                          <input
                            type="checkbox"
                            onChange={toggleSelectAllAudio}
                            checked={
                              audioData?.data &&
                              audioData.data.filter((a: AudioFile) => canAnalyze(a)).length > 0 &&
                              audioData.data.filter((a: AudioFile) => canAnalyze(a)).every((a: AudioFile) => selectedAudioIds.has(a.id))
                            }
                            className="w-4 h-4 rounded border-border bg-primary accent-accent cursor-pointer"
                          />
                        </th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Fayl nomi</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Menejer</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Telefon</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Davomiylik</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Holati</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Kategoriya</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Umumiy ball</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Lid sifati</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Sotuv</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Lead sanasi</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Aloqa vaqti</th>
                        <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Javob vaqti</th>
                        <th className="text-right py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Amallar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(audioData?.data || []).map((audio: AudioFile) => {
                        const noConv = isNoConversation(audio);
                        return (
                          <tr
                            key={audio.id}
                            className={`border-b border-border/50 transition-colors ${noConv ? "opacity-40 hover:opacity-60" : "hover:bg-white/[0.02]"}`}
                          >
                            <td className="py-3 px-3">
                              {!noConv && canAnalyze(audio) ? (
                                <input
                                  type="checkbox"
                                  checked={selectedAudioIds.has(audio.id)}
                                  onChange={() => toggleAudioSelect(audio.id)}
                                  className="w-4 h-4 rounded border-border bg-primary accent-accent cursor-pointer"
                                />
                              ) : (
                                <span className="w-4 h-4 block" />
                              )}
                            </td>
                            <td
                              className={`py-3 px-3 text-sm ${noConv ? "text-secondary cursor-pointer hover:text-accent" : "text-white cursor-pointer hover:text-accent"}`}
                              onClick={() => navigate(`/audio/${audio.id}`)}
                            >
                              {audio.fileName}
                            </td>
                            <td className="py-3 px-3 text-secondary text-sm whitespace-nowrap">{audio.manager?.name || "—"}</td>
                            <td className="py-3 px-3 text-secondary text-sm font-mono">{audio.phoneNumber || "—"}</td>
                            <td className="py-3 px-3 text-secondary text-sm font-mono">{formatDuration(audio.duration)}</td>
                            <td className="py-3 px-3">{statusBadge(audio.status)}</td>
                            <td className="py-3 px-3 text-secondary text-sm whitespace-nowrap">{categoryLabel(audio.category)}</td>
                            <td className="py-3 px-3 text-white text-sm font-medium whitespace-nowrap">
                              {noConv ? "—" : (audio.analysis?.overallScore ?? "—")}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              {noConv ? <span className="text-secondary">—</span> : leadBadge(audio.analysis?.leadQuality, audio.analysis?.leadScore)}
                            </td>
                            <td className="py-3 px-3 text-sm">
                              <span className={audio.isSale ? "text-success font-medium" : "text-secondary"}>
                                {audio.isSale ? "Ha" : "Yo'q"}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-secondary text-xs whitespace-nowrap">{formatDateTime(audio.leadCreatedAt)}</td>
                            <td className="py-3 px-3 text-secondary text-xs whitespace-nowrap">{formatDateTime(audio.firstContactAt)}</td>
                            <td className="py-3 px-3 text-xs whitespace-nowrap">
                              <span className={
                                (() => {
                                  if (!audio.leadCreatedAt || !audio.firstContactAt) return "text-secondary";
                                  const diff = new Date(audio.firstContactAt).getTime() - new Date(audio.leadCreatedAt).getTime();
                                  const hours = diff / 3600000;
                                  if (hours <= 1) return "text-success";
                                  if (hours <= 4) return "text-warning";
                                  return "text-danger";
                                })()
                              }>
                                {formatResponseTime(audio.leadCreatedAt, audio.firstContactAt)}
                              </span>
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex items-center justify-end gap-1.5">
                                {canAnalyze(audio) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      analyzeMutation.mutate(audio.id);
                                    }}
                                    disabled={analyzeMutation.isPending}
                                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors"
                                  >
                                    Tahlil
                                  </button>
                                )}
                                {audio.status === "processing" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toast("Bu audio navbatda, tahlil tugaganda ko'rinadi", { icon: "\u23F3" });
                                    }}
                                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-warning/10 text-warning border border-warning/20 transition-colors"
                                  >
                                    Tahlil
                                  </button>
                                )}
                                <button
                                  onClick={() => navigate(`/audio/${audio.id}`)}
                                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-white/5 text-secondary hover:text-white hover:bg-white/10 border border-border transition-colors"
                                >
                                  Ko'rish
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteMutation.mutate(audio.id);
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium rounded-md bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20 transition-colors"
                                >
                                  O'chirish
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {(!audioData?.data || audioData.data.length === 0) && (
                        <tr>
                          <td colSpan={14} className="py-12 text-center text-secondary">
                            Audio fayllar topilmadi
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Card View */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(audioData?.data || []).map((audio: AudioFile) => {
                    const noConv = isNoConversation(audio);
                    return (
                      <div
                        key={audio.id}
                        className={`bg-primary border border-border rounded-xl p-4 transition-colors flex flex-col ${noConv ? "opacity-50" : "hover:border-accent/50"}`}
                      >
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-3">
                          {!noConv && canAnalyze(audio) && (
                            <input
                              type="checkbox"
                              checked={selectedAudioIds.has(audio.id)}
                              onChange={() => toggleAudioSelect(audio.id)}
                              className="w-4 h-4 rounded accent-accent cursor-pointer shrink-0"
                            />
                          )}
                          <span
                            className="text-sm text-white font-medium truncate cursor-pointer hover:text-accent"
                            onClick={() => navigate(`/audio/${audio.id}`)}
                          >
                            {audio.fileName}
                          </span>
                          <div className="ml-auto shrink-0">{statusBadge(audio.status)}</div>
                        </div>

                        {/* Info */}
                        <div className="space-y-2 text-sm text-secondary">
                          <div className="flex justify-between">
                            <span>Menejer</span>
                            <span className="text-white">{audio.manager?.name || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Telefon</span>
                            <span className="text-white font-mono">{audio.phoneNumber || "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Davomiylik</span>
                            <span className="text-white">{formatDuration(audio.duration)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Kategoriya</span>
                            <span className="text-white">{categoryLabel(audio.category)}</span>
                          </div>
                        </div>

                        {/* CRM info */}
                        <div className="space-y-1.5 text-xs text-secondary pt-2 mt-2 border-t border-border">
                          <div className="text-xs text-secondary/80 uppercase tracking-wider font-medium mb-1.5">CRM</div>
                          <div className="flex justify-between">
                            <span>Lead sanasi</span>
                            <span className="text-white">{formatDateTime(audio.leadCreatedAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Aloqa vaqti</span>
                            <span className="text-white">{formatDateTime(audio.firstContactAt)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Javob vaqti</span>
                            <span className={
                              !audio.leadCreatedAt ? "text-secondary" :
                              !audio.firstContactAt ? "text-danger" :
                              (new Date(audio.firstContactAt).getTime() - new Date(audio.leadCreatedAt).getTime()) / 3600000 <= 1 ? "text-success" :
                              (new Date(audio.firstContactAt).getTime() - new Date(audio.leadCreatedAt).getTime()) / 3600000 <= 4 ? "text-warning" : "text-danger"
                            }>
                              {formatResponseTime(audio.leadCreatedAt, audio.firstContactAt)}
                            </span>
                          </div>
                        </div>

                        {/* Analysis */}
                        {!noConv && audio.analysis && (
                          <div className="space-y-1.5 text-xs text-secondary pt-2 mt-2 border-t border-border">
                            <div className="text-xs text-secondary/80 uppercase tracking-wider font-medium mb-1.5">Tahlil</div>
                            <div className="flex justify-between">
                              <span>Umumiy ball</span>
                              <span className="text-white font-medium">{audio.analysis.overallScore}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span>Lid sifati</span>
                              {leadBadge(audio.analysis.leadQuality, audio.analysis.leadScore)}
                            </div>
                            <div className="flex justify-between">
                              <span>Sotuv</span>
                              <span className={audio.isSale ? "text-success font-medium" : "text-secondary"}>
                                {audio.isSale ? "Ha" : "Yo'q"}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 mt-auto pt-3 border-t border-border">
                          {canAnalyze(audio) && (
                            <button
                              onClick={() => analyzeMutation.mutate(audio.id)}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors"
                            >
                              Tahlil
                            </button>
                          )}
                          {audio.status === "processing" && (
                            <button
                              onClick={() => toast("Bu audio navbatda, tahlil tugaganda ko'rinadi", { icon: "\u23F3" })}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-warning/10 text-warning border border-warning/20 transition-colors"
                            >
                              Tahlil
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/audio/${audio.id}`)}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-white/5 text-secondary hover:text-white hover:bg-white/10 border border-border transition-colors"
                          >
                            Ko'rish
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(audio.id)}
                            className="px-2.5 py-1 text-xs font-medium rounded-md bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20 transition-colors ml-auto"
                          >
                            O'chirish
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {(!audioData?.data || audioData.data.length === 0) && (
                    <div className="col-span-full py-12 text-center text-secondary">
                      Audio fayllar topilmadi
                    </div>
                  )}
                </div>
              )}

              {/* Pagination */}
              {audioTotal > 0 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                  <span className="text-sm text-secondary">
                    {audioStartItem}dan {audioEndItem}gacha jami natijalar {audioTotal}ta
                  </span>
                  {audioTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAudioPage((p) => Math.max(1, p - 1))}
                        disabled={audioPage === 1}
                        className="p-2 text-secondary hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-30 transition-colors"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      {getPageNumbers(audioTotalPages, audioPage).map((pn, idx) =>
                        typeof pn === "string" ? (
                          <span key={`e-${idx}`} className="px-2 text-secondary text-sm">...</span>
                        ) : (
                          <button
                            key={pn}
                            onClick={() => setAudioPage(pn)}
                            className={`min-w-[36px] h-9 px-3 text-sm rounded-lg transition-colors ${
                              audioPage === pn ? "bg-accent font-medium" : "text-secondary hover:text-white hover:bg-white/5"
                            }`}
                            style={audioPage === pn ? { color: "#ffffff" } : undefined}
                          >
                            {pn}
                          </button>
                        )
                      )}
                      <button
                        onClick={() => setAudioPage((p) => Math.min(audioTotalPages, p + 1))}
                        disabled={audioPage === audioTotalPages}
                        className="p-2 text-secondary hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-30 transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* ==================== SOZLAMALAR TAB ==================== */}
      {activeTab === "settings" && pipelineName && (
        <PipelineSettingsTab pipelineName={pipelineName} />
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Error Accordion sub-component                                     */
/* ------------------------------------------------------------------ */

const ErrorAccordion: React.FC<{
  entry: {
    type: string;
    count: number;
    percent: number;
    items: Array<{ description: string; timestamp: string; managerName: string; audioFileId: string }>;
  };
}> = ({ entry }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-primary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            size={14}
            className={`text-secondary transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
          />
          <span className="text-sm text-white font-medium">
            {entry.type}{" "}
            <span className="text-secondary font-normal">
              ({entry.count} ta, {entry.percent}%)
            </span>
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {entry.items.map((item, i) => (
            <div key={i} className="p-3 bg-primary/30 border border-border rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-white font-medium mb-1">
                    {item.description.length > 80 ? item.description.slice(0, 80) + "..." : item.description}
                  </p>
                  <span className="inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 mb-2">
                    Tavsiya
                  </span>
                  <p className="text-xs text-secondary leading-relaxed mb-2">{item.description}</p>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span
                      onClick={() => window.open(`/audio/${item.audioFileId}/transcription?t=0`, "_blank")}
                      className="text-blue-400 hover:underline cursor-pointer"
                    >
                      Vaqt: {item.timestamp}
                    </span>
                    <span className="text-secondary">Menejer: {item.managerName}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default VoronkaDetailPage;
