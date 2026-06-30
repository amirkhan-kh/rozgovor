import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ListX, RefreshCw, XCircle } from "lucide-react";
import { analyticsService, ReasonGroup } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

const COLORS = ["#ef4444", "#f59e0b", "#8b5cf6"];

const ReasonList: React.FC<{ title: string; icon: React.ReactNode; group: ReasonGroup; color: string }> = ({ title, icon, group, color }) => {
  const max = group.reasons.reduce((m, r) => Math.max(m, r.count), 0) || 1;
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}1f`, color }}>{icon}</div>
        <div>
          <h4 className="text-[13px] font-semibold leading-tight" style={{ color: "var(--text-primary,#f5f5f7)" }}>{title}</h4>
          <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>jami {group.total.toLocaleString()}</span>
        </div>
      </div>
      {group.reasons.length === 0 ? (
        <p className="text-[12px] py-2" style={{ color: "var(--text-muted,#64748b)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-2.5">
          {group.reasons.map((r) => (
            <div key={r.name}>
              <div className="flex items-center justify-between text-[12px] mb-1">
                <span className="truncate pr-2" style={{ color: "var(--text-secondary,#a1a1b5)" }} title={r.name}>{r.name}</span>
                <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-primary,#f5f5f7)" }}>{r.count} <span style={{ color: "var(--text-muted,#64748b)" }}>· {r.pct}%</span></span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-border,#1f1f2a)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, (r.count / max) * 100)}%`, background: color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ReasonBreakdownCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-reason-breakdown"],
    queryFn: () => analyticsService.reasonBreakdown(),
  });

  return (
    <Card title="Sifatsiz & qayta obrabotka sabablari" subtitle="Ichki kategoriyalar bo'yicha sabablar, foiz bilan">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ReasonList title="Sifatsiz sabablari" icon={<ListX size={15} />} group={data.sifatsiz} color={COLORS[0]} />
            <ReasonList title="Qayta obrabotka sabablari" icon={<RefreshCw size={15} />} group={data.qayta} color={COLORS[1]} />
            <ReasonList title="Yopilgan deal sabablari" icon={<XCircle size={15} />} group={data.dealFailed} color={COLORS[2]} />
          </div>
          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default ReasonBreakdownCard;
