import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Lightbulb, ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { analyticsService, AdviceItem } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

const SEV_COLOR: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#3b82f6" };

const AdviceRow: React.FC<{ it: AdviceItem }> = ({ it }) => {
  const color = SEV_COLOR[it.severity] || "#f59e0b";
  const Icon = it.direction === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="rounded-xl p-4" style={{ background: `${color}10`, border: `1px solid ${color}33` }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={16} style={{ color }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>{it.metric}</span>
        <span className="text-[12px] font-bold tabular-nums" style={{ color }}>
          {it.current}{typeof it.deltaPct === "number" ? ` (${it.deltaPct > 0 ? "+" : ""}${it.deltaPct}%)` : ""}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>oldingi: {it.previous}</span>
      </div>
      <div className="text-[12px] mb-1.5" style={{ color: "var(--text-secondary,#a1a1b5)" }}>
        <span className="font-semibold" style={{ color: "var(--text-primary,#cbd5e1)" }}>Sabab: </span>{it.cause}
      </div>
      <div className="text-[12px]" style={{ color: "var(--text-secondary,#a1a1b5)" }}>
        <span className="font-semibold" style={{ color: "#10b981" }}>Tavsiya: </span>{it.recommendation}
      </div>
    </div>
  );
};

const AdviceCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-advice"],
    queryFn: () => analyticsService.advice(),
  });

  return (
    <Card title="Avtomatik maslahat bloki" subtitle="Joriy oy vs oldingi oy — yomonlashgan ko'rsatkichlar uchun sabab va tavsiya">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-muted,#64748b)" }}>
            <span>Davr: <b style={{ color: "var(--text-secondary,#a1a1b5)" }}>{data.period.current}</b> vs {data.period.previous}</span>
            <span>·</span>
            <span>Lid {data.metrics.current.leads} / Sotuv {data.metrics.current.sales} / Konv {data.metrics.current.conv}%</span>
          </div>

          {data.healthy ? (
            <div className="flex items-center gap-3 rounded-xl px-4 py-5" style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
              <CheckCircle2 size={22} style={{ color: "#10b981" }} />
              <div>
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>Ko'rsatkichlar barqaror</div>
                <div className="text-[12px]" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Oldingi oyga nisbatan yomonlashgan asosiy KPI yo'q.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Lightbulb size={16} style={{ color: "#f59e0b" }} />
                <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>{data.items.length} ta e'tibor talab qiladigan ko'rsatkich</span>
              </div>
              {data.items.map((it, i) => <AdviceRow key={i} it={it} />)}
            </div>
          )}

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default AdviceCard;
