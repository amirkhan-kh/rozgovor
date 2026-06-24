import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Phone, TrendingUp, Target, AlertTriangle, Award, Users,
  ArrowRight, Sparkles, BarChart3,
} from "lucide-react";
import { dashboardService, DashboardFilters } from "../../services/dashboard.service";
import { managersService } from "../../services/managers.service";
import { agentsService } from "../../services/agents.service";
import { useAuth } from "../../store/authStore";
import DailyLessonBanner from "../../components/dashboard/DailyLessonBanner";
import {
  StatCard,
  InsightBanner,
  SectionHeader,
  ScoreBadge,
} from "../../components/ui/stats";
import { generateInsight, generateBadgeLabel } from "./insightEngine";
import { SkeletonDashboard } from "../../components/ui/Skeleton";

/**
 * Audio davomiyligi (sekundda) → "Xs Ym" formatiga:
 *   5400 → "1 soat 30 min"
 *   323100 → "89 soat 45 min"
 *   45 → "45 son"
 */
function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return "0 min";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} soat`;
  return `${h}s ${m}m`;
}

/**
 * Sotuv summasi (so'm) → qisqa format:
 *   15_000_000 → "15 mln so'm"
 *   1_500_000 → "1.5 mln so'm"
 *   850_000 → "850k so'm"
 *   0 → "0 so'm"
 */
function formatSaleAmount(amount: number): string {
  if (!amount || amount <= 0) return "0 so'm";
  if (amount >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")} mlrd so'm`;
  }
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")} mln so'm`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}k so'm`;
  }
  return `${amount} so'm`;
}

/**
 * Dashboard v2 — Narrative-driven design.
 *
 * Tuzilma (5 section, inverted pyramid):
 *   1. Daily Lesson (Distiller banner)
 *   2. Hero KPIs — 2 ta katta raqam (ball + conversion)
 *   3. Focus Today — auto insight + red-alerts
 *   4. Team Snapshot — top managers + weak spots + trends
 *   5. Footer — link to /dashboard/analysis (batafsil)
 *
 * Principles: Refactoring UI hierarchy, storytelling with data,
 * 10-second rule, single primary action per screen.
 */
const DashboardPage: React.FC = () => {
  const { userRole, managerUser } = useAuth();
  const navigate = useNavigate();

  // ── Filters ─────────────────────────────────────────────
  const [period] = useState("month");
  const [managerId, setManagerId] = useState("all");
  const [viewAll, setViewAllState] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem("dashboardViewAll") === "1";
    } catch { return false; }
  });
  const setViewAll = (v: boolean) => {
    setViewAllState(v);
    try { sessionStorage.setItem("dashboardViewAll", v ? "1" : "0"); } catch {}
  };

  // Manager role enforcement
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

  if (userRole === "manager" && managerUser && !managerUser.canViewDashboard) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="ds-card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2 ds-text-primary">Ruxsat yo'q</h2>
          <p className="ds-text-secondary">Sizda dashboard ko'rish ruxsati yo'q</p>
        </div>
      </div>
    );
  }

  const filters: DashboardFilters = {
    period,
    managerId,
  };

  // ── Data fetching ───────────────────────────────────────
  const { data: managers } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["dashboard-stats", filters],
    queryFn: () => dashboardService.getStats(filters),
  });

  const { data: benchmark, isLoading: benchmarkLoading } = useQuery({
    queryKey: ["benchmark"],
    queryFn: () => agentsService.getBenchmark().catch(() => null),
    staleTime: 60 * 1000,
  });

  const { data: redAlerts = [] } = useQuery({
    queryKey: ["red-alerts"],
    queryFn: () => agentsService.getRedAlerts().catch(() => []),
    refetchInterval: 60000,
  });

  // ── Derived data ────────────────────────────────────────
  const scoreVariant =
    stats && stats.avgScore >= 80 ? "success"
    : stats && stats.avgScore >= 60 ? "warning"
    : "danger";

  const insight = generateInsight({
    stats,
    benchmark,
    redAlerts,
    managerName: managerUser?.name,
  });

  const topManagers = benchmark?.managerPercentiles.slice(0, 3) || [];
  const worstErrors = benchmark?.errorDistribution.slice(0, 3) || [];

  // Trend deltas — from benchmark (last 30 days)
  const teamStats = benchmark?.teamStats;

  const isLoading = statsLoading || benchmarkLoading;
  const isEmpty = !isLoading && (!stats || stats.totalCalls === 0);

  // Fresh account yoki loading — skeletonni ko'rsatamiz.
  // Faqat haqiqiy data bor paytda to'liq dashboardga o'tamiz.
  if (isLoading || isEmpty) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <SkeletonDashboard />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8">
      {/* ── Toolbar: view toggle + filters ───────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold ds-text-primary">
            {managerUser?.canViewAll && !viewAll ? `Salom, ${managerUser.name}` : "Dashboard"}
          </h1>
          <p className="text-sm ds-text-secondary mt-0.5">
            {stats?.totalCalls} ta qo'ng'iroq · {generateBadgeLabel(stats)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {userRole === "manager" && managerUser?.canViewAll && (
            <div
              className="flex rounded-xl p-1 gap-1 border"
              style={{ background: "var(--ds-bg-surface)", borderColor: "var(--ds-border-default)" }}
            >
              <button
                type="button"
                onClick={() => setViewAll(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                style={{
                  background: !viewAll ? "var(--ds-primary)" : "transparent",
                  color: !viewAll ? "#ffffff" : "var(--ds-text-primary)",
                }}
              >
                Mening
              </button>
              <button
                type="button"
                onClick={() => setViewAll(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                style={{
                  background: viewAll ? "var(--ds-primary)" : "transparent",
                  color: viewAll ? "#ffffff" : "var(--ds-text-primary)",
                }}
              >
                Jamoa
              </button>
            </div>
          )}
          <button
            onClick={() => navigate("/dashboard/analysis")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{
              background: "var(--ds-bg-surface)",
              border: "1px solid var(--ds-border-default)",
              color: "var(--ds-text-primary)",
            }}
          >
            <BarChart3 size={14} />
            Batafsil tahlil
          </button>
        </div>
      </div>

      {/* ── 1. Daily Lesson (Distiller) ─────────────────── */}
      <DailyLessonBanner />

      {/* ── 2. Hero KPIs ─────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
          <StatCard
            hero
            label="O'rtacha ball"
            value={stats.avgScore}
            unit="/100"
            variant={scoreVariant}
            trend={
              typeof stats.growthRate === "number"
                ? {
                    value: stats.growthRate,
                    format: "percent",
                    positiveDirection: "up",
                    label: "o'tgan davrga nisbatan",
                  }
                : undefined
            }
            comparison={
              teamStats
                ? { label: "Jamoa o'rtachasi", value: `${teamStats.avgScore}/100` }
                : undefined
            }
            icon={<Sparkles size={18} />}
            insight={
              stats.avgScore >= 80
                ? "Ajoyib natija — top sotuvchilar darajasida"
                : stats.avgScore >= 60
                ? "O'rta daraja — Coach'dan maslahat oling, yuqoriga ko'tariling"
                : "Zaif — haftalik strategiyada aniq diqqat joyi tanlang"
            }
          />
          <StatCard
            hero
            label="Konversiya"
            value={teamStats ? teamStats.avgConversion : "—"}
            unit="%"
            variant={
              teamStats && teamStats.avgConversion >= 18
                ? "success"
                : teamStats && teamStats.avgConversion >= 12
                ? "warning"
                : "danger"
            }
            comparison={
              teamStats
                ? { label: "Taslim stavka", value: `${teamStats.surrenderRate}%` }
                : undefined
            }
            icon={<Target size={18} />}
            insight={
              teamStats && teamStats.avgConversion >= 18
                ? "Maqsaddan ko'proq — shu ritmda davom eting"
                : teamStats
                ? `Jami ${teamStats.totalCalls} qo'ng'iroqdan ${Math.round((teamStats.avgConversion / 100) * teamStats.totalCalls)} sotuv`
                : "Ma'lumot yig'ilmoqda..."
            }
          />
        </div>
      )}

      {/* ── 3. Focus Today — insight + red-alerts ───────── */}
      {!isEmpty && (
        <div className="space-y-3">
          <InsightBanner
            kind={insight.kind}
            title={insight.title}
            message={insight.message}
            action={
              insight.action
                ? {
                    label: insight.action.label,
                    onClick: () => navigate(insight.action!.path),
                  }
                : undefined
            }
          />

          {redAlerts.length > 0 && (
            <div>
              <SectionHeader
                title="🚨 Zudlik kerak bo'lgan leadlar"
                subtitle={`${redAlerts.length} ta bitim xavf ostida · AmoCRM uslubida`}
                icon={<AlertTriangle size={18} />}
              />
              {/* AmoCRM-style 3 column kanban board */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                {([
                  {
                    key: "critical",
                    label: "Kritik",
                    description: "Callback deadline o'tib ketdi",
                    color: "var(--ds-danger)",
                    bg: "var(--ds-danger-bg)",
                    border: "var(--ds-danger-br)",
                    count: redAlerts.filter((a) => a.riskLevel === "critical").length,
                  },
                  {
                    key: "high",
                    label: "Yuqori",
                    description: "Keyingi qadam aniqlanmagan",
                    color: "var(--ds-warning)",
                    bg: "var(--ds-warning-bg)",
                    border: "var(--ds-warning-br)",
                    count: redAlerts.filter((a) => a.riskLevel === "high").length,
                  },
                  {
                    key: "medium",
                    label: "O'rta",
                    description: "Diqqat qarating",
                    color: "var(--ds-info)",
                    bg: "var(--ds-info-bg)",
                    border: "var(--ds-info-br)",
                    count: redAlerts.filter((a) => a.riskLevel === "medium").length,
                  },
                ] as const).map((col) => {
                  const items = redAlerts.filter((a) => a.riskLevel === col.key);
                  return (
                    <div
                      key={col.key}
                      className="rounded-xl overflow-hidden flex flex-col"
                      style={{
                        background: "var(--ds-bg-surface)",
                        border: "1px solid var(--ds-border-default)",
                        minHeight: 220,
                      }}
                    >
                      {/* Column header */}
                      <div
                        className="px-4 py-3 flex items-center justify-between"
                        style={{
                          background: col.bg,
                          borderBottom: `1px solid ${col.border}`,
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: col.color }}
                          />
                          <div className="min-w-0">
                            <p
                              className="text-2xs font-bold uppercase tracking-wider"
                              style={{ color: col.color }}
                            >
                              {col.label}
                            </p>
                            <p className="text-2xs truncate" style={{ color: "var(--ds-text-muted)" }}>
                              {col.description}
                            </p>
                          </div>
                        </div>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{
                            background: "var(--ds-bg-surface)",
                            color: col.color,
                            border: `1px solid ${col.border}`,
                          }}
                        >
                          {col.count}
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: 400 }}>
                        {items.length === 0 ? (
                          <div
                            className="py-6 text-center text-2xs"
                            style={{ color: "var(--ds-text-muted)" }}
                          >
                            Bu darajada lead yo'q ✓
                          </div>
                        ) : (
                          items.map((a) => (
                            <div
                              key={a.id}
                              className="p-3 rounded-lg transition-all cursor-pointer hover:translate-y-[-1px] hover:shadow-md"
                              style={{
                                background: "var(--ds-bg-overlay)",
                                border: "1px solid var(--ds-border-subtle)",
                                borderLeftWidth: 3,
                                borderLeftColor: col.color,
                              }}
                              onClick={() => {
                                if (a.leadId) {
                                  navigate(`/leads/${a.leadId}`);
                                } else if (a.audioFileIds && a.audioFileIds.length > 0) {
                                  navigate(`/audio/${a.audioFileIds[0]}`);
                                }
                              }}
                              title={a.leadId ? "Lead sahifasini ochish" : "Audio detailni ochish"}
                            >
                              <p
                                className="text-sm font-semibold leading-snug mb-1.5 line-clamp-2"
                                style={{ color: "var(--ds-text-primary)" }}
                              >
                                {a.reason}
                              </p>
                              <p
                                className="text-xs leading-snug mb-2 line-clamp-2"
                                style={{ color: "var(--ds-text-secondary)" }}
                              >
                                💡 {a.suggestion}
                              </p>
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className="text-2xs"
                                  style={{ color: "var(--ds-text-muted)" }}
                                >
                                  {new Date(a.createdAt).toLocaleDateString("uz-UZ", {
                                    day: "2-digit",
                                    month: "short",
                                  })}
                                </span>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await agentsService.acknowledgeRedAlert(a.id);
                                    window.location.reload();
                                  }}
                                  className="text-2xs px-2 py-0.5 rounded transition-colors hover:opacity-80"
                                  style={{
                                    background: "var(--ds-bg-surface)",
                                    color: "var(--ds-text-muted)",
                                    border: "1px solid var(--ds-border-default)",
                                  }}
                                >
                                  ✓ Bajarildi
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Team Snapshot — 3 columns ────────────────── */}
      {!isEmpty && benchmark && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 items-stretch">
          {/* Top 3 managers */}
          <div className="ds-card p-4 md:p-5 h-full flex flex-col">
            <SectionHeader
              title="Top sotuvchilar"
              subtitle="Eng yuqori ball"
              icon={<Award size={18} />}
            />
            {topManagers.length === 0 ? (
              <p className="text-sm ds-text-muted">
                Hech bo'lmaganda 3 ta menejer kerak — ko'proq audio yuklang
              </p>
            ) : (
              <div className="space-y-2">
                {topManagers.map((m, i) => (
                  <div
                    key={m.managerId}
                    className="flex items-center gap-3 p-2 rounded-lg transition-colors"
                    style={{ background: i === 0 ? "var(--ds-gold-bg)" : "var(--ds-bg-overlay)" }}
                  >
                    <span className="text-lg flex-shrink-0 w-6 text-center">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate ds-text-primary">
                        {m.managerName}
                      </p>
                      <p className="text-2xs ds-text-muted">{m.conversionRate}% konversiya</p>
                    </div>
                    <ScoreBadge score={m.avgScore} size="sm" showLabel={false} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Worst errors (team-wide weak spots) */}
          <div className="ds-card p-4 md:p-5 h-full flex flex-col">
            <SectionHeader
              title="Zaif joylar"
              subtitle="Jamoa eng ko'p qiladigan xato"
              icon={<AlertTriangle size={18} />}
            />
            {worstErrors.length === 0 ? (
              <p className="text-sm ds-text-muted">Xato topilmadi — ajoyib!</p>
            ) : (
              <div className="space-y-2">
                {worstErrors.map((e) => (
                  <div key={e.type} className="p-2 rounded-lg" style={{ background: "var(--ds-bg-overlay)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold truncate ds-text-primary">{e.type}</p>
                      <span
                        className="text-2xs font-bold flex-shrink-0 ml-2"
                        style={{
                          color: e.teamPercent > 50 ? "var(--ds-danger)"
                            : e.teamPercent > 30 ? "var(--ds-warning)"
                            : "var(--ds-info)",
                        }}
                      >
                        {e.teamPercent}%
                      </span>
                    </div>
                    <div
                      className="h-1 rounded-full overflow-hidden"
                      style={{ background: "var(--ds-border-subtle)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${e.teamPercent}%`,
                          background:
                            e.teamPercent > 50 ? "var(--ds-danger)"
                            : e.teamPercent > 30 ? "var(--ds-warning)"
                            : "var(--ds-info)",
                        }}
                      />
                    </div>
                    {!e.topPerformerHasIt && (
                      <p className="text-2xs mt-1" style={{ color: "var(--ds-success)" }}>
                        ✓ Ustozlarda bu xato yo'q — ulardan o'rganing
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Trend deltas (week-over-week) */}
          <div className="ds-card p-4 md:p-5 h-full flex flex-col">
            <SectionHeader
              title="Haftalik trend"
              subtitle="Asosiy ko'rsatkichlar"
              icon={<TrendingUp size={18} />}
            />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm ds-text-secondary">O'rtacha ball</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold ds-text-primary">{teamStats?.avgScore || 0}</span>
                  <span className="text-2xs font-bold" style={{ color: "var(--ds-success)" }}>
                    ↑ +{Math.max(0, stats?.growthRate || 0)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm ds-text-secondary">Konversiya</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold ds-text-primary">{teamStats?.avgConversion || 0}%</span>
                  <span
                    className="text-2xs font-bold"
                    style={{
                      color: (teamStats?.avgConversion || 0) >= 15 ? "var(--ds-success)" : "var(--ds-warning)",
                    }}
                  >
                    {(teamStats?.avgConversion || 0) >= 15 ? "✓" : "→"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm ds-text-secondary">Taslim stavka</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold ds-text-primary">{teamStats?.surrenderRate || 0}%</span>
                  <span
                    className="text-2xs font-bold"
                    style={{
                      color: (teamStats?.surrenderRate || 0) <= 30 ? "var(--ds-success)" : "var(--ds-danger)",
                    }}
                  >
                    {(teamStats?.surrenderRate || 0) <= 30 ? "↓" : "↑"}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm ds-text-secondary">Ochiq yakun</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold ds-text-primary">{teamStats?.openEndingRate || 0}%</span>
                </div>
              </div>

              <button
                onClick={() => navigate("/benchmark")}
                className="w-full mt-2 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                style={{
                  background: "var(--ds-primary-bg)",
                  color: "var(--ds-primary)",
                }}
              >
                To'liq benchmark
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Quick stats — 3:2 layout ──────────────────── */}
      {!isEmpty && stats && (
        <div className="space-y-3">
          {/* Qator 1: 3 ta karta — asosiy raqamlar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Qo'ng'iroqlar"
              value={stats.totalCalls}
              variant="primary"
              icon={<Phone size={14} />}
            />
            <StatCard
              label="Menejerlar"
              value={managers?.length || 0}
              variant="neutral"
              icon={<Users size={14} />}
            />
            <StatCard
              label="Top ball"
              value={stats.topScore?.score || 0}
              unit="/100"
              variant="warning"
            />
          </div>
          {/* Qator 2: 2 ta keng karta — davomiylik + sotuv */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              label="Audio davomiyligi"
              value={formatDuration(stats.totalDuration || 0)}
              variant="info"
            />
            <StatCard
              label="Sotuv summasi"
              value={formatSaleAmount((stats as any).totalSaleAmount || 0)}
              variant="success"
            />
          </div>
        </div>
      )}

      {/* ── 6. Link to detailed analysis ────────────────── */}
      {!isEmpty && (
        <div className="flex items-center justify-center pt-4">
          <button
            onClick={() => navigate("/dashboard/analysis")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:scale-105"
            style={{
              background: "var(--ds-bg-surface)",
              border: "1px solid var(--ds-border-default)",
              color: "var(--ds-text-primary)",
            }}
          >
            <BarChart3 size={16} />
            Batafsil tahlil — xatolar, e'tirozlar, funnel sizishi
            <ArrowRight size={14} />
          </button>
        </div>
      )}

    </div>
  );
};

export default DashboardPage;
