import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Phone, Timer } from "lucide-react";
import { DashboardStats } from "../../../types";

interface ManagerDuration {
  name: string;
  avgDuration: number;
  totalDuration: number;
  callsCount: number;
}

interface DurationBlockProps {
  stats: DashboardStats;
  managerName?: string;
  managerDurations?: ManagerDuration[];
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const formatTotalDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const ACCENT = "#3b5ef5";

const tooltipStyle = {
  contentStyle: {
    background: "var(--chart-tooltip-bg, #1a1a2e)",
    border: "1px solid var(--chart-tooltip-border, #2d2d4e)",
    borderRadius: "10px",
    color: "var(--chart-tooltip-text, #fff)",
  },
  itemStyle: { color: "var(--chart-tooltip-text, #fff)" },
  labelStyle: { color: "#9ca3af" },
};

const DurationBlock: React.FC<DurationBlockProps> = ({
  stats,
  managerName,
  managerDurations,
}) => {
  const barData = (managerDurations || []).map((m) => ({
    name: m.name,
    duration: m.avgDuration,
  }));

  const maxDuration = barData.length > 0 ? Math.max(...barData.map((d) => d.duration)) : 0;
  const xMax = Math.ceil(maxDuration / 60) * 60 + 60;

  const tickInterval = xMax > 600 ? 300 : 120;
  const ticks: number[] = [];
  for (let t = 0; t <= xMax; t += tickInterval) {
    ticks.push(t);
  }

  return (
    <div className={`grid grid-cols-1 ${managerName ? "" : "lg:grid-cols-2"} gap-6`}>
      {/* Left: Team stats */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0 flex flex-col">
        <h4 className="text-sm font-semibold text-white mb-1">
          O'rtacha qo'ng'iroq davomiyligi{managerName ? ` — ${managerName}` : " (Jamoa)"}
        </h4>
        <p className="text-xs text-secondary mb-6">
          Tanlangan davr bo'yicha
        </p>

        <div className="flex-1 flex items-center justify-center gap-4 md:gap-8">
          <div className="text-center">
            <div className="text-xs text-secondary mb-1">O'rtacha</div>
            <div className="text-3xl md:text-5xl font-bold text-white tracking-wider leading-none">
              {formatDuration(stats.avgDuration)}
            </div>
          </div>
          <div className="h-16 w-px bg-border" />
          <div className="text-center">
            <div className="text-xs text-secondary mb-1">Jami</div>
            <div className="text-xl md:text-2xl font-bold text-white leading-none">
              {formatTotalDuration(stats.totalDuration)}
            </div>
            <div className="text-xs text-secondary mt-1">
              {stats.totalCalls} Qo'ng'iroqlar
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:gap-4 mt-6">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Phone size={14} style={{ color: ACCENT }} />
              <span className="text-xs text-secondary">Jami soni</span>
            </div>
            <div className="text-xl md:text-2xl font-bold" style={{ color: "#fff" }}>
              {stats.totalCalls}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Timer size={14} style={{ color: ACCENT }} />
              <span className="text-xs text-secondary">Jami davomiylik</span>
            </div>
            <div className="text-xl md:text-2xl font-bold" style={{ color: "#fff" }}>
              {formatTotalDuration(stats.totalDuration)}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Managers vertical bar chart */}
      {!managerName && (
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="text-sm font-semibold text-white mb-1">
          O'rtacha qo'ng'iroq davomiyligi (Menejerlar)
        </h4>
        <p className="text-xs text-secondary mb-4">
          Har bir menejer bo'yicha
        </p>

        {barData.length > 0 ? (
          <div className="overflow-x-auto">
          <div style={{ minWidth: Math.max(320, barData.length * 64) }}>
          <ResponsiveContainer width="99%" height={300}>
            <BarChart
              data={barData}
              margin={{ top: 5, right: 10, left: 10, bottom: 40 }}
              barCategoryGap="15%"
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#2d2d4e"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                axisLine={{ stroke: "#2d2d4e" }}
                tickLine={false}
                angle={-35}
                textAnchor="end"
                interval={0}
              />
              <YAxis
                tickFormatter={(v) => formatDuration(v)}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, xMax]}
                ticks={ticks}
              />
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
                labelStyle={tooltipStyle.labelStyle}
                formatter={(value: number) => [formatDuration(value), "Davomiylik"]}
              />
              <Bar
                dataKey="duration"
                fill={ACCENT}
                radius={[6, 6, 0, 0]}
                maxBarSize={60}
              />
            </BarChart>
          </ResponsiveContainer>
          </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm font-semibold" style={{ color: "var(--ds-text-primary)" }}>
              Davomiylik ma'lumoti yo'q
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--ds-text-secondary)" }}>
              Audio davomiyligi tahlilda topilmadi
            </p>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default DurationBlock;
