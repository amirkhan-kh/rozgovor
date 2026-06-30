import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { SpeechRatioData } from "../../../services/dashboard.service";

interface SpeechRatioBlockProps {
  data: SpeechRatioData;
  managerName?: string;
}

const MANAGER_COLOR = "#3b5ef5";
const CLIENT_COLOR = "#2fcc6e";

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

const SpeechRatioBlock: React.FC<SpeechRatioBlockProps> = ({ data, managerName }) => {
  const teamData = [
    { name: "Menejer", value: data.team.manager },
    { name: "Mijoz", value: data.team.client },
  ];

  const totalCalls = data.managers.length;

  // Prepare bar chart data
  const barData = data.managers.map((m) => ({
    name: m.name,
    manager: m.manager,
    client: m.client,
  }));

  return (
    <div className={`grid grid-cols-1 ${managerName ? "" : "lg:grid-cols-2"} gap-6`}>
      {/* Left: Team Donut */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          Nutq nisbati{managerName ? ` — ${managerName}` : " (Jamoa)"}
        </h4>
        <p className="text-xs text-secondary mb-4">
          Tahlil qilingan qo'ng'iroqlar: {totalCalls}
        </p>

        <div className="relative">
          <ResponsiveContainer width="99%" height={220}>
            <PieChart>
              <Pie
                data={teamData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={4}
                dataKey="value"
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                <Cell fill={MANAGER_COLOR} />
                <Cell fill={CLIENT_COLOR} />
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
                labelStyle={tooltipStyle.labelStyle}
                formatter={(value: number, name: string) => [`${value}%`, name]}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-3xl font-bold text-white leading-none">
                {data.team.manager}%
              </div>
              <div className="text-[11px] text-secondary mt-1">Menejer</div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-4 md:gap-8 mt-4">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: MANAGER_COLOR }}
            />
            <span className="text-xs text-secondary">Menejer</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: CLIENT_COLOR }}
            />
            <span className="text-xs text-secondary">Mijoz</span>
          </div>
        </div>

        {/* Percentage breakdown */}
        <div className="text-center mt-3">
          <span className="text-xs text-secondary">
            Menejer:{" "}
            <span className="text-white font-medium">{data.team.manager}%</span>
            {"  "}Mijoz:{" "}
            <span className="text-white font-medium">{data.team.client}%</span>
          </span>
        </div>
      </div>

      {/* Right: Managers Stacked Bar Chart */}
      {!managerName && (
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          Nutq nisbati (Menejerlar)
        </h4>
        <p className="text-xs text-secondary mb-4">
          Har bir menejer bo'yicha (Menejer vs Mijoz)
        </p>

        {barData.length > 0 ? (
          <div className="overflow-x-auto">
          <div style={{ minWidth: Math.max(320, barData.length * 48) }}>
          <ResponsiveContainer width="99%" height={300}>
            <BarChart
              data={barData}
              margin={{ top: 5, right: 10, left: 10, bottom: 40 }}
              barCategoryGap="25%"
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
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
                labelStyle={tooltipStyle.labelStyle}
                formatter={(value: number, name: string) => {
                  const label = name === "manager" ? "Menejer" : "Mijoz";
                  return [`${value}%`, label];
                }}
              />
              <Bar
                dataKey="manager"
                stackId="ratio"
                fill={MANAGER_COLOR}
                radius={[6, 6, 0, 0]}
                name="manager"
                maxBarSize={40}
              />
              <Bar
                dataKey="client"
                stackId="ratio"
                fill={CLIENT_COLOR}
                radius={[6, 6, 0, 0]}
                name="client"
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
          </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm font-semibold" style={{ color: "var(--ds-text-primary)" }}>
              Nutq nisbati hisoblanmadi
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--ds-text-secondary)" }}>
              Tahlil qilingan qo'ng'iroqlar yetarli emas
            </p>
          </div>
        )}

        {/* Legend */}
        <div className="flex justify-center gap-6 mt-5 pt-3 border-t border-border">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: MANAGER_COLOR }}
            />
            <span className="text-xs text-secondary">Menejer</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: CLIENT_COLOR }}
            />
            <span className="text-xs text-secondary">Mijoz</span>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default SpeechRatioBlock;
