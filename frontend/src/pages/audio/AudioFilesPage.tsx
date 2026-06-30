import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Search, ChevronLeft, ChevronRight, Play, CheckSquare,
  Filter, RefreshCw, Loader2, LayoutGrid, List, Settings, MoreVertical,
  Phone, Clock, User, Trash2, Eye, X, GitBranch, Tag, Calendar as CalendarIcon,
  CheckCircle, Timer, Flag,
} from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as ReTooltip,
} from "recharts";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import Modal from "../../components/ui/Modal";
import { audioService } from "../../services/audio.service";
import { managersService } from "../../services/managers.service";
import { salesService } from "../../services/sales.service";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";
import { AudioFile } from "../../types";
import toast from "react-hot-toast";
import { useAuth } from "../../store/authStore";

const FILTERS_STORAGE_KEY = "audioFiltersState";
type SavedAudioFilters = {
  page?: number;
  search?: string;
  managerId?: string;
  category?: string;
  status?: string;
  period?: string;
  dateFrom?: string;
  dateTo?: string;
  pipeline?: string;
  responseFilter?: string;
  durationMin?: string;
  showNoConversation?: boolean;
  rejectionReason?: string;
};
const loadSavedFilters = (): SavedAudioFilters => {
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const statusBadge = (status: string, analysis?: any) => {
  // Tahlil to'liq bo'lmasa alohida ko'rsatish
  if (status === "done" && analysis) {
    const hasCriteria = analysis.criteria && Object.keys(analysis.criteria).length > 0;
    const hasScore = analysis.overallScore > 0;
    if (!hasCriteria || !hasScore) {
      return <Badge variant="warning">Tahlil to'liq emas</Badge>;
    }
    return <Badge variant="success">Tahlil tugallangan</Badge>;
  }

  const map: Record<string, { variant: "default" | "warning" | "success" | "danger" | "info"; label: string }> = {
    pending: { variant: "default", label: "Kutilmoqda" },
    processing: { variant: "warning", label: "Tahlil qilinmoqda" },
    done: { variant: "success", label: "Tahlil tugallangan" },
    error: { variant: "danger", label: "Xatolik" },
    no_conversation: { variant: "info", label: "Suhbat yo'q" },
    disconnected: { variant: "warning", label: "Aloqa uzildi" },
    transferred: { variant: "info", label: "O'tkazildi" },
  };
  const s = map[status] || map.pending;
  return <Badge variant={s.variant}>{s.label}</Badge>;
};

const isNoConversation = (audio: AudioFile) => audio.status === "no_conversation" || audio.status === "disconnected" || audio.status === "transferred";

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

const formatDateTime = (date: string | null): string => {
  if (!date) return "—";
  return `${new Date(date).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" })} ${new Date(date).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}`;
};

const getResponseStatus = (leadCreatedAt: string | null, firstContactAt: string | null): "fast" | "good" | "slow" | "none" => {
  if (!firstContactAt) return "none";
  if (!leadCreatedAt) return "fast";
  const hours = (new Date(firstContactAt).getTime() - new Date(leadCreatedAt).getTime()) / 3600000;
  if (hours <= 1) return "fast";
  if (hours <= 4) return "good";
  return "slow";
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

// Score → tier accent
const scoreTier = (score: number): { accent: string; bg: string; label: string } => {
  if (score >= 80) return { accent: "#22c55e", bg: "rgba(34,197,94,0.12)", label: "A'lo" };
  if (score >= 60) return { accent: "#eab308", bg: "rgba(234,179,8,0.12)", label: "Yaxshi" };
  if (score >= 40) return { accent: "#f97316", bg: "rgba(249,115,22,0.12)", label: "O'rtacha" };
  return { accent: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "Past" };
};

// 🚩 Manager haq/noxaq verdict uslubi (AudioDetailPage bilan bir xil)
const verdictStyle = (status?: string) => {
  if (status === "right") return { label: "Manager haq", color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.28)" };
  if (status === "wrong") return { label: "Manager nohaq", color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.28)" };
  if (status === "unclear") return { label: "Aniq emas", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.28)" };
  return { label: "Sabab yo'q", color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.22)" };
};

// Criterion nomlarini radar uchun qisqa qilish
const shortCriterionLabel = (name: string): string => {
  const map: Record<string, string> = {
    // Canonical (qisqa) — backend normalizatordan keladi
    "Salomlashish": "Salom",
    "Ehtiyojni aniqlash": "Ehtiyoj",
    "Taqdimot": "Taqdimot",
    "E'tiroz bilan ishlash": "E'tiroz",
    "E'tirozga yechim berish": "E'tiroz",
    "Bosim o'tkazish": "Bosim",
    "Kayfiyati": "Kayfiyat",
    "Aktiv tinglash": "Aktiv",
    "Kontekstni eslatish": "Kontekst",
    // DB (uzun) nomlar — fallback
    "Salomlashish va suhbatni boshlash": "Salom",
    "Ehtiyojni aniqlash — SOPRANO texnikasi": "Ehtiyoj",
    "Taqdimot — mahsulotni tushuntirish": "Taqdimot",
    "Bosim — closing va keyingi qadamga olib kelish": "Bosim",
    "Kayfiyat — ovoz tonusi va energiya": "Kayfiyat",
    "Kontekstni eslatish — oldingi suhbatga bog'lash": "Kontekst",
    // Legacy
    "Mahsulotni tushuntirish": "Taqdimot",
    "E'tirozlar bilan ishlash": "E'tiroz",
    "Keyingi qadamga yo'naltirish": "Yakun",
    "Keyingi qadam": "Yakun",
    "Qaror holatini aniqlash": "Qaror",
    "Yangi sabab bilan chiqish": "Sabab",
    "Oldingi to‘siqni tekshirish": "To'siq",
    "Oldingi to'siqni tekshirish": "To'siq",
    "Closing va keyingi qadamni kelishish": "Closing",
  };
  if (map[name]) return map[name];
  return name.split(/\s+/)[0].slice(0, 10);
};

// Radar chart axislari kategoriyaga qarab soat yonalishi bo'yicha tartiblanadi.
// Sotuv (7 mezon): Salom → Ehtiyoj → Taqdimot → E'tiroz → Bosim → Kayfiyat → Aktiv
// Qayta (5 mezon + legacy): Kontekst → E'tiroz → Bosim → Kayfiyat → Aktiv
const SOTUV_CRITERION_ORDER: Record<string, number> = {
  "Salomlashish": 1,
  "Salomlashish va suhbatni boshlash": 1,
  "Ehtiyojni aniqlash": 2,
  "Ehtiyojni aniqlash — SOPRANO texnikasi": 2,
  "Ehtiyojni aniqlash — SPIN texnikasi": 2,
  "SOPRANO texnikasi": 2,
  "Taqdimot": 3,
  "Taqdimot — mahsulotni tushuntirish": 3,
  "Mahsulotni tushuntirish": 3,
  "Mahsulot taqdimoti": 3,
  "E'tiroz bilan ishlash": 4,
  "E'tirozlar bilan ishlash": 4,
  "E'tirozga yechim berish": 4,
  "Bosim o'tkazish": 5,
  "Bosim — closing va keyingi qadamga olib kelish": 5,
  "Bosim": 5,
  "Kayfiyati": 6,
  "Kayfiyat — ovoz tonusi va energiya": 6,
  "Kayfiyat": 6,
  "Aktiv tinglash": 7,
  // Legacy
  "Keyingi qadamga yo'naltirish": 8,
  "Keyingi qadam": 8,
  "Yakunlash": 8,
};
const QAYTA_CRITERION_ORDER: Record<string, number> = {
  // Qayta 5-mezon: Kontekst → E'tirozga yechim → Bosim → Kayfiyat → Aktiv
  // (Salomlashish olib tashlandi — qayta'da takror tanishtirish shart emas)
  "Kontekstni eslatish": 1,
  "Kontekstni eslatish — oldingi suhbatga bog'lash": 1,
  "E'tiroz bilan ishlash": 2,
  "E'tirozlar bilan ishlash": 2,
  "E'tirozga yechim berish": 2,
  "Bosim o'tkazish": 3,
  "Bosim — closing va keyingi qadamga olib kelish": 3,
  "Bosim": 3,
  "Kayfiyati": 4,
  "Kayfiyat — ovoz tonusi va energiya": 4,
  "Kayfiyat": 4,
  "Aktiv tinglash": 5,
  // Legacy qayta-only mezonlari (eski tahlillarda bo'lgan)
  "Oldingi to‘siqni tekshirish": 6,
  "Oldingi to'siqni tekshirish": 6,
  "Yangi sabab bilan chiqish": 7,
  "Qo‘shimcha ehtiyoj aniqlash": 7,
  "Qo'shimcha ehtiyoj aniqlash": 7,
  "Qaror holatini aniqlash": 8,
  "Yechim taqdim etish": 9,
  "Closing va keyingi qadamni kelishish": 10,
};
const orderForCategory = (cat: string | null | undefined) =>
  cat === "qayta" ? QAYTA_CRITERION_ORDER : SOTUV_CRITERION_ORDER;
const sortByCycle = (cat: string | null | undefined) => (a: string, b: string): number => {
  const o = orderForCategory(cat);
  return (o[a] ?? 99) - (o[b] ?? 99);
};

/* ---- Column visibility ---- */
const AUDIO_COLUMNS = [
  { key: "fileName", label: "Fayl nomi" },
  { key: "manager", label: "Menejer" },
  { key: "phone", label: "Telefon raqami" },
  { key: "duration", label: "Davomiylik" },
  { key: "status", label: "Holati" },
  { key: "category", label: "Kategoriya" },
  { key: "score", label: "Umumiy ball" },
  { key: "leadQuality", label: "Lid sifati" },
  { key: "errors", label: "Xatolar" },
  { key: "isSale", label: "Sotuv" },
  { key: "pipeline", label: "Voronka" },
  { key: "source", label: "Manbasi" },
  { key: "leadDate", label: "Lead sanasi" },
  { key: "contactTime", label: "Aloqa vaqti" },
  { key: "responseTime", label: "Javob vaqti" },
] as const;

const ALL_AUDIO_COL_KEYS = AUDIO_COLUMNS.map((c) => c.key);
const STORAGE_KEY_AUDIO_COLS = "audioColumns";

const loadAudioColumns = (): string[] => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_AUDIO_COLS);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [...ALL_AUDIO_COL_KEYS];
};

const AudioColumnsDropdown: React.FC<{
  visibleCols: string[];
  setVisibleCols: (c: string[]) => void;
}> = ({ visibleCols, setVisibleCols }) => {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current?.contains(e.target as Node)) return;
      if (btnRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (key: string) => {
    const next = visibleCols.includes(key)
      ? visibleCols.filter((k) => k !== key)
      : [...visibleCols, key];
    setVisibleCols(next);
    localStorage.setItem(STORAGE_KEY_AUDIO_COLS, JSON.stringify(next));
  };

  const handleOpen = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen(!open);
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="p-2 text-secondary hover:text-white border border-border rounded-lg hover:bg-white/5 transition-colors"
        title="Ustunlar sozlamasi"
      >
        <Settings size={18} />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed bottom-0 left-0 right-0 md:bottom-auto md:left-auto bg-card border-t md:border border-border rounded-t-2xl md:rounded-xl shadow-2xl z-[9999] p-4 space-y-2 max-h-[70vh] overflow-y-auto"
          style={{ ...(window.innerWidth >= 768 ? { top: pos.top, right: pos.right, width: 256 } : {}) }}
        >
          <h4 className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>Ustunlar</h4>
          {AUDIO_COLUMNS.map((col) => (
            <label key={col.key} className="flex items-center gap-2 cursor-pointer text-sm text-secondary hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={visibleCols.includes(col.key)}
                onChange={() => toggle(col.key)}
                className="w-4 h-4 rounded border-border bg-primary accent-accent"
              />
              {col.label}
            </label>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};

interface AudioFilesPageProps {
  lockedManagerId?: string | null;
  lockedPipelineName?: string | null;
  // ManagerDetailPage tab'idan — bitta menejerga qulflash + ichki joylash
  forceManagerIds?: string[];
  embedded?: boolean;
}

const AudioFilesPage: React.FC<AudioFilesPageProps> = ({
  lockedManagerId: lockedManagerIdProp,
  lockedPipelineName,
  forceManagerIds,
  embedded,
} = {}) => {
  // forceManagerIds (ManagerDetailPage) → lockedManagerId
  const lockedManagerId =
    lockedManagerIdProp != null
      ? lockedManagerIdProp
      : forceManagerIds && forceManagerIds.length > 0
      ? forceManagerIds.join(",")
      : undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userRole, managerUser } = useAuth();
  const [showFilter, setShowFilter] = useState(false);
  const [filterTab, setFilterTab] = useState<
    "status" | "manager" | "category" | "period" | "pipeline" | "response" | "duration"
  >("status");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobileMenuTab, setMobileMenuTab] = useState<"filter" | "columns" | null>(null);

  // Sessiondagi saqlangan filtrlardan — audio detaildan orqaga qaytganda holat yo'qolmaydi
  const saved = loadSavedFilters();
  const isRegularSotuvchi =
    userRole === "manager" && !!managerUser && !managerUser.canViewAll;
  const defaultManagerId = isRegularSotuvchi ? managerUser.id : "";

  const [page, setPage] = useState(saved.page ?? 1);
  const [search, setSearch] = useState(saved.search ?? "");
  // managerId = "id" (1 ta) yoki "id1,id2,id3" (multi). Flat ro'yxat ManagerDeptFilter uchun.
  const [managerId, setManagerId] = useState(
    lockedManagerId != null ? lockedManagerId : (saved.managerId ?? defaultManagerId)
  );
  useEffect(() => {
    if (lockedManagerId != null) setManagerId(lockedManagerId);
  }, [lockedManagerId]);
  const selectedManagerIds = (managerId || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const setSelectedManagerIds = (ids: string[]) => {
    setManagerId(ids.join(","));
    setPage(1);
  };
  const [category, setCategory] = useState(saved.category ?? "");
  const [status, setStatus] = useState(saved.status ?? "done");
  const [period, setPeriod] = useState(saved.period ?? "all");
  const [dateFrom, setDateFrom] = useState(saved.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(saved.dateTo ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showNoConversation, setShowNoConversation] = useState(saved.showNoConversation ?? false);
  const [pipeline, setPipeline] = useState(
    lockedPipelineName != null ? lockedPipelineName : (saved.pipeline ?? "")
  );
  useEffect(() => {
    if (lockedPipelineName != null) setPipeline(lockedPipelineName);
  }, [lockedPipelineName]);
  const [responseFilter, setResponseFilter] = useState(saved.responseFilter ?? "");
  const [durationMin, setDurationMin] = useState(saved.durationMin ?? "");
  // 🚩 "Yo'qotilgan lidlar" filtri — "" o'chiq, "all" yoniq (faqat closeReasonName bor lidlar)
  const [rejectionReason, setRejectionReason] = useState(saved.rejectionReason ?? "");

  // Filtrlarni sessionStorage'ga avtomatik saqlash — orqaga qaytganda tiklash uchun
  useEffect(() => {
    const state: SavedAudioFilters = {
      page, search, managerId, category, status, period,
      dateFrom, dateTo, pipeline, responseFilter, durationMin, showNoConversation, rejectionReason,
    };
    try { sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [page, search, managerId, category, status, period, dateFrom, dateTo, pipeline, responseFilter, durationMin, showNoConversation, rejectionReason]);
  const [viewMode, setViewMode] = useState<"table" | "card">(() => {
    return (localStorage.getItem("audioViewMode") as "table" | "card") || "card";
  });
  const [visibleCols, setVisibleCols] = useState<string[]>(loadAudioColumns);

  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    type: "delete" | "analyze" | "bulk-delete" | "bulk-analyze" | "stop-analysis";
    ids: string[];
    message: string;
  } | null>(null);

  // AmoCRM sync modal state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncMode, setSyncMode] = useState<"today" | "range">("today");
  const [syncDateFrom, setSyncDateFrom] = useState("");
  const [syncDateTo, setSyncDateTo] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; total: number; errors: number } | null>(null);
  const [syncLive, setSyncLive] = useState<{ synced: number; total: number; page: number } | null>(null);
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ total: number; done: number; pending: number; percent: number } | null>(null);
  const analyzePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyzeStartRef = useRef<number>(0);
  const analyzeStartDoneRef = useRef<number>(0);
  const [analyzeEta, setAnalyzeEta] = useState<string>("");

  const calcEta = (done: number, pending: number) => {
    const newDone = done - analyzeStartDoneRef.current;
    const elapsed = (Date.now() - analyzeStartRef.current) / 1000;
    let remaining: number;

    if (newDone > 0 && elapsed > 5) {
      // Real tezlik asosida
      const perItem = elapsed / newDone;
      remaining = perItem * pending;
    } else {
      // Default: har bir audio ~25 sekund
      remaining = pending * 25;
    }

    if (remaining < 60) return `~${Math.ceil(remaining)} soniya`;
    if (remaining < 3600) return `~${Math.ceil(remaining / 60)} daqiqa`;
    return `~${(remaining / 3600).toFixed(1)} soat`;
  };

  // Sahifa yuklanganda — backend da tahlil davom etayaptimi tekshirish
  useEffect(() => {
    const checkRunning = async () => {
      try {
        const p = await audioService.getProgress();
        if (p.processing > 0) {
          // Tahlil davom etyapti — progress ko'rsatish (faqat joriy batch)
          setIsAnalyzing(true);
          analyzeStartRef.current = Date.now();
          analyzeStartDoneRef.current = p.done;
          const batchRemaining = p.pending + p.processing + p.error;
          setAnalyzeProgress({ total: batchRemaining, done: 0, pending: p.pending + p.processing, percent: 0 });

          // Polling boshlash
          if (!analyzePollRef.current) {
            analyzePollRef.current = setInterval(async () => {
              try {
                const pp = await audioService.getProgress();
                const batchDone = pp.done - analyzeStartDoneRef.current;
                const stillPending = pp.pending + pp.processing;
                const batchTotal = batchDone + stillPending + pp.error;
                const ppct = batchTotal > 0 ? Math.round((batchDone / batchTotal) * 100) : 100;
                setAnalyzeProgress({ total: batchTotal, done: batchDone, pending: stillPending, percent: ppct });

                // ETA
                setAnalyzeEta(calcEta(pp.done, stillPending));

                if (pp.pending === 0 && pp.processing === 0) {
                  clearInterval(analyzePollRef.current!);
                  analyzePollRef.current = null;
                  setIsAnalyzing(false);
                  setAnalyzeEta("");
                  toast.success(`${pp.done} ta audio tahlil qilindi`);
                  refetch();
                }
              } catch { /* ignore */ }
            }, 3000);
          }
        }
      } catch { /* ignore */ }
    };
    checkRunning();
    return () => {
      if (analyzePollRef.current) { clearInterval(analyzePollRef.current); analyzePollRef.current = null; }
    };
  }, []);

  const stopPolling = () => {
    if (syncPollRef.current) { clearInterval(syncPollRef.current); syncPollRef.current = null; }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    setSyncLive(null);
    try {
      await audioService.syncAmoCrm(
        syncMode === "range" ? syncDateFrom || undefined : undefined,
        syncMode === "range" ? syncDateTo || undefined : undefined
      );
      // Polling boshlash
      syncPollRef.current = setInterval(async () => {
        try {
          const status = await audioService.getSyncStatus();
          setSyncLive({ synced: status.synced, total: status.total, page: status.page });
          if (!status.running) {
            stopPolling();
            setSyncResult({ synced: status.synced, total: status.total, errors: status.errors });
            setIsSyncing(false);
            refetch();
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch {
      toast.error("AmoCRM sync xatolik yuz berdi");
      setIsSyncing(false);
    }
  };

  const closeSyncModal = () => {
    setShowSyncModal(false);
    setSyncResult(null);
    setSyncMode("today");
    setSyncDateFrom("");
    setSyncDateTo("");
  };

  // Filter modal — ESC key + body scroll lock
  useEffect(() => {
    if (!showFilter) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowFilter(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [showFilter]);

  // mm:ss → soniya konvertatsiya
  const durationMinSec = (() => {
    if (!durationMin) return 0;
    const parts = durationMin.split(":");
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!isNaN(m) && !isNaN(s)) return m * 60 + s;
    }
    const plain = parseInt(durationMin, 10);
    return isNaN(plain) ? 0 : plain;
  })();

  const activeFilterCount = [managerId, category, status, period !== "all" ? period : "", showNoConversation ? "nc" : "", pipeline, responseFilter, durationMin].filter(Boolean).length;

  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });
  const { data: pipelines } = useQuery({
    queryKey: ["sales-pipelines"],
    queryFn: () => salesService.getPipelines(),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audioFiles", page, managerId, category, status, period, search, dateFrom, dateTo, showNoConversation, pipeline, durationMinSec, rejectionReason],
    queryFn: () =>
      audioService.getAll({
        page, limit: 12, category,
        status,
        period, search,
        ...(selectedManagerIds.length === 1
          ? { managerId: selectedManagerIds[0] }
          : selectedManagerIds.length > 1
          ? { managerIds: selectedManagerIds.join(",") }
          : {}),
        ...(period === "custom" && dateFrom ? { dateFrom } : {}),
        ...(period === "custom" && dateTo ? { dateTo } : {}),
        ...(showNoConversation ? { showNoConversation: "true" } : {}),
        ...(pipeline ? { pipeline } : {}),
        ...(durationMinSec > 0 ? { minDurationSec: String(durationMinSec) } : {}),
        ...(rejectionReason ? { rejectionReason } : {}),
      }),
  });


  const analyzeMutation = useMutation({
    mutationFn: (id: string) => audioService.analyzeOne(id),
    onSuccess: (result) => {
      toast.success(result.message);
      refetch();
    },
    onError: () => toast.error("Tahlil qilishda xatolik"),
  });

  const bulkMutation = useMutation({
    mutationFn: (ids: string[]) => audioService.analyzeBulk(ids),
    onSuccess: (result) => {
      toast.success(result.message);
      setSelectedIds(new Set());
      refetch();
    },
    onError: () => toast.error("Bulk tahlil xatolik"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => audioService.remove(id),
    onSuccess: () => {
      toast.success("Audio o'chirildi");
      queryClient.invalidateQueries({ queryKey: ["audioFiles"] });
    },
    onError: () => toast.error("O'chirishda xatolik"),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!data?.data) return;
    const analyzableIds = data.data
      .filter((a: AudioFile) => a.status === "pending" || a.status === "error")
      .map((a: AudioFile) => a.id);
    if (analyzableIds.length === 0) return;
    const allSelected = analyzableIds.every((id: string) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(analyzableIds));
  };

  const canAnalyze = (audio: AudioFile) => audio.status === "pending" || audio.status === "error";
  const selectedCount = selectedIds.size;
  const limit = 12;
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const startItem = total > 0 ? (page - 1) * limit + 1 : 0;
  const endItem = Math.min(page * limit, total);

  const resetFilters = () => {
    setManagerId("");
    setCategory("");
    setStatus("");
    setPeriod("all");
    setDateFrom("");
    setDateTo("");
    setShowNoConversation(false);
    setPipeline("");
    setResponseFilter("");
    setDurationMin("");
    setRejectionReason("");
    setPage(1);
  };

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (page <= 3) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (page >= totalPages - 2) {
      pages.push(1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, "...", page - 1, page, page + 1, "...", totalPages);
    }
    return pages;
  };

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 pb-8"}>
      {/* Bulk actions */}
      {selectedCount > 0 && (
        <div className="flex items-center gap-4 border border-accent/30 rounded-xl px-4 py-3" style={{ backgroundColor: "rgba(59,94,245,0.08)" }}>
          <CheckSquare size={18} style={{ color: "#3b5ef5" }} />
          <span className="text-sm" style={{ color: "var(--text-primary, #ffffff)" }}>{selectedCount} ta audio tanlandi</span>
          <Button variant="primary" size="sm" onClick={() => setConfirmModal({
            type: "bulk-analyze",
            ids: Array.from(selectedIds),
            message: `${selectedCount} ta audio faylni tahlil qilmoqchimisiz?`,
          })} disabled={bulkMutation.isPending}>
            <Play size={14} />
            {bulkMutation.isPending ? "Tahlil qilinmoqda..." : "Tahlil qilish"}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmModal({
            type: "bulk-delete",
            ids: Array.from(selectedIds),
            message: `${selectedCount} ta audio faylni o'chirmoqchimisiz?`,
          })}>
            O'chirish
          </Button>
          <button onClick={() => setSelectedIds(new Set())} className="text-sm ml-auto" style={{ color: "#7c7c9a" }}>
            Bekor qilish
          </button>
        </div>
      )}

      {/* Tahlil progress */}
      {isAnalyzing && analyzeProgress && (
        <div className="bg-card border border-accent/30 rounded-xl px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-accent" />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary, #fff)" }}>
                Tahlil qilinmoqda...
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-accent">{analyzeProgress.percent}%</span>
              <button
                onClick={() => setConfirmModal({
                  type: "stop-analysis",
                  ids: [],
                  message: "Tahlilni to'xtatmoqchimisiz? Qolgan audio fayllar tahlil qilinmaydi.",
                })}
                className="px-3 py-1 text-xs font-medium rounded-md bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20 transition-colors"
              >
                Bekor qilish
              </button>
            </div>
          </div>
          <div className="w-full h-2.5 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${analyzeProgress.percent}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-secondary">
            <span>Tayyor: {analyzeProgress.done} / {analyzeProgress.total}</span>
            {analyzeEta && <span>Taxminan: {analyzeEta}</span>}
            <span>Kutilmoqda: {analyzeProgress.pending}</span>
          </div>
        </div>
      )}

      {/* Table Card */}
      <Card className="overflow-hidden max-w-[calc(100vw-2rem)] md:max-w-full">
        {/* Search + Filter + Actions bar */}
        <div className="flex items-center gap-2 mb-4">
          {/* View toggle */}
          <div className="flex bg-primary border border-border rounded-lg p-0.5 shrink-0">
            <button
              onClick={() => { setViewMode("table"); localStorage.setItem("audioViewMode", "table"); }}
              className={`p-1.5 rounded transition-colors ${viewMode === "table" ? "bg-accent" : "text-secondary hover:text-white"}`}
              style={viewMode === "table" ? { color: "#ffffff" } : undefined}
            >
              <List size={14} />
            </button>
            <button
              onClick={() => { setViewMode("card"); localStorage.setItem("audioViewMode", "card"); }}
              className={`p-1.5 rounded transition-colors ${viewMode === "card" ? "bg-accent" : "text-secondary hover:text-white"}`}
              style={viewMode === "card" ? { color: "#ffffff" } : undefined}
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
            <input
              type="text"
              placeholder="Qidirish..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-2 bg-primary border border-border rounded-lg text-sm placeholder-secondary focus:outline-none focus:border-accent/50"
              style={{ color: "var(--text-primary)" }}
            />
          </div>

          {/* Desktop: tugmalar */}
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => {
              setConfirmModal({ type: "bulk-analyze", ids: [], message: "Barcha tahlil qilinmagan audio fayllarini tahlil qilmoqchimisiz?" });
            }}>
              <Play size={14} />
              Tahlil
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowSyncModal(true)}>
              <RefreshCw size={14} />
              Sinxron
            </Button>
            <Button size="sm" onClick={() => navigate("/audio/upload")}>
              <Upload size={14} />
              Yuklash
            </Button>
          </div>

          {/* Mobile: ⋮ menu */}
          <div className="relative md:hidden shrink-0">
            <button
              onClick={() => { setShowMobileMenu(!showMobileMenu); setMobileMenuTab(null); }}
              className="p-2 text-secondary hover:text-white border border-border rounded-lg transition-colors"
            >
              <MoreVertical size={16} />
            </button>
            {showMobileMenu && createPortal(
              <>
                <div className="fixed inset-0 z-[9998] bg-black/30 cursor-pointer" onClick={() => setShowMobileMenu(false)} />
                <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:right-4 md:left-auto md:top-24 md:w-64 bg-card border-t md:border border-border rounded-t-2xl md:rounded-xl shadow-2xl z-[9999] py-2 max-h-[80vh] overflow-y-auto">
                  {!mobileMenuTab ? (
                    /* Asosiy menu */
                    <>
                      <button
                        onClick={() => { navigate("/audio/upload"); setShowMobileMenu(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors hover:bg-primary/50"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <Upload size={14} /> Audio yuklash
                      </button>
                      <button
                        onClick={() => {
                          setConfirmModal({ type: "bulk-analyze", ids: [], message: "Barcha tahlil qilinmagan audio fayllarini tahlil qilmoqchimisiz?" });
                          setShowMobileMenu(false);
                        }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors hover:bg-primary/50"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <Play size={14} /> Barchasini tahlil
                      </button>
                      <button
                        onClick={() => { setShowSyncModal(true); setShowMobileMenu(false); }}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors hover:bg-primary/50"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <RefreshCw size={14} /> Sinhronlash
                      </button>
                      <div className="border-t my-1" style={{ borderColor: "var(--color-border)" }} />
                      <button
                        onClick={() => setMobileMenuTab("filter")}
                        className="flex items-center justify-between w-full px-4 py-2.5 text-sm transition-colors hover:bg-primary/50"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span className="flex items-center gap-2"><Filter size={14} /> Filtrlar</span>
                        {activeFilterCount > 0 && <span className="text-xs bg-accent text-white px-1.5 py-0.5 rounded-full">{activeFilterCount}</span>}
                      </button>
                      <button
                        onClick={() => setMobileMenuTab("columns")}
                        className="flex items-center gap-2 w-full px-4 py-2.5 text-sm transition-colors hover:bg-primary/50"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <Settings size={14} /> Ustunlar
                      </button>
                    </>
                  ) : mobileMenuTab === "filter" ? (
                    /* Filter sub-menu */
                    <div className="p-3 space-y-3">
                      <div className="flex items-center justify-between mb-1">
                        <button onClick={() => setMobileMenuTab(null)} className="text-xs text-accent">← Orqaga</button>
                        <button onClick={() => { resetFilters(); }} className="text-xs text-accent">Tozalash</button>
                      </div>
                      <div>
                        <label className="block text-xs text-secondary mb-1">Holati</label>
                        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-sm" style={{ color: "var(--text-primary)" }}>
                          <option value="">Barchasi</option>
                          <option value="done">Tahlil tugallangan</option>
                          <option value="incomplete">Tahlil to'liq emas</option>
                          <option value="pending">Kutilmoqda</option>
                          <option value="error">Xatolik</option>
                          <option value="no_conversation">Suhbat yo'q</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-secondary mb-1">Menejer</label>
                        <select value={managerId} onChange={(e) => { setManagerId(e.target.value); setPage(1); }} className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-sm" style={{ color: "var(--text-primary)" }}>
                          <option value="">Barchasi</option>
                          {managers?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-secondary mb-1">Kategoriya</label>
                        <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-sm" style={{ color: "var(--text-primary)" }}>
                          <option value="">Barchasi</option>
                          <option value="sotuv">1-Qo'ng'iroq</option>
                          <option value="qayta">Qayta</option>
                          <option value="boshqa">Boshqa</option>
                        </select>
                      </div>
                    </div>
                  ) : (
                    /* Columns sub-menu */
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between mb-1">
                        <button onClick={() => setMobileMenuTab(null)} className="text-xs text-accent">← Orqaga</button>
                        <span className="text-xs text-secondary">Ustunlar</span>
                      </div>
                      {AUDIO_COLUMNS.map((col) => (
                        <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "var(--text-primary)" }}>
                          <input
                            type="checkbox"
                            checked={visibleCols.includes(col.key)}
                            onChange={() => {
                              const next = visibleCols.includes(col.key)
                                ? visibleCols.filter((k) => k !== col.key)
                                : [...visibleCols, col.key];
                              setVisibleCols(next);
                              localStorage.setItem("audioColumns", JSON.stringify(next));
                            }}
                            className="accent-accent"
                          />
                          {col.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </>,
              document.body
            )}
          </div>

          {/* 🚩 Yo'qotilgan lidlar toggle */}
          <button
            onClick={() => {
              setRejectionReason((prev) => (prev ? "" : "all"));
              setStatus("done");
              setPage(1);
            }}
            className="relative inline-flex items-center gap-1.5 px-2.5 py-2 border rounded-lg transition-colors shrink-0"
            style={{
              color: rejectionReason ? "#ef4444" : "var(--text-secondary)",
              borderColor: rejectionReason ? "rgba(239,68,68,0.6)" : "var(--color-border)",
              backgroundColor: rejectionReason ? "rgba(239,68,68,0.1)" : "transparent",
              boxShadow: rejectionReason ? "0 0 0 3px rgba(239,68,68,0.12)" : "none",
            }}
            title={rejectionReason ? "Yo'qotilgan lidlar: yoniq" : "Yo'qotilgan lidlarni ko'rsatish"}
          >
            <Flag size={16} fill={rejectionReason ? "currentColor" : "none"} />
            {rejectionReason && <span className="text-xs font-semibold">Yo'qotilgan</span>}
          </button>

          {/* Filter button — faqat desktop */}
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowFilter(true)}
              className="relative p-2 border border-border rounded-lg hover:bg-white/5 transition-colors"
              style={{
                color: activeFilterCount > 0 ? "#8b5cf6" : "var(--text-secondary)",
              }}
              title="Filter"
            >
              <Filter size={16} />
              {activeFilterCount > 0 && (
                <span
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Column visibility settings — faqat desktop */}
          <div className="hidden md:block">
            <AudioColumnsDropdown visibleCols={visibleCols} setVisibleCols={setVisibleCols} />
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-4">
            {/* Table header */}
            <div className="flex gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-3 flex-1" />
              ))}
            </div>
            {/* 8 rows */}
            {Array.from({ length: 8 }).map((_, r) => (
              <div key={r} className="flex items-center gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)", opacity: 1 - r * 0.08 }}>
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-16" rounded="full" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
            {/* Pagination */}
            <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
              <Skeleton className="h-4 w-48" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-20" rounded="lg" />
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
                    <th className="text-left py-3 px-3 w-10 whitespace-nowrap">
                      <input
                        type="checkbox"
                        onChange={toggleSelectAll}
                        checked={
                          data?.data &&
                          data.data.filter((a: AudioFile) => canAnalyze(a)).length > 0 &&
                          data.data.filter((a: AudioFile) => canAnalyze(a)).every((a: AudioFile) => selectedIds.has(a.id))
                        }
                        className="w-4 h-4 rounded border-border bg-primary accent-accent cursor-pointer"
                      />
                    </th>
                    {visibleCols.includes("fileName") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Fayl nomi</th>}
                    {visibleCols.includes("manager") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Menejer</th>}
                    {visibleCols.includes("phone") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Telefon raqami</th>}
                    {visibleCols.includes("duration") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Davomiylik</th>}
                    {visibleCols.includes("status") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Holati</th>}
                    {visibleCols.includes("category") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Kategoriya</th>}
                    {visibleCols.includes("score") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Umumiy ball</th>}
                    {visibleCols.includes("leadQuality") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Lid sifati</th>}
                    {visibleCols.includes("errors") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Xatolar</th>}
                    {visibleCols.includes("isSale") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Sotuv</th>}
                    {visibleCols.includes("pipeline") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Voronka</th>}
                    {visibleCols.includes("source") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Manbasi</th>}
                    {visibleCols.includes("leadDate") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Lead sanasi</th>}
                    {visibleCols.includes("contactTime") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Aloqa vaqti</th>}
                    {visibleCols.includes("responseTime") && <th className="text-left py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Javob vaqti</th>}
                    <th className="text-right py-3 px-3 text-xs text-secondary font-medium whitespace-nowrap">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.data || []).filter((a: AudioFile) => !responseFilter || getResponseStatus(a.leadCreatedAt, a.firstContactAt) === responseFilter).map((audio: AudioFile) => {
                    const noConv = isNoConversation(audio);
                    return (
                    <tr key={audio.id} onClick={() => navigate(`/audio/${audio.id}`)} className={`border-b border-border/50 transition-colors cursor-pointer ${noConv ? "opacity-40 hover:opacity-60" : "hover:bg-white/[0.02]"}`}>
                      <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                        {!noConv && canAnalyze(audio) ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(audio.id)}
                            onChange={() => toggleSelect(audio.id)}
                            className="w-4 h-4 rounded border-border bg-primary accent-accent cursor-pointer"
                          />
                        ) : (
                          <div className="w-4 h-4" />
                        )}
                      </td>
                      {visibleCols.includes("fileName") && <td className={`py-3 px-3 text-sm ${noConv ? "text-secondary cursor-pointer hover:text-accent" : "text-white cursor-pointer hover:text-accent"}`} onClick={() => navigate(`/audio/${audio.id}`)}>
                        {audio.fileName}
                      </td>}
                      {visibleCols.includes("manager") && <td className="py-3 px-3 text-secondary text-sm whitespace-nowrap">{audio.manager?.name || "—"}</td>}
                      {visibleCols.includes("phone") && <td className="py-3 px-3 text-secondary text-sm font-mono">{audio.phoneNumber || "—"}</td>}
                      {visibleCols.includes("duration") && <td className="py-3 px-3 text-secondary text-sm font-mono">{formatDuration(audio.duration)}</td>}
                      {visibleCols.includes("status") && <td className="py-3 px-3">{statusBadge(audio.status, audio.analysis)}</td>}
                      {visibleCols.includes("category") && <td className="py-3 px-3 text-secondary text-sm whitespace-nowrap">{categoryLabel(audio.category)}</td>}
                      {visibleCols.includes("score") && (
                        <td className="py-3 px-3 text-white text-sm font-medium whitespace-nowrap">
                          {noConv ? "—" : (
                            <span className="flex items-center gap-1.5">
                              <span>{audio.analysis?.overallScore ?? "—"}</span>
                              {audio.analysis?.judgeSkipped && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-md whitespace-nowrap"
                                  style={{
                                    backgroundColor: "rgba(245,158,11,0.15)",
                                    color: "#f59e0b",
                                    border: "1px solid rgba(245,158,11,0.30)",
                                  }}
                                  title={audio.analysis.judgeReason || "Vaqt kamligi — ball hisoblanmaydi"}
                                >
                                  ⚖️ Sud
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                      )}
                      {visibleCols.includes("leadQuality") && <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {noConv ? <span className="text-secondary">—</span> : leadBadge(audio.analysis?.leadQuality, audio.analysis?.leadScore)}
                          {rejectionReason && audio.analysis?.rejectionInfo?.managerVerdict && (() => {
                            const v = verdictStyle(audio.analysis.rejectionInfo.managerVerdict.status);
                            return (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                style={{ color: v.color, backgroundColor: v.bg, border: `1px solid ${v.border}` }}
                                title={audio.analysis.rejectionInfo.short || ""}
                              >
                                {v.label}
                              </span>
                            );
                          })()}
                        </span>
                      </td>}
                      {visibleCols.includes("errors") && <td className="py-3 px-3 whitespace-nowrap">
                        {noConv ? <span className="text-secondary">—</span> : audio.analysis?.errors ? (
                          <span className={`text-sm ${audio.analysis.errors.length > 0 ? "text-red-400" : "text-secondary"}`}>
                            {audio.analysis.errors.length}
                          </span>
                        ) : (
                          <span className="text-secondary">—</span>
                        )}
                      </td>}
                      {visibleCols.includes("isSale") && <td className="py-3 px-3 whitespace-nowrap">
                        {noConv ? <span className="text-secondary">—</span> : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${audio.isSale ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-secondary"}`}>
                            {audio.isSale ? "Ha" : "Yo'q"}
                          </span>
                        )}
                      </td>}
                      {visibleCols.includes("pipeline") && <td className="py-3 px-3 text-secondary text-xs whitespace-nowrap">{audio.pipelineName || "—"}</td>}
                      {visibleCols.includes("source") && <td className="py-3 px-3 text-secondary text-xs whitespace-nowrap">{audio.sourceName || "—"}</td>}
                      {visibleCols.includes("leadDate") && <td className="py-3 px-3 text-secondary text-xs whitespace-nowrap">{formatDateTime(audio.leadCreatedAt)}</td>}
                      {visibleCols.includes("contactTime") && <td className="py-3 px-3 text-secondary text-xs whitespace-nowrap">{formatDateTime(audio.firstContactAt)}</td>}
                      {visibleCols.includes("responseTime") && <td className="py-3 px-3 text-xs whitespace-nowrap">
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
                      </td>}
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {canAnalyze(audio) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmModal({ type: "analyze", ids: [audio.id], message: `"${audio.fileName}" faylni tahlil qilmoqchimisiz?` }); }}
                              disabled={analyzeMutation.isPending}
                              className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/20 transition-colors"
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
                              setConfirmModal({ type: "delete", ids: [audio.id], message: `"${audio.fileName}" faylni o'chirmoqchimisiz?` });
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
                  {(!data?.data || data.data.length === 0) && (
                    <tr>
                      <td colSpan={15} className="py-12 text-center text-secondary">
                        Audio fayllar topilmadi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            ) : (
            /* Card View — clean, focused, radar chart */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data?.data.map((audio: AudioFile) => {
                const noConv = isNoConversation(audio);
                const score = audio.analysis?.overallScore ?? 0;
                const tier = scoreTier(score);
                const criteria = audio.analysis?.criteria as Record<string, { score: number }> | undefined;
                // BARCHA mezonlarni ko'rsatamiz (ilgari slice(0, 6) — "Salomlashish"
                // kabi birinchi mezon tushib qolardi). Order — JSON tartibida.
                const orderMap = orderForCategory(audio.category);
                const radarData = criteria
                  ? Object.entries(criteria)
                      // Faqat shu kategoriyaga tegishli mezonlar
                      .filter(([name]) => orderMap[name] !== undefined)
                      .sort(([a], [b]) => sortByCycle(audio.category)(a, b))
                      .map(([name, v]) => ({
                        name: shortCriterionLabel(name),
                        fullName: name,
                        score: v?.score ?? 0,
                      }))
                  : [];
                const hasAnalysis = !!audio.analysis && score > 0;

                // Kategoriya badge: "1-Qo'ng'iroq" (sotuv) / "Qayta qo'ng'iroq" (qayta)
                const cat = audio.category || "";
                const catBadge =
                  cat === "sotuv"
                    ? { label: "1-Qo'ng'iroq", color: "#8b5cf6" }
                    : cat === "qayta"
                    ? { label: "Qayta qo'ng'iroq", color: "#06b6d4" }
                    : null;

                return (
                  <div
                    key={audio.id}
                    onClick={() => navigate(`/audio/${audio.id}`)}
                    className={`relative rounded-2xl border overflow-hidden flex flex-col transition-transform hover:-translate-y-0.5 cursor-pointer ${noConv ? "opacity-60" : ""}`}
                    style={{
                      backgroundColor: "var(--color-card-bg)",
                      borderColor: "var(--color-border)",
                      boxShadow: hasAnalysis
                        ? `0 10px 30px -12px ${tier.accent}30, 0 2px 8px rgba(0,0,0,0.08)`
                        : "0 1px 3px rgba(0,0,0,0.05)",
                    }}
                  >
                    {/* Top accent */}
                    {hasAnalysis && (
                      <div
                        className="absolute top-0 left-0 right-0 h-1"
                        style={{ background: `linear-gradient(90deg, transparent, ${tier.accent}, transparent)` }}
                      />
                    )}

                    <div className="p-4 flex flex-col flex-1">
                      {/* Top: checkbox + kategoriya + status */}
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        {!noConv && canAnalyze(audio) ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(audio.id)}
                            onChange={() => toggleSelect(audio.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded accent-accent cursor-pointer shrink-0"
                          />
                        ) : <div className="w-4 shrink-0" />}
                        {/* Kategoriya badge */}
                        {catBadge && (
                          <span
                            className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0"
                            style={{
                              backgroundColor: `${catBadge.color}1f`,
                              color: catBadge.color,
                              border: `1px solid ${catBadge.color}40`,
                            }}
                          >
                            {catBadge.label}
                          </span>
                        )}
                        <div className={catBadge ? "" : "ml-auto"}>
                          {statusBadge(audio.status, audio.analysis)}
                        </div>
                      </div>

                      {/* 🚩 Manager haq/noxaq verdict badge */}
                      {rejectionReason && audio.analysis?.rejectionInfo?.managerVerdict && (() => {
                        const v = verdictStyle(audio.analysis.rejectionInfo.managerVerdict.status);
                        return (
                          <div className="mb-3 flex items-center gap-2 flex-wrap">
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={{ color: v.color, backgroundColor: v.bg, border: `1px solid ${v.border}` }}
                            >
                              <Flag size={11} /> {v.label}
                            </span>
                            {audio.analysis.rejectionInfo.label && (
                              <span className="text-[11px] text-secondary truncate" title={audio.analysis.rejectionInfo.short || ""}>
                                {audio.analysis.rejectionInfo.label}
                              </span>
                            )}
                          </div>
                        );
                      })()}

                      {/* Header: score + manager info */}
                      <div className="flex items-start gap-3 mb-3">
                        {/* Score badge */}
                        {hasAnalysis ? (
                          <div
                            className="flex flex-col items-center justify-center rounded-xl px-3 py-2 shrink-0"
                            style={{
                              backgroundColor: tier.bg,
                              border: `1px solid ${tier.accent}40`,
                              minWidth: 64,
                            }}
                          >
                            <span className="text-2xl font-black leading-none" style={{ color: tier.accent }}>
                              {score}
                            </span>
                            <span className="text-[9px] uppercase font-bold tracking-wider mt-1" style={{ color: tier.accent }}>
                              {tier.label}
                            </span>
                          </div>
                        ) : (
                          <div
                            className="flex flex-col items-center justify-center rounded-xl shrink-0 text-secondary"
                            style={{
                              backgroundColor: "rgba(156,163,175,0.08)",
                              border: "1px dashed rgba(156,163,175,0.25)",
                              width: 64, height: 52,
                            }}
                          >
                            <span className="text-xl leading-none">—</span>
                            <span className="text-[9px] uppercase tracking-wider mt-1">ball</span>
                          </div>
                        )}

                        {/* Manager + phone */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <User size={12} style={{ color: "var(--text-secondary)" }} />
                            <span
                              className="text-sm font-semibold truncate cursor-pointer hover:text-accent"
                              onClick={() => navigate(`/audio/${audio.id}`)}
                              style={{ color: "var(--text-primary)" }}
                            >
                              {audio.manager?.name || "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                            <Phone size={11} />
                            <span className="font-mono truncate">{audio.phoneNumber || "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            <Clock size={11} />
                            <span>{formatDuration(audio.duration)}</span>
                            <span className="mx-1">·</span>
                            <span>{formatDateTime(audio.callDate || audio.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Radar chart — agar tahlil bor va 3+ mezon bor bo'lsa */}
                      {hasAnalysis && radarData.length >= 3 ? (
                        <div
                          className="rounded-lg px-1 py-1.5 mb-3"
                          style={{
                            backgroundColor: `${tier.accent}06`,
                            border: `1px solid ${tier.accent}20`,
                          }}
                        >
                          <div className="h-36">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart data={radarData} margin={{ top: 4, right: 14, bottom: 4, left: 14 }}>
                                <PolarGrid stroke="var(--color-border)" />
                                <PolarAngleAxis
                                  dataKey="name"
                                  tick={{ fill: "var(--text-secondary)", fontSize: 9, fontWeight: 600 }}
                                />
                                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                  dataKey="score"
                                  stroke={tier.accent}
                                  fill={tier.accent}
                                  fillOpacity={0.3}
                                  strokeWidth={1.5}
                                />
                                <ReTooltip
                                  content={({ active, payload }) => {
                                    if (!active || !payload || payload.length === 0) return null;
                                    const p = payload[0] as { payload: { fullName: string; score: number } };
                                    return (
                                      <div className="px-2 py-1 rounded-lg text-xs font-semibold shadow-lg" style={{ backgroundColor: "rgba(0,0,0,0.85)", color: "#fff" }}>
                                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>{p.payload.fullName}</div>
                                        <div>{p.payload.score} ball</div>
                                      </div>
                                    );
                                  }}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="rounded-lg flex flex-col items-center justify-center mb-3 py-8 text-center"
                          style={{
                            backgroundColor: "rgba(156,163,175,0.05)",
                            border: "1px dashed rgba(156,163,175,0.22)",
                            minHeight: 144,
                          }}
                        >
                          <div
                            className="w-12 h-12 rounded-full flex items-center justify-center mb-2"
                            style={{
                              backgroundColor: "rgba(156,163,175,0.12)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <Search size={20} strokeWidth={2} />
                          </div>
                          <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                            Tahlil qilinmagan
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                            {canAnalyze(audio) ? "\"Tahlil\" tugmasini bosing" : "Jarayon kutilmoqda"}
                          </p>
                        </div>
                      )}

                      {/* Bottom info: voronka + xatolar + sotuv */}
                      <div className="flex items-center justify-between gap-2 text-[11px] pt-2 mt-auto border-t border-border">
                        <span
                          className="px-2 py-0.5 rounded-md font-medium truncate"
                          style={{
                            backgroundColor: "rgba(139,92,246,0.1)",
                            color: "#8b5cf6",
                            maxWidth: "60%",
                          }}
                          title={audio.pipelineName || "—"}
                        >
                          {audio.pipelineName || "Yangi lid"}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {hasAnalysis && audio.analysis?.errors?.length ? (
                            <span className="text-red-400 font-medium">⚠ {audio.analysis.errors.length}</span>
                          ) : null}
                          {audio.isSale && (
                            <span className="text-emerald-500 font-semibold">✓ Sotuv</span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 mt-3">
                        {canAnalyze(audio) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmModal({ type: "analyze", ids: [audio.id], message: `"${audio.fileName}" tahlil qilinsinmi?` }); }}
                            className="flex-1 flex items-center justify-center gap-1 h-8 rounded-lg text-xs font-semibold transition-colors"
                            style={{
                              backgroundColor: "rgba(59,94,245,0.1)",
                              color: "var(--color-accent, #3b5ef5)",
                              border: "1px solid rgba(59,94,245,0.25)",
                            }}
                          >
                            <Play size={12} strokeWidth={2.5} />
                            Tahlil
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/audio/${audio.id}`)}
                          className="flex-1 flex items-center justify-center gap-1 h-8 rounded-lg text-xs font-semibold transition-colors"
                          style={{
                            backgroundColor: "transparent",
                            color: "var(--text-primary)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          <Eye size={12} strokeWidth={2.5} />
                          Ko'rish
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmModal({ type: "delete", ids: [audio.id], message: `"${audio.fileName}" o'chirilsinmi?` }); }}
                          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:brightness-110"
                          style={{
                            backgroundColor: "rgba(239,68,68,0.1)",
                            color: "#dc2626",
                            border: "1px solid rgba(239,68,68,0.25)",
                          }}
                          title="O'chirish"
                        >
                          <Trash2 size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!data?.data || data.data.length === 0) && (
                <div className="col-span-full py-12 text-center text-secondary">
                  Audio fayllar topilmadi
                </div>
              )}
            </div>
            )}

            {/* Pagination */}
            {total > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4 pt-4 border-t border-border">
                <span className="text-xs sm:text-sm text-secondary">
                  {startItem}–{endItem} / {total}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1.5 text-secondary hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {getPageNumbers().map((pn, idx) =>
                      typeof pn === "string" ? (
                        <span key={`e-${idx}`} className="px-1 text-secondary text-xs">…</span>
                      ) : (
                        <button key={pn} onClick={() => setPage(pn)}
                          className={`min-w-[28px] h-7 px-1.5 text-xs rounded-lg transition-colors ${
                            page === pn ? "bg-accent font-medium" : "text-secondary hover:text-white hover:bg-white/5"
                          }`}
                          style={page === pn ? { color: "#ffffff" } : undefined}
                        >{pn}</button>
                      )
                    )}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1.5 text-secondary hover:text-white hover:bg-white/5 rounded-lg disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Card>

      {/* AmoCRM Sync Modal */}
      <Modal isOpen={showSyncModal} onClose={closeSyncModal} title="AmoCRM Sinhronlash" size="sm">
        {syncResult ? (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-4xl font-bold text-accent mb-2">{syncResult.synced}</div>
              <p className="text-white text-sm">{syncResult.synced} ta yangi audio yuklandi</p>
              {syncResult.errors > 0 && (
                <p className="text-red-400 text-xs mt-1">{syncResult.errors} ta xatolik</p>
              )}
              <p className="text-secondary text-xs mt-1">Jami topilgan: {syncResult.total}</p>
            </div>
            <button
              onClick={closeSyncModal}
              className="w-full py-2.5 bg-accent text-sm font-medium rounded-lg hover:bg-accent/80 transition-colors" style={{ color: "#ffffff" }}
            >
              Yopish
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Radio options */}
            <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-white/[0.02] transition-colors">
              <input
                type="radio"
                name="syncMode"
                checked={syncMode === "today"}
                onChange={() => setSyncMode("today")}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-white text-sm">Bugungi qo'ng'iroqlarni sinhronlash</span>
            </label>
            <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-white/[0.02] transition-colors">
              <input
                type="radio"
                name="syncMode"
                checked={syncMode === "range"}
                onChange={() => setSyncMode("range")}
                className="w-4 h-4 accent-accent"
              />
              <span className="text-white text-sm">Sanalar oralig'ida sinhronlash</span>
            </label>

            {syncMode === "range" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Dan</label>
                  <input
                    type="date"
                    value={syncDateFrom}
                    onChange={(e) => setSyncDateFrom(e.target.value)}
                    className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-secondary mb-1.5">Gacha</label>
                  <input
                    type="date"
                    value={syncDateTo}
                    onChange={(e) => setSyncDateTo(e.target.value)}
                    className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-white text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>
              </div>
            )}

            {/* Progress — syncing davomida */}
            {isSyncing && (
              <div className="bg-primary border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin text-accent" />
                  <span className="text-sm" style={{ color: "var(--text-primary, #fff)" }}>Sinhronlanmoqda...</span>
                </div>
                <div className="flex justify-between text-xs text-secondary">
                  <span>Sahifa: {syncLive?.page || 0}</span>
                  <span>Yuklandi: {syncLive?.synced || 0} ta</span>
                  <span>Topildi: {syncLive?.total || 0} ta</span>
                </div>
                <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: syncLive && syncLive.total > 0 ? `${Math.round((syncLive.synced / syncLive.total) * 100)}%` : "5%" }}
                  />
                </div>
                <p className="text-xs text-secondary text-center">
                  {syncLive && syncLive.total > 0
                    ? `${Math.round((syncLive.synced / syncLive.total) * 100)}% bajarildi`
                    : "Qo'ng'iroqlar qidirilmoqda..."}
                </p>
              </div>
            )}

            {!isSyncing && (
              <button
                onClick={handleSync}
                className="w-full py-2.5 bg-accent text-sm font-medium rounded-lg hover:bg-accent/80 transition-colors flex items-center justify-center gap-2"
                style={{ color: "#ffffff" }}
              >
                Sinhronlash
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* Confirm Modal */}
      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title={confirmModal?.type === "stop-analysis" ? "Tahlilni to'xtatish" : confirmModal?.type?.includes("delete") ? "O'chirishni tasdiqlash" : "Tahlilni tasdiqlash"}
        size="sm"
      >
        <p className="text-secondary mb-6">{confirmModal?.message}</p>
        <div className="flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmModal(null)}>
            Bekor qilish
          </Button>
          <Button
            variant={confirmModal?.type?.includes("delete") || confirmModal?.type === "stop-analysis" ? "danger" : "primary"}
            onClick={() => {
              if (!confirmModal) return;
              if (confirmModal.type === "stop-analysis") {
                audioService.stopAnalysis().then(() => {
                  setIsAnalyzing(false);
                  setAnalyzeProgress(null);
                  if (analyzePollRef.current) { clearInterval(analyzePollRef.current); analyzePollRef.current = null; }
                  toast.success("Tahlil to'xtatildi");
                  refetch();
                }).catch(() => toast.error("To'xtatishda xatolik"));
              } else if (confirmModal.type === "delete") {
                confirmModal.ids.forEach((id) => deleteMutation.mutate(id));
              } else if (confirmModal.type === "bulk-delete") {
                confirmModal.ids.forEach((id) => deleteMutation.mutate(id));
                setSelectedIds(new Set());
              } else if (confirmModal.type === "analyze") {
                confirmModal.ids.forEach((id) => analyzeMutation.mutate(id));
              } else if (confirmModal.type === "bulk-analyze") {
                if (confirmModal.ids.length === 0) {
                  // Barchasini tahlil — backfill (aktiv menejerlar + CRM synced + pending)
                  // Avval joriy done sanini olamiz (faqat yangi batch progress ko'rsatish uchun)
                  audioService.getProgress().catch(() => null).then((initP) => {
                    const startDone = initP ? initP.done : 0;
                    const batchTotal = initP ? initP.pending + initP.processing + initP.error : 0;

                    setIsAnalyzing(true);
                    setAnalyzeProgress({ total: batchTotal, done: 0, pending: batchTotal, percent: 0 });
                    analyzeStartRef.current = Date.now();
                    analyzeStartDoneRef.current = startDone;
                    setAnalyzeEta("");
                    audioService.backfill().catch(() => {});

                    analyzePollRef.current = setInterval(async () => {
                      try {
                        const p = await audioService.getProgress();
                        const batchDone = p.done - analyzeStartDoneRef.current;
                        const stillPending = p.pending + p.processing;
                        const bt = batchDone + stillPending + p.error;
                        const pct = bt > 0 ? Math.round((batchDone / bt) * 100) : 100;
                        setAnalyzeProgress({ total: bt, done: batchDone, pending: stillPending, percent: pct });

                        // ETA
                        setAnalyzeEta(calcEta(p.done, stillPending));

                        if (p.pending === 0 && p.processing === 0) {
                          clearInterval(analyzePollRef.current!);
                          analyzePollRef.current = null;
                          setIsAnalyzing(false);
                          setAnalyzeEta("");
                          toast.success(`${batchDone} ta audio tahlil qilindi`);
                          refetch();
                        }
                      } catch { /* ignore */ }
                    }, 3000);
                  });
                } else {
                  // Tanlangan fayllarni tahlil
                  bulkMutation.mutate(confirmModal.ids);
                  setSelectedIds(new Set());
                }
              }
              setConfirmModal(null);
            }}
          >
            {confirmModal?.type === "stop-analysis" ? "Ha, to'xtatish" : confirmModal?.type?.includes("delete") ? "Ha, o'chirish" : "Ha, tahlil qilish"}
          </Button>
        </div>
      </Modal>

      {/* ── Filter modal — markazlashtirilgan ───────────────── */}
      {showFilter && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", marginTop: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFilter(false);
          }}
        >
          <div
            className="rounded-2xl shadow-2xl border overflow-hidden w-full flex flex-col"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
              maxWidth: 720,
              maxHeight: "85vh",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2">
                <Filter size={18} style={{ color: "#8b5cf6" }} />
                <h3
                  className="text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Filtrlar
                </h3>
                {activeFilterCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center text-[11px] font-bold rounded-full px-2 py-0.5"
                    style={{
                      backgroundColor: "rgba(139,92,246,0.15)",
                      color: "#8b5cf6",
                    }}
                  >
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowFilter(false)}
                className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Body — 2 ustunli: sidebar tabs + kontent */}
            <div className="flex flex-1 overflow-hidden" style={{ minHeight: 360 }}>
              {/* Sidebar tabs */}
              <div
                className="w-44 shrink-0 border-r p-2 space-y-1 overflow-y-auto"
                style={{ borderColor: "var(--color-border)" }}
              >
                {(
                  [
                    {
                      key: "status" as const,
                      label: "Holati",
                      icon: <CheckCircle size={14} />,
                      count: status ? 1 : 0,
                    },
                    {
                      key: "manager" as const,
                      label: "Menejer",
                      icon: <User size={14} />,
                      count: selectedManagerIds.length,
                    },
                    {
                      key: "category" as const,
                      label: "Kategoriya",
                      icon: <Tag size={14} />,
                      count: category ? 1 : 0,
                    },
                    {
                      key: "period" as const,
                      label: "Davr",
                      icon: <CalendarIcon size={14} />,
                      count: period !== "all" ? 1 : 0,
                    },
                    {
                      key: "pipeline" as const,
                      label: "Voronka",
                      icon: <GitBranch size={14} />,
                      count: pipeline ? 1 : 0,
                    },
                    {
                      key: "response" as const,
                      label: "Javob vaqti",
                      icon: <Timer size={14} />,
                      count: responseFilter ? 1 : 0,
                    },
                    {
                      key: "duration" as const,
                      label: "Davomiylik",
                      icon: <Clock size={14} />,
                      count: durationMin ? 1 : 0,
                    },
                  ]
                ).map((tab) => {
                  const active = filterTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setFilterTab(tab.key)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                      style={{
                        backgroundColor: active
                          ? "rgba(139,92,246,0.15)"
                          : "transparent",
                        color: active ? "#8b5cf6" : "var(--text-secondary)",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        {tab.icon}
                        {tab.label}
                      </span>
                      {tab.count > 0 && (
                        <span
                          className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5"
                          style={{
                            backgroundColor: active
                              ? "#8b5cf6"
                              : "rgba(139,92,246,0.2)",
                            color: active ? "#fff" : "#8b5cf6",
                            minWidth: 18,
                            height: 16,
                          }}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {filterTab === "status" && (
                  <div className="space-y-2">
                    <h4
                      className="text-sm font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Tahlil holati
                    </h4>
                    {[
                      { value: "", label: "Barchasi" },
                      { value: "done", label: "Tahlil tugallangan" },
                      { value: "incomplete", label: "Tahlil to'liq emas" },
                      { value: "pending", label: "Kutilmoqda" },
                      { value: "processing", label: "Tahlil qilinmoqda" },
                      { value: "no_conversation", label: "Suhbat yo'q" },
                      { value: "disconnected", label: "Aloqa uzildi" },
                      { value: "transferred", label: "O'tkazildi" },
                      { value: "error", label: "Xatolik" },
                    ].map((opt) => {
                      const active = status === opt.value;
                      return (
                        <button
                          key={opt.value || "all"}
                          onClick={() => {
                            setStatus(opt.value);
                            setPage(1);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <span
                            className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center"
                            style={{
                              borderColor: active
                                ? "#8b5cf6"
                                : "var(--color-border)",
                            }}
                          >
                            {active && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "#8b5cf6" }}
                              />
                            )}
                          </span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {filterTab === "manager" && (
                  <div>
                    <h4
                      className="text-sm font-semibold mb-2 px-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Menejer
                    </h4>
                    <ManagerDeptFilter
                      selectedManagerIds={selectedManagerIds}
                      onChange={setSelectedManagerIds}
                      accentColor="#8b5cf6"
                      maxHeight={380}
                      fallbackManagers={(managers ?? [])
                        .filter((m: any) => m.isActive)
                        .map((m: any) => ({ id: m.id, name: m.name }))}
                    />
                  </div>
                )}

                {filterTab === "category" && (
                  <div className="space-y-2">
                    <h4
                      className="text-sm font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Kategoriya
                    </h4>
                    {[
                      { value: "", label: "Barchasi" },
                      { value: "sotuv", label: "1-Qo'ng'iroq" },
                      { value: "qayta", label: "Qayta qo'ng'iroq" },
                      { value: "boshqa", label: "Boshqa" },
                    ].map((opt) => {
                      const active = category === opt.value;
                      return (
                        <button
                          key={opt.value || "all"}
                          onClick={() => {
                            setCategory(opt.value);
                            setPage(1);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <span
                            className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center"
                            style={{
                              borderColor: active
                                ? "#8b5cf6"
                                : "var(--color-border)",
                            }}
                          >
                            {active && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "#8b5cf6" }}
                              />
                            )}
                          </span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {filterTab === "period" && (
                  <div className="space-y-3">
                    <h4
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Davr
                    </h4>
                    <div className="space-y-2">
                      {[
                        { value: "all", label: "Barchasi" },
                        { value: "today", label: "Bugun" },
                        { value: "yesterday", label: "Kecha" },
                        { value: "week", label: "Bu hafta" },
                        { value: "month", label: "Bu oy" },
                        { value: "quarter", label: "Bu chorak" },
                        { value: "year", label: "Bu yil" },
                        { value: "custom", label: "Boshqa (oraliq)" },
                      ].map((opt) => {
                        const active = period === opt.value;
                        return (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setPeriod(opt.value);
                              setPage(1);
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span
                              className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center"
                              style={{
                                borderColor: active
                                  ? "#8b5cf6"
                                  : "var(--color-border)",
                              }}
                            >
                              {active && (
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: "#8b5cf6" }}
                                />
                              )}
                            </span>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {period === "custom" && (
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div>
                          <label
                            className="block text-xs mb-1.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Dan
                          </label>
                          <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => {
                              setDateFrom(e.target.value);
                              setPage(1);
                            }}
                            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                            style={{
                              backgroundColor: "var(--color-bg)",
                              borderColor: "var(--color-border)",
                              color: "var(--text-primary)",
                            }}
                          />
                        </div>
                        <div>
                          <label
                            className="block text-xs mb-1.5"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Gacha
                          </label>
                          <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => {
                              setDateTo(e.target.value);
                              setPage(1);
                            }}
                            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                            style={{
                              backgroundColor: "var(--color-bg)",
                              borderColor: "var(--color-border)",
                              color: "var(--text-primary)",
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {filterTab === "pipeline" && (
                  <div className="space-y-2">
                    <h4
                      className="text-sm font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Voronka
                    </h4>
                    {[
                      { value: "", label: "Barchasi" },
                      { value: "Yangi lid", label: "Yangi lid" },
                      ...((pipelines || []).map((p) => ({
                        value: p.name,
                        label: p.name,
                      }))),
                    ].map((opt) => {
                      const active = pipeline === opt.value;
                      return (
                        <button
                          key={opt.value || "all"}
                          onClick={() => {
                            setPipeline(opt.value);
                            setPage(1);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <span
                            className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center"
                            style={{
                              borderColor: active
                                ? "#8b5cf6"
                                : "var(--color-border)",
                            }}
                          >
                            {active && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "#8b5cf6" }}
                              />
                            )}
                          </span>
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {filterTab === "response" && (
                  <div className="space-y-2">
                    <h4
                      className="text-sm font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Javob vaqti
                    </h4>
                    {[
                      { value: "", label: "Barchasi", color: undefined },
                      { value: "fast", label: "Vaqtida (≤1 soat)", color: "#2fcc6e" },
                      { value: "good", label: "Yaxshi (1-4 soat)", color: "#e6a020" },
                      { value: "slow", label: "Kech (>4 soat)", color: "#e64545" },
                      { value: "none", label: "Aloqa yo'q", color: "#7c7c9a" },
                    ].map((opt) => {
                      const active = responseFilter === opt.value;
                      return (
                        <button
                          key={opt.value || "all"}
                          onClick={() => {
                            setResponseFilter(opt.value);
                            setPage(1);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                          style={{ color: opt.color || "var(--text-primary)" }}
                        >
                          <span
                            className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center"
                            style={{
                              borderColor: active
                                ? "#8b5cf6"
                                : "var(--color-border)",
                            }}
                          >
                            {active && (
                              <span
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: "#8b5cf6" }}
                              />
                            )}
                          </span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {filterTab === "duration" && (
                  <div className="space-y-4">
                    <div>
                      <h4
                        className="text-sm font-semibold mb-1"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Minimum davomiylik
                      </h4>
                      <p className="text-xs text-secondary mb-3">
                        mm:ss formatida kiriting — shu vaqtdan uzun auditlar ko'rsatiladi
                      </p>
                      <div className="relative">
                        <input
                          type="text"
                          value={durationMin}
                          onChange={(e) => {
                            // Faqat raqam va ikki nuqta qabul qilish
                            const val = e.target.value.replace(/[^0-9:]/g, "");
                            setDurationMin(val);
                            setPage(1);
                          }}
                          placeholder="03:00"
                          maxLength={5}
                          className="w-full px-3 py-2.5 rounded-xl text-sm font-mono"
                          style={{
                            backgroundColor: "var(--color-primary)",
                            border: `1px solid ${durationMin && durationMinSec > 0 ? "#8b5cf6" : "var(--color-border)"}`,
                            color: "var(--text-primary)",
                          }}
                        />
                        {durationMin && (
                          <button
                            onClick={() => { setDurationMin(""); setPage(1); }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-secondary hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      {durationMin && durationMinSec > 0 && (
                        <p className="text-xs mt-1.5" style={{ color: "#8b5cf6" }}>
                          ≥ {durationMinSec} soniya ({durationMin}) dan uzun
                        </p>
                      )}
                    </div>

                    {/* Tez tanlash */}
                    <div className="space-y-1.5">
                      <p className="text-xs text-secondary px-1">Tez tanlash</p>
                      {[
                        { label: "1 daqiqa+", value: "01:00" },
                        { label: "2 daqiqa+", value: "02:00" },
                        { label: "3 daqiqa+", value: "03:00" },
                        { label: "5 daqiqa+", value: "05:00" },
                        { label: "10 daqiqa+", value: "10:00" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => { setDurationMin(opt.value); setPage(1); }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors hover:bg-white/5"
                          style={{
                            color: durationMin === opt.value ? "#8b5cf6" : "var(--text-primary)",
                            backgroundColor: durationMin === opt.value ? "rgba(139,92,246,0.08)" : "transparent",
                          }}
                        >
                          <span
                            className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center"
                            style={{ borderColor: durationMin === opt.value ? "#8b5cf6" : "var(--color-border)" }}
                          >
                            {durationMin === opt.value && (
                              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#8b5cf6" }} />
                            )}
                          </span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between gap-3 px-5 py-3 border-t"
              style={{ borderColor: "var(--color-border)" }}
            >
              <button
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
                className="text-sm font-medium disabled:opacity-40"
                style={{ color: "var(--text-secondary)" }}
              >
                Tozalash
              </button>
              <button
                onClick={() => setShowFilter(false)}
                className="px-5 py-2 rounded-lg text-sm font-semibold"
                style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
              >
                Qo'llash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AudioFilesPage;
