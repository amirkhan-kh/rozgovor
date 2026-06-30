import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import {
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  Phone,
  Timer,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import CustomSelect from "../../components/ui/CustomSelect";
import ManagerDeptFilterTrigger from "../../components/filters/ManagerDeptFilterTrigger";
import { SkeletonDashboard } from "../../components/ui/Skeleton";
import {
  dashboardService,
  DashboardFilters,
  CriteriaData,
  ErrorData,
  ErrorItem,
  ErrorSummaryEntry,
  ObjectionData,
  WinLossData,
  CallsTrendData,
  SpeechRatioData,
  CategoryStatsData,
  SalesStatsData,
} from "../../services/dashboard.service";
import { managersService } from "../../services/managers.service";
import { DashboardStats } from "../../types";

/* ---- Constants ---- */

const ACCENT = "#3b5ef5";
const MANAGER_A_COLOR = "#3b5ef5";
const MANAGER_B_COLOR = "#2fcc6e";

const CHART_COLORS = ["#3b5ef5", "#2fcc6e", "#e6a020", "#e64545", "#9333ea", "#ec4899", "#06b6d4"];

const tooltipStyle = {
  contentStyle: {
    background: "var(--chart-tooltip-bg, #1a1a2e)",
    border: "1px solid var(--chart-tooltip-border, #2d2d4e)",
    borderRadius: "10px",
    color: "var(--chart-tooltip-text, #fff)",
    fontSize: "12px",
  },
  itemStyle: { color: "var(--chart-tooltip-text, #fff)" },
  labelStyle: { color: "#9ca3af" },
};

const periodOptions = [
  { value: "today", label: "Bugun" },
  { value: "yesterday", label: "Kecha" },
  { value: "week", label: "Bu hafta" },
  { value: "month", label: "Bu oy" },
  { value: "quarter", label: "Bu chorak" },
  { value: "year", label: "Bu yil" },
  { value: "custom", label: "Boshqa" },
];

const categoryOptions = [
  { value: "", label: "Barchasi" },
  { value: "sotuv", label: "1-Qo'ng'iroq" },
  { value: "qayta", label: "Qayta qo'ng'iroq" },
  { value: "boshqa", label: "Boshqa" },
];

/* ---- Helpers ---- */

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatTotalDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const scoreColor = (score: number): string => {
  if (score >= 80) return "#2fcc6e";
  if (score >= 60) return "#e6a020";
  if (score >= 40) return "#d97706";
  return "#e64545";
};

const timeToSeconds = (ts: string): number => {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const formatTimestamp = (ts: string): string => {
  if (!ts) return "—";
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(ts)) return ts;
  if (/^\d{1,2}:\d{2}$/.test(ts)) {
    const [m, s] = ts.split(":");
    return `${m.padStart(2, "0")}:${s}`;
  }
  if (/^\d+$/.test(ts)) {
    const totalSeconds = parseInt(ts, 10);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return ts;
};

/* ---- Section Header ---- */

const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle,
}) => (
  <div className="mb-4 mt-2">
    <h2 className="text-lg font-bold text-white">{title}</h2>
    {subtitle && <p className="text-sm text-secondary mt-0.5">{subtitle}</p>}
  </div>
);

/* ---- Column wrapper ---- */

const CompareGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{children}</div>
);

const ManagerColumn: React.FC<{
  children: React.ReactNode;
  label: string;
  color: string;
}> = ({ children, label, color }) => (
  <div>
    <div className="flex items-center gap-2 mb-3">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-sm font-semibold text-white">{label}</span>
    </div>
    {children}
  </div>
);

/* ---- Placeholder ---- */

const EmptyPlaceholder: React.FC<{ text?: string }> = ({
  text = "Ma'lumot yo'q",
}) => (
  <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center">
    <p className="text-secondary text-sm">{text}</p>
  </div>
);

/* ============================================================
   COMPARE PAGE
   ============================================================ */

const pipelineOptions = [
  { value: "", label: "Barchasi" },
  { value: "Воронка", label: "Воронка" },
  { value: "VSL", label: "VSL" },
  { value: "Retention", label: "Retention" },
];

const ComparePage: React.FC = () => {
  const [period, setPeriod] = useState("month");
  const [category, setCategory] = useState("");
  const [pipeline, setPipeline] = useState("");
  const [managerA, setManagerA] = useState("");
  const [managerB, setManagerB] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  /* ---- Managers list ---- */
  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  const activeManagers = (managers || []).filter((m) => m.isActive);

  const managerAName =
    activeManagers.find((m) => m.id === managerA)?.name || "Menejer A";
  const managerBName =
    activeManagers.find((m) => m.id === managerB)?.name || "Menejer B";

  /* ---- Filters ---- */
  const isCustomReady = period !== "custom" || (!!dateFrom && !!dateTo);

  const buildFilters = (managerId: string): DashboardFilters => ({
    period,
    managerId,
    ...(period === "custom" && dateFrom ? { dateFrom } : {}),
    ...(period === "custom" && dateTo ? { dateTo } : {}),
    ...(category ? { category } : {}),
    ...(pipeline ? { pipeline } : {}),
  });

  const filtersA = buildFilters(managerA);
  const filtersB = buildFilters(managerB);

  /* ---- Data for A ---- */
  const { data: statsA, isLoading: loadingA } = useQuery({
    queryKey: ["compare-stats-a", filtersA],
    queryFn: () => dashboardService.getStats(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: criteriaA } = useQuery({
    queryKey: ["compare-criteria-a", filtersA],
    queryFn: () => dashboardService.getCriteria(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: errorsA } = useQuery({
    queryKey: ["compare-errors-a", filtersA],
    queryFn: () => dashboardService.getErrors(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: objectionsA } = useQuery({
    queryKey: ["compare-objections-a", filtersA],
    queryFn: () => dashboardService.getObjections(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: winLossA } = useQuery({
    queryKey: ["compare-winloss-a", filtersA],
    queryFn: () => dashboardService.getWinLoss(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: trendA } = useQuery({
    queryKey: ["compare-trend-a", filtersA],
    queryFn: () => dashboardService.getCallsTrend(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: speechA } = useQuery({
    queryKey: ["compare-speech-a", filtersA],
    queryFn: () => dashboardService.getSpeechRatio(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: categoryStatsA } = useQuery({
    queryKey: ["compare-category-a", filtersA],
    queryFn: () => dashboardService.getCategoryStats(filtersA),
    enabled: !!managerA && isCustomReady,
  });
  const { data: salesStatsA } = useQuery({
    queryKey: ["compare-sales-a", filtersA],
    queryFn: () => dashboardService.getSalesStats(filtersA),
    enabled: !!managerA && isCustomReady,
  });

  /* ---- Data for B ---- */
  const { data: statsB, isLoading: loadingB } = useQuery({
    queryKey: ["compare-stats-b", filtersB],
    queryFn: () => dashboardService.getStats(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: criteriaB } = useQuery({
    queryKey: ["compare-criteria-b", filtersB],
    queryFn: () => dashboardService.getCriteria(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: errorsB } = useQuery({
    queryKey: ["compare-errors-b", filtersB],
    queryFn: () => dashboardService.getErrors(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: objectionsB } = useQuery({
    queryKey: ["compare-objections-b", filtersB],
    queryFn: () => dashboardService.getObjections(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: winLossB } = useQuery({
    queryKey: ["compare-winloss-b", filtersB],
    queryFn: () => dashboardService.getWinLoss(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: trendB } = useQuery({
    queryKey: ["compare-trend-b", filtersB],
    queryFn: () => dashboardService.getCallsTrend(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: speechB } = useQuery({
    queryKey: ["compare-speech-b", filtersB],
    queryFn: () => dashboardService.getSpeechRatio(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: categoryStatsB } = useQuery({
    queryKey: ["compare-category-b", filtersB],
    queryFn: () => dashboardService.getCategoryStats(filtersB),
    enabled: !!managerB && isCustomReady,
  });
  const { data: salesStatsB } = useQuery({
    queryKey: ["compare-sales-b", filtersB],
    queryFn: () => dashboardService.getSalesStats(filtersB),
    enabled: !!managerB && isCustomReady,
  });

  const anySelected = !!managerA || !!managerB;
  const isLoading = (!!managerA && loadingA) || (!!managerB && loadingB);

  const labelClass = "text-xs font-medium text-secondary uppercase tracking-wide mb-1";
  const dateInputClass =
    "px-3 py-2.5 bg-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="space-y-8 overflow-hidden pb-8">
      {/* ============ HEADER / FILTERS ============ */}
      <div className="bg-card border border-border rounded-xl px-3 md:px-5 py-4">
        <div className="flex items-center gap-3 mb-4">
          <ArrowLeftRight size={20} className="text-accent" />
          <h1 className="text-xl font-bold text-white">Menejerlarni solishtirish</h1>
        </div>
        <div className="flex items-end gap-4 flex-wrap">
          {/* Period */}
          <div className="flex flex-col">
            <label className={labelClass}>Davr</label>
            <CustomSelect value={period} onChange={setPeriod} options={periodOptions} />
          </div>

          {/* Category */}
          <div className="flex flex-col">
            <label className={labelClass}>Kategoriya</label>
            <CustomSelect value={category} onChange={setCategory} options={categoryOptions} />
          </div>

          {/* Voronka */}
          <div className="flex flex-col">
            <label className={labelClass}>Voronka</label>
            <CustomSelect value={pipeline} onChange={setPipeline} options={pipelineOptions} />
          </div>

          {/* Custom dates */}
          {period === "custom" && (
            <>
              <div className="flex flex-col">
                <label className={labelClass}>Dan</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={dateInputClass}
                  style={{ color: "var(--text-primary, #fff)" }}
                />
              </div>
              <div className="flex flex-col">
                <label className={labelClass}>Gacha</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={dateInputClass}
                  style={{ color: "var(--text-primary, #fff)" }}
                />
              </div>
            </>
          )}

          {/* Manager A */}
          <div className="flex flex-col">
            <label className={labelClass}>
              <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: MANAGER_A_COLOR }} />
              Menejer A
            </label>
            <ManagerDeptFilterTrigger
              selected={managerA ? [managerA] : []}
              onChange={(ids) => setManagerA(ids[0] || "")}
              fallbackManagers={activeManagers.map((m) => ({ id: m.id, name: m.name }))}
              mode="single"
              accentColor={MANAGER_A_COLOR}
              emptyLabel="Menejer A tanlang"
            />
          </div>

          {/* Manager B */}
          <div className="flex flex-col">
            <label className={labelClass}>
              <span className="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style={{ backgroundColor: MANAGER_B_COLOR }} />
              Menejer B
            </label>
            <ManagerDeptFilterTrigger
              selected={managerB ? [managerB] : []}
              onChange={(ids) => setManagerB(ids[0] || "")}
              fallbackManagers={activeManagers.map((m) => ({ id: m.id, name: m.name }))}
              mode="single"
              accentColor={MANAGER_B_COLOR}
              emptyLabel="Menejer B tanlang"
            />
          </div>
        </div>
      </div>

      {/* ============ NO SELECTION ============ */}
      {!anySelected && (
        <div className="flex items-center justify-center h-[40vh]">
          <div className="bg-card border border-border rounded-xl p-8 text-center max-w-md">
            <ArrowLeftRight size={48} className="mx-auto mb-4 text-secondary" />
            <h2 className="text-xl font-semibold text-white mb-2">Menejerlarni tanlang</h2>
            <p className="text-secondary text-sm">
              Solishtirish uchun kamida bitta menejer tanlang
            </p>
          </div>
        </div>
      )}

      {/* ============ LOADING ============ */}
      {anySelected && isLoading && (
        <SkeletonDashboard />
      )}

      {/* ============ CONTENT ============ */}
      {anySelected && !isLoading && (
        <>
          {/* 1. Info cards */}
          <SectionHeader title="Umumiy ko'rsatkichlar" subtitle="Tanlangan menejerlarning asosiy statistikasi" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <InfoCard
                  name={managerAName}
                  stats={statsA}
                  color={MANAGER_A_COLOR}
                />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <InfoCard
                  name={managerBName}
                  stats={statsB}
                  color={MANAGER_B_COLOR}
                />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 2. Kategoriyalar */}
          <SectionHeader title="Kategoriyalar" subtitle="Qo'ng'iroqlar turi bo'yicha taqsimot" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <CategoryCards data={categoryStatsA} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <CategoryCards data={categoryStatsB} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 3. Savdo statistikasi */}
          <SectionHeader title="Savdo statistikasi" subtitle="Issiq lidlar bo'yicha natijalar" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <SalesDonut data={salesStatsA} color={MANAGER_A_COLOR} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <SalesDonut data={salesStatsB} color={MANAGER_B_COLOR} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 4. Ish faoliyati */}
          <SectionHeader title="Ish faoliyati" subtitle="Trend va eng yuqori natijalar" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <ActivityBlock stats={statsA} trendData={trendA} color={MANAGER_A_COLOR} gradientId="gradA" />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <ActivityBlock stats={statsB} trendData={trendB} color={MANAGER_B_COLOR} gradientId="gradB" />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 5. Mezonlarga rioya qilishi */}
          <SectionHeader title="Mezonlarga rioya qilishi" subtitle="Har bir mezon bo'yicha ball" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <CriteriaBar data={criteriaA} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <CriteriaBar data={criteriaB} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 6. E'tirozlar */}
          <SectionHeader title="E'tirozlar tahlili" subtitle="Qo'ng'iroqlardagi e'tirozlar statistikasi" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <ObjectionsBlock data={objectionsA} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <ObjectionsBlock data={objectionsB} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 7. Xatoliklar */}
          <SectionHeader title="Aniqlangan xatoliklar" subtitle="Eng ko'p uchraydigan xatoliklar" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <ErrorsList data={errorsA} filters={filtersA} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <ErrorsList data={errorsB} filters={filtersB} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 8. G'alaba / Yo'qotish */}
          <SectionHeader title="G'alaba / Yo'qotish tahlili" subtitle="Muvaffaqiyatli va muvaffaqiyatsiz natijalar" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <WinLossSection data={winLossA} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <WinLossSection data={winLossB} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 9. Qo'ng'iroqlar soni */}
          <SectionHeader title="Qo'ng'iroqlar dinamikasi" subtitle="Kunlik qo'ng'iroqlar soni" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <CallsTrendBlock data={trendA} color={MANAGER_A_COLOR} gradientId="callsGradA" />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <CallsTrendBlock data={trendB} color={MANAGER_B_COLOR} gradientId="callsGradB" />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 10. Nutq nisbati */}
          <SectionHeader title="Nutq nisbati" subtitle="Menejer va mijoz gapirish ulushi" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <SpeechRatioDonut data={speechA} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <SpeechRatioDonut data={speechB} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>

          {/* 11. O'rtacha davomiylik */}
          <SectionHeader title="Qo'ng'iroq davomiyligi" subtitle="O'rtacha va umumiy davomiylik" />
          <CompareGrid>
            {managerA ? (
              <ManagerColumn label={managerAName} color={MANAGER_A_COLOR}>
                <DurationSection stats={statsA} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer A tanlanmagan" />
            )}
            {managerB ? (
              <ManagerColumn label={managerBName} color={MANAGER_B_COLOR}>
                <DurationSection stats={statsB} />
              </ManagerColumn>
            ) : (
              <EmptyPlaceholder text="Menejer B tanlanmagan" />
            )}
          </CompareGrid>
        </>
      )}
    </div>
  );
};

/* ============================================================
   SUB-COMPONENTS
   ============================================================ */

/* ---- 1. Info Card ---- */
const InfoCard: React.FC<{
  name: string;
  stats?: DashboardStats;
  color: string;
}> = ({ name, stats, color }) => (
  <div className="bg-card border border-border rounded-xl p-3 md:p-5">
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
        style={{ backgroundColor: color }}
      >
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div className="text-base font-semibold text-white">{name}</div>
        <div className="text-xs text-secondary">Solishtirish uchun menejer</div>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-primary/40 border border-border rounded-lg p-3 text-center">
        <div className="text-xs text-secondary mb-1">Tahlil qilingan</div>
        <div className="text-2xl font-bold text-white">{stats?.totalCalls ?? 0}</div>
      </div>
      <div className="bg-primary/40 border border-border rounded-lg p-3 text-center">
        <div className="text-xs text-secondary mb-1">O'rtacha ball</div>
        <div className="text-2xl font-bold text-white">{stats?.avgScore ?? 0}%</div>
      </div>
    </div>
  </div>
);

/* ---- 2. Category Cards ---- */
const CategoryCards: React.FC<{ data?: CategoryStatsData }> = ({ data }) => {
  if (!data) return <EmptyPlaceholder />;
  return (
    <div className="grid grid-cols-3 gap-3">
      {data.categories.map((cat) => (
        <div key={cat.name} className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs text-secondary mb-1">{cat.name}</div>
          <div className="text-2xl font-bold text-white">{cat.count}</div>
        </div>
      ))}
      {data.categories.length === 0 && (
        <div className="col-span-3 text-sm text-secondary text-center py-4">Ma'lumot yo'q</div>
      )}
    </div>
  );
};

/* ---- 3. Sales Donut ---- */
const SalesDonut: React.FC<{ data?: SalesStatsData; color: string }> = ({ data, color: _color }) => {
  if (!data) return <EmptyPlaceholder />;
  const pieData = data.managers.map((m) => ({ name: m.name, value: m.count }));

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5">
      <div className="text-sm font-semibold text-white mb-1">Savdo: {data.total} ta</div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData.length > 0 ? pieData : [{ name: "Bo'sh", value: 1 }]}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              {pieData.length > 0
                ? pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)
                : <Cell fill="#27272a" />
              }
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle.contentStyle}
              itemStyle={tooltipStyle.itemStyle}
              formatter={(value: number, name: string) => [`${value} ta`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{data.total}</div>
            <div className="text-[11px] text-secondary mt-0.5">Jami</div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---- 4. Activity Block ---- */
const ActivityBlock: React.FC<{
  stats?: DashboardStats;
  trendData?: CallsTrendData[];
  color: string;
  gradientId: string;
}> = ({ stats, trendData, color, gradientId }) => {
  const trend = (trendData || []).map((d) => ({
    ...d,
    count: (d as any).analyzed ?? (d as any).count ?? 0,
    label: d.date.split("-").reverse().join("."),
  }));

  return (
    <div className="space-y-3">
      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="label" stroke="var(--color-secondary)" tick={{ fontSize: 10, fill: "var(--color-secondary)" }} />
              <YAxis stroke="var(--color-secondary)" tick={{ fontSize: 10, fill: "var(--color-secondary)" }} />
              <Tooltip contentStyle={tooltipStyle.contentStyle} />
              <Area
                type="monotone"
                dataKey="count"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: color }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-secondary">Ma'lumot yo'q</div>
        )}
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-accent rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{stats?.avgScore ?? 0}%</div>
          <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>O'rtacha natija</div>
        </div>
        <div className="bg-accent rounded-xl p-4">
          <div className="flex items-center gap-1.5">
            <div className="text-2xl font-bold text-white">
              {(stats?.growthRate ?? 0) > 0 ? "+" : ""}
              {stats?.growthRate ?? 0}%
            </div>
            {(stats?.growthRate ?? 0) >= 0 ? (
              <TrendingUp size={18} className="text-emerald-400" />
            ) : (
              <TrendingDown size={18} className="text-red-400" />
            )}
          </div>
          <div className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>O'sish sur'ati</div>
        </div>
      </div>
    </div>
  );
};

/* ---- 5. Criteria Bar ---- */
const CriteriaBar: React.FC<{ data?: CriteriaData }> = ({ data }) => {
  const team = data?.sotuv?.team;
  if (!team || Object.keys(team).length === 0) return <EmptyPlaceholder />;

  const chartData = Object.entries(team).map(([name, score]) => ({
    name,
    score: score as number,
    fill: scoreColor(score as number),
  }));

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5">
      <ResponsiveContainer width="100%" height={chartData.length * 44 + 30}>
        <BarChart data={chartData} layout="vertical" barSize={20} margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 20, 40, 60, 80, 100]}
            tickFormatter={(v: number) => `${v}%`}
            stroke="var(--color-secondary)"
            tick={{ fontSize: 10, fill: "var(--color-secondary)" }}
            axisLine={{ stroke: "var(--color-border)" }}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke="transparent"
            width={160}
            tick={{ fontSize: 11, fill: "var(--text-primary)" }}
            reversed
          />
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            formatter={(value: number) => [`${value}%`, "Ball"]}
          />
          <Bar dataKey="score" radius={[0, 6, 6, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ---- 6. Objections Block ---- */
const ObjectionsBlock: React.FC<{ data?: ObjectionData[] }> = ({ data }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!data || data.length === 0) return <EmptyPlaceholder text="E'tirozlar yo'q" />;

  const totalObjections = data.reduce((sum, d) => sum + d.count, 0);
  const chartData = data.map((d, i) => ({
    name: d.type,
    value: d.count,
    percent: d.percent,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
  const top5 = data.slice(0, 5);

  return (
    <div className="space-y-3">
      {/* Donut */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5">
        <div className="text-sm font-semibold text-white mb-2">E'tirozlar taqsimoti ({totalObjections})</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle.contentStyle}
              formatter={(value: number, name: string) => {
                const item = chartData.find((d) => d.name === name);
                return [`${value} ta (${item?.percent ?? 0}%)`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-2">
          {chartData.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              <span className="text-xs text-secondary">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 list */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5">
        <div className="text-sm font-semibold text-white mb-3">Top 5 e'tirozlar</div>
        <div className="space-y-1">
          {top5.map((obj, i) => {
            const color = CHART_COLORS[i % CHART_COLORS.length];
            const isOpen = expanded === obj.type;
            return (
              <div key={i} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : obj.type)}
                  className="w-full py-2.5 px-3 hover:bg-primary/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown size={14} className="text-secondary" /> : <ChevronRight size={14} className="text-secondary" />}
                    <span className="text-sm text-white font-medium">{obj.type}</span>
                    <span className="text-xs text-secondary">({obj.count} ta)</span>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ color, backgroundColor: color + "18" }}>
                    {obj.percent}%
                  </span>
                </button>
                {isOpen && (
                  <div className="px-3 pb-2 text-xs text-secondary">
                    {obj.count} ta e'tiroz aniqlandi ({obj.percent}%)
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ---- 7. Errors List ---- */
const COMPARE_PAGE_SIZE = 20;

const getErrTitle = (desc: string): string => {
  const first = desc.split(/[.!?]/)[0];
  return first.length <= 80 ? first : desc.slice(0, 80) + "...";
};

// Bitta xatolik turi — ochilganda item'lar talab bo'yicha (20 tadan) yuklanadi
const CompareErrorType: React.FC<{ entry: ErrorSummaryEntry; filters: DashboardFilters }> = ({ entry, filters }) => {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<ErrorItem[]>([]);
  const [total, setTotal] = useState(entry.count);
  const [loading, setLoading] = useState(false);

  const fetchPage = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await dashboardService.getErrorItems(filters, {
        type: entry.type,
        offset: items.length,
        limit: COMPARE_PAGE_SIZE,
      });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  const onToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && items.length === 0) fetchPage();
  };

  const remaining = Math.max(0, total - items.length);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2.5 px-3 hover:bg-primary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            size={14}
            className={`text-secondary transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
          />
          <span className="text-sm text-white font-medium">
            {entry.type}{" "}
            <span className="text-secondary font-normal">({entry.count} ta, {entry.percent}%)</span>
          </span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {items.map((item, idx) => (
            <div key={idx} className="p-2.5 bg-primary/30 border border-border rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-white font-medium mb-1">{getErrTitle(item.description)}</p>
                  <p className="text-xs text-secondary leading-relaxed mb-1">{item.description}</p>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span
                      onClick={() => window.open(`/audio/${item.audioFileId}/transcription?t=${timeToSeconds(item.timestamp)}`, "_blank")}
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
          {loading && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-secondary">
              <Loader2 size={14} className="animate-spin" />
              Yuklanmoqda...
            </div>
          )}
          {!loading && remaining > 0 && (
            <button
              onClick={fetchPage}
              className="w-full py-2 rounded-lg text-xs font-medium border border-border text-blue-400 hover:bg-primary/30 transition-colors"
            >
              Ko'proq ko'rsatish ({remaining})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ErrorsList: React.FC<{ data?: ErrorData; filters: DashboardFilters }> = ({ data, filters }) => {
  if (!data || data.total === 0) return <EmptyPlaceholder text="Xatoliklar yo'q" />;

  const filtersKey = JSON.stringify(filters);

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5">
      <div className="text-sm font-semibold text-white mb-1">Xatoliklar ({data.total})</div>
      <p className="text-xs text-secondary mb-3">Mezonlarga rioya qilmaslik holatlari</p>
      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
        {data.summary
          .filter((e) => e.count > 0)
          .map((entry) => (
            <CompareErrorType key={`err-${entry.type}-${filtersKey}`} entry={entry} filters={filters} />
          ))}
      </div>
    </div>
  );
};

/* ---- 8. Win/Loss Section ---- */
const WinLossSection: React.FC<{ data?: WinLossData }> = ({ data }) => {
  const [expandedWins, setExpandedWins] = useState<Set<string>>(new Set());
  const [expandedLosses, setExpandedLosses] = useState<Set<string>>(new Set());

  if (!data) return <EmptyPlaceholder />;

  const totalWinPoints = Object.values(data.wins).reduce((s, pts) => s + pts.length, 0);
  const totalLossPoints = Object.values(data.losses).reduce((s, pts) => s + pts.length, 0);
  const hasWins = Object.keys(data.wins).length > 0;
  const hasLosses = Object.keys(data.losses).length > 0;

  if (!hasWins && !hasLosses) return <EmptyPlaceholder text="Ma'lumot yo'q" />;

  const toggle = (_set: Set<string>, setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderSection = (
    entries: Record<string, Array<{ description: string; timestamp: string; audioFileId: string }>>,
    total: number,
    expanded: Set<string>,
    setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>,
    variant: "win" | "loss"
  ) => {
    const icon = variant === "win" ? <CheckCircle size={13} className="text-emerald-400 mt-0.5 flex-shrink-0" /> : <XCircle size={13} className="text-red-400 mt-0.5 flex-shrink-0" />;
    const bgColor = variant === "win" ? "bg-emerald-500/5 border-emerald-500/10" : "bg-red-500/5 border-red-500/10";
    const label = variant === "win" ? "G'alaba" : "Yo'qotish";

    return (
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-sm font-semibold text-white mb-2">
          {label} nuqtalari ({total})
        </div>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-1">
          {Object.entries(entries).map(([manager, points]) => {
            const isOpen = expanded.has(manager);
            return (
              <div key={manager} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggle(expanded, setExpanded, manager)}
                  className="w-full flex items-center justify-between py-2 px-3 hover:bg-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight size={13} className={`text-secondary transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    <span className="text-sm text-white font-medium">{manager} <span className="text-secondary font-normal">({points.length} ta)</span></span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-2.5 space-y-1.5">
                    {points.map((p, i) => (
                      <div key={i} className={`p-2.5 border rounded-lg ${bgColor}`}>
                        <div className="flex items-start gap-2">
                          {icon}
                          <div className="flex-1">
                            <p className="text-xs text-white leading-relaxed mb-1">{p.description}</p>
                            <span
                              onClick={() => window.open(`/audio/${p.audioFileId}/transcription?t=${timeToSeconds(p.timestamp)}`, "_blank")}
                              className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                            >
                              Vaqt: {formatTimestamp(p.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {hasWins && renderSection(data.wins, totalWinPoints, expandedWins, setExpandedWins, "win")}
      {hasLosses && renderSection(data.losses, totalLossPoints, expandedLosses, setExpandedLosses, "loss")}
    </div>
  );
};

/* ---- 9. Calls Trend Block ---- */
const CallsTrendBlock: React.FC<{
  data?: CallsTrendData[];
  color: string;
  gradientId: string;
}> = ({ data, color, gradientId }) => {
  if (!data || data.length === 0) return <EmptyPlaceholder text="Trend ma'lumoti yo'q" />;

  const formatted = data.map((d) => ({
    ...d,
    count: (d as any).analyzed ?? (d as any).count ?? 0,
    label: d.date.split("-").reverse().join("."),
  }));
  const total = formatted.reduce((s, d) => s + (d.count || 0), 0);
  const maxCount = Math.max(...formatted.map((d) => (d.count ?? 0)), 0);
  const yMax = Math.ceil(maxCount * 1.2) || 10;

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-white">Qo'ng'iroqlar soni</h4>
        <span className="text-xs text-secondary">Jami: {total} ta</span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={formatted} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="50%" stopColor={color} stopOpacity={0.12} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-card-bg)" vertical={false} />
          <XAxis dataKey="label" stroke="transparent" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
          <YAxis stroke="transparent" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} domain={[0, yMax]} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle.contentStyle} formatter={(value: number) => [`${value} ta`, "Qo'ng'iroqlar"]} />
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2.5}
            fillOpacity={1}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: color, stroke: "var(--color-card-bg)", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

/* ---- 10. Speech Ratio Donut ---- */
const SpeechRatioDonut: React.FC<{ data?: SpeechRatioData }> = ({ data }) => {
  if (!data) return <EmptyPlaceholder />;

  const MANAGER_COLOR = "#3b5ef5";
  const CLIENT_COLOR = "#2fcc6e";
  const teamData = [
    { name: "Menejer", value: data.team.manager },
    { name: "Mijoz", value: data.team.client },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5">
      <div className="text-sm font-semibold text-white mb-1">Nutq nisbati</div>
      <p className="text-xs text-secondary mb-3">Menejer vs Mijoz</p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={teamData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
              stroke="none"
              startAngle={90}
              endAngle={-270}
            >
              <Cell fill={MANAGER_COLOR} />
              <Cell fill={CLIENT_COLOR} />
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle.contentStyle}
              formatter={(value: number, name: string) => [`${value}%`, name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{data.team.manager}%</div>
            <div className="text-[11px] text-secondary mt-0.5">Menejer</div>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-6 mt-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: MANAGER_COLOR }} />
          <span className="text-xs text-secondary">Menejer: {data.team.manager}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: CLIENT_COLOR }} />
          <span className="text-xs text-secondary">Mijoz: {data.team.client}%</span>
        </div>
      </div>
    </div>
  );
};

/* ---- 11. Duration Section ---- */
const DurationSection: React.FC<{ stats?: DashboardStats }> = ({ stats }) => {
  if (!stats) return <EmptyPlaceholder />;

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5">
      <div className="text-sm font-semibold text-white mb-4">O'rtacha qo'ng'iroq davomiyligi</div>

      <div className="flex items-center justify-center gap-6 mb-5">
        <div className="text-center">
          <div className="text-xs text-secondary mb-1">O'rtacha</div>
          <div className="text-4xl font-bold text-white tracking-wider">{formatDuration(stats.avgDuration)}</div>
        </div>
        <div className="h-14 w-px bg-border" />
        <div className="text-center">
          <div className="text-xs text-secondary mb-1">Jami</div>
          <div className="text-xl font-bold text-white">{formatTotalDuration(stats.totalDuration)}</div>
          <div className="text-xs text-secondary mt-0.5">{stats.totalCalls} Qo'ng'iroqlar</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/40 border border-border rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Phone size={13} style={{ color: ACCENT }} />
            <span className="text-xs text-secondary">Jami soni</span>
          </div>
          <div className="text-xl font-bold text-white">{stats.totalCalls}</div>
        </div>
        <div className="bg-primary/40 border border-border rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Timer size={13} style={{ color: ACCENT }} />
            <span className="text-xs text-secondary">Jami davomiylik</span>
          </div>
          <div className="text-xl font-bold text-white">{formatTotalDuration(stats.totalDuration)}</div>
        </div>
      </div>
    </div>
  );
};

export default ComparePage;
