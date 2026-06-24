import React, { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { CriteriaData, CriteriaGroup } from "../../../services/dashboard.service";

interface CriteriaTeamChartProps {
  data: CriteriaData;
  managerName?: string;
}

const scoreColor = (score: number): string => {
  if (score >= 80) return "#2fcc6e";
  if (score >= 60) return "#e6a020";
  if (score >= 40) return "#d97706";
  return "#e64545";
};

const scoreLabel = (score: number): string => {
  if (score >= 80) return "A'lo";
  if (score >= 60) return "Yaxshi";
  if (score >= 40) return "O'rtacha";
  return "Past";
};

const CRITERIA_COLORS = ["#4f6ef7", "#2fcc6e", "#e6a020", "#d97706", "#e64545", "#9b59b6", "#1abc9c"];

const CriteriaChart: React.FC<{ group: CriteriaGroup; label: string; managerName?: string }> = ({ group, label, managerName }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!group.team || Object.keys(group.team).length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center">
        <p className="text-secondary text-sm">{label} bo'yicha tahlil qilingan qo'ng'iroqlar yo'q</p>
      </div>
    );
  }

  const orderedKeys = Object.keys(group.team);

  const chartData = orderedKeys.map((name) => ({
    name,
    score: group.team[name] || 0,
    fill: scoreColor(group.team[name] || 0),
  }));

  const criteriaCards = orderedKeys.map((name, idx) => ({
    name,
    score: group.team[name] || 0,
    color: CRITERIA_COLORS[idx % CRITERIA_COLORS.length],
  }));

  return (
    <div className="space-y-4 overflow-hidden min-w-0">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">{label} mezonlari</h3>
          <p className="text-xs text-secondary">{Object.keys(group.team).length} ta mezon bo'yicha tahlil</p>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1.5 text-accent text-sm hover:underline"
        >
          {showDetails ? "Yashirish" : "Tafsilot"}
          <ChevronDown size={14} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
        </button>
      </div>

      {showDetails && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
          {criteriaCards.map((c) => (
            <div key={c.name} className="bg-card border border-border rounded-xl p-3 md:p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-2">
                  <div className="w-1 h-10 rounded-full mt-0.5" style={{ backgroundColor: c.color }} />
                  <span className="text-sm text-white font-medium leading-tight">{c.name}</span>
                </div>
                <span className="text-2xl font-bold text-white">{c.score}%</span>
              </div>
              {/* Real progress bar (oldingi fake sparkline o'rniga) */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--ds-border-subtle)" }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${c.score}%`, background: c.color }}
                />
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-2xs" style={{ color: "var(--ds-text-muted)" }}>Jamoa o'rtachasi</span>
                <span className="text-2xs font-semibold" style={{ color: c.color }}>{scoreLabel(c.score)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold text-white mb-0.5">
          {label} mezonlariga rioya{managerName ? ` — ${managerName}` : " (Jamoa)"}
        </h3>
        <p className="text-xs md:text-sm text-secondary mb-4 md:mb-5">
          Tahlil qilingan qo'ng'iroqlar asosida
        </p>

        <div className="overflow-x-auto -mx-2 px-2">
          <div style={{ minWidth: "340px" }}>
            <ResponsiveContainer width="99%" height={chartData.length * 44 + 30}>
              <BarChart data={chartData} layout="vertical" barSize={20} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  stroke="#7c7c9a"
                  tick={{ fontSize: 10, fill: "#7c7c9a" }}
                  axisLine={{ stroke: "#27272a" }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="transparent"
                  width={120}
                  tick={{ fontSize: 10, fill: "#d1d5db" }}
                  tickFormatter={(value: string) => value.length > 18 ? value.slice(0, 18) + '...' : value}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--chart-tooltip-bg, #1a1a2e)",
                    border: "1px solid var(--chart-tooltip-border, #2d2d4e)",
                    borderRadius: "10px",
                    color: "var(--chart-tooltip-text, #fff)",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "var(--chart-tooltip-text, #fff)" }}
                  labelStyle={{ color: "#9ca3af" }}
                  cursor={{ fill: "rgba(79, 110, 247, 0.1)" }}
                  formatter={(value: number) => [`${value}% — ${scoreLabel(value)}`, "Ball"]}
                />
                <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const CriteriaTeamChart: React.FC<CriteriaTeamChartProps> = ({ data, managerName }) => {
  const [activeTab, setActiveTab] = useState<"sotuv" | "qayta">("sotuv");

  const hasSotuv = data.sotuv && Object.keys(data.sotuv.team || {}).length > 0;
  const hasQayta = data.qayta && Object.keys(data.qayta.team || {}).length > 0;

  if (!hasSotuv && !hasQayta) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Mezonlar bo'yicha tahlil</h3>
          <p className="text-sm text-secondary">Har bir mezon uchun alohida ko'rsatkichlar</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-primary/50 border border-border rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("sotuv")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "sotuv" ? "bg-accent shadow-sm" : ""
          }`}
          style={{ color: activeTab === "sotuv" ? "#fff" : "var(--color-secondary)" }}
        >
          1-Qo'ng'iroq (Sotuv)
        </button>
        <button
          onClick={() => setActiveTab("qayta")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "qayta" ? "bg-accent shadow-sm" : ""
          }`}
          style={{ color: activeTab === "qayta" ? "#fff" : "var(--color-secondary)" }}
        >
          Qayta qo'ng'iroq
        </button>
      </div>

      {activeTab === "sotuv" && (
        <CriteriaChart group={data.sotuv || { team: {}, managers: {} }} label="Sotuv" managerName={managerName} />
      )}
      {activeTab === "qayta" && (
        <CriteriaChart group={data.qayta || { team: {}, managers: {} }} label="Qayta qo'ng'iroq" managerName={managerName} />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 md:gap-4 pt-3 border-t border-border">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#2fcc6e" }} />
          <span className="text-[10px] md:text-xs text-secondary">A'lo (80+)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#e6a020" }} />
          <span className="text-[10px] md:text-xs text-secondary">Yaxshi (60+)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#d97706" }} />
          <span className="text-[10px] md:text-xs text-secondary">O'rtacha (40+)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#e64545" }} />
          <span className="text-[10px] md:text-xs text-secondary">Past (0-39)</span>
        </div>
      </div>
    </div>
  );
};

export default CriteriaTeamChart;
