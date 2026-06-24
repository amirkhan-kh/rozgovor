import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { DashboardStats } from "../../../types";

interface TrendChartProps {
  stats: DashboardStats | undefined;
  trendData: Array<{ date: string; analyzed?: number; synced?: number; count?: number }>;
  managerName?: string;
}

const TrendChart: React.FC<TrendChartProps> = ({ stats, trendData, managerName }) => {
  const growthRate = stats?.growthRate || 0;
  const totalSynced = stats?.totalSynced || 0;
  const totalAnalyzed = stats?.totalCalls || 0;

  const chartData = trendData.map((d) => ({
    date: d.date,
    analyzed: d.analyzed ?? d.count ?? 0,
    synced: d.synced ?? d.count ?? 0,
  }));

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-base md:text-lg font-semibold text-white">
          Jami faoliyat{managerName ? ` — ${managerName}` : " (Jamoa)"}
        </h3>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs md:text-sm text-secondary mt-0.5">
          <span>Sinxronlangan: {totalSynced}</span>
          <span>Tahlil: {totalAnalyzed}</span>
          <span>O'rtacha: {stats?.avgScore || 0}%</span>
        </div>
      </div>

      {/* Metric Cards — yuqorida, doim 2 ustun */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-accent rounded-xl p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold leading-tight" style={{ color: "#ffffff" }}>
            {stats?.avgScore || 0}%
          </div>
          <div className="text-xs md:text-sm mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>O'rtacha ball</div>
          <div className="text-[10px] md:text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>
            {totalAnalyzed} tahlil / {totalSynced} sinxron
          </div>
        </div>

        <div className="bg-accent rounded-xl p-4 md:p-5">
          <div className="text-2xl md:text-3xl font-bold leading-tight" style={{ color: growthRate >= 0 ? "#ffffff" : "#fca5a5" }}>
            {growthRate > 0 ? "+" : ""}{growthRate}%
          </div>
          <div className="text-xs md:text-sm mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>O'sish sur'ati</div>
        </div>
      </div>

      {/* Area Chart */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-4">
        <ResponsiveContainer width="99%" height={250}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSynced" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b5ef5" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b5ef5" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorAnalyzed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2fcc6e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#2fcc6e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              stroke="var(--color-secondary)"
              tick={{ fontSize: 10, fill: "var(--color-secondary)" }}
              tickFormatter={(v) => { const d = v.split("-"); return `${d[2]}.${d[1]}`; }}
            />
            <YAxis stroke="var(--color-secondary)" tick={{ fontSize: 10, fill: "var(--color-secondary)" }} width={35} />
            <Tooltip
              contentStyle={{
                background: "var(--color-card-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "8px",
                color: "var(--text-primary)",
                fontSize: "12px",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) => value === "synced" ? "Sinxron" : "Tahlil"}
            />
            <Area
              type="monotone"
              dataKey="synced"
              stroke="#3b5ef5"
              strokeWidth={2}
              fill="url(#colorSynced)"
              dot={false}
              activeDot={{ r: 4 }}
              name="synced"
            />
            <Area
              type="monotone"
              dataKey="analyzed"
              stroke="#2fcc6e"
              strokeWidth={2}
              fill="url(#colorAnalyzed)"
              dot={false}
              activeDot={{ r: 4 }}
              name="analyzed"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendChart;
