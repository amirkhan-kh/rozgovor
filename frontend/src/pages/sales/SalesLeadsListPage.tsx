import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Users,
  Filter as FilterIcon,
  TrendingUp,
  CircleDollarSign,
  User,
  Calendar as CalendarIcon,
  CheckCircle2,
  X,
  Search as SearchIcon,
  LayoutGrid,
  List as ListIcon,
  Phone,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import { salesService } from "../../services/sales.service";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";

const formatMoney = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} mlrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} mln`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return String(Math.round(n));
};

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("uz-UZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
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

type Kind = "lid" | "qualified" | "sotuv";

const KIND_META: Record<
  Kind,
  { title: string; icon: React.ReactNode; accent: string; subtitle: string }
> = {
  lid: {
    title: "Lid soni",
    icon: <Users size={22} />,
    accent: "#3b5ef5",
    subtitle: "Davrda tushgan barcha lidlar",
  },
  qualified: {
    title: "Sifatli lid",
    icon: <FilterIcon size={22} />,
    accent: "#06b6d4",
    subtitle: "Deal'ga o'tgan lidlar",
  },
  sotuv: {
    title: "Sotuv",
    icon: <TrendingUp size={22} />,
    accent: "#22c55e",
    subtitle: "Yopilgan won dealllar",
  },
};

type FilterKey = "today" | "week" | "month" | "custom";
type FilterTab = "pipeline" | "manager" | "source";
type ViewMode = "card" | "table";

const STORAGE_KEY = "leads-list-view";

const SalesLeadsListPage: React.FC = () => {
  const { kind: kindParam } = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const [urlSearch] = useSearchParams();

  const kind: Kind = (["lid", "qualified", "sotuv"] as const).includes(
    kindParam as Kind,
  )
    ? (kindParam as Kind)
    : "lid";

  const meta = KIND_META[kind];
  const accent = meta.accent;

  // ── Filter state — Sales sahifasidagi kabi ───────────────────────────
  const initialPeriod = (urlSearch.get("period") as FilterKey) || "month";
  const [filter, setFilter] = useState<FilterKey>(initialPeriod);

  const initialFrom = urlSearch.get("dateFrom");
  const initialTo = urlSearch.get("dateTo");
  const [range, setRange] = useState<DateRange | undefined>(
    initialFrom && initialTo
      ? { from: new Date(initialFrom), to: new Date(initialTo) }
      : undefined,
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("pipeline");
  const [filterSearch, setFilterSearch] = useState("");
  const filterRef = useRef<HTMLDivElement | null>(null);

  const initialPipelines = (urlSearch.get("pipelineIds") || "")
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
  const initialManagers = (urlSearch.get("managerIds") || "")
    .split(",")
    .filter(Boolean);
  const initialSources = (urlSearch.get("sourceIds") || "")
    .split(",")
    .filter(Boolean);
  const [selectedPipelines, setSelectedPipelines] =
    useState<number[]>(initialPipelines);
  const [selectedManagers, setSelectedManagers] =
    useState<string[]>(initialManagers);
  const [selectedSources, setSelectedSources] =
    useState<string[]>(initialSources);

  // ── View mode (card | table) ─────────────────────────────────────────
  const [view, setView] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "card" || saved === "table") return saved;
    } catch { /* noop */ }
    return "card"; // default
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch { /* noop */ }
  }, [view]);

  // Outside click — calendar
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

  // Outside click — filter
  useEffect(() => {
    if (!filterOpen) {
      setFilterSearch("");
      return;
    }
    const h = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  useEffect(() => {
    setFilterSearch("");
  }, [filterTab]);

  // ── Pipelines / Sources query ────────────────────────────────────────
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
    setSelectedPipelines((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );
  const toggleSource = (id: string) =>
    setSelectedSources((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  const totalFiltersApplied =
    selectedPipelines.length + selectedManagers.length + selectedSources.length;

  // ── Query params ─────────────────────────────────────────────────────
  const params: Record<string, string> = {
    ...(filter === "custom" && range?.from && range?.to
      ? {
          period: "custom",
          dateFrom: toLocalDateStr(range.from),
          dateTo: toLocalDateStr(range.to),
        }
      : { period: filter }),
    ...(selectedPipelines.length > 0
      ? { pipelineIds: selectedPipelines.join(",") }
      : {}),
    ...(selectedManagers.length > 0
      ? { managerIds: selectedManagers.join(",") }
      : {}),
    ...(selectedSources.length > 0
      ? { sourceIds: selectedSources.join(",") }
      : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["sales-kpi-leads-list", kind, params],
    queryFn: () => salesService.getKpiLeadsList(kind, params),
    enabled: filter !== "custom" || !!(range?.from && range?.to),
  });

  const applyRange = () => {
    if (!range?.from) return;
    if (!range.to) setRange({ from: range.from, to: range.from });
    setFilter("custom");
    setCalendarOpen(false);
  };

  const formatRangeLabel = (): string => {
    if (!range?.from) return "Sana";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-7xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate("/sales")}
        className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-70 transition-opacity"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Sotuv sahifasiga qaytish
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accent}1a`, color: accent }}
          >
            {meta.icon}
          </div>
          <div className="min-w-0">
            <h1
              className="text-2xl font-bold flex items-center gap-2 flex-wrap"
              style={{ color: "var(--text-primary)" }}
            >
              {meta.title}
              {data && (
                <span
                  className="text-sm font-semibold px-2.5 py-0.5 rounded-full"
                  style={{ backgroundColor: `${accent}1a`, color: accent }}
                >
                  {data.count.toLocaleString("ru-RU")} ta
                </span>
              )}
              {kind === "sotuv" && data?.totalAmount != null && (
                <span
                  className="inline-flex items-center gap-1 text-sm font-semibold px-2.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "rgba(34,197,94,0.12)",
                    color: "#22c55e",
                  }}
                >
                  <CircleDollarSign size={14} />
                  {formatMoney(data.totalAmount)} UZS
                </span>
              )}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {meta.subtitle}
            </p>
          </div>
        </div>

        {/* View toggle */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
          }}
        >
          {([
            { key: "card" as ViewMode, label: "Card", icon: <LayoutGrid size={14} /> },
            { key: "table" as ViewMode, label: "Jadval", icon: <ListIcon size={14} /> },
          ]).map((b) => {
            const active = view === b.key;
            return (
              <button
                key={b.key}
                onClick={() => setView(b.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{
                  backgroundColor: active ? accent : "transparent",
                  color: active ? "#fff" : "var(--text-secondary)",
                }}
              >
                {b.icon}
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar — Sales sahifasidagi kabi */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl border flex-wrap"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-card-bg)",
        }}
      >
        {([
          { key: "month", label: "Bu oy" },
          { key: "week", label: "Bu hafta" },
          { key: "today", label: "Bugun" },
        ] as { key: FilterKey; label: string }[]).map((b) => {
          const active = filter === b.key;
          return (
            <button
              key={b.key}
              onClick={() => {
                setFilter(b.key);
                setRange(undefined);
              }}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{
                backgroundColor: active ? accent : "transparent",
                color: active ? "#fff" : "var(--text-secondary)",
              }}
            >
              {b.label}
            </button>
          );
        })}

        <div className="w-px self-stretch mx-1" style={{ backgroundColor: "var(--color-border)" }} />

        {/* Calendar */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setCalendarOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: filter === "custom" ? accent : "transparent",
              color: filter === "custom" ? "#fff" : "var(--text-secondary)",
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
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
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
                  disabled={!range?.from}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={{ backgroundColor: accent, color: "#fff" }}
                >
                  Qo'llash
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-px self-stretch mx-1" style={{ backgroundColor: "var(--color-border)" }} />

        {/* Filter popover */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: totalFiltersApplied > 0 ? accent : "transparent",
              color: totalFiltersApplied > 0 ? "#fff" : "var(--text-secondary)",
            }}
            title="Filter"
          >
            <FilterIcon size={14} />
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
                width: 320,
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
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

              <div
                className="flex gap-1 px-3 py-2 border-b"
                style={{ borderColor: "var(--color-border)" }}
              >
                {([
                  { key: "pipeline" as FilterTab, label: "Voronka", count: selectedPipelines.length },
                  { key: "manager" as FilterTab, label: "Menejer", count: selectedManagers.length },
                  { key: "source" as FilterTab, label: "Manba", count: selectedSources.length },
                ]).map((tab) => {
                  const active = filterTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setFilterTab(tab.key)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{
                        backgroundColor: active ? `${accent}26` : "transparent",
                        color: active ? accent : "var(--text-secondary)",
                      }}
                    >
                      {tab.label}
                      {tab.count > 0 && (
                        <span
                          className="inline-flex items-center justify-center text-[9px] font-bold rounded-full px-1.5"
                          style={{
                            backgroundColor: active ? accent : "rgba(255,255,255,0.15)",
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

              {filterTab !== "manager" && (
                <div
                  className="px-3 py-2 border-b"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div className="relative">
                    <SearchIcon
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--text-secondary)" }}
                    />
                    <input
                      type="text"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder={`${filterTab === "pipeline" ? "Voronka" : "Manba"} qidirish...`}
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

              {filterTab === "manager" && (
                <ManagerDeptFilter
                  selectedManagerIds={selectedManagers}
                  onChange={setSelectedManagers}
                  accentColor={accent}
                  maxHeight={288}
                  fallbackManagers={[]}
                />
              )}

              <div
                className="max-h-72 overflow-y-auto py-1"
                style={{ display: filterTab === "manager" ? "none" : undefined }}
              >
                {filterTab === "pipeline" &&
                  (pipelines ?? [])
                    .filter((p) =>
                      filterSearch.trim() === ""
                        ? true
                        : p.name.toLowerCase().includes(filterSearch.trim().toLowerCase()),
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
                                backgroundColor: active ? accent : "transparent",
                                borderColor: active ? accent : "var(--color-border)",
                              }}
                            >
                              {active && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1 5L4 8L9 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className="truncate">{p.name}</span>
                          </span>
                          <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
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
                        : s.name.toLowerCase().includes(filterSearch.trim().toLowerCase()),
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
                                backgroundColor: active ? accent : "transparent",
                                borderColor: active ? accent : "var(--color-border)",
                              }}
                            >
                              {active && (
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                  <path d="M1 5L4 8L9 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            <span className="truncate" title={s.name}>{s.name}</span>
                          </span>
                          <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
                            {s.leadCount}
                          </span>
                        </button>
                      );
                    })}
              </div>

              <div
                className="flex items-center justify-between gap-2 px-4 py-2.5 border-t"
                style={{ borderColor: "var(--color-border)" }}
              >
                <button
                  onClick={() => {
                    setSelectedPipelines([]);
                    setSelectedManagers([]);
                    setSelectedSources([]);
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
                  style={{ backgroundColor: accent, color: "#fff" }}
                >
                  Qo'llash
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        view === "card" ? (
          /* Card skeleton — har bir kartda real layout shakli */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border p-3 flex flex-col gap-2 animate-pulse"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  borderColor: "var(--color-border)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className="h-4 w-8 rounded"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                  <div
                    className="h-4 w-16 rounded"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                </div>
                <div
                  className="h-4 w-full rounded"
                  style={{ backgroundColor: "var(--color-border)" }}
                />
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                  <div
                    className="h-3 w-24 rounded"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div
                    className="h-4 w-20 rounded"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                  <div
                    className="h-3 w-16 rounded"
                    style={{ backgroundColor: "var(--color-border)" }}
                  />
                </div>
                <div
                  className="h-3 w-3/4 rounded"
                  style={{ backgroundColor: "var(--color-border)", opacity: 0.6 }}
                />
              </div>
            ))}
          </div>
        ) : (
          /* Table skeleton */
          <Card>
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" rounded="md" />
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" rounded="md" />
              ))}
            </div>
          </Card>
        )
      ) : !data || data.items.length === 0 ? (
        <Card>
          <div className="py-16 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Bu davrda hech qanday lid topilmadi
          </div>
        </Card>
      ) : view === "card" ? (
        <>
          {/* Card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {data.items.map((it, idx) => (
              <div
                key={it.id}
                className="rounded-xl border p-3 flex flex-col gap-2 transition-transform hover:-translate-y-0.5"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  borderColor: "var(--color-border)",
                  boxShadow: `0 4px 16px -8px ${accent}25`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: `${accent}1a`,
                      color: accent,
                    }}
                  >
                    #{idx + 1}
                  </span>
                  {kind === "sotuv" && it.price != null && it.price > 0 && (
                    <span
                      className="text-xs font-bold"
                      style={{ color: "#22c55e" }}
                    >
                      {formatMoney(it.price)}
                    </span>
                  )}
                  {kind === "qualified" && it.isConverted && (
                    <CheckCircle2 size={14} style={{ color: "#06b6d4" }} />
                  )}
                </div>

                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--text-primary)" }}
                  title={it.title}
                >
                  {it.title}
                </div>

                {it.clientPhone && (
                  <a
                    href={`tel:${it.clientPhone}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-xs font-mono font-semibold transition-opacity hover:opacity-80 truncate"
                    style={{ color: "#06b6d4" }}
                    title={it.clientPhone}
                  >
                    <Phone size={11} />
                    <span className="truncate">{it.clientPhone}</span>
                  </a>
                )}

                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {it.managerPhotoUrl ? (
                    <img
                      src={it.managerPhotoUrl}
                      alt={it.manager || ""}
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <User size={11} />
                    </div>
                  )}
                  <span className="truncate">{it.manager || "—"}</span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[11px]">
                  {it.sourceName ? (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium truncate max-w-[60%]"
                      style={{
                        backgroundColor: `${accent}10`,
                        color: accent,
                      }}
                      title={it.sourceName}
                    >
                      {it.sourceName}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-secondary)", opacity: 0.4 }}>—</span>
                  )}
                  <span className="inline-flex items-center gap-1" style={{ color: "var(--text-secondary)" }}>
                    <CalendarIcon size={11} />
                    {formatDate(it.date)}
                  </span>
                </div>

                {kind === "sotuv" && it.pipelineName && (
                  <div className="text-[10px] truncate" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                    {it.pipelineName}
                  </div>
                )}

                {(kind === "lid" || kind === "qualified") && it.statusName && (
                  <div className="text-[10px] truncate" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                    {it.statusName}
                  </div>
                )}
              </div>
            ))}
          </div>

          {data.items.length >= 1000 && (
            <div className="text-xs text-center py-3" style={{ color: "var(--text-secondary)" }}>
              Ko'rsatilayotgan: dastlabki 1000 ta. Filterni torrtoring.
            </div>
          )}
        </>
      ) : (
        /* Table view — horizontal scroll bilan */
        <Card>
          <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
            <div className="min-w-[800px]">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left"
                    style={{
                      backgroundColor: "var(--ds-bg-overlay)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">#</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">
                      {kind === "sotuv" ? "Deal" : "Lid"}
                    </th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Telefon</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Manba</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Menejer</th>
                    {kind === "sotuv" && (
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Voronka</th>
                    )}
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Sana</th>
                    {kind === "sotuv" ? (
                      <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Summa</th>
                    ) : (
                      <th className="px-3 py-2.5 font-medium whitespace-nowrap">Status</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, idx) => (
                    <tr
                      key={it.id}
                      className="border-t hover:bg-white/[0.02]"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <td className="px-3 py-2.5 text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                        {it.title}
                        {kind === "qualified" && it.isConverted && (
                          <CheckCircle2
                            size={12}
                            className="inline ml-1.5 align-middle"
                            style={{ color: "#06b6d4" }}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        {it.clientPhone ? (
                          <a
                            href={`tel:${it.clientPhone}`}
                            className="inline-flex items-center gap-1 font-mono text-xs font-semibold transition-opacity hover:opacity-80"
                            style={{ color: "#06b6d4" }}
                          >
                            <Phone size={11} />
                            {it.clientPhone}
                          </a>
                        ) : (
                          <span style={{ opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>
                        {it.sourceName ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap"
                            style={{ backgroundColor: `${accent}10`, color: accent }}
                          >
                            {it.sourceName}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        <div className="inline-flex items-center gap-1.5">
                          {it.managerPhotoUrl ? (
                            <img src={it.managerPhotoUrl} alt={it.manager || ""} className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{
                                backgroundColor: "var(--color-border)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              <User size={11} />
                            </div>
                          )}
                          <span>{it.manager || "—"}</span>
                        </div>
                      </td>
                      {kind === "sotuv" && (
                        <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>
                          {it.pipelineName || "—"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        <div className="inline-flex items-center gap-1">
                          <CalendarIcon size={12} />
                          {formatDate(it.date)}
                        </div>
                      </td>
                      {kind === "sotuv" ? (
                        <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap" style={{ color: "#22c55e" }}>
                          {it.price != null && it.price > 0 ? formatMoney(it.price) : "—"}
                        </td>
                      ) : (
                        <td className="px-3 py-2.5" style={{ color: "var(--text-secondary)" }}>
                          {it.statusName ? (
                            <span className="text-xs">{it.statusName}</span>
                          ) : (
                            <span style={{ opacity: 0.4 }}>—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {data.items.length >= 1000 && (
            <div className="px-3 py-3 text-xs text-center" style={{ color: "var(--text-secondary)" }}>
              Ko'rsatilayotgan: dastlabki 1000 ta. Filterni torrtoring.
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default SalesLeadsListPage;
