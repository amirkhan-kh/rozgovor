import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Wallet, AlertTriangle, TrendingUp } from "lucide-react";
import { analyticsService, OverdueDeal } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, NameChip, DistBars, SegmentBar, fmtDate, fmtMoney } from "./shared";

const SPEED_COLORS = ["#10b981", "#22c55e", "#f59e0b", "#ef4444"];
const WON = "#22c55e";
const OPEN = "#3b82f6";
const FAIL = "#ef4444";

const OverdueRow: React.FC<{ d: OverdueDeal }> = ({ d }) => (
  <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: "rgba(239,68,68,0.10)" }} title={d.contactPhone || ""}>
    <div className="min-w-0 flex-1">
      <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary,#f5f5f7)" }}>{d.contactName || d.contactPhone || `Lead #${d.leadId}`}</div>
      <div className="text-[11px] mt-0.5 flex items-center gap-1.5">
        <NameChip name={d.managerName} photo={d.managerPhoto} size={16} />
        <span style={{ color: "var(--text-muted,#64748b)" }}>· {fmtDate(d.agreedPaymentDate)}</span>
      </div>
    </div>
    {d.price > 0 && <span className="text-[12px] font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text-secondary,#a1a1b5)" }}>{fmtMoney(d.price)}</span>}
    <div className="flex flex-col items-end flex-shrink-0 w-16">
      <span className="text-[14px] font-bold tabular-nums" style={{ color: FAIL }}>{d.daysOverdue}</span>
      <span className="text-[10px]" style={{ color: "var(--text-muted,#64748b)" }}>kun o'tdi</span>
    </div>
  </div>
);

const ConversionBlock: React.FC<{
  title: string;
  total: number;
  won: number;
  open: number;
  failed: number;
  pct: number;
  extra?: { label: string; value: string };
}> = ({ title, total, won, open, failed, pct, extra }) => (
  <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
    <div className="flex items-baseline justify-between mb-3">
      <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>{title}</h4>
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-bold" style={{ color: WON }}>{pct}%</span>
        <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>konversiya</span>
      </div>
    </div>
    <SegmentBar segments={[
      { label: "Sotildi", count: won, color: WON },
      { label: "Ochiq", count: open, color: OPEN },
      { label: "Yo'qotildi", count: failed, color: FAIL },
    ]} />
    <div className="flex items-center justify-between mt-2.5 text-[11px]">
      <span style={{ color: "var(--text-secondary,#a1a1b5)" }}><b style={{ color: WON }}>{won}</b> sotildi</span>
      <span style={{ color: "var(--text-secondary,#a1a1b5)" }}><b style={{ color: OPEN }}>{open}</b> ochiq</span>
      <span style={{ color: "var(--text-secondary,#a1a1b5)" }}><b style={{ color: FAIL }}>{failed}</b> yo'q</span>
      <span style={{ color: "var(--text-muted,#64748b)" }}>jami {total}</span>
    </div>
    {extra && (
      <div className="mt-2.5 pt-2.5 text-[12px] flex items-center justify-between" style={{ borderTop: "1px solid var(--color-border,#1f1f2a)" }}>
        <span style={{ color: "var(--text-secondary,#a1a1b5)" }}>{extra.label}</span>
        <span className="font-semibold" style={{ color: "#f59e0b" }}>{extra.value}</span>
      </div>
    )}
  </div>
);

const PaymentAnalyticsCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-payments"],
    queryFn: () => analyticsService.payments(),
  });

  const ps = data?.paymentSpeed;
  const speedBars = (ps?.buckets || []).map((b, i) => ({ label: b.label, count: b.count, color: SPEED_COLORS[i % SPEED_COLORS.length] }));

  return (
    <Card title="To'lov tezligi va konversiya" subtitle="To'lov muddati, qisman/kelajak-sana konversiyasi va muddati o'tgan deallar">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          {/* #23 to'lov tezligi */}
          <div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatTile icon={<Banknote size={15} />} color="#22c55e" label="3 kun ichida to'lov" value={`${ps?.within3Pct ?? 0}%`} sub={`${ps?.within3 ?? 0} / ${ps?.sales ?? 0} sotuv`} />
              <StatTile icon={<Banknote size={15} />} color="#10b981" label="7 kun ichida" value={`${ps?.within7Pct ?? 0}%`} sub={`${ps?.within7 ?? 0} ta`} />
              <StatTile icon={<TrendingUp size={15} />} color="#8b5cf6" label="O'rtacha kun" value={ps?.avgDays != null ? `${ps.avgDays}` : "—"} sub={`median ${ps?.medianDays ?? "—"}`} />
              <StatTile icon={<Wallet size={15} />} color="#4f46e5" label="Jami sotuv" value={(ps?.sales ?? 0).toLocaleString()} sub="closedAt bo'yicha" />
            </div>
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary,#f5f5f7)" }}>To'lovgacha vaqt taqsimoti</h4>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-muted,#64748b)" }}>lead yaratilgandan to'lovgacha (sotuvlar bo'yicha)</p>
              <DistBars data={speedBars} height={200} unit="sotuv" />
            </div>
          </div>

          {/* #24 + #25 konversiya bloklari */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ConversionBlock
              title="Qisman to'lov → to'liq sotuv"
              total={data.partialConversion.total}
              won={data.partialConversion.won}
              open={data.partialConversion.open}
              failed={data.partialConversion.failed}
              pct={data.partialConversion.conversionPct}
            />
            <ConversionBlock
              title="Kelishilgan sana → sotuv"
              total={data.futureDateConversion.total}
              won={data.futureDateConversion.won}
              open={data.futureDateConversion.open}
              failed={data.futureDateConversion.failed}
              pct={data.futureDateConversion.conversionPct}
              extra={{ label: "Sana o'tib, to'lanmagan", value: `${data.futureDateConversion.datePassedUnpaid} ta` }}
            />
          </div>

          {/* #27 muddati o'tganlar alert */}
          <div className="rounded-xl p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.25)" }}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} style={{ color: FAIL }} />
                <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>To'lov muddati o'tganlar — follow-up kerak</h4>
              </div>
              <div className="flex items-center gap-3 text-[12px]">
                <span style={{ color: FAIL, fontWeight: 700 }}>{data.overdue.count} ta</span>
                {data.overdue.totalAmount > 0 && <span style={{ color: "var(--text-secondary,#a1a1b5)" }}>{fmtMoney(data.overdue.totalAmount)}</span>}
              </div>
            </div>
            {data.overdue.list.length === 0 ? (
              <p className="text-[12px] px-1 py-2" style={{ color: "var(--text-muted,#64748b)" }}>Muddati o'tgan to'lov yo'q 🎉</p>
            ) : (
              <div className="space-y-1.5 overflow-y-auto pr-0.5" style={{ maxHeight: 380 }}>
                {data.overdue.list.map((d) => <OverdueRow key={d.leadId} d={d} />)}
              </div>
            )}
          </div>

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default PaymentAnalyticsCard;
