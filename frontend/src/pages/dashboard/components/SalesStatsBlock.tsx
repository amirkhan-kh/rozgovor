import React from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { SalesStatsData } from "../../../services/dashboard.service";

interface SalesStatsBlockProps {
  data: SalesStatsData;
  managerName?: string;
}

const COLORS = ["#3b5ef5", "#2fcc6e", "#e6a020", "#e64545", "#9333ea", "#ec4899", "#06b6d4", "#f97316", "#14b8a6"];

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

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

const SalesStatsBlock: React.FC<SalesStatsBlockProps> = ({ data, managerName }) => {
  if (data.managers.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--ds-text-primary)" }}>
          Hali sotuv yo'q
        </p>
        <p className="text-xs" style={{ color: "var(--ds-text-secondary)" }}>
          Birinchi sotuv yopilgach, statistika shu yerda paydo bo'ladi
        </p>
      </div>
    );
  }

  // Manager detail sahifasida — bar chart
  if (managerName) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-sm font-semibold text-white">
            Savdo statistikasi — {managerName}
          </h4>
          <span className="text-xs text-secondary">Jami: {data.total} ta</span>
        </div>
        <p className="text-xs text-secondary mb-4">Sotuvlar soni</p>
        <ResponsiveContainer width="99%" height={280}>
          <BarChart data={data.managers.map((m) => ({ name: m.name, count: m.count, percent: m.percent }))} margin={{ top: 5, right: 10, left: 10, bottom: 40 }} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #2d2d4e)" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 10 }} axisLine={{ stroke: "var(--color-border, #2d2d4e)" }} tickLine={false} angle={-35} textAnchor="end" interval={0} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle.contentStyle} itemStyle={tooltipStyle.itemStyle} labelStyle={tooltipStyle.labelStyle} formatter={(value: number, _: string, props: any) => [`${value} ta (${props.payload.percent}%)`, "Sotuvlar"]} />
            <Bar dataKey="count" fill="#2fcc6e" radius={[6, 6, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Boshqaruv panelida — pie chart + menejerlar ro'yxati
  const pieData = data.managers.map((m) => ({ name: m.name, value: m.count }));

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-white">Savdo statistikasi</h4>
        <span className="text-xs text-secondary">Jami: {data.total} ta</span>
      </div>
      <p className="text-xs text-secondary mb-4">Menejerlar bo'yicha sotuvlar</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chap: Menejerlar ro'yxati */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.managers.map((m, i) => {
            const color = COLORS[i % COLORS.length];
            return (
              <div key={m.name} className="flex items-center gap-3 p-2 rounded-lg hover:bg-primary/30 transition-colors">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {getInitials(m.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white font-medium truncate">{m.name}</div>
                  <div className="text-xs text-secondary">{m.count} ta sotuv · {m.percent}%</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* O'ng: Donut chart */}
        <div className="relative">
          <ResponsiveContainer width="99%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
                labelStyle={tooltipStyle.labelStyle}
                formatter={(value: number, name: string) => [`${value} ta`, name]}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Markaziy raqam */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-3xl font-bold text-white leading-none">{data.total}</div>
              <div className="text-[11px] text-secondary mt-1">Jami</div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-border">
        {data.managers.map((m, i) => (
          <div key={m.name} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-xs text-secondary">{m.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalesStatsBlock;
