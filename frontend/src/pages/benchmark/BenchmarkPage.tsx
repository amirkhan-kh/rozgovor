import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, TrendingUp, AlertTriangle, Award,
  Phone, Target, Sparkles,
} from "lucide-react";
import { agentsService, BenchmarkStats } from "../../services/agents.service";
import {
  StatCard,
  SectionHeader,
  ScoreBadge,
  InsightBanner,
  EmptyState,
  TrendIndicator,
} from "../../components/ui/stats";
import { SkeletonDashboard } from "../../components/ui/Skeleton";

/**
 * Benchmark sahifasi — Benchmark Agent (Layer 3) ma'lumotlari.
 *
 * Redesign v2:
 *   1. Hero KPIs (StatCard) — 4 ta asosiy ko'rsatkich
 *   2. Narrative insight — "Jamoa qaysi yo'nalishda"
 *   3. Menejerlar reytingi — ScoreBadge bilan
 *   4. Xato distributsiyasi — progress bar + "ustozlarda yo'q" label
 *
 * Abbreviatura yo'q, har raqam kontekstli, trend yo'nalishi ko'rinadi.
 */
const BenchmarkPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<BenchmarkStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await agentsService.getBenchmark();
        setStats(s);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
        <SkeletonDashboard />
      </div>
    );
  }

  if (!stats || stats.teamStats.totalCalls === 0) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <h1 className="text-xl md:text-2xl font-bold mb-6 ds-text-primary">
          Jamoa Benchmark
        </h1>
        <div className="ds-card p-8">
          <EmptyState
            title="Hali ma'lumot yo'q"
            message="Benchmark oxirgi 30 kunlik qo'ng'iroqlardan hisoblanadi. Audio yuklanishi va tahlili tugashini kuting, keyinroq qayta tashrif buyuring."
            action={{ label: "Audio yuklash", onClick: () => navigate("/audio/upload") }}
          />
        </div>
      </div>
    );
  }

  const { teamStats, errorDistribution, managerPercentiles } = stats;

  // Narrative insight — jamoa holati bo'yicha
  const getInsight = (): { kind: "success" | "warning" | "tip" | "info"; title: string; message: string } => {
    if (teamStats.surrenderRate >= 40) {
      const topErr = errorDistribution.find((e) => !e.topPerformerHasIt);
      return {
        kind: "tip",
        title: "Looping texnikasini o'rgatish vaqti",
        message: `Jamoaning ${teamStats.surrenderRate}% e'tirozga taslim bo'lyapti. ${topErr ? `Ustozlarda bu xato yo'q — ularning usulini tarqatish kerak.` : "Haftalik Coaching orqali bu ko'rsatkichni 20% ga tushirish mumkin."}`,
      };
    }
    if (teamStats.avgScore >= 75) {
      return {
        kind: "success",
        title: "Jamoa kuchli holatda",
        message: `O'rtacha ball ${teamStats.avgScore}/100 · Konversiya ${teamStats.avgConversion}%. Hozirgi sur'at saqlansa, bu oy rekord bo'ladi.`,
      };
    }
    return {
      kind: "info",
      title: "Barqaror natija",
      message: `${teamStats.totalCalls} ta qo'ng'iroq · ${teamStats.totalManagers} menejer · ${teamStats.avgConversion}% konversiya. Top sotuvchilar bilan taqqoslab, o'sish yo'llarini ko'ring.`,
    };
  };

  const insight = getInsight();
  const medalEmoji = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 lg:space-y-8">
      {/* ── Header ──────────────────────────────────────── */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold ds-text-primary">Jamoa Benchmark</h1>
        <p className="text-sm ds-text-secondary mt-1">
          Oxirgi 30 kunlik statistika · {teamStats.totalCalls} qo'ng'iroq · {teamStats.totalManagers} menejer
        </p>
      </div>

      {/* ── Hero KPIs ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="O'rtacha ball"
          value={teamStats.avgScore}
          unit="/100"
          variant={teamStats.avgScore >= 75 ? "success" : teamStats.avgScore >= 60 ? "warning" : "danger"}
          icon={<Target size={14} />}
        />
        <StatCard
          label="Konversiya"
          value={teamStats.avgConversion}
          unit="%"
          variant={teamStats.avgConversion >= 18 ? "success" : teamStats.avgConversion >= 12 ? "warning" : "danger"}
          icon={<Award size={14} />}
        />
        <StatCard
          label="Taslim stavka"
          value={teamStats.surrenderRate}
          unit="%"
          variant={teamStats.surrenderRate <= 25 ? "success" : teamStats.surrenderRate <= 40 ? "warning" : "danger"}
          icon={<AlertTriangle size={14} />}
        />
        <StatCard
          label="Ochiq yakun"
          value={teamStats.openEndingRate}
          unit="%"
          variant={teamStats.openEndingRate <= 25 ? "success" : teamStats.openEndingRate <= 40 ? "warning" : "danger"}
          icon={<Phone size={14} />}
        />
      </div>

      {/* ── Narrative insight ───────────────────────────── */}
      <InsightBanner
        kind={insight.kind}
        title={insight.title}
        message={insight.message}
      />

      {/* ── Main content — 2 columns ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Menejerlar reytingi */}
        <div className="ds-card p-5 md:p-6 lg:col-span-3">
          <SectionHeader
            title="Menejerlar reytingi"
            subtitle="Ball bo'yicha tartiblanganda"
            icon={<Users size={18} />}
          />
          <div className="space-y-2">
            {managerPercentiles.map((m) => (
              <div
                key={m.managerId}
                className="flex items-center gap-3 p-3 rounded-lg transition-colors"
                style={{
                  background: m.rank === 1 ? "var(--ds-gold-bg)" : "var(--ds-bg-overlay)",
                  border: m.rank === 1 ? "1px solid var(--ds-gold-br)" : "1px solid var(--ds-border-subtle)",
                }}
              >
                <span className="text-lg w-8 text-center flex-shrink-0">{medalEmoji(m.rank)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate ds-text-primary">
                    {m.managerName}
                  </p>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {m.strongCriteria.slice(0, 2).map((c, i) => (
                      <span
                        key={`s-${i}`}
                        className="text-2xs px-1.5 py-0.5 rounded"
                        style={{ background: "var(--ds-success-bg)", color: "var(--ds-success)" }}
                      >
                        ✓ {c}
                      </span>
                    ))}
                    {m.weakCriteria.slice(0, 1).map((c, i) => (
                      <span
                        key={`w-${i}`}
                        className="text-2xs px-1.5 py-0.5 rounded"
                        style={{ background: "var(--ds-danger-bg)", color: "var(--ds-danger)" }}
                      >
                        ⚠ {c}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-2xs ds-text-muted uppercase font-semibold">Konversiya</p>
                    <p className="text-sm font-bold ds-text-primary">{m.conversionRate}%</p>
                  </div>
                  {/* Jamoa o'rtachasiga nisbatan delta — TrendIndicator */}
                  <TrendIndicator
                    value={m.avgScore - teamStats.avgScore}
                    format="number"
                    positiveDirection="up"
                    label="Jamoa o'rtachasiga nisbatan"
                    size="sm"
                    stableThreshold={1}
                  />
                  <ScoreBadge score={m.avgScore} size="md" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Xato distributsiyasi */}
        <div className="ds-card p-5 md:p-6 lg:col-span-2">
          <SectionHeader
            title="Eng ko'p xatolar"
            subtitle="Jamoa uchun umumiy zaif joylar"
            icon={<AlertTriangle size={18} />}
          />
          <div className="space-y-3">
            {errorDistribution.slice(0, 6).map((e) => (
              <div key={e.type}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold truncate ds-text-primary">{e.type}</p>
                  <span
                    className="text-2xs font-bold flex-shrink-0 ml-2"
                    style={{
                      color:
                        e.teamPercent > 50 ? "var(--ds-danger)"
                        : e.teamPercent > 30 ? "var(--ds-warning)"
                        : "var(--ds-info)",
                    }}
                  >
                    {e.teamPercent}%
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--ds-border-subtle)" }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${e.teamPercent}%`,
                      background:
                        e.teamPercent > 50 ? "var(--ds-danger)"
                        : e.teamPercent > 30 ? "var(--ds-warning)"
                        : "var(--ds-info)",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-2xs ds-text-muted">
                    {e.managersWithError}/{managerPercentiles.length} menejer · {e.count} marta
                  </span>
                  {!e.topPerformerHasIt && (
                    <span
                      className="text-2xs font-semibold flex items-center gap-0.5"
                      style={{ color: "var(--ds-success)" }}
                    >
                      <Sparkles size={10} />
                      Ustozlarda yo'q
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer note ─────────────────────────────────── */}
      <div
        className="flex items-center justify-center gap-2 text-xs pt-2"
        style={{ color: "var(--ds-text-muted)" }}
      >
        <TrendingUp size={12} />
        <span>Ma'lumot har soat avtomatik yangilanadi</span>
      </div>
    </div>
  );
};

export default BenchmarkPage;
