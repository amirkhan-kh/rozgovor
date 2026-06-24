import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ClipboardList,
  ClipboardX,
  AlertTriangle,
  CalendarClock,
  Filter as FilterIcon,
  User,
  Calendar as CalendarIcon,
  Search as SearchIcon,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import { salesService } from "../../services/sales.service";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";

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

type Kind = "total" | "overdue" | "today" | "noTask";

const KIND_META: Record<
  Kind,
  { title: string; icon: React.ReactNode; accent: string; subtitle: string }
> = {
  total: {
    title: "Bugungi umumiy zadacha",
    icon: <ClipboardList size={22} />,
    accent: "#8b5cf6",
    subtitle: "Bugun bajarilishi kerak bo'lgan barcha aktivliklar",
  },
  noTask: {
    title: "Bez zadach",
    icon: <ClipboardX size={22} />,
    accent: "#64748b",
    subtitle: "Ochiq dealdan task'siz bo'lganlari",
  },
  overdue: {
    title: "Prosrochenniy",
    icon: <AlertTriangle size={22} />,
    accent: "#ef4444",
    subtitle: "Muddati o'tib ketgan zadachlar",
  },
  today: {
    title: "Bugungi zadachi",
    icon: <CalendarClock size={22} />,
    accent: "#f59e0b",
    subtitle: "Bugun muddatda bajarilishi kerak",
  },
};

type FilterKey = "today" | "week" | "month" | "custom";
type FilterTab = "pipeline" | "manager";
type ViewMode = "card" | "table";

const STORAGE_KEY = "tasks-list-view";

const SalesTasksListPage: React.FC = () => {
  const { kind: kindParam } = useParams<{ kind: string }>();
  const navigate = useNavigate();
  const [urlSearch] = useSearchParams();

  const kind: Kind = (["total", "overdue", "today", "noTask"] as const).includes(
    kindParam as Kind,
  )
    ? (kindParam as Kind)
    : "total";

  const meta = KIND_META[kind];
  const accent = meta.accent;

  // ── Filter state ─────────────────────────────────────────────────────
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
  const [selectedPipelines, setSelectedPipelines] =
    useState<number[]>(initialPipelines);
  const [selectedManagers, setSelectedManagers] =
    useState<string[]>(initialManagers);

  const [view, setView] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "card" || saved === "table") return saved;
    } catch { /* noop */ }
    return "card";
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, view); } catch { /* noop */ }
  }, [view]);

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

  useEffect(() => { setFilterSearch(""); }, [filterTab]);

  const { data: pipelines } = useQuery({
    queryKey: ["sales-pipelines"],
    queryFn: () => salesService.getPipelines(),
    staleTime: 5 * 60 * 1000,
  });

  const togglePipeline = (id: number) =>
    setSelectedPipelines((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );

  const totalFiltersApplied = selectedPipelines.length + selectedManagers.length;

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
  };

  const { data, isLoading } = useQuery({
    queryKey: ["sales-task-list", kind, params],
    queryFn: () => salesService.getTaskList(kind, params),
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
      <button
        onClick={() => navigate("/sales")}
        className="inline-flex items-center gap-2 text-sm font-medium hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Sotuv sahifasiga qaytish
      </button>

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
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {meta.subtitle}
            </p>
          </div>
        </div>

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

      {/* Filter bar */}
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
              onClick={() => { setFilter(b.key); setRange(undefined); }}
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

        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setCalendarOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: filter === "custom" ? accent : "transparent",
              color: filter === "custom" ? "#fff" : "var(--text-secondary)",
            }}
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
                  onClick={() => { setRange(undefined); setFilter("month"); setCalendarOpen(false); }}
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

        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium"
            style={{
              backgroundColor: totalFiltersApplied > 0 ? accent : "transparent",
              color: totalFiltersApplied > 0 ? "#fff" : "var(--text-secondary)",
            }}
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
                className="flex gap-1 px-3 py-2 border-b"
                style={{ borderColor: "var(--color-border)" }}
              >
                {([
                  { key: "pipeline" as FilterTab, label: "Voronka", count: selectedPipelines.length },
                  { key: "manager" as FilterTab, label: "Menejer", count: selectedManagers.length },
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

              {filterTab === "pipeline" && (
                <>
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
                        placeholder="Voronka qidirish..."
                        className="w-full h-8 pl-7 pr-2 rounded-md border text-xs focus:outline-none"
                        style={{
                          backgroundColor: "var(--color-card-bg)",
                          borderColor: "var(--color-border)",
                          color: "var(--text-primary)",
                        }}
                      />
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto py-1">
                    {(pipelines ?? [])
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
                          </button>
                        );
                      })}
                  </div>
                </>
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
                className="flex items-center justify-between gap-2 px-4 py-2.5 border-t"
                style={{ borderColor: "var(--color-border)" }}
              >
                <button
                  onClick={() => { setSelectedPipelines([]); setSelectedManagers([]); }}
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
                <div className="h-4 w-full rounded" style={{ backgroundColor: "var(--color-border)" }} />
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
                  <div className="h-3 w-24 rounded" style={{ backgroundColor: "var(--color-border)" }} />
                </div>
                <div className="h-3 w-3/4 rounded" style={{ backgroundColor: "var(--color-border)", opacity: 0.6 }} />
              </div>
            ))}
          </div>
        ) : (
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
            Bu davrda zadach topilmadi
          </div>
        </Card>
      ) : view === "card" ? (
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
                  style={{ backgroundColor: `${accent}1a`, color: accent }}
                >
                  #{idx + 1}
                </span>
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{
                    backgroundColor: it.type === "deal" ? "rgba(34,197,94,0.12)" : `${accent}1a`,
                    color: it.type === "deal" ? "#22c55e" : accent,
                  }}
                >
                  {it.type === "deal" ? "Deal" : "Aktivlik"}
                </span>
              </div>

              <div
                className="text-sm font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
                title={it.title}
              >
                {it.title}
              </div>

              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                {it.managerPhotoUrl ? (
                  <img src={it.managerPhotoUrl} alt={it.manager || ""} className="w-5 h-5 rounded-full object-cover" />
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

              <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                <span className="inline-flex items-center gap-1">
                  <CalendarIcon size={11} />
                  {formatDate(it.date)}
                </span>
                {it.statusName && (
                  <span className="truncate text-right opacity-80">{it.statusName}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto -mx-4 md:-mx-6 px-4 md:px-6">
            <div className="min-w-[700px]">
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
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Tur</th>
                    <th className="px-3 py-2.5 font-medium">Mavzu</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Menejer</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Sana / Muddati</th>
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
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span
                          className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
                          style={{
                            backgroundColor: it.type === "deal" ? "rgba(34,197,94,0.12)" : `${accent}1a`,
                            color: it.type === "deal" ? "#22c55e" : accent,
                          }}
                        >
                          {it.type === "deal" ? "Deal" : "Aktivlik"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text-primary)" }}>
                        {it.title}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        <div className="inline-flex items-center gap-1.5">
                          {it.managerPhotoUrl ? (
                            <img src={it.managerPhotoUrl} alt={it.manager || ""} className="w-5 h-5 rounded-full object-cover" />
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: "var(--color-border)" }}
                            >
                              <User size={11} />
                            </div>
                          )}
                          <span>{it.manager || "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                        <div className="inline-flex items-center gap-1">
                          <CalendarIcon size={12} />
                          {formatDate(it.date)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SalesTasksListPage;
