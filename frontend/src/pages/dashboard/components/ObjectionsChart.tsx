import React, { useState } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ObjectionData } from "../../../services/dashboard.service";

interface ObjectionsChartProps {
  data: ObjectionData[];
  managerName?: string;
}

const TYPE_COLORS: Record<string, string> = {
  Kechiktirish: "#e64545",
  Narx: "#2fcc6e",
  Vaqt: "#e6a020",
  Boshqa: "#d97706",
  Ishonch: "#3b5ef5",
  Raqobat: "#7c3aed",
  "Kerak emas": "#9ca3af",
};

const TYPE_DESCRIPTIONS: Record<string, string> = {
  Narx: "Mijoz narxni qimmat deb hisoblaydi, byudjeti yetarli emas yoki moliyaviy imkoniyati cheklangan",
  Vaqt: "Mijoz hozir vaqti yo'q, band, keyinroq ko'rib chiqmoqchi yoki o'ylab ko'rishi kerak deydi",
  Ishonch: "Mijoz natijaga ishonchi komil emas, kafolat so'raydi yoki shubhalanadi",
  Raqobat: "Mijoz allaqachon boshqa kursda o'qiyapti, boshqa joyni tanlagan yoki raqobatchi bilan solishtirmoqda",
  "Kerak emas": "Mijoz hozir bu xizmatga ehtiyoj sezmaydi, qiziqmaydi yoki kerak emas deydi",
  Kechiktirish: "Mijoz qarorni keyinga suradi, hozir emas deydi yoki vaqt so'raydi",
  Boshqa: "Yuqoridagi turkumlarga kirmagan boshqa turdagi e'tirozlar",
};

const FALLBACK_COLORS = ["#e64545", "#2fcc6e", "#e6a020", "#d97706", "#3b5ef5", "#7c7c9a"];

const getColor = (type: string, index: number): string =>
  TYPE_COLORS[type] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];

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

const ObjectionsChart: React.FC<ObjectionsChartProps> = ({ data, managerName }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (data.length === 0) return null;

  const totalObjections = data.reduce((sum, d) => sum + d.count, 0);
  const chartData = data.map((d, i) => ({
    name: d.type,
    value: d.count,
    percent: d.percent,
    color: getColor(d.type, i),
  }));
  const top5 = data.slice(0, 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: Donut Chart */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          E'tirozlar taqsimoti ({totalObjections})
        </h4>
        <p className="text-xs text-secondary mb-4">Teg bo'yicha foiz</p>

        <ResponsiveContainer width="99%" height={260}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle.contentStyle}
              itemStyle={tooltipStyle.itemStyle}
              labelStyle={tooltipStyle.labelStyle}
              formatter={(value: number, name: string) => {
                const item = chartData.find((d) => d.name === name);
                return [`${value} ta (${item?.percent ?? 0}%)`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-3">
          {chartData.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-secondary">{item.name}</span>
            </div>
          ))}
        </div>

        {/* Percentage breakdown */}
        <div className="text-xs text-secondary text-center mt-3">
          {chartData.map((item, i) => (
            <span key={i}>
              {item.name}: {item.percent}%
              {i < chartData.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Right: Accordion list */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          Top 5 mijoz e'tirozlari ({totalObjections}){managerName ? ` — ${managerName}` : " — Jamoa"}
        </h4>
        <p className="text-xs text-secondary mb-4">Teg bo'yicha guruhlangan</p>

        <div className="space-y-1 max-h-[600px] overflow-y-auto pr-1">
          {top5.map((obj, i) => {
            const color = getColor(obj.type, i);
            const isOpen = expanded === obj.type;

            return (
              <div key={i} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : obj.type)}
                  className="w-full py-3 px-4 hover:bg-primary/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    {isOpen ? (
                      <ChevronDown size={14} className="text-secondary" />
                    ) : (
                      <ChevronRight size={14} className="text-secondary" />
                    )}
                    <span className="text-sm text-white font-medium">
                      {obj.type}
                    </span>
                    <span className="text-xs text-secondary">
                      ({obj.count} ta, {obj.percent}%)
                    </span>
                  </div>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{
                      color: color,
                      backgroundColor: color + "18",
                    }}
                  >
                    {obj.percent}%
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-3">
                    <div className="p-3 bg-primary/30 rounded-lg">
                      <p className="text-xs text-secondary leading-relaxed">
                        {TYPE_DESCRIPTIONS[obj.type] || `"${obj.type}" — mijoz tomonidan bildirilgan e'tiroz turi`}
                      </p>
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50">
                        <span className="text-xs text-white">
                          Jami: <span className="font-medium">{obj.count} ta</span>
                        </span>
                        <span className="text-xs text-secondary">
                          Barcha qo'ng'iroqlarning {obj.percent}% ida uchraydi
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ObjectionsChart;
