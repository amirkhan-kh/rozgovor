import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ArrowLeftRight, ArrowRight, UserMinus, UserPlus, Users } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

const GIVEN = "#f59e0b"; // berilgan (chiqib ketgan)
const RECEIVED = "#22c55e"; // qabul qilingan (kelgan)

const PERIODS: { label: string; days: number }[] = [
  { label: "Hammasi", days: 0 },
  { label: "90 kun", days: 90 },
  { label: "30 kun", days: 30 },
  { label: "7 kun", days: 7 },
];

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

const Tile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}> = ({ icon, label, value, sub, color = "#3b82f6" }) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2" style={{ color }}>
      {icon}
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-secondary,#94a3b8)" }}>
        {label}
      </span>
    </div>
    <div className="text-2xl font-bold" style={{ color: "var(--text-primary,#fff)" }}>
      {value}
    </div>
    {sub && <div className="text-xs mt-1" style={{ color: "var(--text-secondary,#94a3b8)" }}>{sub}</div>}
  </div>
);

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const LeadTransfersSection: React.FC = () => {
  const [days, setDays] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-lead-transfers", days],
    queryFn: () => analyticsService.leadTransfers(days),
  });

  const chartData = (data?.perManager || []).map((m) => ({
    name: m.name,
    given: m.given,
    received: m.received,
  }));

  return (
    <Card
      title="Lead transfer tarixi (kim → kim)"
      subtitle="Lead bir menejerdan boshqasiga o'tgan holatlar — qabul qilingan va berilgan"
    >
      {/* Davr boshqaruvi */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {PERIODS.map((p) => {
          const active = p.days === days;
          return (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: active ? "var(--color-accent, #3b5ef5)" : "var(--color-card-bg, #15151f)",
                color: active ? "#fff" : "var(--text-secondary, #94a3b8)",
                border: "1px solid var(--color-border, #2d2d4e)",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="py-10 flex justify-center"><LoadingSpinner /></div>
      ) : !data || data.total === 0 ? (
        <div className="text-center py-10">
          <ArrowLeftRight size={32} className="mx-auto mb-2" style={{ color: "var(--text-secondary,#64748b)" }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary,#fff)" }}>
            Tanlangan davrda transfer topilmadi
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary,#94a3b8)" }}>
            Lead bir menejerdan boshqasiga o'tganda shu yerda ko'rinadi
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tile
              icon={<ArrowLeftRight size={16} />}
              color="#3b82f6"
              label="Jami transfer"
              value={data.total.toLocaleString()}
              sub={`${data.uniqueLeads} ta lead`}
            />
            <Tile
              icon={<Users size={16} />}
              color="#8b5cf6"
              label="Qatnashgan menejer"
              value={data.managersInvolved.toLocaleString()}
            />
            <Tile
              icon={<UserMinus size={16} />}
              color={GIVEN}
              label="Eng ko'p bergan"
              value={data.topGiver ? data.topGiver.name : "—"}
              sub={data.topGiver ? `${data.topGiver.count} ta` : undefined}
            />
            <Tile
              icon={<UserPlus size={16} />}
              color={RECEIVED}
              label="Eng ko'p qabul qilgan"
              value={data.topReceiver ? data.topReceiver.name : "—"}
              sub={data.topReceiver ? `${data.topReceiver.count} ta` : undefined}
            />
          </div>

          {/* Menejer kesimida grouped bar chart */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-1">Menejer kesimida</h4>
            <p className="text-xs text-secondary mb-3">Har menejer nechta lead qabul qilgan va bergan</p>
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(360, chartData.length * 72) }}>
                <ResponsiveContainer width="99%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 50 }} barCategoryGap="20%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2d4e" vertical={false} />
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
                      allowDecimals={false}
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle.contentStyle}
                      itemStyle={tooltipStyle.itemStyle}
                      labelStyle={tooltipStyle.labelStyle}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
                    <Bar dataKey="received" name="Qabul qilingan" fill={RECEIVED} radius={[4, 4, 0, 0]} maxBarSize={34} />
                    <Bar dataKey="given" name="Berilgan" fill={GIVEN} radius={[4, 4, 0, 0]} maxBarSize={34} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Yo'nalishlar + so'nggi transferlar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top flows */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Eng ko'p yo'nalishlar</h4>
              {data.flows.length === 0 ? (
                <p className="text-xs text-secondary">Ma'lumot yo'q</p>
              ) : (
                <div className="space-y-2">
                  {data.flows.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate" style={{ color: "var(--text-primary,#e2e8f0)" }}>{f.fromName}</span>
                        <ArrowRight size={14} style={{ color: "var(--text-secondary,#64748b)", flexShrink: 0 }} />
                        <span className="truncate" style={{ color: "var(--text-primary,#e2e8f0)" }}>{f.toName}</span>
                      </div>
                      <span
                        className="ml-2 px-2 py-0.5 rounded-md text-xs font-semibold flex-shrink-0"
                        style={{ backgroundColor: "rgba(59,94,245,0.15)", color: "#7c93ff" }}
                      >
                        {f.count}×
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent transfers */}
            <div className="bg-card border border-border rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3">So'nggi transferlar</h4>
              {data.recent.length === 0 ? (
                <p className="text-xs text-secondary">Ma'lumot yo'q</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {data.recent.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-sm">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate" style={{ color: "var(--text-primary,#e2e8f0)" }}>{r.fromName}</span>
                        <ArrowRight size={13} style={{ color: GIVEN, flexShrink: 0 }} />
                        <span className="truncate" style={{ color: "var(--text-primary,#e2e8f0)" }}>{r.toName}</span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs" style={{ color: "var(--text-secondary,#94a3b8)" }}>{fmtDate(r.at)}</div>
                        <div className="text-[10px]" style={{ color: "var(--text-secondary,#64748b)" }}>{r.phone}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {data.note && (
            <p className="text-xs" style={{ color: "var(--text-secondary,#64748b)" }}>{data.note}</p>
          )}
        </div>
      )}
    </Card>
  );
};

export default LeadTransfersSection;
