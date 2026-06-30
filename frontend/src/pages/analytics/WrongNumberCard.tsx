import React from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PhoneOff, AlertTriangle, TrendingUp, Megaphone } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile } from "./shared";

const WN = "#ef4444";

const WrongNumberCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-wrong-number"],
    queryFn: () => analyticsService.wrongNumber(),
  });

  const maxSrc = data?.bySource.reduce((m, s) => Math.max(m, s.wrong), 0) || 1;

  return (
    <Card title="Noto'g'ri / chet el raqami foizi" subtitle="Xato raqam ulushi, oyma-oy o'sish alerti va manba (reklama formasi) bo'yicha">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          {data.alert && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)" }}>
              <AlertTriangle size={16} style={{ color: WN }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>
                Alert: xato raqam foizi oxirgi oyda {data.delta > 0 ? "+" : ""}{data.delta}pp oshdi — manbani tekshiring
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<PhoneOff size={15} />} color={WN} label="Xato raqam" value={data.wrong.toLocaleString()} sub={`jami ${data.total.toLocaleString()} lead`} />
            <StatTile icon={<PhoneOff size={15} />} color="#f59e0b" label="Ulush" value={`${data.wrongPct}%`} />
            <StatTile icon={<TrendingUp size={15} />} color={data.delta > 0 ? WN : "#10b981"} label="Oxirgi oy o'zgarish" value={`${data.delta > 0 ? "+" : ""}${data.delta}pp`} sub="oldingi oyga" />
            <StatTile icon={<Megaphone size={15} />} color="#8b5cf6" label="Eng ko'p manba" value={data.bySource[0]?.sourceName ?? "—"} sub={data.bySource[0] ? `${data.bySource[0].wrong} ta xato` : undefined} />
          </div>

          {data.months.some((m) => m.total > 0) && (
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary,#f5f5f7)" }}>Xato raqam foizi — oyma-oy</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data.months} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#1f1f2a)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#a1a1b5", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fill: "#a1a1b5", fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: "var(--chart-tooltip-bg,#131319)", border: "1px solid var(--chart-tooltip-border,#1f1f2a)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, _n, p: any) => [`${v}% (${p.payload.wrong}/${p.payload.total})`, "Xato raqam"]}
                  />
                  <Line type="monotone" dataKey="pct" name="Xato raqam %" stroke={WN} strokeWidth={2.5} dot={{ r: 4, fill: WN }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {data.bySource.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary,#f5f5f7)" }}>Manba (reklama formasi) bo'yicha</h4>
              <div className="space-y-2.5">
                {data.bySource.map((s) => (
                  <div key={s.sourceId} className="flex items-center gap-3">
                    <span className="w-32 truncate text-[13px] flex-shrink-0" style={{ color: "var(--text-secondary,#a1a1b5)" }} title={s.sourceName}>{s.sourceName}</span>
                    <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--color-border,#1f1f2a)" }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.max(3, (s.wrong / maxSrc) * 100)}%`, background: WN }} />
                    </div>
                    <span className="w-24 text-right text-[12px] tabular-nums flex-shrink-0" style={{ color: "var(--text-primary,#f5f5f7)" }}>
                      {s.wrong} <span style={{ color: "var(--text-muted,#64748b)" }}>({s.pct}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default WrongNumberCard;
