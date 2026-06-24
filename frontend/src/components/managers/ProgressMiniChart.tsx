import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import Card from "../ui/Card";
import { agentsService, ManagerProgress } from "../../services/agents.service";

interface Props {
  managerId: string;
}

/**
 * ManagerDetailPage uchun 4 haftalik Progress chart.
 * Progress Agent (Layer 4) ma'lumotlaridan foydalanadi.
 * SVG sparkline + delta ko'rsatkichlar.
 */
const ProgressMiniChart: React.FC<Props> = ({ managerId }) => {
  const [history, setHistory] = useState<ManagerProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = async () => {
    try {
      const h = await agentsService.getProgress(managerId);
      setHistory(h || []);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managerId]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await agentsService.refreshProgress(managerId);
      await loadHistory();
    } catch {}
    setRefreshing(false);
  };

  if (loading) {
    return (
      <Card>
        <div className="h-32 animate-pulse" style={{ background: "var(--color-bg-secondary)" }} />
      </Card>
    );
  }

  // Eng so'nggi 4 haftani olish (tartibi eskidan yangiga)
  const recent = history.slice(0, 4).reverse();

  if (recent.length === 0) {
    return (
      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            📈 Progress (4 hafta)
          </p>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-xs text-secondary hover:text-primary underline"
          >
            {refreshing ? "..." : "Yangilash"}
          </button>
        </div>
        <p className="text-sm text-secondary text-center py-6">
          Hali progress ma'lumoti yo'q.
          <br />
          <button onClick={refresh} disabled={refreshing} className="underline mt-2">
            Birinchi snapshot yaratish
          </button>
        </p>
      </Card>
    );
  }

  const latest = recent[recent.length - 1];
  const earliest = recent[0];
  const deltaScore = Math.round((latest.avgScore - earliest.avgScore) * 10) / 10;
  const deltaConv = Math.round((latest.conversionRate - earliest.conversionRate) * 10) / 10;

  // SVG sparkline — score trend
  const width = 260;
  const height = 60;
  const scores = recent.map((r) => r.avgScore);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = Math.max(1, maxScore - minScore);
  const points = scores
    .map((s, i) => {
      const x = (i / Math.max(1, scores.length - 1)) * (width - 20) + 10;
      const y = height - 10 - ((s - minScore) / range) * (height - 20);
      return `${x},${y}`;
    })
    .join(" ");

  const trendIcon =
    deltaScore > 1 ? <TrendingUp size={14} color="#2fcc6e" /> :
    deltaScore < -1 ? <TrendingDown size={14} color="#e64545" /> :
    <Minus size={14} color="#e6a020" />;

  const trendColor = deltaScore > 1 ? "#2fcc6e" : deltaScore < -1 ? "#e64545" : "#e6a020";

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
            📈 Progress (4 hafta)
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs text-secondary hover:text-primary underline"
        >
          {refreshing ? "Yangilanmoqda..." : "Yangilash"}
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div
          className="p-3 rounded-lg"
          style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}
        >
          <p className="text-[10px] text-secondary uppercase mb-1">O'rtacha ball</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {Math.round(latest.avgScore)}
            </p>
            <div className="flex items-center gap-0.5 text-xs" style={{ color: trendColor }}>
              {trendIcon}
              <span>{deltaScore > 0 ? `+${deltaScore}` : deltaScore}</span>
            </div>
          </div>
        </div>
        <div
          className="p-3 rounded-lg"
          style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}
        >
          <p className="text-[10px] text-secondary uppercase mb-1">Konversiya</p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {latest.conversionRate}%
            </p>
            <div
              className="flex items-center gap-0.5 text-xs"
              style={{ color: deltaConv > 0 ? "#2fcc6e" : deltaConv < 0 ? "#e64545" : "#e6a020" }}
            >
              {deltaConv > 0 ? "+" : ""}
              {deltaConv}%
            </div>
          </div>
        </div>
      </div>

      {/* SVG sparkline */}
      {scores.length >= 2 && (
        <div className="mb-3">
          <p className="text-[10px] text-secondary uppercase mb-2">Ball chizig'i</p>
          <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
            <polyline
              points={points}
              fill="none"
              stroke={trendColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {scores.map((s, i) => {
              const x = (i / Math.max(1, scores.length - 1)) * (width - 20) + 10;
              const y = height - 10 - ((s - minScore) / range) * (height - 20);
              return <circle key={i} cx={x} cy={y} r="3" fill={trendColor} />;
            })}
          </svg>
        </div>
      )}

      {/* Coaching effectiveness + goals */}
      {(latest.coachingEffectiveness !== null || latest.weeklyGoalsTotal > 0) && (
        <div
          className="pt-3 mt-3 flex items-center justify-between text-xs"
          style={{ borderTop: "1px solid var(--color-border)" }}
        >
          {latest.coachingEffectiveness !== null && (
            <span className="text-secondary">
              Coaching samaradorligi: <b style={{ color: "var(--text-primary)" }}>{latest.coachingEffectiveness}%</b>
            </span>
          )}
          {latest.weeklyGoalsTotal > 0 && (
            <span className="text-secondary">
              Maqsadlar: <b style={{ color: "var(--text-primary)" }}>{latest.weeklyGoalsCompleted}/{latest.weeklyGoalsTotal}</b>
            </span>
          )}
        </div>
      )}
    </Card>
  );
};

export default ProgressMiniChart;
