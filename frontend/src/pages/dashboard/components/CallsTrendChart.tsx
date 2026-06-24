import React from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import { CallsTrendData } from "../../../services/dashboard.service";

interface CallsTrendChartProps {
  data: CallsTrendData[];
  managerName?: string;
}

const CallsTrendChart: React.FC<CallsTrendChartProps> = ({ data, managerName }) => {
  if (data.length === 0) return null;

  const formatted = data.map((d: any) => ({
    ...d,
    label: d.date.split("-").reverse().join("."),
    count: d.count ?? d.synced ?? 0,
    analyzed: d.analyzed ?? d.count ?? 0,
    synced: d.synced ?? d.count ?? 0,
  }));

  const maxCount = Math.max(...formatted.map((d) => d.synced), 0);
  const yMax = Math.ceil(maxCount * 1.2) || 10;

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-white">
          Qo'ng'iroqlar soni{managerName ? ` — ${managerName}` : " (Jamoa)"}
        </h4>
        <span className="text-xs text-secondary">
          Jami: {formatted.reduce((s: number, d: any) => s + (d.synced || 0), 0)} ta
        </span>
      </div>
      <p className="text-xs text-secondary mb-4">
        Kunlik qo'ng'iroqlar soni trendi
      </p>

      <ResponsiveContainer width="99%" height={280}>
        <AreaChart data={formatted} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCallsTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b5ef5" stopOpacity={0.35} />
              <stop offset="50%" stopColor="#3b5ef5" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#3b5ef5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-card-bg)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="transparent"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            dy={8}
          />
          <YAxis
            stroke="transparent"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            domain={[0, yMax]}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--chart-tooltip-bg, #18181b)",
              border: "1px solid var(--color-border)",
              borderRadius: "10px",
              color: "var(--chart-tooltip-text, #fff)",
              fontSize: "12px",
              padding: "8px 12px",
            }}
            itemStyle={{ color: "#3b5ef5" }}
            labelStyle={{ color: "#7c7c9a", marginBottom: "4px" }}
            formatter={(value: number) => [`${value} ta`, "Sinxronlangan"]}
            cursor={{
              stroke: "#3b5ef5",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }}
          />
          <Area
            type="monotone"
            dataKey="synced"
            stroke="#3b5ef5"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorCallsTrend)"
            dot={false}
            activeDot={{
              r: 5,
              fill: "#3b5ef5",
              stroke: "var(--color-card-bg)",
              strokeWidth: 2,
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CallsTrendChart;
