import React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Flame, Snowflake, Sparkles } from "lucide-react";
import { analyticsService, StageMismatchFlag } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, NameChip, fmtDate } from "./shared";

const HOT = "#f97316";
const COLD = "#0ea5e9";

const FlagRow: React.FC<{ f: StageMismatchFlag }> = ({ f }) => {
  const hot = f.type === "hot_but_lost";
  const accent = hot ? HOT : COLD;
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5"
      style={{ background: `${accent}14` }}
      title={`${f.phone || ""} · AI: ${f.heatScore}`}
    >
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${accent}26`, color: accent }}>
        {hot ? <Flame size={15} /> : <Snowflake size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <NameChip name={f.managerName} photo={f.managerPhoto} size={20} strong />
        <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted,#64748b)" }}>
          {hot ? "AI issiq, CRM rad" : "AI sovuq, CRM sotildi"} · {f.statusName || "—"} · {fmtDate(f.callDate)}
        </div>
      </div>
      <div className="flex flex-col items-end flex-shrink-0">
        <span className="text-[15px] font-bold tabular-nums" style={{ color: accent }}>{f.heatScore}</span>
        <span className="text-[10px]" style={{ color: "var(--text-muted,#64748b)" }}>AI ball</span>
      </div>
    </div>
  );
};

const StageMismatchCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-stage-mismatch"],
    queryFn: () => analyticsService.stageMismatch(),
  });

  return (
    <Card title="AI ↔ CRM stage nomuvofiqligi" subtitle="AI bashorati menejer qo'ygan CRM stage bilan mos kelmagan qo'ng'iroqlar">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<Sparkles size={15} />} color="#8b5cf6" label="Tahlil qilingan" value={data.analyzed.toLocaleString()} sub="AI balli bor qo'ng'iroq" />
            <StatTile icon={<AlertTriangle size={15} />} color="#ef4444" label="Nomuvofiqlik" value={`${data.mismatchPct}%`} sub={`${data.mismatchTotal} ta`} />
            <StatTile icon={<Flame size={15} />} color={HOT} label="Issiq → rad/yopildi" value={data.hotButLost.toLocaleString()} sub={`AI ≥ ${data.thresholds.hot}`} />
            <StatTile icon={<Snowflake size={15} />} color={COLD} label="Sovuq → sotildi" value={data.coldButWon.toLocaleString()} sub={`AI ≤ ${data.thresholds.cold}`} />
          </div>

          {data.flags.length > 0 ? (
            <div className="rounded-xl p-3" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <div className="flex items-baseline justify-between mb-2.5 px-1">
                <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>Belgilangan qo'ng'iroqlar</h4>
                <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>AI ball bo'yicha</span>
              </div>
              <div className="space-y-1.5 overflow-y-auto pr-0.5" style={{ maxHeight: 420 }}>
                {data.flags.map((f) => <FlagRow key={f.audioFileId} f={f} />)}
              </div>
            </div>
          ) : (
            <p className="text-[13px] py-4 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Nomuvofiqlik topilmadi — AI va CRM mos.</p>
          )}

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default StageMismatchCard;
