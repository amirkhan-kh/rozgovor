import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Headphones,
  PhoneOutgoing,
  PhoneIncoming,
  PhoneCall,
  Repeat,
  Clock,
  Timer,
  BarChart3,
  AlertTriangle,
  MessageSquare,
  Calendar as CalendarIcon,
  X,
  Filter,
  PhoneOff,
  Search,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { auditService } from "../../services/audit.service";
import { dashboardService, DashboardFilters } from "../../services/dashboard.service";
import { salesService } from "../../services/sales.service";
import { managersService } from "../../services/managers.service";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";
import DurationBlock from "../dashboard/components/DurationBlock";
import SpeechRatioBlock from "../dashboard/components/SpeechRatioBlock";
import CriteriaTeamChart from "../dashboard/components/CriteriaTeamChart";
import CriteriaManagersTable from "../dashboard/components/CriteriaManagersTable";
import WinLossBlock from "../dashboard/components/WinLossBlock";
import ErrorsBlock from "../dashboard/components/ErrorsBlock";
import ObjectionsChart from "../dashboard/components/ObjectionsChart";

// ── Helpers ──────────────────────────────────────────────
const formatDuration = (sec: number): string => {
  if (!sec || sec < 0) return "0 son";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}s ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s} son`;
};

const formatHours = (h: number): string => {
  if (!h || h < 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${h.toFixed(1)} soat`;
  return `${Math.round(h / 24)} kun`;
};

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

// ── KPI Card ────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  accentColor: string;
  hint?: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  suffix,
  icon,
  accentColor,
  hint,
}) => (
  <div
    className="relative overflow-hidden rounded-2xl p-5 border"
    style={{
      backgroundColor: "var(--color-card-bg)",
      borderColor: "var(--color-border)",
    }}
  >
    <div
      className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-15 blur-2xl"
      style={{ background: accentColor }}
    />
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)", opacity: 0.75 }}
        >
          {label}
        </p>
        <div className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap">
          <span
            className="text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            {value}
          </span>
          {suffix && (
            <span
              className="text-xs font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {suffix}
            </span>
          )}
        </div>
        {hint && (
          <p
            className="text-xs mt-1.5"
            style={{ color: "var(--text-secondary)", opacity: 0.7 }}
          >
            {hint}
          </p>
        )}
      </div>
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
      >
        {icon}
      </div>
    </div>
  </div>
);

// ── Asosiy sahifa ───────────────────────────────────────
type FilterKey = "today" | "week" | "month" | "custom";
type FilterTab = "pipeline" | "manager" | "source" | "duration";

interface AuditPageProps {
  forceManagerIds?: string[];
  embedded?: boolean;
}

const AuditPage: React.FC<AuditPageProps> = ({ forceManagerIds, embedded }) => {
  const [filter, setFilter] = useState<FilterKey>("month");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("pipeline");
  const [selectedPipelines, setSelectedPipelines] = useState<number[]>([]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const effectiveManagers = forceManagerIds && forceManagerIds.length > 0 ? forceManagerIds : selectedManagers;
  const [filterSearch, setFilterSearch] = useState("");
  // Min davomiylik: "mm:ss" formatida input, lekin int sekundda saqlanadi
  const [minDurationMin, setMinDurationMin] = useState<string>("");
  const [minDurationSecInput, setMinDurationSecInput] = useState<string>("");
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);

  // Hisoblangan min duration (sekund)
  const minDurationSec = (() => {
    const m = parseInt(minDurationMin, 10);
    const s = parseInt(minDurationSecInput, 10);
    const total = (Number.isNaN(m) ? 0 : m) * 60 + (Number.isNaN(s) ? 0 : s);
    return total > 0 ? total : 0;
  })();

  // Tashqariga bosilganda kalendar yopiladi
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  // Filter popover tashqariga bosish
  useEffect(() => {
    if (!filterOpen) {
      setFilterSearch("");
      return;
    }
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  // Tab almashtirilganda search tozalanadi
  useEffect(() => {
    setFilterSearch("");
  }, [filterTab]);

  // Filter manbalari
  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });
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

  const togglePipeline = (id: number) =>
    setSelectedPipelines((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  const toggleSource = (id: string) =>
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const totalFiltersApplied =
    selectedPipelines.length +
    selectedManagers.length +
    selectedSources.length +
    (minDurationSec > 0 ? 1 : 0);

  const applyRange = () => {
    if (range?.from && range?.to) {
      setFilter("custom");
      setCalendarOpen(false);
    }
  };

  const formatRangeLabel = (): string => {
    if (!range?.from) return "Sana tanlang";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };

  // Query params
  const baseParams: {
    period: string;
    dateFrom?: string;
    dateTo?: string;
    managerId?: string;
    managerIds?: string;
    pipelines?: string;
    sourceIds?: string;
    minDurationSec?: number;
  } = {
    ...(filter === "custom" && range?.from && range?.to
      ? {
          period: "custom",
          dateFrom: toLocalDateStr(range.from),
          dateTo: toLocalDateStr(range.to),
        }
      : { period: filter }),
    ...(effectiveManagers.length === 1
      ? { managerId: effectiveManagers[0] }
      : effectiveManagers.length > 1
      ? { managerIds: effectiveManagers.join(",") }
      : {}),
    ...(selectedPipelines.length > 0
      ? {
          pipelines: selectedPipelines
            .map((id) => pipelines?.find((p) => p.id === id)?.name)
            .filter((n): n is string => !!n)
            .join(","),
        }
      : {}),
    ...(selectedSources.length > 0 ? { sourceIds: selectedSources.join(",") } : {}),
    ...(minDurationSec > 0 ? { minDurationSec } : {}),
  };

  // Audit KPI
  const { data: audit, isLoading: auditLoading } = useQuery({
    queryKey: ["audit-overview", baseParams],
    queryFn: () => auditService.getOverview(baseParams),
    enabled: filter !== "custom" || !!(range?.from && range?.to),
  });

  // Dashboard chartlari uchun filters
  const filters: DashboardFilters = {
    period: baseParams.period,
    dateFrom: baseParams.dateFrom,
    dateTo: baseParams.dateTo,
    managerId: baseParams.managerId || "all",
    ...(baseParams.managerIds ? { managerIds: baseParams.managerIds } : {}),
    ...(baseParams.pipelines ? { pipelines: baseParams.pipelines } : {}),
    ...(baseParams.sourceIds ? { sourceIds: baseParams.sourceIds } : {}),
    ...(baseParams.minDurationSec ? { minDurationSec: baseParams.minDurationSec } : {}),
  };

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", filters],
    queryFn: () => dashboardService.getStats(filters),
  });
  const { data: criteriaData } = useQuery({
    queryKey: ["dashboard-criteria", filters],
    queryFn: () => dashboardService.getCriteria(filters),
  });
  const { data: errorsData } = useQuery({
    queryKey: ["dashboard-errors", filters],
    queryFn: () => dashboardService.getErrors(filters),
  });
  const { data: objectionsData } = useQuery({
    queryKey: ["dashboard-objections", filters],
    queryFn: () => dashboardService.getObjections(filters),
  });
  const { data: speechData } = useQuery({
    queryKey: ["dashboard-speech", filters],
    queryFn: () => dashboardService.getSpeechRatio(filters),
  });
  const { data: managerDurationsData } = useQuery({
    queryKey: ["dashboard-manager-durations", filters],
    queryFn: () => dashboardService.getManagerDurations(filters),
  });
  const { data: winLossData } = useQuery({
    queryKey: ["dashboard-winloss", filters],
    queryFn: () => dashboardService.getWinLoss(filters),
  });

  const kpis = audit?.kpis;

  return (
    <div className={embedded ? "space-y-5" : "px-4 md:px-6 py-4 space-y-5 max-w-7xl mx-auto"}>
      {/* ── Header + filter ─────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {embedded ? <div /> : (
        <div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <Headphones size={24} style={{ color: "#8b5cf6" }} />
            Audit
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Qo'ng'iroqlar tahlili va audio fayl statistikasi
          </p>
        </div>
        )}

        {/* Filter pills + Calendar + Filter */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
          }}
        >
          {(
            [
              { key: "month", label: "Bu oy" },
              { key: "week", label: "Bu hafta" },
              { key: "today", label: "Bugun" },
            ] as { key: FilterKey; label: string }[]
          ).map((btn) => {
            const active = filter === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => {
                  setFilter(btn.key);
                  setRange(undefined);
                }}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: active ? "#8b5cf6" : "transparent",
                  color: active ? "#ffffff" : "var(--text-secondary)",
                }}
              >
                {btn.label}
              </button>
            );
          })}

          <div
            className="w-px self-stretch mx-1"
            style={{ backgroundColor: "var(--color-border)" }}
          />

          {/* Calendar */}
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setCalendarOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor:
                  filter === "custom" ? "#8b5cf6" : "transparent",
                color:
                  filter === "custom" ? "#ffffff" : "var(--text-secondary)",
              }}
              title="Sana oraliq tanlash"
            >
              <CalendarIcon size={15} />
              {filter === "custom" && range?.from && range?.to && (
                <span className="hidden sm:inline">{formatRangeLabel()}</span>
              )}
            </button>

            {calendarOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  borderColor: "var(--color-border)",
                  minWidth: 320,
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 border-b"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Sana oralig'i
                  </span>
                  <button
                    onClick={() => setCalendarOpen(false)}
                    className="p-1 rounded hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-3">
                  <DayPicker
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    locale={uz}
                    weekStartsOn={1}
                    numberOfMonths={1}
                    className="sales-daypicker"
                  />
                </div>
                <div
                  className="flex items-center justify-between gap-2 px-4 py-3 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <button
                    onClick={() => {
                      setRange(undefined);
                      setFilter("month");
                      setCalendarOpen(false);
                    }}
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Tozalash
                  </button>
                  <button
                    onClick={applyRange}
                    disabled={!range?.from || !range?.to}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                    style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                  >
                    Qo'llash
                  </button>
                </div>
              </div>
            )}
          </div>

          <div
            className="w-px self-stretch mx-1"
            style={{ backgroundColor: "var(--color-border)" }}
          />

          {/* Filter popover */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor:
                  totalFiltersApplied > 0 ? "#8b5cf6" : "transparent",
                color:
                  totalFiltersApplied > 0 ? "#ffffff" : "var(--text-secondary)",
              }}
              title="Filter"
            >
              <Filter size={14} />
              <span className="hidden sm:inline">Filter</span>
              {totalFiltersApplied > 0 && (
                <span
                  className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.3)",
                    minWidth: 18,
                    height: 16,
                  }}
                >
                  {totalFiltersApplied}
                </span>
              )}
            </button>

            {filterOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  borderColor: "var(--color-border)",
                  width: 340,
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-4 py-3 border-b"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Filterlar
                  </span>
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="p-1 rounded hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Tab switcher (horizontal) */}
                <div
                  className="flex gap-1 px-3 py-2 border-b"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {([
                    {
                      key: "pipeline" as FilterTab,
                      label: "Voronka",
                      count: selectedPipelines.length,
                    },
                    {
                      key: "manager" as FilterTab,
                      label: "Menejer",
                      count: selectedManagers.length,
                    },
                    {
                      key: "source" as FilterTab,
                      label: "Manba",
                      count: selectedSources.length,
                    },
                    {
                      key: "duration" as FilterTab,
                      label: "Davomiylik",
                      count: minDurationSec > 0 ? 1 : 0,
                    },
                  ]).map((tab) => {
                    const active = filterTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setFilterTab(tab.key)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                        style={{
                          backgroundColor: active
                            ? "rgba(139,92,246,0.15)"
                            : "transparent",
                          color: active ? "#8b5cf6" : "var(--text-secondary)",
                        }}
                      >
                        {tab.label}
                        {tab.count > 0 && (
                          <span
                            className="inline-flex items-center justify-center text-[9px] font-bold rounded-full px-1.5"
                            style={{
                              backgroundColor: active
                                ? "#8b5cf6"
                                : "rgba(255,255,255,0.15)",
                              color: active ? "#fff" : "var(--text-secondary)",
                              minWidth: 16,
                              height: 14,
                            }}
                          >
                            {tab.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Search — pipeline/source uchun (manager o'z search'i, duration kerak emas) */}
                {filterTab !== "duration" && filterTab !== "manager" && (
                  <div
                    className="px-3 py-2 border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div className="relative">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <input
                        type="text"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder={`${
                          filterTab === "pipeline" ? "Voronka" : "Manba"
                        } qidirish...`}
                        className="w-full h-8 pl-7 pr-2 rounded-md border text-xs focus:outline-none"
                        style={{
                          backgroundColor: "var(--color-card-bg)",
                          borderColor: "var(--color-border)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Manager tab — dept tree */}
                {filterTab === "manager" && (
                  <ManagerDeptFilter
                    selectedManagerIds={selectedManagers}
                    onChange={setSelectedManagers}
                    accentColor="#8b5cf6"
                    maxHeight={288}
                    fallbackManagers={(managers ?? []).map((m) => ({
                      id: m.id,
                      name: m.name,
                    }))}
                  />
                )}

                {/* Pipeline / Source list */}
                <div
                  className="max-h-72 overflow-y-auto py-1"
                  style={{
                    display:
                      filterTab === "manager" || filterTab === "duration"
                        ? "none"
                        : undefined,
                  }}
                >
                  {filterTab === "pipeline" &&
                    (pipelines ?? [])
                      .filter((p) =>
                        filterSearch.trim() === ""
                          ? true
                          : p.name
                              .toLowerCase()
                              .includes(filterSearch.trim().toLowerCase()),
                      )
                      .map((p) => {
                        const active = selectedPipelines.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => togglePipeline(p.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-white/5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                                style={{
                                  backgroundColor: active
                                    ? "#8b5cf6"
                                    : "transparent",
                                  borderColor: active
                                    ? "#8b5cf6"
                                    : "var(--color-border)",
                                }}
                              >
                                {active && (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                  >
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
                              .includes(filterSearch.trim().toLowerCase()),
                      )
                      .map((s) => {
                        const active = selectedSources.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggleSource(s.id)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-white/5"
                            style={{ color: "var(--text-primary)" }}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <span
                                className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                                style={{
                                  backgroundColor: active
                                    ? "#8b5cf6"
                                    : "transparent",
                                  borderColor: active
                                    ? "#8b5cf6"
                                    : "var(--color-border)",
                                }}
                              >
                                {active && (
                                  <svg
                                    width="10"
                                    height="10"
                                    viewBox="0 0 10 10"
                                    fill="none"
                                  >
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
                              <span className="truncate" title={s.name}>
                                {s.name}
                              </span>
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

                  {filterTab === "source" &&
                    (!sources || sources.length === 0) && (
                      <div
                        className="py-8 text-center text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Manbalar topilmadi
                      </div>
                    )}
                </div>

                {/* Duration tab */}
                {filterTab === "duration" && (
                  <div className="p-4 space-y-4">
                    <div>
                      <p
                        className="text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Ko'rsatilgan qiymatdan uzoqroq qo'ng'iroqlar chiqadi.
                      </p>
                    </div>

                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label
                          className="block text-[10px] mb-1 font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Daqiqa
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={minDurationMin}
                          onChange={(e) =>
                            setMinDurationMin(
                              e.target.value.replace(/[^0-9]/g, ""),
                            )
                          }
                          placeholder="0"
                          className="w-full h-9 px-2.5 rounded-md border text-sm focus:outline-none"
                          style={{
                            backgroundColor: "var(--color-card-bg)",
                            borderColor: "var(--color-border)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                      <span
                        className="text-base font-bold pb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        :
                      </span>
                      <div className="flex-1">
                        <label
                          className="block text-[10px] mb-1 font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Soniya
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={minDurationSecInput}
                          onChange={(e) =>
                            setMinDurationSecInput(
                              e.target.value.replace(/[^0-9]/g, ""),
                            )
                          }
                          placeholder="0"
                          className="w-full h-9 px-2.5 rounded-md border text-sm focus:outline-none"
                          style={{
                            backgroundColor: "var(--color-card-bg)",
                            borderColor: "var(--color-border)",
                            color: "var(--text-primary)",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <p
                        className="text-[10px] mb-1.5 font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Tez tanlash
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: "30 son", m: 0, s: 30 },
                          { label: "1 daq", m: 1, s: 0 },
                          { label: "2 daq", m: 2, s: 0 },
                          { label: "5 daq", m: 5, s: 0 },
                          { label: "10 daq", m: 10, s: 0 },
                        ].map((p) => {
                          const active =
                            parseInt(minDurationMin || "0", 10) === p.m &&
                            parseInt(minDurationSecInput || "0", 10) === p.s;
                          return (
                            <button
                              key={p.label}
                              onClick={() => {
                                setMinDurationMin(String(p.m));
                                setMinDurationSecInput(String(p.s));
                              }}
                              className="px-2.5 py-1 rounded-md text-[11px] font-medium border"
                              style={{
                                backgroundColor: active
                                  ? "rgba(139,92,246,0.15)"
                                  : "transparent",
                                borderColor: active
                                  ? "#8b5cf6"
                                  : "var(--color-border)",
                                color: active
                                  ? "#8b5cf6"
                                  : "var(--text-primary)",
                              }}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                        {minDurationSec > 0 && (
                          <button
                            onClick={() => {
                              setMinDurationMin("");
                              setMinDurationSecInput("");
                            }}
                            className="px-2.5 py-1 rounded-md text-[11px] font-medium border"
                            style={{
                              borderColor: "var(--color-border)",
                              color: "#ef4444",
                            }}
                          >
                            Tozalash
                          </button>
                        )}
                      </div>
                    </div>

                    {minDurationSec > 0 && (
                      <div
                        className="rounded-md px-2.5 py-1.5 text-[11px]"
                        style={{
                          backgroundColor: "rgba(139,92,246,0.08)",
                          color: "#8b5cf6",
                        }}
                      >
                        Tanlangan: {Math.floor(minDurationSec / 60)} daq{" "}
                        {minDurationSec % 60} son ({minDurationSec} soniya)
                      </div>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div
                  className="flex items-center justify-between gap-2 px-4 py-2.5 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <button
                    onClick={() => {
                      setSelectedPipelines([]);
                      setSelectedManagers([]);
                      setSelectedSources([]);
                      setMinDurationMin("");
                      setMinDurationSecInput("");
                    }}
                    disabled={totalFiltersApplied === 0}
                    className="text-xs font-medium disabled:opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Hammasini tozalash
                  </button>
                  <button
                    onClick={() => setFilterOpen(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: "#8b5cf6", color: "#ffffff" }}
                  >
                    Qo'llash
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ── KPI kartalar — 4 yuqori + 3 pastki (to'liq kenglik) ───── */}
      {auditLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" rounded="xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28" rounded="xl" />
            ))}
          </div>
        </div>
      ) : kpis ? (
        <div className="space-y-3">
          {/* Yuqori qator — 4 ta */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Umumiy"
              value={kpis.totalCalls.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<PhoneCall size={20} />}
              accentColor="#3b5ef5"
              hint="Jami qo'ng'iroqlar"
            />
            <KpiCard
              label="Chiquvchi"
              value={kpis.outgoing.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<PhoneOutgoing size={20} />}
              accentColor="#22c55e"
              hint={
                kpis.totalCalls > 0
                  ? `${Math.round((kpis.outgoing / kpis.totalCalls) * 100)}%`
                  : "—"
              }
            />
            <KpiCard
              label="Kiruvchi"
              value={kpis.incoming.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<PhoneIncoming size={20} />}
              accentColor="#f59e0b"
              hint={
                kpis.totalCalls > 0
                  ? `${Math.round((kpis.incoming / kpis.totalCalls) * 100)}%`
                  : "—"
              }
            />
            <KpiCard
              label="1-qo'ng'iroq"
              value={kpis.firstCallCount.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<PhoneCall size={20} />}
              accentColor="#06b6d4"
              hint="Lidga birinchi aloqa"
            />
          </div>

          {/* Pastki qator — 4 ta (4×2 grid) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Qayta"
              value={kpis.repeatCallCount.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<Repeat size={20} />}
              accentColor="#ec4899"
              hint="Takroriy aloqalar"
            />
            <KpiCard
              label="O'rt. davomiylik"
              value={formatDuration(kpis.avgDurationSec)}
              icon={<Clock size={20} />}
              accentColor="#8b5cf6"
              hint="Bir qo'ng'iroqga"
            />
            <KpiCard
              label="Aloqaga chiqish"
              value={formatHours(kpis.avgTimeToContactHours)}
              icon={<Timer size={20} />}
              accentColor="#14b8a6"
              hint={`${kpis.totalLeadsCount ?? kpis.contactSampleCount} ta lid (${kpis.contactSampleCount} ta aloqaga chiqilgan)`}
            />
            <KpiCard
              label="Suhbat yo'q"
              value={(kpis.noConversationCount ?? 0).toLocaleString("ru-RU")}
              suffix="ta"
              icon={<PhoneOff size={20} />}
              accentColor="#6b7280"
              hint="Voicemail / avtomat xabar"
            />
          </div>
        </div>
      ) : null}

      {/* ── 2) E'tirozlar ─────────────────────────── */}
      {objectionsData && objectionsData.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <MessageSquare size={18} style={{ color: "#f59e0b" }} />
            <h2
              className="text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              E'tirozlar
            </h2>
          </div>
          <ObjectionsChart data={objectionsData} />
        </div>
      )}

      {/* ── 3) Aniqlangan xatoliklar ──────────────── */}
      {errorsData && errorsData.total > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <AlertTriangle size={18} style={{ color: "#ef4444" }} />
            <h2
              className="text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Aniqlangan xatoliklar
            </h2>
          </div>
          <ErrorsBlock data={errorsData} filters={filters} />
        </div>
      )}

      {/* ── 4) G'alaba va mag'lubiyatlar ──────────── */}
      {winLossData && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <BarChart3 size={18} style={{ color: "#22c55e" }} />
            <h2
              className="text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              G'alaba va mag'lubiyatlar
            </h2>
          </div>
          <WinLossBlock data={winLossData} />
        </div>
      )}

      {/* ── 5) Sotuv mezonlariga rioya (Jamoa + Menejerlar) ─ */}
      {criteriaData && (
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <BarChart3 size={18} style={{ color: "#22c55e" }} />
              <h2
                className="text-base font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Sotuv mezonlariga rioya (Jamoa)
              </h2>
            </div>
            <CriteriaTeamChart data={criteriaData} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <BarChart3 size={18} style={{ color: "#8b5cf6" }} />
              <h2
                className="text-base font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Mezonlarga rioya qilishi (Menejerlar)
              </h2>
            </div>
            <Card>
              <CriteriaManagersTable data={criteriaData} />
            </Card>
          </div>
        </div>
      )}

      {/* ── 7) O'rtacha qo'ng'iroq davomiyligi (Jamoa + Menejerlar) ─ */}
      {stats && managerDurationsData && (
        <DurationBlock
          stats={stats}
          managerDurations={managerDurationsData}
        />
      )}

      {/* ── 8) Nutq nisbati (Jamoa + Menejerlar) ─── */}
      {speechData && speechData.managers && speechData.managers.length > 0 && (
        <SpeechRatioBlock data={speechData} />
      )}
    </div>
  );
};

export default AuditPage;
