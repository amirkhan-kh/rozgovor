import React from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { MessageSquare, DollarSign, AlertTriangle } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile } from "./shared";

const CAT_COLORS: Record<string, string> = {
  Narx: "#ef4444",
  Vaqt: "#f59e0b",
  Ishonch: "#3b82f6",
  Raqobat: "#8b5cf6",
  "Kerak emas": "#64748b",
  Kechiktirish: "#14b8a6",
  Boshqa: "#94a3b8",
};

const ObjectionTrendCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-objection-trend"],
    queryFn: () => analyticsService.objectionTrend(),
  });

  const topCats = (data?.categories || []).slice(0, 4).map((c) => c.type);
  const maxCat = data?.categories.reduce((m, c) => Math.max(m, c.count), 0) || 1;

  return (
    <Card title="E'tiroz / narx trendi va alert" subtitle="AI aniqlagan e'tirozlar oyma-oy; narx e'tirozi oshsa alert">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          {data.priceAlert && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <AlertTriangle size={16} style={{ color: "#ef4444" }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>
                Alert: narx e'tirozi oshdi ({data.narxLastPct}%, {data.narxDelta > 0 ? "+" : ""}{data.narxDelta}pp) — narx yoki skriptni qayta ko'rib chiqing
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatTile icon={<DollarSign size={15} />} color="#ef4444" label="Narx e'tirozi (oxirgi oy)" value={`${data.narxLastPct}%`} sub={`${data.narxDelta > 0 ? "+" : ""}${data.narxDelta}pp`} />
            <StatTile icon={<MessageSquare size={15} />} color="#8b5cf6" label="Eng ko'p e'tiroz" value={data.categories[0]?.type ?? "—"} sub={data.categories[0] ? `${data.categories[0].pct}%` : undefined} />
            <StatTile icon={<MessageSquare size={15} />} color="#3b82f6" label="Kategoriyalar" value={data.categories.length.toString()} />
          </div>

          {data.months.some((m) => m.total > 0) && (
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary,#f5f5f7)" }}>E'tirozlar — oyma-oy (top kategoriyalar)</h4>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.months} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#1f1f2a)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1b5", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#a1a1b5", fontSize: 11 }} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "var(--chart-tooltip-bg,#131319)", border: "1px solid var(--chart-tooltip-border,#1f1f2a)", borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {topCats.map((cat) => (
                    <Line key={cat} type="monotone" dataKey={cat} name={cat} stroke={CAT_COLORS[cat] || "#94a3b8"} strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
            <h4 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary,#f5f5f7)" }}>Kategoriya bo'yicha ulush</h4>
            <div className="space-y-2.5">
              {data.categories.map((c) => (
                <div key={c.type} className="flex items-center gap-3">
                  <span className="w-24 truncate text-[13px] flex-shrink-0" style={{ color: "var(--text-secondary,#a1a1b5)" }}>{c.type}</span>
                  <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--color-border,#1f1f2a)" }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.max(2, (c.count / maxCat) * 100)}%`, background: CAT_COLORS[c.type] || "#94a3b8" }} />
                  </div>
                  <span className="w-20 text-right text-[12px] tabular-nums flex-shrink-0" style={{ color: "var(--text-primary,#f5f5f7)" }}>{c.count} <span style={{ color: "var(--text-muted,#64748b)" }}>· {c.pct}%</span></span>
                </div>
              ))}
            </div>
          </div>

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default ObjectionTrendCard;
