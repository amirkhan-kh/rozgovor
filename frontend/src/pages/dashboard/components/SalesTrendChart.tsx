import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { SalesTrendData } from "../../../services/dashboard.service";

interface SalesTrendChartProps {
  data: SalesTrendData[];
  managerName?: string;
}

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

const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data, managerName }) => {
  if (data.length === 0) return null;

  const formatted = data.map((d) => ({
    ...d,
    label: d.date.split("-").reverse().slice(0, 2).join("."),
  }));

  const totalSales = formatted.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...formatted.map((d) => d.count), 0);
  const avg = formatted.length > 0 ? totalSales / formatted.length : 0;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-white">
          Kunlik sotuvlar{managerName ? ` — ${managerName}` : ""}
        </h4>
        <span className="text-xs text-secondary">
          Jami: {totalSales} ta · O'rtacha: {avg.toFixed(1)}/kun
        </span>
      </div>
      <p className="text-xs text-secondary mb-4">
        Har kungi sotuv soni — qaysi kuni o'sish, qaysi kuni pasayish ko'rinadi
      </p>

      <ResponsiveContainer width="99%" height={320}>
        <LineChart data={formatted} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2fcc6e" stopOpacity={1} />
              <stop offset="100%" stopColor="#2fcc6e" stopOpacity={0.3} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #2d2d4e)" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="var(--color-secondary, #9ca3af)"
            tick={{ fontSize: 11, fill: "var(--color-secondary, #9ca3af)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-border, #2d2d4e)" }}
          />
          <YAxis
            stroke="var(--color-secondary, #9ca3af)"
            tick={{ fontSize: 11, fill: "var(--color-secondary, #9ca3af)" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            domain={[0, Math.ceil(maxCount * 1.2) || 5]}
          />
          <Tooltip
            contentStyle={tooltipStyle.contentStyle}
            itemStyle={tooltipStyle.itemStyle}
            labelStyle={tooltipStyle.labelStyle}
            formatter={(value: number) => [`${value} ta`, "Sotuv"]}
          />
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke="#9ca3af"
              strokeDasharray="4 4"
              label={{
                value: `O'rtacha ${avg.toFixed(1)}`,
                position: "right",
                fill: "#9ca3af",
                fontSize: 10,
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="count"
            stroke="url(#lineGrad)"
            strokeWidth={3}
            dot={{ r: 4, fill: "#2fcc6e", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#2fcc6e" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SalesTrendChart;
