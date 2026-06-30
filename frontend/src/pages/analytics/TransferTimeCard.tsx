import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Zap, Hourglass } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, DistBars } from "./shared";

const COLORS = ["#10b981", "#22c55e", "#f59e0b", "#ef4444"];

const fmtH = (h: number | null): string => {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} daq`;
  if (h < 24) return `${h} soat`;
  return `${Math.round(h / 24)} kun`;
};

const TransferTimeCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-transfer-time"],
    queryFn: () => analyticsService.transferTime(),
  });

  const bucketBars = (data?.buckets || []).map((b, i) => ({ label: b.label, count: b.count, color: COLORS[i % COLORS.length] }));

  return (
    <Card title="Operator → sotuvchi transfer vaqti" subtitle="Lead birinchi menejerdan keyingi menejerga o'tgunicha ketgan vaqt">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data || data.transfers === 0 ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Transfer topilmadi</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<ArrowLeftRight size={15} />} color="#4f46e5" label="Transfer" value={data.transfers.toLocaleString()} />
            <StatTile icon={<Hourglass size={15} />} color="#8b5cf6" label="O'rtacha" value={fmtH(data.avgHours)} sub={`median ${fmtH(data.medianHours)}`} />
            <StatTile icon={<Zap size={15} />} color="#10b981" label="1 soat ichida" value={`${data.within1hPct}%`} sub={`${data.within1h} ta`} />
            <StatTile icon={<Hourglass size={15} />} color="#ef4444" label="1 kundan ortiq" value={data.over24h.toLocaleString()} sub="sekin transfer" />
          </div>

          <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
            <h4 className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary,#f5f5f7)" }}>Transfer vaqti taqsimoti</h4>
            <p className="text-[11px] mb-2" style={{ color: "var(--text-muted,#64748b)" }}>operatordan sotuvchiga o'tish vaqti bo'yicha</p>
            <DistBars data={bucketBars} height={210} unit="transfer" />
          </div>

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default TransferTimeCard;
