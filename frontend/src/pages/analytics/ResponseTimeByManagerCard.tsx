import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Zap, TimerReset, Users } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, ManagerBars, fmtMinShort } from "./shared";

const GOOD = "#10b981";
const WARN = "#f59e0b";
const BAD = "#ef4444";

// avg daqiqaga qarab rang (tezroq = yashil)
const speedColor = (m: number | null): string => {
  if (m == null) return "#64748b";
  if (m <= 15) return GOOD;
  if (m <= 60) return WARN;
  return BAD;
};

const ResponseTimeByManagerCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-rt-by-manager"],
    queryFn: () => analyticsService.responseTimeByManager(),
  });

  const chartData = (data?.byManager || []).map((m) => ({
    name: m.name,
    photo: m.photo,
    value: m.avgMinutes ?? 0,
    color: speedColor(m.avgMinutes),
  }));

  return (
    <Card title="Menejer kesimida birinchi-aloqa vaqti" subtitle="Lead tushgandan menejerning birinchi qo'ng'irog'igacha — har menejer bo'yicha">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<Clock size={15} />} color="#4f46e5" label="Kompaniya o'rtacha" value={fmtMinShort(data.companyAvgMinutes)} sub={`median ${fmtMinShort(data.companyMedianMinutes)}`} />
            <StatTile icon={<Users size={15} />} color="#8b5cf6" label="Menejer" value={data.managers.toLocaleString()} sub="javob bergan" />
            <StatTile icon={<Zap size={15} />} color={GOOD} label="Eng tez" value={data.fastest ? fmtMinShort(data.fastest.avgMinutes) : "—"} sub={data.fastest?.name} />
            <StatTile icon={<TimerReset size={15} />} color={BAD} label="Eng sekin" value={data.slowest ? fmtMinShort(data.slowest.avgMinutes) : "—"} sub={data.slowest?.name} />
          </div>

          {data.byManager.length > 0 && (
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <div className="flex items-baseline justify-between mb-1">
                <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>O'rtacha javob vaqti — menejer kesimida</h4>
                <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>kalta = tez</span>
              </div>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-muted,#64748b)" }}>tezdan sekinga · rang: 🟢 ≤15daq · 🟡 ≤1soat · 🔴 &gt;1soat</p>
              <ManagerBars data={chartData} valueFormatter={(v) => fmtMinShort(v)} rowHeight={46} maxVisible={10} />
            </div>
          )}

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default ResponseTimeByManagerCard;
