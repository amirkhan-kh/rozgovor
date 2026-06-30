import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Cpu, Mic, Sparkles, Gauge, Clock } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, NameChip } from "./shared";

const usd = (n: number) => `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}`;
const STT = "#0ea5e9";
const FLASH = "#8b5cf6";
const PRO = "#22c55e";

const AiCostsCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-ai-costs"],
    queryFn: () => analyticsService.aiCosts(),
  });

  const maxMgr = data?.byManager.reduce((m, x) => Math.max(m, x.costUsd), 0) || 1;
  const comp = data ? [
    { key: "STT (Yandex)", val: data.byComponent.stt, color: STT, icon: <Mic size={13} /> },
    { key: "Diarizatsiya (Flash)", val: data.byComponent.flash, color: FLASH, icon: <Sparkles size={13} /> },
    { key: "Tahlil (Pro)", val: data.byComponent.pro, color: PRO, icon: <Cpu size={13} /> },
  ] : [];
  const compTotal = comp.reduce((s, c) => s + c.val, 0) || 1;

  return (
    <Card title="AI agent xarajatlari va limit" subtitle="AudioCost bo'yicha STT/Flash/Pro sarfi, menejer kesimida va plan limiti">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<Cpu size={15} />} color="#4f46e5" label="Umumiy sarf" value={usd(data.totalCostUsd)} sub={`${data.analyzedCalls} tahlil`} />
            <StatTile icon={<Gauge size={15} />} color="#f59e0b" label="O'rtacha / qo'ng'iroq" value={usd(data.avgPerCallUsd)} />
            <StatTile icon={<Clock size={15} />} color="#22c55e" label="Sarflangan soat" value={`${data.limits.usedHours}`} sub={`${data.limits.totalLimitHours} dan · ${data.limits.usedPct}%`} />
            <StatTile icon={<Gauge size={15} />} color="#8b5cf6" label="Plan" value={data.limits.plan} sub={`${data.limits.totalAudio} audio`} />
          </div>

          {/* Limit gauge */}
          <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
            <div className="flex items-center justify-between mb-2 text-[12px]">
              <span style={{ color: "var(--text-secondary,#a1a1b5)" }}>Soat limiti</span>
              <span style={{ color: "var(--text-primary,#f5f5f7)" }}>{data.limits.usedHours} / {data.limits.totalLimitHours} soat</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--color-border,#1f1f2a)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, data.limits.usedPct)}%`, background: data.limits.usedPct > 85 ? "#ef4444" : data.limits.usedPct > 60 ? "#f59e0b" : "#22c55e" }} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Komponent bo'yicha */}
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary,#f5f5f7)" }}>Komponent bo'yicha sarf</h4>
              <div className="flex h-2.5 rounded-full overflow-hidden mb-3" style={{ background: "var(--color-border,#1f1f2a)" }}>
                {comp.map((c) => <div key={c.key} style={{ width: `${(c.val / compTotal) * 100}%`, background: c.color }} title={`${c.key}: ${usd(c.val)}`} />)}
              </div>
              <div className="space-y-2">
                {comp.map((c) => (
                  <div key={c.key} className="flex items-center justify-between text-[12px]">
                    <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary,#a1a1b5)" }}>
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />{c.key}
                    </span>
                    <span className="tabular-nums" style={{ color: "var(--text-primary,#f5f5f7)" }}>{usd(c.val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Menejer kesimida */}
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-3" style={{ color: "var(--text-primary,#f5f5f7)" }}>Menejer kesimida sarf</h4>
              {data.byManager.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--text-muted,#64748b)" }}>Ma'lumot yo'q</p>
              ) : (
                <div className="space-y-2.5 overflow-y-auto pr-0.5" style={{ maxHeight: 240 }}>
                  {data.byManager.map((m) => (
                    <div key={m.managerId} className="flex items-center gap-3">
                      <div className="w-32 flex-shrink-0"><NameChip name={m.name} photo={m.photo} size={22} /></div>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--color-border,#1f1f2a)" }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.max(3, (m.costUsd / maxMgr) * 100)}%`, background: "#4f46e5" }} />
                      </div>
                      <span className="w-14 text-right text-[12px] tabular-nums flex-shrink-0" style={{ color: "var(--text-primary,#f5f5f7)" }}>{usd(m.costUsd)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default AiCostsCard;
