import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  RefreshCw,
  Loader2,
  Calendar as CalendarIcon,
  X,
  TrendingUp,
  ClipboardList,
  Archive,
  Search,
  Filter,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import Button from "../../components/ui/Button";
import ManagersSalesTab from "./ManagersSalesTab";
import ManagersAuditTab from "./ManagersAuditTab";
import ManagersArchivedTab from "./ManagersArchivedTab";
import { salesService } from "../../services/sales.service";
import { managersService } from "../../services/managers.service";

type TabKey = "sales" | "audit" | "archived";
type PeriodKey = "today" | "week" | "month" | "custom";
type FilterTab = "pipeline" | "source";

const ManagersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("sales");

  const syncMutation = useMutation({
    mutationFn: () => managersService.syncFromBitrix(),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      queryClient.invalidateQueries({ queryKey: ["managers-audit"] });
      queryClient.invalidateQueries({ queryKey: ["manager-dept-filter"] });
      toast.success(
        `Sinxron ✓ ${r.upserted} menejer (yangilandi/qo'shildi)` +
          (r.deactivated > 0 ? `, ${r.deactivated} arxivlandi` : ""),
      );
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) =>
      toast.error(e?.response?.data?.message || e?.message || "Sinxron xatosi"),
  });
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("pipeline");
  const [filterSearch, setFilterSearch] = useState("");
  const [selectedPipelines, setSelectedPipelines] = useState<number[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const filterRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    setFilterSearch("");
  }, [filterTab]);

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

  const togglePipeline = (id: number) => {
    setSelectedPipelines((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const totalFiltersApplied =
    selectedPipelines.length + selectedSources.length;

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

  const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const salesQueryParams: {
    period: string;
    dateFrom?: string;
    dateTo?: string;
    pipelineIds?: string;
    sourceIds?: string;
    search?: string;
  } = {
    ...(period === "custom" && range?.from && range?.to
      ? {
          period: "custom",
          dateFrom: toLocalDateStr(range.from),
          dateTo: toLocalDateStr(range.to),
        }
      : { period }),
    ...(selectedPipelines.length > 0
      ? { pipelineIds: selectedPipelines.join(",") }
      : {}),
    ...(selectedSources.length > 0
      ? { sourceIds: selectedSources.join(",") }
      : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  };

  const UZ_MONTHS_SHORT = [
    "yan", "fev", "mar", "apr", "may", "iyn",
    "iyl", "avg", "sen", "okt", "noy", "dek",
  ];
  const formatUzDate = (d: Date): string =>
    `${d.getDate()} ${UZ_MONTHS_SHORT[d.getMonth()]}`;
  const formatRangeLabel = (): string => {
    if (!range?.from) return "Sana tanlang";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };


  return (
    <div className="overflow-hidden">
      {/* Breadcrumb */}
      <div className="mb-1">
        <span className="text-sm text-secondary">Bosh sahifa / Menejerlar</span>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Menejerlar</h1>
        <Button
          onClick={() => syncMutation.mutate()}
          loading={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          Sinxronlash
        </Button>
      </div>

      {/* Tab toggler + Kalendar (Sotuv tab uchun) */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
          }}
        >
          {([
            { key: "sales" as TabKey, label: "Sotuv", icon: <TrendingUp size={14} /> },
            { key: "audit" as TabKey, label: "Audit", icon: <ClipboardList size={14} /> },
            { key: "archived" as TabKey, label: "Arxivlangan", icon: <Archive size={14} /> },
          ]).map((btn) => {
            const active = tab === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => setTab(btn.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: active ? "#22c55e" : "transparent",
                  color: active ? "#ffffff" : "var(--text-secondary)",
                }}
              >
                {btn.icon}
                {btn.label}
              </button>
            );
          })}
        </div>

        {(tab === "sales" || tab === "audit") && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div
              className="relative flex items-center"
              style={{
                backgroundColor: "var(--color-card-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
              }}
            >
              <Search
                size={14}
                className="absolute left-3"
                style={{ color: "var(--text-secondary)" }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Menejer qidirish..."
                className="h-9 pl-8 pr-7 text-xs bg-transparent focus:outline-none"
                style={{ color: "var(--text-primary)", width: 180 }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 p-0.5 rounded hover:bg-white/5"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter (Voronka + Manba) */}
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setFilterOpen((v) => !v)}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl border text-xs font-medium"
                style={{
                  backgroundColor:
                    totalFiltersApplied > 0
                      ? "#22c55e"
                      : "var(--color-card-bg)",
                  borderColor:
                    totalFiltersApplied > 0
                      ? "#22c55e"
                      : "var(--color-border)",
                  color:
                    totalFiltersApplied > 0
                      ? "#ffffff"
                      : "var(--text-secondary)",
                }}
              >
                <Filter size={13} />
                <span>Filter</span>
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
                        key: "source" as FilterTab,
                        label: "Manba",
                        count: selectedSources.length,
                      },
                    ]).map((t) => {
                      const active = filterTab === t.key;
                      return (
                        <button
                          key={t.key}
                          onClick={() => setFilterTab(t.key)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            backgroundColor: active
                              ? "rgba(34,197,94,0.15)"
                              : "transparent",
                            color: active ? "#22c55e" : "var(--text-secondary)",
                          }}
                        >
                          {t.label}
                          {t.count > 0 && (
                            <span
                              className="inline-flex items-center justify-center text-[9px] font-bold rounded-full px-1.5"
                              style={{
                                backgroundColor: active
                                  ? "#22c55e"
                                  : "rgba(255,255,255,0.15)",
                                color: active
                                  ? "#fff"
                                  : "var(--text-secondary)",
                                minWidth: 16,
                                height: 14,
                              }}
                            >
                              {t.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

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

                  <div className="max-h-72 overflow-y-auto py-1">
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
                                      ? "#22c55e"
                                      : "transparent",
                                    borderColor: active
                                      ? "#22c55e"
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
                                      ? "#22c55e"
                                      : "transparent",
                                    borderColor: active
                                      ? "#22c55e"
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

                  <div
                    className="flex items-center justify-between gap-2 px-4 py-2.5 border-t"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <button
                      onClick={() => {
                        setSelectedPipelines([]);
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
                      style={{ backgroundColor: "#22c55e", color: "#ffffff" }}
                    >
                      Qo'llash
                    </button>
                  </div>
                </div>
              )}
            </div>

          <div
            className="inline-flex items-center gap-1 p-1 rounded-xl border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
            }}
          >
            {([
              { key: "month" as PeriodKey, label: "Bu oy" },
              { key: "week" as PeriodKey, label: "Bu hafta" },
              { key: "today" as PeriodKey, label: "Bugun" },
            ]).map((btn) => {
              const active = period === btn.key;
              return (
                <button
                  key={btn.key}
                  onClick={() => {
                    setPeriod(btn.key);
                    setRange(undefined);
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: active ? "#22c55e" : "transparent",
                    color: active ? "#ffffff" : "var(--text-secondary)",
                  }}
                >
                  {btn.label}
                </button>
              );
            })}
            <div className="w-px self-stretch mx-1" style={{ backgroundColor: "var(--color-border)" }} />
            <div className="relative" ref={popoverRef}>
              <button
                onClick={() => setCalendarOpen((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: period === "custom" ? "#22c55e" : "transparent",
                  color: period === "custom" ? "#ffffff" : "var(--text-secondary)",
                }}
                title="Sana oraliq tanlash"
              >
                <CalendarIcon size={15} />
                {period === "custom" && range?.from && range?.to && (
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
                        setPeriod("month");
                        setCalendarOpen(false);
                      }}
                      className="text-xs font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Tozalash
                    </button>
                    <button
                      onClick={() => {
                        if (range?.from && range?.to) {
                          setPeriod("custom");
                          setCalendarOpen(false);
                        }
                      }}
                      disabled={!(range?.from && range?.to)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{
                        backgroundColor: range?.from && range?.to ? "#22c55e" : "rgba(34,197,94,0.3)",
                        color: "#ffffff",
                        cursor: range?.from && range?.to ? "pointer" : "not-allowed",
                      }}
                    >
                      Qo'llash
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Sotuv tab */}
      {tab === "sales" && (
        <ManagersSalesTab
          queryParams={salesQueryParams}
          enabled={period !== "custom" || !!(range?.from && range?.to)}
        />
      )}

      {/* Audit tab — FIFA-style cards with radar chart */}
      {tab === "audit" && (
        <ManagersAuditTab
          queryParams={salesQueryParams}
          enabled={period !== "custom" || !!(range?.from && range?.to)}
        />
      )}

      {/* Arxivlangan tab */}
      {tab === "archived" && <ManagersArchivedTab />}

    </div>
  );
};

export default ManagersPage;
