import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, PhoneOff, Clock, MoonStar, TrendingDown } from "lucide-react";
import { analyticsService, FunnelStage } from "../../services/analytics.service";
import SectionHeader from "../../components/ui/stats/SectionHeader";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import LeadTransfersSection from "./LeadTransfersSection";
import QualityTrendCard from "./QualityTrendCard";
import ResponseTimeByManagerCard from "./ResponseTimeByManagerCard";
import CallAttemptsCard from "./CallAttemptsCard";
import PresentationsCard from "./PresentationsCard";
import PaymentAnalyticsCard from "./PaymentAnalyticsCard";
import TransferTimeCard from "./TransferTimeCard";
import PbxMappingCard from "./PbxMappingCard";
import AdviceCard from "./AdviceCard";
import WrongNumberCard from "./WrongNumberCard";
import ReasonBreakdownCard from "./ReasonBreakdownCard";
import ObjectionTrendCard from "./ObjectionTrendCard";
import AiCostsCard from "./AiCostsCard";

const STAGE_COLORS: Record<string, string> = {
  yangi: "#3b82f6",
  ishlanmoqda: "#8b5cf6",
  qayta_obrabotka: "#f59e0b",
  sifatsiz: "#ef4444",
  sotildi: "#22c55e",
};

const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}> = ({ icon, label, value, sub, color = "#3b82f6" }) => (
  <div className="bg-card border border-border rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2" style={{ color }}>
      {icon}
      <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-secondary,#94a3b8)" }}>
        {label}
      </span>
    </div>
    <div className="text-xl font-bold" style={{ color: "var(--text-primary,#fff)" }}>
      {value}
    </div>
    {sub && <div className="text-xs mt-1" style={{ color: "var(--text-secondary,#94a3b8)" }}>{sub}</div>}
  </div>
);

const FunnelBar: React.FC<{ stage: FunnelStage; max: number }> = ({ stage, max }) => {
  const color = STAGE_COLORS[stage.key] || "#64748b";
  const width = max > 0 ? Math.max(2, (stage.count / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span style={{ color: "var(--text-primary,#e2e8f0)" }}>{stage.label}</span>
        <span style={{ color: "var(--text-secondary,#94a3b8)" }}>
          {stage.count.toLocaleString()} · {stage.percent}%
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-border,#1f1f2a)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

const fmtMin = (m: number | null): string => {
  if (m == null) return "—";
  if (m < 60) return `${m} daq`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h} soat ${min} daq`;
};

// Bog'liq sectionlar 4 ta tabga guruhlangan (lifecycle tartibida)
const TABS = [
  { key: "umumiy", label: "Umumiy & lead sifati" },
  { key: "aloqa", label: "Aloqa & transfer" },
  { key: "suhbat", label: "Suhbat & to'lov" },
  { key: "tizim", label: "Tizim" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const AnalyticsPage: React.FC = () => {
  const [tab, setTab] = useState<TabKey>("umumiy");
  const { data: funnel, isLoading: lf } = useQuery({
    queryKey: ["analytics-funnel"],
    queryFn: () => analyticsService.funnel(),
  });
  const { data: nna } = useQuery({
    queryKey: ["analytics-new-noanswer"],
    queryFn: () => analyticsService.newNoAnswer(),
  });
  const { data: rt } = useQuery({
    queryKey: ["analytics-response-time"],
    queryFn: () => analyticsService.responseTime(),
  });

  const maxStage = funnel ? Math.max(...funnel.stages.map((s) => s.count), 1) : 1;

  return (
    <div className="px-4 md:px-6 py-4 space-y-6 max-w-5xl mx-auto">
      <SectionHeader title="Analitika" icon={<Filter size={20} />} subtitle="Lead voronka va KPI hisobotlari" />

      {/* Tab navigatsiya — bog'liq sectionlar guruhlangan, scroll qisqaradi */}
      <div className="sticky top-0 z-20 bg-card border border-border rounded-xl p-1.5 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-3.5 py-2 rounded-lg text-[13px] font-medium whitespace-nowrap transition-all flex-shrink-0"
            style={{ backgroundColor: tab === t.key ? "var(--color-accent,#4f46e5)" : "transparent", color: tab === t.key ? "#fff" : "var(--text-secondary,#a1a1b5)" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ 1. UMUMIY & LEAD SIFATI ═══ */}
      {tab === "umumiy" && (
        <>
          <Card title="Lead voronka">
            {lf ? (
              <div className="py-8 flex justify-center"><LoadingSpinner /></div>
            ) : funnel ? (
              <div className="space-y-4">
                <div className="text-sm" style={{ color: "var(--text-secondary,#94a3b8)" }}>
                  Jami: <b style={{ color: "var(--text-primary,#fff)" }}>{funnel.total.toLocaleString()}</b> lead
                </div>
                {funnel.stages.map((s) => (
                  <FunnelBar key={s.key} stage={s} max={maxStage} />
                ))}
              </div>
            ) : null}
          </Card>
          <AdviceCard />
          <ReasonBreakdownCard />
          <WrongNumberCard />
          <QualityTrendCard />
        </>
      )}

      {/* ═══ 2. ALOQA & TRANSFER ═══ */}
      {tab === "aloqa" && (
        <>
          <Card title="Yangi → Ko'tarmadi">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatTile icon={<TrendingDown size={16} />} color="#3b82f6" label="Yangi lid" value={(nna?.newCount ?? 0).toLocaleString()} />
              <StatTile icon={<PhoneOff size={16} />} color="#f59e0b" label="Ko'tarmadi" value={(nna?.noAnswerCount ?? 0).toLocaleString()} />
              <StatTile icon={<PhoneOff size={16} />} color="#ef4444" label="Ko'tarmaslik %" value={`${nna?.noAnswerPercent ?? 0}%`} sub="yangi bosqichdan" />
            </div>
            {nna?.note && <p className="text-xs mt-3" style={{ color: "var(--text-secondary,#64748b)" }}>{nna.note}</p>}
          </Card>
          <CallAttemptsCard />
          <Card title="Javob vaqti va ish vaqtidan tashqari">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <StatTile icon={<MoonStar size={16} />} color="#8b5cf6" label="Off-hours lead" value={`${rt?.offHoursPercent ?? 0}%`} sub={`${(rt?.offHoursLeads ?? 0).toLocaleString()} / ${(rt?.totalLeads ?? 0).toLocaleString()}`} />
              <StatTile icon={<Clock size={16} />} color="#22c55e" label="Javob (ish vaqti)" value={fmtMin(rt?.responseTime.avgMinutes ?? null)} sub={`median ${fmtMin(rt?.responseTime.medianMinutes ?? null)}`} />
              <StatTile icon={<Clock size={16} />} color="#f59e0b" label="Javob (off-hours)" value={fmtMin(rt?.offHoursResponseTime.avgMinutes ?? null)} sub="alohida ajratilgan" />
              <StatTile icon={<Clock size={16} />} color="#3b82f6" label="Ish vaqti" value={rt?.workHours?.split(" ")[0] ?? "—"} sub="Tashkent" />
            </div>
            {rt?.note && <p className="text-xs mt-3" style={{ color: "var(--text-secondary,#64748b)" }}>{rt.note}</p>}
          </Card>
          <ResponseTimeByManagerCard />
          <LeadTransfersSection />
          <TransferTimeCard />
        </>
      )}

      {/* ═══ 3. SUHBAT & TO'LOV ═══ */}
      {tab === "suhbat" && (
        <>
          <PresentationsCard />
          <ObjectionTrendCard />
          <PaymentAnalyticsCard />
        </>
      )}

      {/* ═══ 4. TIZIM (REFERENCE) ═══ */}
      {tab === "tizim" && (
        <>
          <PbxMappingCard />
          <AiCostsCard />
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
