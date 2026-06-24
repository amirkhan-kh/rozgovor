import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Sector,
} from "recharts";
import {
  UsersRound, MapPin, Clock, Phone, HelpCircle, Heart, ShieldAlert,
  User2, Calendar as CalendarIcon, X, MessageCircle, Search, ArrowRight,
  Lightbulb, Filter as FilterIcon,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import {
  clientsService,
  InsightSection,
  SectionInsight,
} from "../../services/clients.service";

type PeriodFilter = "all" | "today" | "week" | "month" | "custom";

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

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  color: string;
}> = ({ icon, label, value, hint, color }) => (
  <div
    className="rounded-xl p-4 border"
    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
  >
    <div className="flex items-center gap-2 mb-2">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
    </div>
    <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
      {value}
    </div>
    {hint && (
      <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
        {hint}
      </div>
    )}
  </div>
);

// InsightSection (obj) yoki eski string formatni bir joyga keltiradi.
const toInsight = (raw: InsightSection | undefined | null): SectionInsight => {
  if (!raw) return { summary: "", recommendation: "" };
  if (typeof raw === "string") return { summary: raw, recommendation: "" };
  return {
    summary: raw.summary || "",
    recommendation: raw.recommendation || "",
  };
};

const AiBlock: React.FC<{
  icon: React.ReactNode;
  title: string;
  insight: InsightSection | undefined | null;
  color: string;
  loading?: boolean;
  onClick?: () => void;
  ctaLabel?: string;
  summaryLabel?: string;
  recommendationLabel?: string;
}> = ({
  icon,
  title,
  insight,
  color,
  loading,
  onClick,
  ctaLabel,
  summaryLabel = "Xulosa",
  recommendationLabel = "Taklif",
}) => {
  const { summary, recommendation } = toInsight(insight);
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`rounded-xl p-5 border transition-all ${
        clickable ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg" : ""
      }`}
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-card-bg)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {icon}
        </div>
        <h3
          className="text-sm font-bold flex-1"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
        {clickable && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md"
            style={{ color, backgroundColor: `${color}15` }}
          >
            {ctaLabel || "Ochish"} <ArrowRight size={11} />
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-16" rounded="lg" />
      ) : (
        <div className="space-y-3">
          {/* Xulosa */}
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-wider mb-1"
              style={{ color: "var(--text-secondary)", opacity: 0.7 }}
            >
              {summaryLabel}
            </div>
            <p
              className="text-sm leading-relaxed"
              style={{ color: "var(--text-primary)" }}
            >
              {summary || "Ma'lumot yetarli emas"}
            </p>
          </div>

          {/* Taklif / Yechim — agar bor bo'lsa */}
          {recommendation && (
            <div
              className="rounded-lg p-3 flex items-start gap-2"
              style={{ backgroundColor: `${color}0d`, borderLeft: `3px solid ${color}` }}
            >
              <Lightbulb
                size={14}
                className="shrink-0 mt-0.5"
                style={{ color }}
              />
              <div className="flex-1 min-w-0">
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                  style={{ color }}
                >
                  {recommendationLabel}
                </div>
                <p
                  className="text-[13px] leading-snug"
                  style={{ color: "var(--text-primary)" }}
                >
                  {recommendation}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max - 1) + "…" : text;

// Savollar uchun — to'liq matnli horizontal bar list.
// Pie chart savollarga mos emas (uzun matn kesiladi). Bu ro'yxat
// ko'rinishida har savolni to'liq, count progress bar bilan ko'rsatadi.
const QuestionsList: React.FC<{
  title: string;
  items: { value: string; count: number }[];
  icon?: React.ReactNode;
  iconColor?: string;
}> = ({ title, items, icon, iconColor }) => {
  if (items.length === 0) return null;
  const maxCount = Math.max(...items.map((i) => i.count), 1);
  return (
    <Card>
      <h3
        className="text-sm font-bold mb-4 flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        {icon && (
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${iconColor || "#3b82f6"}20`,
              color: iconColor || "#3b82f6",
            }}
          >
            {icon}
          </span>
        )}
        {title}
        <span
          className="ml-auto text-[11px] font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {items.length} ta
        </span>
      </h3>
      <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
        {items.map((it, i) => {
          const pct = Math.round((it.count / maxCount) * 100);
          const color = PIE_COLORS[i % PIE_COLORS.length];
          return (
            <div key={i} className="group">
              <div className="flex items-start gap-2 mb-1">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold shrink-0 mt-0.5"
                  style={{ backgroundColor: `${color}22`, color }}
                >
                  {i + 1}
                </span>
                <p
                  className="text-sm leading-snug flex-1"
                  style={{ color: "var(--text-primary)" }}
                  title={it.value}
                >
                  {it.value}
                </p>
                <span
                  className="text-xs font-bold tabular-nums shrink-0 mt-0.5"
                  style={{ color }}
                >
                  {it.count}
                </span>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden ml-7"
                style={{ backgroundColor: "var(--color-border)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

// Pie chart uchun rang palitrasi (etarlicha kontrastli)
const PIE_COLORS = [
  "#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899",
  "#3b82f6", "#ef4444", "#14b8a6", "#a855f7", "#eab308",
];

// Active segment renderer — kattalashtirib ajratib ko'rsatadi
const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

const PieListChart: React.FC<{
  title: string;
  items: { value: string; count: number }[];
  icon?: React.ReactNode;
  iconColor?: string;
  limit?: number;
}> = ({ title, items, icon, iconColor, limit = 8 }) => {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  if (items.length === 0) return null;
  const top = items.slice(0, limit);
  const restTotal = items.slice(limit).reduce((a, b) => a + b.count, 0);
  const data = restTotal > 0
    ? [...top, { value: "Boshqalar", count: restTotal }]
    : top;
  const total = data.reduce((a, b) => a + b.count, 0);
  const chartData = data.map((it) => ({
    name: truncate(it.value, 40),
    value: it.count,
    percent: total > 0 ? Math.round((it.count / total) * 100) : 0,
  }));

  return (
    <Card>
      <h3 className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
        {icon && (
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${iconColor || "#06b6d4"}20`, color: iconColor || "#06b6d4" }}
          >
            {icon}
          </span>
        )}
        {title}
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 28 + 60)}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="40%"
            cy="50%"
            outerRadius={90}
            innerRadius={50}
            paddingAngle={2}
            label={({ percent }) => (percent > 5 ? `${percent}%` : "")}
            labelLine={false}
            activeIndex={activeIndex ?? undefined}
            activeShape={renderActiveShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {chartData.map((_, i) => (
              <Cell
                key={i}
                fill={PIE_COLORS[i % PIE_COLORS.length]}
                style={{
                  filter:
                    activeIndex === null || activeIndex === i
                      ? "none"
                      : "opacity(0.4)",
                  transition: "filter 0.2s",
                  cursor: "pointer",
                }}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--chart-tooltip-bg)",
              border: "1px solid var(--chart-tooltip-border)",
              borderRadius: 8,
              color: "var(--chart-tooltip-text)",
              fontSize: 12,
            }}
            itemStyle={{ color: "var(--chart-tooltip-text)" }}
            labelStyle={{ display: "none" }}
            separator=""
            formatter={(
              v: number,
              name: string,
              p: { payload?: { name?: string; percent?: number } }
            ) => [
              `${p.payload?.name ?? name}: ${v} (${p.payload?.percent ?? 0}%)`,
              "",
            ]}
          />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{ fontSize: 11, color: "var(--text-primary)", paddingLeft: 8 }}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            formatter={(val: string, _entry, i: number) => (
              <span
                style={{
                  color: "var(--text-primary)",
                  fontWeight: activeIndex === i ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                {val}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
};

// ─── Filter popover (Sotuv sahifa uslubida) ─────────────────────────────
type FilterTab = "region" | "gender" | "pipeline" | "source";

interface FilterPopoverProps {
  regions: string[];
  setRegions: (v: string[]) => void;
  genders: string[];
  setGenders: (v: string[]) => void;
  pipelineIds: string[];
  setPipelineIds: (v: string[]) => void;
  sourceIds: string[];
  setSourceIds: (v: string[]) => void;
  options: {
    regions: { value: string; count: number }[];
    pipelines: { id: number; name: string; count: number }[];
    sources: { id: string; name: string; count: number }[];
  };
}

const FilterPopover: React.FC<FilterPopoverProps> = ({
  regions, setRegions, genders, setGenders,
  pipelineIds, setPipelineIds, sourceIds, setSourceIds,
  options,
}) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<FilterTab>("region");
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const total = regions.length + genders.length + pipelineIds.length + sourceIds.length;

  const toggle = (arr: string[], setter: (v: string[]) => void, val: string) =>
    arr.includes(val) ? setter(arr.filter((x) => x !== val)) : setter([...arr, val]);

  const clearAll = () => {
    setRegions([]); setGenders([]); setPipelineIds([]); setSourceIds([]);
  };

  const matchSearch = (label: string) =>
    search.trim() === "" ? true : label.toLowerCase().includes(search.trim().toLowerCase());

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "region", label: "Viloyat", count: regions.length },
    { key: "gender", label: "Jins", count: genders.length },
    { key: "pipeline", label: "Voronka", count: pipelineIds.length },
    { key: "source", label: "Manba", count: sourceIds.length },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 h-10 rounded-lg text-sm font-medium transition-all border"
        style={{
          backgroundColor: total > 0 ? "#22c55e" : "transparent",
          color: total > 0 ? "#ffffff" : "var(--text-secondary)",
          borderColor: total > 0 ? "#22c55e" : "var(--color-border)",
        }}
        title="Filter"
      >
        <FilterIcon size={14} />
        <span>Filter</span>
        {total > 0 && (
          <span
            className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5"
            style={{
              backgroundColor: "rgba(255,255,255,0.3)",
              minWidth: 18,
              height: 16,
            }}
          >
            {total}
          </span>
        )}
      </button>

      {open && (
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
              onClick={() => setOpen(false)}
              className="p-1 rounded hover:opacity-70"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab switcher */}
          <div
            className="flex gap-1 px-3 py-2 border-b"
            style={{ borderColor: "var(--color-border)" }}
          >
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setSearch(""); }}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    backgroundColor: active ? "rgba(34,197,94,0.15)" : "transparent",
                    color: active ? "#22c55e" : "var(--text-secondary)",
                  }}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span
                      className="inline-flex items-center justify-center text-[9px] font-bold rounded-full px-1"
                      style={{
                        backgroundColor: active ? "#22c55e" : "rgba(255,255,255,0.15)",
                        color: active ? "#fff" : "var(--text-secondary)",
                        minWidth: 14,
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

          {/* Search (gender tabidan tashqari) */}
          {tab !== "gender" && (
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
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`${tabs.find((x) => x.key === tab)?.label} qidirish...`}
                  className="w-full h-8 pl-7 pr-2 rounded-md border text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  style={{
                    backgroundColor: "var(--color-card-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            </div>
          )}

          {/* List */}
          <div className="max-h-72 overflow-y-auto py-1">
            {tab === "region" &&
              options.regions
                .filter((r) => matchSearch(r.value))
                .map((r) => {
                  const active = regions.includes(r.value);
                  return (
                    <FilterRow
                      key={r.value}
                      active={active}
                      label={r.value}
                      count={r.count}
                      onClick={() => toggle(regions, setRegions, r.value)}
                    />
                  );
                })}

            {tab === "gender" && (
              <>
                <FilterRow
                  active={genders.includes("male")}
                  label="Erkak"
                  onClick={() => toggle(genders, setGenders, "male")}
                />
                <FilterRow
                  active={genders.includes("female")}
                  label="Ayol"
                  onClick={() => toggle(genders, setGenders, "female")}
                />
              </>
            )}

            {tab === "pipeline" &&
              options.pipelines
                .filter((p) => matchSearch(p.name))
                .map((p) => {
                  const id = String(p.id);
                  const active = pipelineIds.includes(id);
                  return (
                    <FilterRow
                      key={p.id}
                      active={active}
                      label={p.name}
                      count={p.count}
                      onClick={() => toggle(pipelineIds, setPipelineIds, id)}
                    />
                  );
                })}

            {tab === "source" &&
              options.sources
                .filter((s) => matchSearch(s.name))
                .map((s) => {
                  const active = sourceIds.includes(s.id);
                  return (
                    <FilterRow
                      key={s.id}
                      active={active}
                      label={s.name}
                      count={s.count}
                      onClick={() => toggle(sourceIds, setSourceIds, s.id)}
                    />
                  );
                })}

            {tab === "region" && options.regions.length === 0 && (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
                Viloyatlar topilmadi
              </div>
            )}
            {tab === "pipeline" && options.pipelines.length === 0 && (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
                Voronkalar topilmadi
              </div>
            )}
            {tab === "source" && options.sources.length === 0 && (
              <div className="py-8 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
                Manbalar topilmadi
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5 border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <button
              onClick={clearAll}
              disabled={total === 0}
              className="text-xs font-medium disabled:opacity-40"
              style={{ color: "var(--text-secondary)" }}
            >
              Hammasini tozalash
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ backgroundColor: "#22c55e", color: "#ffffff" }}
            >
              Qo'llash
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const FilterRow: React.FC<{
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}> = ({ active, label, count, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-white/5"
    style={{ color: "var(--text-primary)" }}
  >
    <span className="flex items-center gap-2 min-w-0">
      <span
        className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
        style={{
          backgroundColor: active ? "#22c55e" : "transparent",
          borderColor: active ? "#22c55e" : "var(--color-border)",
        }}
      >
        {active && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 5L4 8L9 2" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="truncate" title={label}>{label}</span>
    </span>
    {count !== undefined && (
      <span className="text-xs shrink-0" style={{ color: "var(--text-secondary)" }}>
        {count}
      </span>
    )}
  </button>
);

const ClientsPage: React.FC = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [genders, setGenders] = useState<string[]>([]);
  const [pipelineIds, setPipelineIds] = useState<string[]>([]);
  const [sourceIds, setSourceIds] = useState<string[]>([]);
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  const dateFrom =
    period === "custom" && range?.from ? toLocalDateStr(range.from) : "";
  const dateTo =
    period === "custom" && range?.to ? toLocalDateStr(range.to) : "";

  const { data: filters } = useQuery({
    queryKey: ["clients-filters"],
    queryFn: () => clientsService.filters(),
    staleTime: 5 * 60 * 1000,
  });

  // Multi-select: bir nechta qiymat comma-separated ko'rinishida yuboriladi.
  // Backend `regions=Toshkent,Samarqand` formatda IN-filter qiladi.
  const baseParams = {
    region: regions.length > 0 ? regions.join(",") : undefined,
    gender: genders.length > 0 ? genders.join(",") : undefined,
    pipelineId: pipelineIds.length > 0 ? pipelineIds.join(",") : undefined,
    sourceId: sourceIds.length > 0 ? sourceIds.join(",") : undefined,
    search: search || undefined,
    period: period !== "all" ? period : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };
  const insightsKey = ["clients-insights", baseParams];

  // 1) Aggregate (tez) — DB aggregation, AI yo'q
  const { data: insights, isLoading } = useQuery({
    queryKey: insightsKey,
    queryFn: () => clientsService.insights(baseParams),
    enabled: period !== "custom" || !!range?.from,
    staleTime: 30 * 60 * 1000, // 30 daqiqa
  });

  // 2) AI narrative (sekin) — alohida query, lazy. Aggregate kelganidan keyin boshlanadi.
  const { data: aiData, isLoading: aiLoading } = useQuery({
    queryKey: ["clients-insights-ai", baseParams],
    queryFn: () => clientsService.aiNarrative(baseParams),
    enabled: !!insights && insights.total > 0,
    staleTime: 24 * 60 * 60 * 1000, // 24 soat
  });
  const aiNarrative = aiData?.aiNarrative || insights?.aiNarrative || null;

  const formatRangeLabel = (): string => {
    if (!range?.from) return "Sana tanlang";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };

  const hasFilters = !!(regions.length || genders.length || pipelineIds.length || sourceIds.length || search || period !== "all");

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <UsersRound size={24} style={{ color: "#06b6d4" }} />
          Mijozlar portreti
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          AI qo'ng'iroq tahlili asosida — mijozlaringiz haqida umumlashtirilgan ma'lumot
        </p>
      </div>

      {/* Filter bar — sotuv style (period+calendar chap, Filter o'ng) */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Chap: period pills + calendar */}
          <div className="flex flex-wrap items-center gap-3">
          {/* Period pills */}
          <div
            className="inline-flex items-center h-10 gap-1 p-1 rounded-xl border"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
          >
            {([
              { key: "all" as PeriodFilter, label: "Barchasi" },
              { key: "month" as PeriodFilter, label: "Bu oy" },
              { key: "week" as PeriodFilter, label: "Bu hafta" },
              { key: "today" as PeriodFilter, label: "Bugun" },
            ]).map((btn) => {
              const active = period === btn.key;
              return (
                <button
                  key={btn.key}
                  onClick={() => {
                    setPeriod(btn.key);
                    setRange(undefined);
                  }}
                  className="h-full px-3 rounded-lg text-sm font-medium transition-all"
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
                className="h-full flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: period === "custom" ? "#22c55e" : "transparent",
                  color: period === "custom" ? "#ffffff" : "var(--text-secondary)",
                }}
                title="Sana oraliq tanlash"
              >
                <CalendarIcon size={15} />
                {period === "custom" && range?.from && (
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
                        setPeriod("all");
                        setCalendarOpen(false);
                      }}
                      className="text-xs font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Tozalash
                    </button>
                    <button
                      onClick={() => {
                        if (range?.from) {
                          if (!range.to) setRange({ from: range.from, to: range.from });
                          setPeriod("custom");
                          setCalendarOpen(false);
                        }
                      }}
                      disabled={!range?.from}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                      style={{ backgroundColor: "#22c55e", color: "#ffffff" }}
                    >
                      Qo'llash
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          </div>

          {/* O'ng: Unified Filter button + Tozalash */}
          <div className="flex items-center gap-3">
          <FilterPopover
            regions={regions}
            setRegions={setRegions}
            genders={genders}
            setGenders={setGenders}
            pipelineIds={pipelineIds}
            setPipelineIds={setPipelineIds}
            sourceIds={sourceIds}
            setSourceIds={setSourceIds}
            options={{
              regions: filters?.regions || [],
              pipelines: filters?.pipelines || [],
              sources: filters?.sources || [],
            }}
          />

          {hasFilters && (
            <button
              onClick={() => {
                setSearch("");
                setRegions([]);
                setGenders([]);
                setPipelineIds([]);
                setSourceIds([]);
                setPeriod("all");
                setRange(undefined);
              }}
              className="text-xs font-medium hover:underline flex items-center gap-1"
              style={{ color: "#ef4444" }}
            >
              <X size={14} /> Tozalash
            </button>
          )}
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" rounded="xl" />
          ))}
        </div>
      ) : !insights || insights.total === 0 ? (
        <Card>
          <div className="py-12 text-center" style={{ color: "var(--text-secondary)" }}>
            <UsersRound size={32} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Mijozlar topilmadi.</p>
            <p className="text-xs mt-1 opacity-70">
              Qo'ng'iroqlar tahlil qilingandan keyin mijoz profillari avtomatik to'ldiriladi.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<UsersRound size={16} />}
              label="Jami mijozlar"
              value={insights.total.toLocaleString("ru-RU")}
              hint={hasFilters ? "Tanlangan filter bo'yicha" : "Barcha mijozlar"}
              color="#06b6d4"
            />
            <StatCard
              icon={<User2 size={16} />}
              label="O'rtacha yosh"
              value={insights.avgAge != null ? `${insights.avgAge} yosh` : "—"}
              hint={
                insights.gender.male + insights.gender.female > 0
                  ? `${insights.gender.malePercent}% erkak · ${insights.gender.femalePercent}% ayol`
                  : undefined
              }
              color="#8b5cf6"
            />
            <StatCard
              icon={<Clock size={16} />}
              label="Qaror qabul qilish"
              value={insights.avgDecisionTimeDays != null ? `${insights.avgDecisionTimeDays} kun` : "—"}
              hint="O'rtacha vaqt"
              color="#f59e0b"
            />
            <StatCard
              icon={<Phone size={16} />}
              label="Qo'ng'iroq/mijoz"
              value={insights.avgCallsPerClient}
              hint="O'rtacha aloqa"
              color="#22c55e"
            />
          </div>

          {/* AI narrative — alohida loading, aggregate'ni bloklamaydi */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AiBlock
              icon={<Heart size={16} />}
              title="Qiziqishlari"
              insight={aiNarrative?.interests}
              color="#ec4899"
              loading={!aiNarrative && aiLoading}
              summaryLabel="Nimani xohlaydi"
              recommendationLabel="Nima taklif qilish"
            />
            <AiBlock
              icon={<ShieldAlert size={16} />}
              title="Qo'rquv va shubhalari"
              insight={aiNarrative?.fears}
              color="#ef4444"
              loading={!aiNarrative && aiLoading}
              summaryLabel="Asosiy xavotir"
              recommendationLabel="Qanday bartaraf etish"
            />
            <AiBlock
              icon={<HelpCircle size={16} />}
              title="Eng ko'p beradigan savollari"
              insight={aiNarrative?.questions}
              color="#3b82f6"
              loading={!aiNarrative && aiLoading}
              summaryLabel="Aniqlangan muammo"
              recommendationLabel="Yechim"
            />
            <AiBlock
              icon={<MessageCircle size={16} />}
              title="Eng ko'p keltiradigan e'tirozlari"
              insight={aiNarrative?.objections}
              color="#dc2626"
              loading={!aiNarrative && aiLoading}
              summaryLabel="Asosiy e'tiroz"
              recommendationLabel="Javob texnikasi"
              onClick={() => navigate("/knowledge/objections")}
              ctaLabel="E'tirozlar bazasi"
            />
            <div className="md:col-span-2">
              <AiBlock
                icon={<Clock size={16} />}
                title="Qaror qabul qilish vaqti"
                insight={aiNarrative?.decisionTime}
                color="#f59e0b"
                loading={!aiNarrative && aiLoading}
                summaryLabel="Xulosa"
                recommendationLabel="Follow-up strategiyasi"
              />
            </div>
          </div>

          {/* Pie chartlar — mijozlar portreti (2×2 grid) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PieListChart
              title="Qiziqishlar"
              items={insights.topInterests}
              icon={<Heart size={14} />}
              iconColor="#ec4899"
            />
            <PieListChart
              title="Qo'rquv va shubhalar"
              items={insights.topFears}
              icon={<ShieldAlert size={14} />}
              iconColor="#ef4444"
            />
            <PieListChart
              title="Asosiy e'tirozlar"
              items={insights.topObjections}
              icon={<MessageCircle size={14} />}
              iconColor="#dc2626"
            />
            {insights.topRegions.length > 0 && (
              <PieListChart
                title="Viloyat taqsimoti"
                items={insights.topRegions.map((r) => ({ value: r.value, count: r.count }))}
                icon={<MapPin size={14} />}
                iconColor="#06b6d4"
                limit={10}
              />
            )}
          </div>

        </>
      )}
    </div>
  );
};

export default ClientsPage;
