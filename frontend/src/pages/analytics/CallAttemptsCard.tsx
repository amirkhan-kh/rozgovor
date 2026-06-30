import React from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, PhoneOff, Repeat, Link2Off } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, DistBars } from "./shared";

const ATTEMPT_COLORS = ["#22c55e", "#f59e0b", "#ef4444"];
const STAGE_COLORS: Record<string, string> = {
  new: "#3b82f6",
  noanswer: "#f59e0b",
  unreachable: "#ef4444",
  converted: "#22c55e",
};

const CallAttemptsCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-call-attempts"],
    queryFn: () => analyticsService.callAttempts(),
  });

  const pr = data?.pickupRate;
  const nc = data?.noContactChain;
  const attemptBars = (pr?.buckets || []).map((b, i) => ({ label: b.label, count: b.count, color: ATTEMPT_COLORS[i % ATTEMPT_COLORS.length] }));
  const chainBars = (nc?.stages || []).map((s) => ({ label: s.label, count: s.count, color: STAGE_COLORS[s.key] || "#64748b" }));

  return (
    <Card title="Qo'ng'iroq urinishlari va ko'tarish foizi" subtitle="Birinchi urinishda ko'tarish, urinishlar soni va 'bog'lanib bo'lmadi' zanjiri">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<PhoneCall size={15} />} color="#22c55e" label="Ko'tarish foizi" value={`${pr?.pickupPct ?? 0}%`} sub={`${pr?.answeredLeads ?? 0} / ${pr?.attemptedLeads ?? 0} lead`} />
            <StatTile icon={<Repeat size={15} />} color="#8b5cf6" label="O'rtacha urinish" value={pr?.avgAttempts != null ? `${pr.avgAttempts}` : "—"} sub="har lead uchun" />
            <StatTile icon={<PhoneOff size={15} />} color="#f59e0b" label="Ko'tarmadi" value={`${nc?.noAnswerPct ?? 0}%`} sub="lead statusidan" />
            <StatTile icon={<Link2Off size={15} />} color="#ef4444" label="Bog'lanib bo'lmadi" value={`${nc?.unreachablePct ?? 0}%`} sub="ko'p urinish, javob yo'q" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* #30 urinishlar taqsimoti */}
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary,#f5f5f7)" }}>Urinishlar soni taqsimoti</h4>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-muted,#64748b)" }}>nechta lead necha marta qo'ng'iroq qilingan</p>
              <DistBars data={attemptBars} height={210} unit="lead" />
            </div>

            {/* #29 no-contact zanjiri */}
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary,#f5f5f7)" }}>Ko'tarmadi → bog'lanib bo'lmadi zanjiri</h4>
              <p className="text-[11px] mb-2" style={{ color: "var(--text-muted,#64748b)" }}>lead holati bo'yicha taqsimot</p>
              <DistBars data={chainBars} height={210} unit="lead" />
            </div>
          </div>

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default CallAttemptsCard;
