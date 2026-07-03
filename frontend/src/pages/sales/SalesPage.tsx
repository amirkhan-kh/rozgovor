import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../store/authStore";
import { useLeaderboardWS } from "../../hooks/useLeaderboardWS";
import { CelebrationOverlay } from "../../components/CelebrationOverlay";
import {
  Users,
  TrendingUp,
  Percent,
  Wallet,
  Clock,
  BarChart3,
  Trophy,
  User,
  Calendar as CalendarIcon,
  X,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Minus,
  Filter,
  Receipt,
  ClipboardList,
  ClipboardX,
  AlertTriangle,
  CalendarClock,
  Tv,
  Search,
  CircleDollarSign,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { salesService, SalesByManager } from "../../services/sales.service";
import { productsService } from "../../services/products.service";
import TvSalesView from "./TvSalesView";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";

const PIE_COLORS = [
  "#3b5ef5",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#a855f7",
];

const formatMoney = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} mlrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} mln`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return String(Math.round(n));
};

const formatDays = (days: number): string => {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours} soat`;
  }
  const whole = Math.floor(days);
  const frac = Math.round((days - whole) * 10);
  return frac > 0 ? `${whole}.${frac} kun` : `${whole} kun`;
};

const formatHoursOrDays = (hours: number): string => {
  if (hours <= 0) return "—";
  if (hours < 24) return `${Math.round(hours * 10) / 10} soat`;
  const days = hours / 24;
  const whole = Math.floor(days);
  const frac = Math.round((days - whole) * 10);
  return frac > 0 ? `${whole}.${frac} kun` : `${whole} kun`;
};

interface KpiDelta {
  current: number;
  previous: number;
  percent: number; // -100..+inf, -Infinity ixtiyoriy
  direction: "up" | "down" | "flat";
  hasPrevious: boolean;
}

const computeDelta = (current: number, previous: number): KpiDelta => {
  if (previous === 0 && current === 0) {
    return { current, previous, percent: 0, direction: "flat", hasPrevious: false };
  }
  if (previous === 0) {
    return {
      current,
      previous,
      percent: 100,
      direction: "up",
      hasPrevious: true,
    };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const absRound = Math.round(Math.abs(pct) * 10) / 10;
  const direction: "up" | "down" | "flat" =
    absRound < 0.1 ? "flat" : pct > 0 ? "up" : "down";
  return {
    current,
    previous,
    percent: Math.round(pct * 10) / 10,
    direction,
    hasPrevious: true,
  };
};

const DeltaBadge: React.FC<{ delta: KpiDelta; inverse?: boolean }> = ({
  delta,
  inverse = false,
}) => {
  if (!delta.hasPrevious) return null;

  // Oddiy ko'rsatkich uchun: up = good (yashil). inverse=true holat uchun (masalan
  // "sikl kuni"), up = bad (qizil).
  const isGood =
    delta.direction === "flat"
      ? null
      : inverse
      ? delta.direction === "down"
      : delta.direction === "up";

  const color =
    delta.direction === "flat"
      ? "#9ca3af"
      : isGood
      ? "#22c55e"
      : "#ef4444";

  const Icon =
    delta.direction === "up"
      ? ArrowUp
      : delta.direction === "down"
      ? ArrowDown
      : Minus;

  const pct = Math.abs(delta.percent);
  const pctStr = pct >= 100 ? `${Math.round(pct)}` : pct.toFixed(1);

  return (
    <div
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold"
      style={{
        backgroundColor: `${color}1a`,
        color,
      }}
    >
      <Icon size={11} strokeWidth={3} />
      <span>{pctStr}%</span>
    </div>
  );
};

interface KpiCardProps {
  label: React.ReactNode;
  value: string | number;
  suffix?: string;
  icon: React.ReactNode;
  gradient: string;
  accentColor: string;
  hint?: string;
  delta?: KpiDelta;
  deltaInverse?: boolean; // true = o'sish yomon (masalan, sikli)
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({
  label,
  value,
  suffix,
  icon,
  gradient,
  accentColor,
  hint,
  delta,
  deltaInverse,
  onClick,
}) => (
  <div
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl p-5 border transition-all ${
      onClick ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5" : ""
    }`}
    style={{
      backgroundColor: "var(--color-card-bg)",
      borderColor: "var(--color-border)",
    }}
  >
    {/* Gradient corner accent */}
    <div
      className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-2xl"
      style={{ background: gradient }}
    />
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)", opacity: 0.75 }}
        >
          {label}
        </p>
        <div className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap flex-wrap">
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
          {delta && <DeltaBadge delta={delta} inverse={deltaInverse} />}
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

interface ManagerLegendProps {
  m: SalesByManager;
  rank: number;
  color: string;
  isActive: boolean;
  onHover: (id: string | null) => void;
}

// ── Generic donut pie chart for breakdowns (lid status, otkaz sababi) ──
interface BreakdownPieProps {
  title: string;
  icon: React.ReactNode;
  accentColor: string;
  items: { name: string; count: number }[];
  emptyText?: string;
  maxSlices?: number;
  // true bo'lsa maxSlices'dan tashqari qolganlar "Boshqalar" ga yig'ilmaydi, tashlab yuboriladi
  hideOthers?: boolean;
}

const BreakdownPieChart: React.FC<BreakdownPieProps> = ({
  title,
  icon,
  accentColor,
  items,
  emptyText,
  maxSlices = 6,
  hideOthers = false,
}) => {
  const [active, setActive] = useState<number | null>(null);
  const sorted = [...items].sort((a, b) => b.count - a.count);
  const TOP = maxSlices;
  const top = sorted.slice(0, TOP);
  const restCount = sorted.slice(TOP).reduce((a, b) => a + b.count, 0);
  const data =
    !hideOthers && restCount > 0
      ? [...top, { name: "Boshqalar", count: restCount }]
      : top;
  const total = data.reduce((a, b) => a + b.count, 0);

  if (total === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
          >
            {icon}
          </div>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h3>
        </div>
        <div className="py-8 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
          {emptyText || "Ma'lumot yo'q"}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${accentColor}1a`, color: accentColor }}
        >
          {icon}
        </div>
        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
          {total.toLocaleString("ru-RU")} ta
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {/* Pie */}
        <div className="relative sm:col-span-2 min-h-[200px]">
          <ResponsiveContainer width="99%" height={200}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                stroke="none"
                startAngle={90}
                endAngle={-270}
                onMouseEnter={(_, i) => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={PIE_COLORS[i % PIE_COLORS.length]}
                    style={{
                      filter:
                        active === null || active === i ? "none" : "opacity(0.4)",
                      transition: "filter 0.2s",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              {active !== null ? (
                <>
                  <div
                    className="text-xs font-medium truncate max-w-[110px] mx-auto"
                    style={{ color: PIE_COLORS[active % PIE_COLORS.length] }}
                  >
                    {data[active].name}
                  </div>
                  <div
                    className="text-xl font-bold leading-none mt-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {((data[active].count / total) * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {data[active].count} ta
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold leading-none" style={{ color: "var(--text-primary)" }}>
                    {total.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    Jami
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Legend list — uzun bo'lsa scroll (rad etish 18+ sabab) */}
        <div className="sm:col-span-3 space-y-1 max-h-[230px] overflow-y-auto pr-1">
          {data.map((d, i) => {
            const pct = total > 0 ? (d.count / total) * 100 : 0;
            const color = PIE_COLORS[i % PIE_COLORS.length];
            return (
              <div
                key={d.name + i}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className="flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all"
                style={{
                  backgroundColor: active === i ? `${color}15` : "transparent",
                }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="text-xs truncate flex-1"
                  style={{ color: "var(--text-primary)" }}
                  title={d.name}
                >
                  {d.name}
                </span>
                <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                  {d.count}
                </span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "var(--text-secondary)", minWidth: 40, textAlign: "right" }}
                >
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

const ManagerLegendRow: React.FC<ManagerLegendProps> = ({
  m,
  rank,
  color,
  isActive,
  onHover,
}) => {
  const medalColor =
    m.salesCount > 0
      ? rank === 1
        ? "#f5c242"
        : rank === 2
        ? "#c0c0c0"
        : rank === 3
        ? "#cd7f32"
        : null
      : null;

  return (
    <div
      onMouseEnter={() => onHover(m.managerId)}
      onMouseLeave={() => onHover(null)}
      className="block rounded-lg p-2.5 border transition-all"
      style={{
        backgroundColor: isActive ? color : "var(--color-card-bg)",
        borderColor: isActive ? color : "var(--color-border)",
      }}
    >
      <div className="flex items-center gap-2.5">
        {/* Color dot */}
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />

        {/* Rank badge */}
        {medalColor ? (
          <Trophy size={14} style={{ color: medalColor }} className="flex-shrink-0" />
        ) : (
          <span
            className="text-[11px] font-bold w-4 text-center flex-shrink-0"
            style={{ color: isActive ? "rgba(255,255,255,0.9)" : "var(--text-secondary)" }}
          >
            {rank}
          </span>
        )}

        {/* Name + conv */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p
              className="font-semibold text-sm truncate"
              style={{ color: isActive ? "#ffffff" : "var(--text-primary)" }}
            >
              {m.managerName}
            </p>
            {m.previous && (
              <DeltaBadge
                delta={computeDelta(m.salesCount, m.previous.salesCount)}
              />
            )}
          </div>
          <p
            className="text-[11px] mt-0.5"
            style={{ color: isActive ? "rgba(255,255,255,0.85)" : "var(--text-secondary)" }}
          >
            {m.leadCount} lid · {m.qualifiedLeadCount} sifatli · {m.salesCount} sotuv · {m.conversionRate}%
          </p>
        </div>

        {/* Share + revenue */}
        <div className="text-right flex-shrink-0">
          <p
            className="font-bold text-sm"
            style={{ color: isActive ? "#ffffff" : color }}
          >
            {m.salesSharePercent}%
          </p>
          <p
            className="text-[11px] font-medium"
            style={{ color: isActive ? "rgba(255,255,255,0.9)" : "#22c55e" }}
          >
            {formatMoney(m.revenue)}
          </p>
          {m.previous && (
            <div className="mt-0.5 flex justify-end">
              <DeltaBadge
                delta={computeDelta(m.revenue, m.previous.revenue)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

type FilterKey = "today" | "week" | "month" | "custom";

type FilterTab = "pipeline" | "manager" | "source" | "product";

interface SalesPageProps {
  forceManagerIds?: string[];
  embedded?: boolean;
}

const SalesPage: React.FC<SalesPageProps> = ({ forceManagerIds, embedded }) => {
  const [filter, setFilter] = useState<FilterKey>("month");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>("pipeline");
  const [selectedPipelines, setSelectedPipelines] = useState<number[]>([]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const effectiveManagers = forceManagerIds && forceManagerIds.length > 0 ? forceManagerIds : selectedManagers;
  const [filterSearch, setFilterSearch] = useState("");
  const [tvMode, setTvMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<{ videoPath: string } | null>(null);

  const navigate = useNavigate();
  const { user, managerUser } = useAuth();
  const companyId = user?.id ?? (managerUser as any)?.companyId;

  // KPI cardlardan lid ro'yxati sahifasiga o'tish — joriy filterlar bilan
  const navigateToLeads = (kind: "lid" | "qualified" | "sotuv") => {
    const qs = new URLSearchParams();
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v != null && v !== "") qs.set(k, String(v));
    });
    navigate(`/sales/leads/${kind}?${qs.toString()}`);
  };

  // Zadach KPI cardlardan task ro'yxatiga o'tish
  const navigateToTasks = (kind: "total" | "overdue" | "today" | "noTask") => {
    const qs = new URLSearchParams();
    Object.entries(queryParams).forEach(([k, v]) => {
      if (v != null && v !== "") qs.set(k, String(v));
    });
    navigate(`/sales/tasks/${kind}?${qs.toString()}`);
  };

  const handleSale = useCallback((e: { videoUrl: string }) => {
    setCelebration({ videoPath: e.videoUrl });
  }, []);

  // Celebration endi global (MainLayout → CelebrationProvider). Bu yerda
  // o'chirilgan — aks holda TV rejimda video ikki marta chiqadi.
  useLeaderboardWS(companyId, handleSale, false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const popoverRefTv = useRef<HTMLDivElement | null>(null);
  const filterRefTv = useRef<HTMLDivElement | null>(null);

  // Tashqariga bosilganda kalendar yopiladi (normal + TV)
  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const inMain = popoverRef.current?.contains(t);
      const inTv = popoverRefTv.current?.contains(t);
      if (!inMain && !inTv) setCalendarOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  // Filter popover tashqariga bosish (normal + TV)
  useEffect(() => {
    if (!filterOpen) {
      setFilterSearch("");
      return;
    }
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const inMain = filterRef.current?.contains(t);
      const inTv = filterRefTv.current?.contains(t);
      if (!inMain && !inTv) setFilterOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  // Tab almashtirilganda search tozalanadi
  useEffect(() => {
    setFilterSearch("");
  }, [filterTab]);

  // Voronkalarni yuklash
  const { data: pipelines } = useQuery({
    queryKey: ["sales-pipelines"],
    queryFn: () => salesService.getPipelines(),
    staleTime: 5 * 60 * 1000,
  });

  // Manbalarni yuklash (Истовчник)
  const { data: sources } = useQuery({
    queryKey: ["sales-sources"],
    queryFn: () => salesService.getSources(),
    staleTime: 5 * 60 * 1000,
  });

  // Mahsulotlar — filter uchun
  const { data: productsData } = useQuery({
    queryKey: ["sales-products"],
    queryFn: () => productsService.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Local date sifatida formatlash (Tashkent) — UTCga o'tkazib noto'g'ri kunga tushmasin
  const toLocalDateStr = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const queryParams: {
    period: string;
    dateFrom?: string;
    dateTo?: string;
    pipelineIds?: string;
    managerIds?: string;
    sourceIds?: string;
    productIds?: string;
  } = {
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
    ...(effectiveManagers.length > 0
      ? { managerIds: effectiveManagers.join(",") }
      : {}),
    ...(selectedSources.length > 0
      ? { sourceIds: selectedSources.join(",") }
      : {}),
    ...(selectedProducts.length > 0
      ? { productIds: selectedProducts.join(",") }
      : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["sales-overview", queryParams],
    queryFn: () => salesService.getOverview(queryParams),
    enabled: filter !== "custom" || !!(range?.from && range?.to),
    refetchInterval: false, // WS orqali real-time yangilanadi
  });

  // Kelishilgan to'lov modal
  const [agreedModalOpen, setAgreedModalOpen] = useState(false);
  const { data: agreedData, isLoading: agreedLoading } = useQuery({
    queryKey: ["sales-kelishilgan-tolov", queryParams],
    queryFn: () => salesService.getKelishilganTolov(queryParams),
    enabled: filter !== "custom" || !!(range?.from && range?.to),
  });

  // TV rejim: ESC chiqish + browser fullscreen + body scroll lock
  useEffect(() => {
    if (!tvMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTvMode(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [tvMode]);

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

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const totalFiltersApplied =
    selectedPipelines.length + selectedManagers.length + selectedSources.length + selectedProducts.length;

  // Zadach statistikasi — filterlar bilan birga yangilanadi
  const { data: taskStats, isLoading: taskStatsLoading } = useQuery({
    queryKey: ["sales-task-stats", queryParams],
    queryFn: () => salesService.getTaskStats(queryParams),
    refetchInterval: 60_000, // 1 daqiqada bir marta yangilanadi
  });

  const applyRange = () => {
    if (!range?.from) return;
    // Faqat "from" tanlangan bo'lsa — bir kun sifatida olamiz
    if (!range.to) setRange({ from: range.from, to: range.from });
    setFilter("custom");
    setCalendarOpen(false);
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

  // Pie chart uchun: sotuvi bor menejerlar (sotuv ulushi mantiqan faqat sotuvchilar)
  const pieManagers = (data?.byManager || []).filter((m) => m.salesCount > 0);
  const pieData = pieManagers.map((m, i) => ({
    id: m.managerId,
    name: m.managerName,
    value: m.salesCount,
    revenue: m.revenue,
    share: m.salesSharePercent,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
  const activeIdx = activeId ? pieData.findIndex((d) => d.id === activeId) : -1;

  // Legend/ro'yxat uchun: BARCHA menejer (to'liq statistika bilan).
  // Saralash: sotuvchilar tepada (sotuv → tushum), keyin lidi ko'plar.
  const pieColorById = new Map(pieData.map((d) => [d.id, d.color]));
  const NEUTRAL_DOT = "#6b7280";
  const legendManagers = [...(data?.byManager || [])].sort(
    (a, b) =>
      b.salesCount - a.salesCount ||
      b.revenue - a.revenue ||
      b.leadCount - a.leadCount
  );

  return (
    <div className={embedded ? "space-y-5" : "px-4 md:px-6 py-4 space-y-5 max-w-7xl mx-auto"}>
      {/* ── Header + filter ───────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {embedded ? <div /> : (
        <div>
          <h1
            className="text-2xl font-bold flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <TrendingUp size={24} style={{ color: "#22c55e" }} />
            Sotuv
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Savdo statistikasi va menejerlar bo'yicha sotuv ko'rsatkichlari
          </p>
        </div>
        )}

        {/* Filter pills: Bugun / Bu hafta / Bu oy / Calendar */}
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
          }}
        >
          {([
            { key: "month", label: "Bu oy" },
            { key: "week", label: "Bu hafta" },
            { key: "today", label: "Bugun" },
          ] as { key: FilterKey; label: string }[]).map((btn) => {
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
                  backgroundColor: active ? "#22c55e" : "transparent",
                  color: active ? "#ffffff" : "var(--text-secondary)",
                }}
              >
                {btn.label}
              </button>
            );
          })}

          {/* Divider */}
          <div
            className="w-px self-stretch mx-1"
            style={{ backgroundColor: "var(--color-border)" }}
          />

          {/* Calendar button + popover */}
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setCalendarOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: filter === "custom" ? "#22c55e" : "transparent",
                color: filter === "custom" ? "#ffffff" : "var(--text-secondary)",
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
                {/* Header */}
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

                {/* Footer */}
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
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                    style={{
                      backgroundColor: "#22c55e",
                      color: "#ffffff",
                    }}
                  >
                    Qo'llash
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div
            className="w-px self-stretch mx-1"
            style={{ backgroundColor: "var(--color-border)" }}
          />

          {/* Kombinatsiya Filter tugmasi */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor:
                  totalFiltersApplied > 0 ? "#22c55e" : "transparent",
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
                  width: 320,
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

                {/* Tab switcher */}
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
                      key: "product" as FilterTab,
                      label: "Mahsulot",
                      count: selectedProducts.length,
                    },
                  ]).map((tab) => {
                    const active = filterTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setFilterTab(tab.key)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                          backgroundColor: active
                            ? "rgba(34,197,94,0.15)"
                            : "transparent",
                          color: active ? "#22c55e" : "var(--text-secondary)",
                        }}
                      >
                        {tab.label}
                        {tab.count > 0 && (
                          <span
                            className="inline-flex items-center justify-center text-[9px] font-bold rounded-full px-1.5"
                            style={{
                              backgroundColor: active
                                ? "#22c55e"
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

                {/* Search — manager tabi dept filter o'zi search bilan keladi, shuning uchun uni ko'rsatmaymiz */}
                {filterTab !== "manager" && (
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
                          filterTab === "pipeline" ? "Voronka" : filterTab === "source" ? "Manba" : "Mahsulot"
                        } qidirish...`}
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

                {/* Manager tabi — dept tree bilan alohida */}
                {filterTab === "manager" && (
                  <ManagerDeptFilter
                    selectedManagerIds={selectedManagers}
                    onChange={setSelectedManagers}
                    accentColor="#22c55e"
                    maxHeight={288}
                    fallbackManagers={(data?.byManager || []).map((m) => ({
                      id: m.managerId,
                      name: m.managerName,
                    }))}
                  />
                )}

                {/* Pipeline/Source list */}
                <div
                  className="max-h-72 overflow-y-auto py-1"
                  style={{
                    display: filterTab === "manager" ? "none" : undefined,
                  }}
                >
                  {filterTab === "pipeline" &&
                    (pipelines ?? [])
                      .filter((p) =>
                        filterSearch.trim() === ""
                          ? true
                          : p.name.toLowerCase().includes(filterSearch.trim().toLowerCase())
                      )
                      .map((p) => {
                      const active = selectedPipelines.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePipeline(p.id)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-white/5"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                              style={{
                                backgroundColor: active ? "#22c55e" : "transparent",
                                borderColor: active
                                  ? "#22c55e"
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
                          : s.name.toLowerCase().includes(filterSearch.trim().toLowerCase())
                      )
                      .map((s) => {
                      const active = selectedSources.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleSource(s.id)}
                          className="w-full flex items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors hover:bg-white/5"
                          style={{ color: "var(--text-primary)" }}
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span
                              className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
                              style={{
                                backgroundColor: active ? "#22c55e" : "transparent",
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

                  {filterTab === "source" && (!sources || sources.length === 0) && (
                    <div
                      className="py-8 text-center text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Manbalar topilmadi
                    </div>
                  )}

                  {filterTab === "product" &&
                    (productsData ?? [])
                      .filter((p) =>
                        filterSearch.trim() === ""
                          ? true
                          : p.name.toLowerCase().includes(filterSearch.trim().toLowerCase()),
                      )
                      .map((p) => {
                        const active = selectedProducts.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => toggleProduct(p.id)}
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
                              <span className="truncate" title={p.name}>
                                {p.name}
                              </span>
                            </span>
                            <span
                              className="text-xs shrink-0"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {p._count.salesLeads}
                            </span>
                          </button>
                        );
                      })}

                  {filterTab === "product" && (!productsData || productsData.length === 0) && (
                    <div
                      className="py-8 text-center text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Mahsulotlar topilmadi
                    </div>
                  )}
                </div>

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
                      setSelectedProducts([]);
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

          {/* Divider */}
          <div
            className="w-px self-stretch mx-1"
            style={{ backgroundColor: "var(--color-border)" }}
          />

          {/* TV rejim tugmasi */}
          <button
            onClick={() => setTvMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
            }}
            title="TV rejim — to'liq ekran, 30s avto-yangilanish"
          >
            <Tv size={16} />
            <span className="hidden sm:inline">TV rejim</span>
          </button>
        </div>
      </div>

      {/* ── KPI kartalar (4 top + 3 bottom, har qator alohida grid) ─── */}
      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28" rounded="xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[5, 6, 7].map((i) => (
              <Skeleton key={i} className="h-28" rounded="xl" />
            ))}
          </div>
        </div>
      ) : data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Lid soni — clickable */}
          <KpiCard
            label="Lid soni"
            value={data.kpis.leadCount.toLocaleString("ru-RU")}
            suffix="ta"
            icon={<Users size={20} />}
            gradient="linear-gradient(135deg, #3b5ef5, #6366f1)"
            accentColor="#3b5ef5"
            hint="Davrda tushgan barcha leadlar"
            delta={
              data.previousKpis
                ? computeDelta(data.kpis.leadCount, data.previousKpis.leadCount)
                : undefined
            }
            onClick={() => navigateToLeads("lid")}
          />
          {/* 2. Sifatli lid soni — clickable */}
          <KpiCard
            label="Sifatli lid"
            value={data.kpis.qualifiedLeadCount.toLocaleString("ru-RU")}
            suffix="ta"
            icon={<Filter size={20} />}
            gradient="linear-gradient(135deg, #06b6d4, #0ea5e9)"
            accentColor="#06b6d4"
            hint={
              data.kpiFromLeads
                ? `${data.kpis.qualifiedLeadRate}% — sifatsizdan tozalangan`
                : `${data.kpis.qualifiedLeadRate}% — deal'ga o'tganlar`
            }
            delta={
              data.previousKpis
                ? computeDelta(
                    data.kpis.qualifiedLeadCount,
                    data.previousKpis.qualifiedLeadCount
                  )
                : undefined
            }
            onClick={() => navigateToLeads("qualified")}
          />
          {/* 3. Konversiya — sotuv / kval */}
          <KpiCard
            label="Konversiya"
            value={data.kpis.conversionRate}
            suffix="%"
            icon={<Percent size={20} />}
            gradient="linear-gradient(135deg, #8b5cf6, #ec4899)"
            accentColor="#8b5cf6"
            hint={
              data.kpiFromLeads
                ? `Sifatli liddan to'lovga o'tish`
                : `${data.kpis.salesCount} sotuv / ${data.kpis.qualifiedLeadCount} sifatli lid`
            }
            delta={
              data.previousKpis
                ? computeDelta(data.kpis.conversionRate, data.previousKpis.conversionRate)
                : undefined
            }
          />
          {/* 4. Kelishilgan to'lov (clickable — lidlar ro'yxatini modalda ochadi) */}
          <KpiCard
            label="Kelishilgan to'lov"
            value={(agreedData?.count ?? 0).toLocaleString("ru-RU")}
            suffix="ta"
            icon={<CircleDollarSign size={20} />}
            gradient="linear-gradient(135deg, #0ea5e9, #06b6d4)"
            accentColor="#0ea5e9"
            hint={
              agreedData
                ? `${formatMoney(agreedData.amount)} UZS · tafsilot →`
                : "Yuklanmoqda..."
            }
            onClick={() => setAgreedModalOpen(true)}
          />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 5. Sotuv — clickable */}
          <KpiCard
            label="Sotuv"
            value={data.kpis.salesCount.toLocaleString("ru-RU")}
            suffix="ta"
            icon={<TrendingUp size={20} />}
            gradient="linear-gradient(135deg, #22c55e, #10b981)"
            accentColor="#22c55e"
            hint={
              data.kpiFromLeads
                ? "To'lov qilgan kandidatlar"
                : (data.kpis.partialPaymentCount ?? 0) > 0
                ? `${data.kpis.partialPaymentCount} tasi qisman to'lov`
                : "To'liq + qisman to'lov"
            }
            delta={
              data.previousKpis
                ? computeDelta(data.kpis.salesCount, data.previousKpis.salesCount)
                : undefined
            }
            onClick={() => navigateToLeads("sotuv")}
          />
          {/* 6. Umumiy tushum */}
          <KpiCard
            label="Umumiy tushum"
            value={formatMoney(data.kpis.totalRevenue)}
            suffix="UZS"
            icon={<Wallet size={20} />}
            gradient="linear-gradient(135deg, #f59e0b, #ef4444)"
            accentColor="#f59e0b"
            hint="Jami kelgan daromad"
            delta={
              data.previousKpis
                ? computeDelta(data.kpis.totalRevenue, data.previousKpis.totalRevenue)
                : undefined
            }
          />
          {/* 7. O'rtacha chek */}
          <KpiCard
            label="O'rtacha chek"
            value={formatMoney(data.kpis.avgCheck)}
            suffix="UZS"
            icon={<Receipt size={20} />}
            gradient="linear-gradient(135deg, #14b8a6, #0ea5e9)"
            accentColor="#14b8a6"
            hint="Bitta sotuvdagi o'rtacha summa"
            delta={
              data.previousKpis
                ? computeDelta(data.kpis.avgCheck, data.previousKpis.avgCheck)
                : undefined
            }
          />
          </div>
        </div>
      ) : null}

      {/* ── Sotuv sikli + Aloqaga chiqish (yonma-yon) ─── */}
      <div className="grid grid-cols-1 gap-4">
        {/* Sotuv sikli */}
        <Card>
          <div className="flex justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(6, 182, 212, 0.15)", color: "#06b6d4" }}
              >
                <Clock size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                  Sotuv sikli
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Liddan sotuvgacha o'rtacha vaqt
                </p>
              </div>
            </div>

            {isLoading ? (
              <Skeleton className="h-16 w-40" rounded="xl" />
            ) : data ? (
              <div className="flex items-end gap-5 ">
                <div >
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    O'rtacha
                  </p>
                  <p className="text-2xl font-bold" style={{ color: "#06b6d4" }}>
                    {formatDays(data.cycle.avgDays)}
                  </p>
                </div>
                <div
                  className="pl-4 border-l"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    Hisoblangan sotuv
                  </p>
                  <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                    {data.cycle.sampleCount} ta
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {/* Aloqaga chiqish — Mahalliy | Chet el raqami (faqat javob berilgan qo'ng'iroqlar) */}
        <Card className="flex justify-between">
          <div className="flex  items-center gap-3 mb-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(20, 184, 166, 0.15)", color: "#14b8a6" }}
            >
              <Clock size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                Aloqaga chiqish
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Lid yaratilgandan birinchi javob berilgan aloqagacha
              </p>
            </div>
          </div>

          {isLoading ? (
            <Skeleton className="h-20" rounded="xl" />
          ) : data?.timeToContact ? (
            <div className="flex  gap-10 flex-wrap">
              {/* ── Mahalliy raqamlar (O'ZGARMAYDI): Umumiy \u00B7 Ish vaqti \u00B7 Lidlar ── */}
              {(() => {
                const s = data.timeToContact.local;
                const contacted = s.contactedLeadsCount > 0;
                return (
                  <div>
                    <p
                      className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Mahalliy raqamlar
                    </p>
                    <div className="flex items-end gap-6 flex-wrap">
                      <div className=" min-w-[52px]">
                        <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                          Umumiy
                        </p>
                        <p className="text-lg font-bold leading-tight" style={{ color: "#14b8a6" }}>
                          {contacted ? formatHoursOrDays(s.avgHours) : "\u00A0"}
                        </p>
                      </div>
                      <div
                        className=" pl-3 border-l min-w-[52px]"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                          Ish vaqti
                        </p>
                        <p className="text-lg font-bold leading-tight" style={{ color: "#14b8a6" }}>
                          {contacted ? formatHoursOrDays(s.avgWorkHours) : "\u00A0"}
                        </p>
                      </div>
                      <div className=" pl-3 border-l" style={{ borderColor: "var(--color-border)" }}>
                        <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                          Lidlar
                        </p>
                        <p className="text-base font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                          {s.totalLeadsCount} ta
                        </p>
                        <p className="text-[9px]" style={{ color: "var(--text-secondary)" }}>
                          {s.contactedLeadsCount} aloqaga chiqilgan
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Chet el raqamlari: Lidlar 1-chi; Umumiy/Ish vaqti FAQAT data kelsa ── */}
              {data.timeToContact.foreign &&
                (() => {
                  const s = data.timeToContact.foreign!;
                  const contacted = s.contactedLeadsCount > 0;
                  return (
                    <div>
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Chet el raqamlari
                      </p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div >
                          <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                            Lidlar
                          </p>
                          <p className="text-base font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                            {s.totalLeadsCount} ta
                          </p>
                          <p className="text-[9px]" style={{ color: "var(--text-secondary)" }}>
                            {s.contactedLeadsCount} aloqaga chiqilgan
                          </p>
                        </div>
                        {contacted && (
                          <>
                            <div
                              className="text-center pl-3 border-l min-w-[52px]"
                              style={{ borderColor: "var(--color-border)" }}
                            >
                              <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                                Umumiy
                              </p>
                              <p className="text-lg font-bold leading-tight" style={{ color: "#14b8a6" }}>
                                {formatHoursOrDays(s.avgHours)}
                              </p>
                            </div>
                            <div
                              className="text-center pl-3 border-l min-w-[52px]"
                              style={{ borderColor: "var(--color-border)" }}
                            >
                              <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                                Ish vaqti
                              </p>
                              <p className="text-lg font-bold leading-tight" style={{ color: "#14b8a6" }}>
                                {formatHoursOrDays(s.avgWorkHours)}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
            </div>
          ) : null}
        </Card>
      </div>

      {/* ── Savdo statistikasi: Menejerlar sotuv foizi ──────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <BarChart3 size={18} style={{ color: "#3b5ef5" }} />
          <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            Savdo statistikasi — Menejerlar bo'yicha
          </h2>
        </div>

        {isLoading ? (
          <Skeleton className="h-80" rounded="xl" />
        ) : !data || legendManagers.length === 0 ? (
          <Card>
            <div className="py-12 text-center">
              <User
                size={32}
                className="mx-auto mb-2 opacity-40"
                style={{ color: "var(--text-secondary)" }}
              />
              <p style={{ color: "var(--text-secondary)" }}>
                Bu davrda menejerlar yo'q
              </p>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ─── Pie chart ─── */}
              <div className="relative">
                <ResponsiveContainer width="99%" height={320}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={115}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      onMouseEnter={(_, i) => setActiveId(pieData[i]?.id ?? null)}
                      onMouseLeave={() => setActiveId(null)}
                    >
                      {pieData.map((d, i) => (
                        <Cell
                          key={d.id}
                          fill={d.color}
                          style={{
                            filter: activeIdx === -1 || activeIdx === i
                              ? "none"
                              : "opacity(0.4)",
                            transition: "filter 0.2s",
                            cursor: "pointer",
                          }}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                {/* Center label */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    {activeIdx >= 0 ? (
                      <>
                        <div
                          className="text-xs font-medium mb-1 max-w-[140px] truncate mx-auto"
                          style={{ color: pieData[activeIdx].color }}
                        >
                          {pieData[activeIdx].name}
                        </div>
                        <div
                          className="text-3xl font-bold leading-none"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {pieData[activeIdx].share}%
                        </div>
                        <div
                          className="text-[11px] mt-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {pieData[activeIdx].value} sotuv
                        </div>
                      </>
                    ) : (
                      <>
                        <div
                          className="text-4xl font-bold leading-none"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {data.kpis.salesCount}
                        </div>
                        <div
                          className="text-xs mt-1.5 font-medium"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Jami sotuv
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ─── Legend/list — BARCHA menejer (to'liq statistika) ─── */}
              <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                {legendManagers.map((m, idx) => (
                  <ManagerLegendRow
                    key={m.managerId}
                    m={m}
                    rank={idx + 1}
                    color={pieColorById.get(m.managerId) || NEUTRAL_DOT}
                    isActive={activeId === m.managerId}
                    onHover={setActiveId}
                  />
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* ── Rad etish + Qayta ishlov berish sabablari (2 qism) ─── */}
      {data &&
        (data.rejectionBreakdown.length > 0 ||
          data.reprocessBreakdown.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.rejectionBreakdown.length > 0 && (
              <BreakdownPieChart
                title="Rad etish sabablari"
                icon={<X size={16} />}
                accentColor="#ef4444"
                items={data.rejectionBreakdown}
                emptyText="Davrda rad etilgan lid yo'q"
                maxSlices={4}
              />
            )}
            {data.reprocessBreakdown.length > 0 && (
              <BreakdownPieChart
                title="Qayta ishlov berish sabablari"
                icon={<RotateCcw size={16} />}
                accentColor="#f59e0b"
                items={data.reprocessBreakdown.filter(
                  (r) => r.name.trim().toLowerCase() !== "boshqa"
                )}
                emptyText="Davrda qayta ishlov berilgan lid yo'q"
                maxSlices={6}
                hideOthers
              />
            )}
          </div>
        )}

      {/* ── Zadach statistikasi (joriy holat) ─────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3 px-1">
          <ClipboardList size={18} style={{ color: "#8b5cf6" }} />
          <h2
            className="text-base font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Zadach statistikasi
          </h2>
          <span
            className="text-xs ml-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Joriy holat
          </span>
        </div>

        {taskStatsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28" rounded="xl" />
            ))}
          </div>
        ) : taskStats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Bugungi umumiy zadacha"
              value={taskStats.totalOpen.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<ClipboardList size={20} />}
              gradient="linear-gradient(135deg, #8b5cf6, #6366f1)"
              accentColor="#8b5cf6"
              hint="Bugun bajarilishi kerak bo'lgan barcha aktivliklar"
              onClick={() => navigateToTasks("total")}
            />
            <KpiCard
              label="Bez zadach"
              value={taskStats.dealsWithoutTask.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<ClipboardX size={20} />}
              gradient="linear-gradient(135deg, #64748b, #475569)"
              accentColor="#64748b"
              hint={`${taskStats.openDeals} ochiq dealdan`}
              onClick={() => navigateToTasks("noTask")}
            />
            <KpiCard
              label="Prosrochenniy"
              value={taskStats.overdue.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<AlertTriangle size={20} />}
              gradient="linear-gradient(135deg, #ef4444, #f97316)"
              accentColor="#ef4444"
              hint="Muddati o'tib ketgan"
              onClick={() => navigateToTasks("overdue")}
            />
            <KpiCard
              label="Bugungi zadachi"
              value={taskStats.today.toLocaleString("ru-RU")}
              suffix="ta"
              icon={<CalendarClock size={20} />}
              gradient="linear-gradient(135deg, #f59e0b, #ec4899)"
              accentColor="#f59e0b"
              hint="Bugun muddatda bajarilishi kerak"
              onClick={() => navigateToTasks("today")}
            />
          </div>
        ) : (
          <Card>
            <div
              className="py-8 text-center text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Bitrix'dan zadach statistikasi olinmadi
            </div>
          </Card>
        )}
      </div>

      {tvMode && data && (
        <TvSalesView
          data={data}
          taskStats={taskStats}
          filter={filter}
          onFilterChange={(f) => {
            setFilter(f);
            setRange(undefined);
          }}
          pieData={pieData}
          pieManagers={pieManagers}
          activeId={activeId}
          setActiveId={setActiveId}
          onExit={() => setTvMode(false)}
        />
      )}

      {tvMode && celebration && (
        <CelebrationOverlay
          videoPath={celebration.videoPath}
          onEnd={() => setCelebration(null)}
        />
      )}

      {/* Kelishilgan to'lov — detallarni ko'rsatuvchi modal */}
      {agreedModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.55)", marginTop: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setAgreedModalOpen(false);
          }}
        >
          <div
            className="rounded-2xl shadow-2xl border overflow-hidden w-full flex flex-col"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
              maxWidth: 820,
              maxHeight: "85vh",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: "var(--color-border)" }}
            >
              <div className="flex items-center gap-2">
                <CircleDollarSign size={18} style={{ color: "#0ea5e9" }} />
                <h3
                  className="text-base font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Kelishilgan to'lov — {(agreedData?.count ?? 0).toLocaleString("ru-RU")} ta
                </h3>
                {agreedData && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "rgba(14,165,233,0.15)",
                      color: "#0ea5e9",
                    }}
                  >
                    {formatMoney(agreedData.amount)} UZS
                  </span>
                )}
              </div>
              <button
                onClick={() => setAgreedModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/5"
                style={{ color: "var(--text-secondary)" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {agreedLoading ? (
                <div className="p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                  Yuklanmoqda...
                </div>
              ) : !agreedData || agreedData.deals.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
                  Bu davrda kelishilgan to'lov lidlari yo'q
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr
                      className="text-left"
                      style={{
                        backgroundColor: "var(--ds-bg-overlay)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <th className="px-4 py-3 font-medium">Lid</th>
                      <th className="px-4 py-3 font-medium">Menejer</th>
                      <th className="px-4 py-3 font-medium">Voronka</th>
                      <th className="px-4 py-3 font-medium">Kelishilgan sana</th>
                      <th className="px-4 py-3 font-medium text-right">Summa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agreedData.deals.map((d) => (
                      <tr
                        key={d.id}
                        className="border-t"
                        style={{ borderColor: "var(--color-border)" }}
                      >
                        <td className="px-4 py-2.5" style={{ color: "var(--text-primary)" }}>
                          {d.title || `#${d.id}`}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                          {d.manager || "—"}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                          {d.pipelineName || "—"}
                        </td>
                        <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>
                          {new Date(d.agreedPaymentDate).toLocaleDateString("uz-UZ")}
                        </td>
                        <td
                          className="px-4 py-2.5 text-right font-semibold"
                          style={{ color: "#0ea5e9" }}
                        >
                          {formatMoney(d.price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesPage;
