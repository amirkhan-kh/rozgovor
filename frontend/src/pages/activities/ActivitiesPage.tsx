import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  CheckSquare,
  Square,
  Phone,
  Calendar as CalendarIcon,
  Mail,
  Clipboard,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  GitBranch,
  User,
  Tag,
  Search,
  Clock,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import toast from "react-hot-toast";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";
import ManagerDeptFilterTrigger from "../../components/filters/ManagerDeptFilterTrigger";
import { salesService } from "../../services/sales.service";
import { managersService } from "../../services/managers.service";
import {
  activitiesService,
  ActivityItem,
} from "../../services/activities.service";
import { WS_BASE_URL } from "../../services/apiBase";
import { useAuth } from "../../store/authStore";

const ACCENT = "#f59e0b";

// ── Helpers ─────────────────────────────────────────────
const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const UZ_MONTHS_SHORT = [
  "yan", "fev", "mar", "apr", "may", "iyn",
  "iyl", "avg", "sen", "okt", "noy", "dek",
];
const formatUzDate = (d: Date): string =>
  `${d.getDate()} ${UZ_MONTHS_SHORT[d.getMonth()]}`;

const formatDeadline = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
  if (sameDay) return `Bugun ${hm}`;
  return `${formatUzDate(d)} ${hm}`;
};

// Bitrix typeId → icon + label
// 1 = Meeting, 2 = Call, 3 = Task, 4 = Email, 5 = Other
const typeInfo = (t: number | null): { label: string; icon: React.ReactNode; color: string } => {
  switch (t) {
    case 1:
      return { label: "Uchrashuv", icon: <CalendarIcon size={14} />, color: "#06b6d4" };
    case 2:
      return { label: "Qo'ng'iroq", icon: <Phone size={14} />, color: "#22c55e" };
    case 3:
      return { label: "Topshiriq", icon: <Clipboard size={14} />, color: "#f59e0b" };
    case 4:
      return { label: "Email", icon: <Mail size={14} />, color: "#8b5cf6" };
    default:
      return { label: "Boshqa", icon: <Clock size={14} />, color: "#6b7280" };
  }
};

// ── Period ──────────────────────────────────────────────
type PeriodKey = "today" | "week" | "month" | "all" | "custom";

const periodToDates = (
  p: PeriodKey,
  customRange?: DateRange
): { dateFrom?: string; dateTo?: string } => {
  const now = new Date();
  if (p === "all") return {};
  if (p === "today") {
    return { dateFrom: toLocalDateStr(now), dateTo: toLocalDateStr(now) };
  }
  if (p === "week") {
    const first = new Date(now);
    first.setDate(now.getDate() - 6);
    return { dateFrom: toLocalDateStr(first), dateTo: toLocalDateStr(now) };
  }
  if (p === "month") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    return { dateFrom: toLocalDateStr(first), dateTo: toLocalDateStr(now) };
  }
  if (p === "custom" && customRange?.from && customRange?.to) {
    return {
      dateFrom: toLocalDateStr(customRange.from),
      dateTo: toLocalDateStr(customRange.to),
    };
  }
  return {};
};

// ── WebSocket listener ──────────────────────────────────
const useActivityWS = (
  companyId: string | undefined,
  enabled: boolean,
  onUpdate: () => void
) => {
  const cbRef = useRef(onUpdate);
  cbRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !companyId) return;
    const token = localStorage.getItem("token") ?? "";
    const url = `${WS_BASE_URL}/ws?token=${token}`;
    let dead = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (dead) return;
      ws = new WebSocket(url);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.companyId !== companyId) return;
          if (msg.type === "activity:update") cbRef.current();
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (!dead) retry = setTimeout(connect, 5000);
      };
      ws.onerror = () => {};
    };
    connect();
    return () => {
      dead = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [companyId, enabled]);
};

// ── Page ────────────────────────────────────────────────
const PAGE_SIZE = 20;

const ActivitiesPage: React.FC = () => {
  const qc = useQueryClient();
  const { user, managerUser } = useAuth();
  const companyId =
    (user as { id?: string } | null)?.id ??
    managerUser?.companyId ??
    undefined;

  const [period, setPeriod] = useState<PeriodKey>("month");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedPipelines, setSelectedPipelines] = useState<number[]>([]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [completedFilter, setCompletedFilter] = useState<"all" | "open" | "done">(
    "all"
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<"pipeline" | "manager" | "source">(
    "manager"
  );
  const [filterSearch, setFilterSearch] = useState("");
  const [page, setPage] = useState(1);

  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Kalendar tashqi klik
  useEffect(() => {
    if (!calendarOpen) return;
    const h = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [calendarOpen]);

  // Filter modal body lock + ESC
  useEffect(() => {
    if (!filterOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [filterOpen]);

  useEffect(() => {
    setFilterSearch("");
  }, [filterTab]);

  // Sources + pipelines
  const { data: pipelines } = useQuery({
    queryKey: ["sales-pipelines"],
    queryFn: () => salesService.getPipelines(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: sources } = useQuery({
    queryKey: ["sales-sources"],
    queryFn: () => salesService.getSources(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  // Filter params
  const dateParts = periodToDates(period, range);
  const baseParams = {
    ...(dateParts.dateFrom ? { dateFrom: dateParts.dateFrom } : {}),
    ...(dateParts.dateTo ? { dateTo: dateParts.dateTo } : {}),
    ...(selectedPipelines.length > 0
      ? { pipelineIds: selectedPipelines.join(",") }
      : {}),
    ...(selectedManagers.length > 0
      ? { managerIds: selectedManagers.join(",") }
      : {}),
    ...(selectedSources.length > 0 ? { sourceIds: selectedSources.join(",") } : {}),
    ...(completedFilter === "done" ? { completed: "true" as const } : {}),
    ...(completedFilter === "open" ? { completed: "false" as const } : {}),
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["activities", baseParams],
    queryFn: () => activitiesService.getAll(baseParams),
    enabled: period !== "custom" || !!(range?.from && range?.to),
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: (days: number) => activitiesService.sync(days),
    onSuccess: (res) => {
      toast.success(
        `Sinxron tugadi: ${res.upserted} zadacha (${res.windowDays} kun)`
      );
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: () => toast.error("Sinxronda xatolik"),
  });

  // WebSocket → refetch
  useActivityWS(companyId, true, () => {
    refetch();
  });

  // Activities + pagination
  const activities: ActivityItem[] = data?.activities ?? [];
  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const pageActivities = useMemo(
    () => activities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [activities, page]
  );
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const totalFiltersApplied =
    selectedPipelines.length +
    selectedManagers.length +
    selectedSources.length +
    (completedFilter !== "all" ? 1 : 0);

  const togglePipeline = (id: number) =>
    setSelectedPipelines((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const toggleSource = (id: string) =>
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const formatRangeLabel = (): string => {
    if (!range?.from) return "Sana tanlang";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };
  const applyRange = () => {
    if (range?.from && range?.to) {
      setPeriod("custom");
      setCalendarOpen(false);
      setPage(1);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Zadachalar
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Bitrix24'dagi topshiriq, qo'ng'iroq va uchrashuvlar
          </p>
        </div>
        <button
          onClick={() => syncMutation.mutate(7)}
          disabled={syncMutation.isPending}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
            color: "var(--text-primary)",
          }}
        >
          <RefreshCw
            size={14}
            className={syncMutation.isPending ? "animate-spin" : ""}
          />
          {syncMutation.isPending ? "Sinxron..." : "Sinxronizatsiya (7 kun)"}
        </button>
      </div>

      {/* Filter bar */}
      <div
        className="flex flex-wrap items-center gap-2 p-3 rounded-xl border"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Period tabs */}
        <div
          className="inline-flex rounded-lg p-0.5 border"
          style={{ borderColor: "var(--color-border)" }}
        >
          {(
            [
              { k: "month", l: "Bu oy" },
              { k: "week", l: "Bu hafta" },
              { k: "today", l: "Bugun" },
              { k: "all", l: "Barchasi" },
            ] as { k: PeriodKey; l: string }[]
          ).map((opt) => {
            const active = period === opt.k;
            return (
              <button
                key={opt.k}
                onClick={() => {
                  setPeriod(opt.k);
                  setPage(1);
                }}
                className="h-8 px-3 rounded-md text-xs font-medium transition-all"
                style={{
                  backgroundColor: active ? `${ACCENT}20` : "transparent",
                  color: active ? ACCENT : "var(--text-secondary)",
                }}
              >
                {opt.l}
              </button>
            );
          })}
        </div>

        {/* Custom range */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setCalendarOpen((p) => !p)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor:
                period === "custom" ? ACCENT : "var(--color-border)",
              color: "var(--text-primary)",
            }}
          >
            <CalendarIcon size={14} />
            {period === "custom" ? formatRangeLabel() : "Oraliq"}
          </button>
          {calendarOpen && (
            <div
              className="absolute z-50 mt-1 right-0 p-2 rounded-xl border shadow-xl"
              style={{
                backgroundColor: "var(--color-card-bg)",
                borderColor: "var(--color-border)",
              }}
            >
              <DayPicker
                mode="range"
                locale={uz}
                selected={range}
                onSelect={setRange}
                weekStartsOn={1}
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => {
                    setRange(undefined);
                    if (period === "custom") setPeriod("month");
                    setCalendarOpen(false);
                  }}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Bekor
                </button>
                <button
                  onClick={applyRange}
                  disabled={!range?.from || !range?.to}
                  className="text-xs px-3 py-1 rounded-md font-medium disabled:opacity-50"
                  style={{ backgroundColor: ACCENT, color: "#fff" }}
                >
                  Qo'llash
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Manager filter — dropdown */}
        <ManagerDeptFilterTrigger
          selected={selectedManagers}
          onChange={(ids) => {
            setSelectedManagers(ids);
            setPage(1);
          }}
          accentColor={ACCENT}
          fallbackManagers={(managers ?? []).map((m) => ({
            id: m.id,
            name: m.name,
          }))}
        />

        {/* Completed toggle */}
        <div
          className="inline-flex rounded-lg p-0.5 border"
          style={{ borderColor: "var(--color-border)" }}
        >
          {(
            [
              { k: "all", l: "Barchasi" },
              { k: "open", l: "Ochiq" },
              { k: "done", l: "Bajarilgan" },
            ] as { k: "all" | "open" | "done"; l: string }[]
          ).map((opt) => {
            const active = completedFilter === opt.k;
            return (
              <button
                key={opt.k}
                onClick={() => {
                  setCompletedFilter(opt.k);
                  setPage(1);
                }}
                className="h-8 px-3 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: active ? `${ACCENT}20` : "transparent",
                  color: active ? ACCENT : "var(--text-secondary)",
                }}
              >
                {opt.l}
              </button>
            );
          })}
        </div>

        {/* More filters (pipeline + source) — modal */}
        <button
          onClick={() => setFilterOpen(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium relative"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor:
              selectedPipelines.length + selectedSources.length > 0
                ? ACCENT
                : "var(--color-border)",
            color: "var(--text-primary)",
          }}
        >
          <Filter size={13} />
          Qo'shimcha
          {selectedPipelines.length + selectedSources.length > 0 && (
            <span
              className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-4"
              style={{ backgroundColor: ACCENT, color: "#fff" }}
            >
              {selectedPipelines.length + selectedSources.length}
            </span>
          )}
        </button>

        {totalFiltersApplied > 0 && (
          <button
            onClick={() => {
              setSelectedPipelines([]);
              setSelectedManagers([]);
              setSelectedSources([]);
              setCompletedFilter("all");
              setPage(1);
            }}
            className="inline-flex items-center gap-1 h-9 px-2 text-xs font-medium"
            style={{ color: ACCENT }}
          >
            <X size={13} />
            Filtrlarni tozalash
          </button>
        )}
      </div>

      {/* List */}
      <Card>
        <div
          className="px-4 py-3 flex items-center justify-between border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Zadachalar ro'yxati
            </h2>
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {activities.length} ta
            </span>
          </div>
          {isLoading && (
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Yuklanmoqda...
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div
            className="py-16 text-center text-sm"
            style={{ color: "var(--text-secondary)" }}
          >
            Hech narsa topilmadi
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {pageActivities.map((a) => {
              const info = typeInfo(a.typeId);
              const overdue =
                !a.completed &&
                a.deadline &&
                new Date(a.deadline).getTime() < Date.now();
              return (
                <div
                  key={a.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {a.completed ? (
                      <CheckSquare
                        size={18}
                        style={{ color: "#22c55e" }}
                      />
                    ) : (
                      <Square
                        size={18}
                        style={{ color: "var(--text-secondary)" }}
                      />
                    )}
                  </div>

                  {/* Type badge */}
                  <div
                    className="shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-md text-[11px] font-medium"
                    style={{
                      backgroundColor: `${info.color}20`,
                      color: info.color,
                    }}
                  >
                    {info.icon}
                    {info.label}
                  </div>

                  {/* Subject */}
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {a.subject || "(nomsiz)"}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px]">
                      <span style={{ color: "var(--text-secondary)" }}>
                        {a.manager?.name || "—"}
                      </span>
                      {a.dealId && (
                        <span
                          className="inline-flex items-center gap-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <Tag size={11} />
                          Deal #{a.dealId}
                        </span>
                      )}
                      {a.leadId && (
                        <span
                          className="inline-flex items-center gap-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <Tag size={11} />
                          Lead #{a.leadId}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Deadline */}
                  <div
                    className="shrink-0 text-right text-xs"
                    style={{
                      color: overdue
                        ? "#ef4444"
                        : "var(--text-secondary)",
                      fontWeight: overdue ? 600 : 400,
                    }}
                  >
                    {formatDeadline(a.deadline)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {activities.length > PAGE_SIZE && (
          <div
            className="px-4 py-3 flex items-center justify-between border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <span
              className="text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Sahifa {page} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border disabled:opacity-40"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--text-primary)",
                }}
                aria-label="Oldingi"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border disabled:opacity-40"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--text-primary)",
                }}
                aria-label="Keyingi"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Filter modal (pipeline + source) ──────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setFilterOpen(false)}
          />
          <div
            className="relative w-full max-w-2xl rounded-2xl border shadow-2xl flex flex-col overflow-hidden"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
              maxHeight: "80vh",
            }}
          >
            <div
              className="px-4 py-3 flex items-center justify-between border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2">
                <Filter size={16} style={{ color: ACCENT }} />
                <h3
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Qo'shimcha filtrlar
                </h3>
              </div>
              <button
                onClick={() => setFilterOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5"
                style={{ color: "var(--text-secondary)" }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-1 overflow-hidden">
              <div
                className="w-44 shrink-0 border-r p-2 space-y-1"
                style={{ borderColor: "var(--color-border)" }}
              >
                {(
                  [
                    {
                      key: "manager" as const,
                      label: "Menejer",
                      icon: <User size={14} />,
                      count: selectedManagers.length,
                    },
                    {
                      key: "pipeline" as const,
                      label: "Voronka",
                      icon: <GitBranch size={14} />,
                      count: selectedPipelines.length,
                    },
                    {
                      key: "source" as const,
                      label: "Manba",
                      icon: <Tag size={14} />,
                      count: selectedSources.length,
                    },
                  ]
                ).map((tab) => {
                  const active = filterTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setFilterTab(tab.key)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                      style={{
                        backgroundColor: active ? `${ACCENT}20` : "transparent",
                        color: active ? ACCENT : "var(--text-secondary)",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        {tab.icon}
                        {tab.label}
                      </span>
                      {tab.count > 0 && (
                        <span
                          className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-4"
                          style={{
                            backgroundColor: active
                              ? ACCENT
                              : `${ACCENT}40`,
                            color: active ? "#fff" : ACCENT,
                          }}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                {filterTab !== "manager" && (
                  <div
                    className="px-4 py-3 border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div className="relative">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="Qidirish..."
                        className="w-full h-9 pl-9 pr-3 rounded-lg border text-sm focus:outline-none"
                        style={{
                          backgroundColor: "var(--color-bg)",
                          borderColor: "var(--color-border)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto py-1">
                  {filterTab === "manager" && (
                    <div className="p-2">
                      <ManagerDeptFilter
                        selectedManagerIds={selectedManagers}
                        onChange={(ids) => {
                          setSelectedManagers(ids);
                          setPage(1);
                        }}
                        accentColor={ACCENT}
                        maxHeight={380}
                        fallbackManagers={(managers ?? []).map((m) => ({
                          id: m.id,
                          name: m.name,
                        }))}
                      />
                    </div>
                  )}
                  {filterTab === "pipeline" &&
                    (pipelines ?? [])
                      .filter((p) =>
                        filterSearch.trim() === ""
                          ? true
                          : p.name
                              .toLowerCase()
                              .includes(filterSearch.trim().toLowerCase())
                      )
                      .map((p) => {
                        const active = selectedPipelines.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => togglePipeline(p.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                                style={{
                                  backgroundColor: active ? ACCENT : "transparent",
                                  borderColor: active
                                    ? ACCENT
                                    : "var(--color-border)",
                                }}
                              >
                                {active && (
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path
                                      d="M1 5L4 8L9 2"
                                      stroke="#fff"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className="truncate">{p.name}</span>
                            </span>
                            <span
                              className="text-xs shrink-0"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {p.dealCount}
                            </span>
                          </button>
                        );
                      })}
                  {filterTab === "source" &&
                    (sources ?? [])
                      .filter((s) =>
                        filterSearch.trim() === ""
                          ? true
                          : s.name
                              .toLowerCase()
                              .includes(filterSearch.trim().toLowerCase())
                      )
                      .map((s) => {
                        const active = selectedSources.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleSource(s.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-white/5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                                style={{
                                  backgroundColor: active ? ACCENT : "transparent",
                                  borderColor: active
                                    ? ACCENT
                                    : "var(--color-border)",
                                }}
                              >
                                {active && (
                                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path
                                      d="M1 5L4 8L9 2"
                                      stroke="#fff"
                                      strokeWidth="1.8"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className="truncate">{s.name}</span>
                            </span>
                            <span
                              className="text-xs shrink-0"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {s.leadCount}
                            </span>
                          </button>
                        );
                      })}
                </div>
              </div>
            </div>
            <div
              className="px-4 py-3 border-t flex justify-end gap-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              <button
                onClick={() => {
                  setSelectedPipelines([]);
                  setSelectedSources([]);
                }}
                className="h-9 px-3 rounded-lg border text-xs font-medium"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--text-secondary)",
                }}
              >
                Tozalash
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="h-9 px-4 rounded-lg text-xs font-semibold"
                style={{ backgroundColor: ACCENT, color: "#fff" }}
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

export default ActivitiesPage;
