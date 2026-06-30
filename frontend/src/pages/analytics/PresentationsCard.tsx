import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Presentation, Clock, AlertTriangle, Gauge } from "lucide-react";
import { analyticsService, SuspiciousCall } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, NameChip, ManagerBars, fmtDur, fmtDate } from "./shared";

const SUS = "#ef4444";

const SusRow: React.FC<{ c: SuspiciousCall }> = ({ c }) => (
  <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: `${SUS}14` }} title={c.phone || ""}>
    <div className="min-w-0 flex-1">
      <NameChip name={c.managerName} photo={c.managerPhoto} size={20} strong />
      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted,#64748b)" }}>{fmtDate(c.callDate)}</div>
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0" title="Davomiyligi">
      <Clock size={13} style={{ color: "var(--text-muted,#64748b)" }} />
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-primary,#f5f5f7)" }}>{fmtDur(c.durationSec)}</span>
    </div>
    <div className="flex items-center gap-1.5 flex-shrink-0 w-14 justify-end" title="AI bahosi">
      <Gauge size={13} style={{ color: SUS }} />
      <span className="text-[13px] font-bold tabular-nums" style={{ color: SUS }}>{c.score}</span>
    </div>
  </div>
);

const PresentationsCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-presentations"],
    queryFn: () => analyticsService.presentations(),
  });

  const candChart = (data?.byManager || []).map((m) => ({
    name: m.name,
    photo: m.photo,
    value: m.candidates,
    color: m.suspicious > 0 ? "#f59e0b" : "#4f46e5",
  }));

  return (
    <Card title="Prezentatsiya & sun'iy cho'zilgan suhbat" subtitle="5+ daqiqalik qo'ng'iroqlar nomzod; uzun lekin sifat past — shubhali">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<Presentation size={15} />} color="#4f46e5" label="Prezentatsiya nomzodi" value={data.candidateCount.toLocaleString()} sub={`jami ${data.totalCalls} dan · ${data.candidatePct}%`} />
            <StatTile icon={<Clock size={15} />} color="#8b5cf6" label="O'rtacha davomiylik" value={data.avgCandidateMinutes != null ? `${data.avgCandidateMinutes} daq` : "—"} sub={`≥ ${data.thresholds.presentMinutes} daqiqa`} />
            <StatTile icon={<AlertTriangle size={15} />} color={SUS} label="Sun'iy cho'zilgan" value={data.suspiciousCount.toLocaleString()} sub={`nomzodlarning ${data.suspiciousPct}%`} />
            <StatTile icon={<Gauge size={15} />} color="#f59e0b" label="Shubha chegarasi" value={`< ${data.thresholds.fakeScoreMax}`} sub="AI bahosi" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Menejer kesimida nomzodlar */}
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <div className="flex items-baseline justify-between mb-1">
                <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>Menejer kesimida nomzodlar</h4>
                <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--text-muted,#64748b)" }}>
                  <span className="w-2 h-2 rounded-sm" style={{ background: "#f59e0b" }} /> shubhali bor
                </span>
              </div>
              {data.byManager.length === 0 ? (
                <p className="text-[12px] mt-2" style={{ color: "var(--text-muted,#64748b)" }}>Ma'lumot yo'q</p>
              ) : (
                <div className="mt-2"><ManagerBars data={candChart} valueFormatter={(v) => `${v} ta`} rowHeight={46} maxVisible={9} /></div>
              )}
            </div>

            {/* Shubhali ro'yxat */}
            <div className="rounded-xl p-3" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <div className="flex items-baseline justify-between mb-2.5 px-1">
                <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>Sun'iy cho'zilgan qo'ng'iroqlar</h4>
                <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>uzun · past ball</span>
              </div>
              {data.suspiciousList.length === 0 ? (
                <p className="text-[12px] px-1 py-2" style={{ color: "var(--text-muted,#64748b)" }}>Shubhali qo'ng'iroq yo'q</p>
              ) : (
                <div className="space-y-1.5 overflow-y-auto pr-0.5" style={{ maxHeight: 360 }}>
                  {data.suspiciousList.map((c) => <SusRow key={c.audioFileId} c={c} />)}
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

export default PresentationsCard;
