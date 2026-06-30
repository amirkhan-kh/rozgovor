import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { SkeletonKPI, SkeletonChart, SkeletonTable } from "../../components/ui/Skeleton";
import { dashboardService, DashboardFilters } from "../../services/dashboard.service";
import { managersService } from "../../services/managers.service";
import { useAuth } from "../../store/authStore";
import FilterBar from "./components/FilterBar";
import FunnelLeaksBlock from "./components/FunnelLeaksBlock";
import DailyLessonBanner from "../../components/dashboard/DailyLessonBanner";
import TrendChart from "./components/TrendChart";
import CriteriaTeamChart from "./components/CriteriaTeamChart";
import CriteriaManagersTable from "./components/CriteriaManagersTable";
import ErrorsBlock from "./components/ErrorsBlock";
import ObjectionsChart from "./components/ObjectionsChart";
import WinLossBlock from "./components/WinLossBlock";
import CallsTrendChart from "./components/CallsTrendChart";
import SpeechRatioBlock from "./components/SpeechRatioBlock";
import DurationBlock from "./components/DurationBlock";
import CategoryStatsBlock from "./components/CategoryStatsBlock";
import SalesStatsBlock from "./components/SalesStatsBlock";
import SalesTrendChart from "./components/SalesTrendChart";
import PlanFactBlock from "./components/PlanFactBlock";
import TalkStatsBlock from "./components/TalkStatsBlock";
import ScheduleHeatmap from "./components/ScheduleHeatmap";
import { ChevronRight, Settings, Filter, Download, Eye, EyeOff } from "lucide-react";

/* ---- Section visibility ---- */
const DASHBOARD_SECTIONS = [
  { key: "kpi", label: "KPI kartalar", tab: "overview" },
  { key: "plan_fact", label: "Plan va Fakt", tab: "overview" },
  { key: "categories", label: "Kategoriyalar", tab: "overview" },
  { key: "sales", label: "Savdo statistikasi", tab: "overview" },
  { key: "sales_trend", label: "Sotuvlar trendi", tab: "overview" },
  { key: "trend", label: "Trend grafik", tab: "overview" },
  { key: "criteria", label: "Mezonlar", tab: "overview" },
  { key: "managers_rating", label: "Menejerlar reytingi", tab: "overview" },
  { key: "funnel", label: "Sotuvni yo'qotish sabablari", tab: "analysis" },
  { key: "errors", label: "Xatolar", tab: "analysis" },
  { key: "objections", label: "E'tirozlar", tab: "analysis" },
  { key: "winloss", label: "G'alaba / Yo'qotish", tab: "analysis" },
  { key: "calls_trend", label: "Qo'ng'iroqlar dinamikasi", tab: "analysis" },
  { key: "speech", label: "Nutq nisbati", tab: "analysis" },
  { key: "duration", label: "Davomiylik", tab: "analysis" },
  { key: "talk_stats", label: "Gaplashish vaqti", tab: "analysis" },
  { key: "schedule", label: "Ish jadvali", tab: "analysis" },
] as const;

const ALL_SECTION_KEYS = DASHBOARD_SECTIONS.map((s) => s.key);

const loadSections = (): string[] => {
  try {
    const saved = localStorage.getItem("dashboardSections");
    if (saved) {
      const parsed = JSON.parse(saved) as string[];
      // Yangi qo'shilgan sectionlarni avtomatik qo'shish
      const missing = ALL_SECTION_KEYS.filter((k) => !parsed.includes(k));
      if (missing.length > 0) {
        const merged = [...parsed, ...missing];
        localStorage.setItem("dashboardSections", JSON.stringify(merged));
        return merged;
      }
      return parsed;
    }
  } catch {}
  return [...ALL_SECTION_KEYS];
};

const SectionsDropdown: React.FC<{
  visibleSections: string[];
  setVisibleSections: (s: string[]) => void;
  activeTab: "overview" | "analysis";
}> = ({ visibleSections, setVisibleSections, activeTab }) => {
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
    const next = visibleSections.includes(key)
      ? visibleSections.filter((k) => k !== key)
      : [...visibleSections, key];
    setVisibleSections(next);
    localStorage.setItem("dashboardSections", JSON.stringify(next));
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
        title="Sozlamalar"
      >
        <Settings size={18} />
      </button>
      {open && createPortal(
        <div
          ref={dropRef}
          className="fixed bottom-0 left-0 right-0 md:bottom-auto md:left-auto bg-card border-t md:border border-border rounded-t-2xl md:rounded-xl shadow-2xl z-[9999] p-4 space-y-2 max-h-[70vh] overflow-y-auto"
          style={{ ...(window.innerWidth >= 768 ? { top: pos.top, right: pos.right, width: 256 } : {}) }}
        >
          <h4 className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>
            {activeTab === "overview" ? "Umumiy" : "Tahlil"} bo'limlari
          </h4>
          {DASHBOARD_SECTIONS.filter((s) => s.tab === activeTab).map((s) => (
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
        </div>,
        document.body
      )}
    </div>
  );
};

/* ---- Section header component ---- */
const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  rightLabel?: string;
  onRightClick?: () => void;
}> = ({ title, subtitle, rightLabel, onRightClick }) => (
  <div className="flex items-end justify-between mb-4 mt-2">
    <div>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {subtitle && (
        <p className="text-sm text-secondary mt-0.5">{subtitle}</p>
      )}
    </div>
    {rightLabel && (
      <button
        type="button"
        onClick={onRightClick}
        className="text-sm text-accent hover:text-accent/80 font-medium flex items-center gap-1 transition-colors"
      >
        {rightLabel}
        <ChevronRight size={16} />
      </button>
    )}
  </div>
);

const DashboardAnalysisPage: React.FC = () => {
  const { userRole, managerUser } = useAuth();
  const [visibleSections, setVisibleSections] = useState<string[]>(loadSections);

  const [period, setPeriod] = useState("month");
  const [managerId, setManagerId] = useState("all");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [managerA, setManagerA] = useState("");
  const [managerB, setManagerB] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [pipeline, setPipeline] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [category, setCategory] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "analysis">("overview");
  const [showFilters, setShowFilters] = useState(false);
  const [filterPos, setFilterPos] = useState({ top: 0, right: 0 });
  const filterDropRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showFilters) return;
    const handler = (e: MouseEvent) => {
      if (filterDropRef.current?.contains(e.target as Node)) return;
      if (filterBtnRef.current?.contains(e.target as Node)) return;
      setShowFilters(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFilters]);
  const [showAmount, setShowAmount] = useState(false);
  // For managers with canViewAll: toggle between own data and all data
  const [viewAll, setViewAll] = useState(false);

  // If manager without canViewAll, force managerId to own ID
  useEffect(() => {
    if (userRole === "manager" && managerUser) {
      if (!managerUser.canViewAll) {
        setManagerId(managerUser.id);
      } else if (!viewAll) {
        setManagerId(managerUser.id);
      } else {
        setManagerId("all");
      }
    }
  }, [userRole, managerUser, viewAll]);

  // If manager doesn't have dashboard permission, show message
  if (userRole === "manager" && managerUser && !managerUser.canViewDashboard) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="bg-card border border-border rounded-xl p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold text-white mb-2">
            Ruxsat yo'q
          </h2>
          <p className="text-secondary">
            Sizda dashboard ko'rish ruxsati yo'q
          </p>
        </div>
      </div>
    );
  }

  const isCustomReady = period !== "custom" || (!!dateFrom && !!dateTo);

  const filters: DashboardFilters = {
    period,
    managerId,
    ...(period === "custom" && dateFrom ? { dateFrom } : {}),
    ...(period === "custom" && dateTo ? { dateTo } : {}),
    ...(category ? { category } : {}),
    ...(pipeline ? { pipeline } : {}),
  };

  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", filters],
    queryFn: () => dashboardService.getStats(filters),
    enabled: isCustomReady,
  });

  const { data: criteriaData } = useQuery({
    queryKey: ["dashboard-criteria", filters],
    queryFn: () => dashboardService.getCriteria(filters),
    enabled: isCustomReady,
  });

  const { data: errorsData } = useQuery({
    queryKey: ["dashboard-errors", filters],
    queryFn: () => dashboardService.getErrors(filters),
    enabled: isCustomReady,
  });

  const { data: objectionsData } = useQuery({
    queryKey: ["dashboard-objections", filters],
    queryFn: () => dashboardService.getObjections(filters),
    enabled: isCustomReady,
  });

  const { data: winLossData } = useQuery({
    queryKey: ["dashboard-winloss", filters],
    queryFn: () => dashboardService.getWinLoss(filters),
    enabled: isCustomReady,
  });

  const { data: trendData } = useQuery({
    queryKey: ["dashboard-trend", filters],
    queryFn: () => dashboardService.getCallsTrend(filters),
    enabled: isCustomReady,
  });

  const { data: speechData } = useQuery({
    queryKey: ["dashboard-speech", filters],
    queryFn: () => dashboardService.getSpeechRatio(filters),
    enabled: isCustomReady,
  });

  const { data: managerDurationsData } = useQuery({
    queryKey: ["dashboard-manager-durations", filters],
    queryFn: () => dashboardService.getManagerDurations(filters),
    enabled: isCustomReady,
  });

  const { data: categoryStatsData } = useQuery({
    queryKey: ["dashboard-category-stats", filters],
    queryFn: () => dashboardService.getCategoryStats(filters),
    enabled: isCustomReady,
  });

  const { data: salesStatsData } = useQuery({
    queryKey: ["dashboard-sales-stats", filters],
    queryFn: () => dashboardService.getSalesStats(filters),
    enabled: isCustomReady,
  });

  const { data: salesTrendData } = useQuery({
    queryKey: ["dashboard-sales-trend", filters],
    queryFn: () => dashboardService.getSalesTrend(filters),
    enabled: isCustomReady,
  });

  const { data: funnelData } = useQuery({
    queryKey: ["dashboard-funnel-leakage"],
    queryFn: () => dashboardService.getFunnelLeakage(30),
    enabled: isCustomReady,
  });

  return (
    <div className="space-y-4 md:space-y-8" id="dashboard-content">
      {/* 📖 Knowledge-Distiller — bugungi dars */}
      <DailyLessonBanner />

      {/* Manager view toggle for canViewAll managers */}
      {userRole === "manager" && managerUser?.canViewAll && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm text-secondary">Ko'rish:</span>
            <div className="flex bg-primary rounded-xl p-1 border border-border">
              <button
                type="button"
                onClick={() => setViewAll(false)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  !viewAll ? "bg-accent" : "hover:opacity-80"
                }`}
                style={{ color: !viewAll ? "#ffffff" : "var(--color-secondary)" }}
              >
                O'z ma'lumotlarim
              </button>
              <button
                type="button"
                onClick={() => setViewAll(true)}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  viewAll ? "bg-accent" : "hover:opacity-80"
                }`}
                style={{ color: viewAll ? "#ffffff" : "var(--color-secondary)" }}
              >
                Umumiy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar: Tabs + Filter + Settings + PDF */}
      <div className="sticky top-0 md:top-0 z-30 py-2 -mx-4 md:-mx-6 px-4 md:px-6" style={{ backgroundColor: "var(--color-primary-bg)" }}>
        <div className="flex items-center justify-between gap-2">
          {/* Left: Tabs */}
          <div className="flex bg-card border border-border rounded-xl p-1 gap-1 shrink-0">
            <button
              onClick={() => setActiveTab("overview")}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === "overview" ? "bg-accent" : "text-secondary hover:text-white"
              }`}
              style={activeTab === "overview" ? { color: "#ffffff" } : undefined}
            >
              Umumiy
            </button>
            <button
              onClick={() => setActiveTab("analysis")}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === "analysis" ? "bg-accent" : "text-secondary hover:text-white"
              }`}
              style={activeTab === "analysis" ? { color: "#ffffff" } : undefined}
            >
              Tahlil
            </button>
          </div>

          {/* Right: Filter + Settings + PDF */}
          <div className="flex items-center gap-1 relative shrink-0">
            {/* Filter toggle */}
            <button
              ref={filterBtnRef}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setFilterPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                setShowFilters(!showFilters);
              }}
              className={`p-2 border rounded-lg transition-colors ${
                showFilters
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "text-secondary hover:text-white border-border hover:bg-white/5"
              }`}
              title="Filtrlar"
            >
              <Filter size={16} />
            </button>

            {/* Settings */}
            <SectionsDropdown visibleSections={visibleSections} setVisibleSections={setVisibleSections} activeTab={activeTab} />

            {/* PDF */}
            <button
              onClick={() => window.print()}
              className="p-2 text-secondary hover:text-white border border-border rounded-lg hover:bg-white/5 transition-colors"
              title="PDF yuklab olish"
            >
              <Download size={16} />
            </button>
          </div>
        </div>

        {/* Filter dropdown — mobile: bottom sheet, desktop: dropdown */}
        {showFilters && createPortal(
            <div
              ref={filterDropRef}
              className="fixed bottom-0 left-0 right-0 md:bottom-auto md:left-auto bg-card border-t md:border border-border rounded-t-2xl md:rounded-xl shadow-2xl z-[9999] p-4 md:p-3 space-y-3 max-h-[80vh] overflow-y-auto"
              style={{ ...(window.innerWidth >= 768 ? { top: filterPos.top, right: filterPos.right, width: 224 } : {}) }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <FilterBar
                period={period}
                setPeriod={setPeriod}
                managerId={managerId}
                setManagerId={setManagerId}
                compareEnabled={compareEnabled}
                setCompareEnabled={setCompareEnabled}
                managerA={managerA}
                setManagerA={setManagerA}
                managerB={managerB}
                setManagerB={setManagerB}
                managers={managers || []}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                hideManagerSelector={false}
                category={category}
                setCategory={setCategory}
                pipeline={pipeline}
                setPipeline={setPipeline}
              />
            </div>,
          document.body
        )}
      </div>

      {/* ==================== UMUMIY ==================== */}
      {activeTab === "overview" && <>

        {/* KPI kartalar */}
        {visibleSections.includes("kpi") && (
          stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 md:gap-4 overflow-hidden">
              <div className="bg-card border border-border rounded-xl p-2 md:p-5 min-w-0">
                <div className="text-[9px] md:text-xs text-secondary mb-1 truncate">Tahlil qilingan</div>
                <div className="text-lg md:text-3xl font-bold" style={{ color: "var(--text-primary, #fff)" }}>{stats.totalCalls}</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-2 md:p-5 min-w-0">
                <div className="text-[9px] md:text-xs text-secondary mb-1 truncate">O'rtacha ball</div>
                <div className="text-lg md:text-3xl font-bold" style={{ color: stats.avgScore >= 70 ? "#2fcc6e" : stats.avgScore >= 50 ? "#e6a020" : "#e64545" }}>{stats.avgScore}%</div>
              </div>
              <div className="bg-card border border-border rounded-xl p-2 md:p-5 min-w-0">
                <div className="text-[9px] md:text-xs text-secondary mb-1 truncate">O'sish</div>
                <div className={`text-lg md:text-3xl font-bold ${stats.growthRate >= 0 ? "text-success" : "text-danger"}`}>
                  {stats.growthRate > 0 ? "+" : ""}{stats.growthRate}%
                </div>
              </div>
              <div className="bg-card border border-border rounded-xl p-3 md:p-5">
                <div className="flex items-center gap-1.5 text-[10px] md:text-xs text-secondary mb-1">
                  Sotuv summasi
                  <button onClick={() => setShowAmount(!showAmount)} className="hover:opacity-70">
                    {showAmount ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <div className="text-xl md:text-3xl font-bold" style={{ color: "var(--text-primary, #fff)" }}>
                  {showAmount
                    ? `${((stats as any).totalSaleAmount || 0).toLocaleString()} so'm`
                    : "••••••••"}
                </div>
              </div>
            </div>
          ) : <SkeletonKPI />
        )}

        {/* Plan-Fakt */}
        {visibleSections.includes("plan_fact") && <PlanFactBlock />}

        {/* Kategoriyalar */}
        {visibleSections.includes("categories") && (
          categoryStatsData ? (
            <div>
              <SectionHeader title="Kategoriyalar bo'yicha qo'ng'iroqlar" subtitle={`Jami: ${categoryStatsData.total} qo'ng'iroq`} />
              <CategoryStatsBlock data={categoryStatsData} />
            </div>
          ) : <SkeletonChart />
        )}

        {/* Savdo statistikasi */}
        {visibleSections.includes("sales") && (
          salesStatsData ? (
            <div>
              <SectionHeader title="Savdo statistikasi" subtitle="CRM dan sotuvlar" />
              <SalesStatsBlock data={salesStatsData} />
            </div>
          ) : <SkeletonChart />
        )}

        {/* Sotuvlar trendi */}
        {visibleSections.includes("sales_trend") && (
          salesTrendData ? (
            salesTrendData.length > 0 && (
              <div>
                <SectionHeader title="Sotuvlar trendi" subtitle="Kunlik sotuv dinamikasi — o'sish va pasayish" />
                <SalesTrendChart data={salesTrendData} />
              </div>
            )
          ) : (
            <SkeletonChart />
          )
        )}

        {/* Trend grafik */}
        {visibleSections.includes("trend") && (
          stats ? (
            <TrendChart stats={stats} trendData={trendData || []} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SkeletonChart />
              <SkeletonChart />
            </div>
          )
        )}

        {/* Mezonlar */}
        {visibleSections.includes("criteria") && (
          criteriaData ? <CriteriaTeamChart data={criteriaData} /> : <SkeletonChart />
        )}
        {visibleSections.includes("managers_rating") && (
          criteriaData ? (
            <div>
              <SectionHeader title="Menejerlar reytingi" subtitle="Mezonlar bo'yicha" />
              <CriteriaManagersTable data={criteriaData} />
            </div>
          ) : <SkeletonTable rows={5} cols={4} />
        )}

      </>}

      {/* ==================== TAHLIL ==================== */}
      {activeTab === "analysis" && <>

        {/* Sotuvni yo'qotish sabablari — Tahlil tabning eng tepasida */}
        {visibleSections.includes("funnel") && (
          funnelData ? <FunnelLeaksBlock data={funnelData} /> : <SkeletonChart height="h-[200px]" />
        )}

        {/* Xatolar */}
        {visibleSections.includes("errors") && (
          errorsData ? (
            <div>
              <SectionHeader title="Aniqlangan xatoliklar va tavsiyalar" subtitle="Eng ko'p uchraydigan xatoliklar" />
              <ErrorsBlock data={errorsData} filters={filters} />
            </div>
          ) : <SkeletonTable rows={5} cols={4} />
        )}

        {/* E'tirozlar */}
        {visibleSections.includes("objections") && (
          objectionsData ? (
            <div>
              <SectionHeader title="E'tirozlar tahlili" subtitle="Qo'ng'iroqlardagi e'tirozlar" />
              <ObjectionsChart data={objectionsData} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SkeletonChart />
              <SkeletonChart />
            </div>
          )
        )}

        {/* G'alaba / Yo'qotish */}
        {visibleSections.includes("winloss") && (
          winLossData ? (
            <div>
              <SectionHeader title="G'alaba va Yo'qotish" subtitle="Muvaffaqiyatli va muvaffaqiyatsiz momentlar" />
              <WinLossBlock data={winLossData} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SkeletonChart />
              <SkeletonChart />
            </div>
          )
        )}

        {/* Qo'ng'iroqlar dinamikasi */}
        {visibleSections.includes("calls_trend") && (
          trendData ? (
            <div>
              <SectionHeader title="Qo'ng'iroqlar dinamikasi" subtitle="Kunlik qo'ng'iroqlar soni" />
              <CallsTrendChart data={trendData} />
            </div>
          ) : <SkeletonChart />
        )}

        {/* Nutq nisbati */}
        {visibleSections.includes("speech") && (
          speechData ? (
            <div>
              <SectionHeader title="Nutq nisbati" subtitle="Menejer va mijoz gapirish ulushi" />
              <SpeechRatioBlock data={speechData} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SkeletonChart />
              <SkeletonChart />
            </div>
          )
        )}

        {/* Davomiylik */}
        {visibleSections.includes("duration") && (
          stats ? (
            <div>
              <SectionHeader title="Qo'ng'iroq davomiyligi" subtitle="O'rtacha va umumiy" />
              <DurationBlock stats={stats} managerDurations={managerDurationsData} />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SkeletonChart />
              <SkeletonChart />
            </div>
          )
        )}

        {/* Gaplashish vaqti */}
        {visibleSections.includes("talk_stats") && <TalkStatsBlock />}

        {/* Ish jadvali */}
        {visibleSections.includes("schedule") && <ScheduleHeatmap />}

      </>}
    </div>
  );
};

export default DashboardAnalysisPage;
