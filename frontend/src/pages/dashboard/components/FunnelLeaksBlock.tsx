import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Lightbulb, TrendingDown, MessageCircle, Mic } from "lucide-react";
import type { FunnelLeakage, FunnelLeakSolution } from "../../../types";

interface ProblemCardProps {
  icon: React.ReactNode;
  color: "red" | "orange" | "yellow";
  title: string;
  count: number;
  percent: number;
  problem: string;
  impact: string;
  estimatedLost?: number;
  worstManagersNode?: React.ReactNode;
  solution: FunnelLeakSolution;
}

const COLOR_MAP = {
  red: {
    borderVar: "var(--ds-danger-br)",
    bgVar: "var(--ds-danger-bg)",
    accentVar: "var(--ds-danger)",
  },
  orange: {
    borderVar: "var(--ds-warning-br)",
    bgVar: "var(--ds-warning-bg)",
    accentVar: "var(--ds-warning)",
  },
  yellow: {
    borderVar: "var(--ds-info-br)",
    bgVar: "var(--ds-info-bg)",
    accentVar: "var(--ds-info)",
  },
} as const;

const ProblemCard: React.FC<ProblemCardProps> = ({
  icon,
  color,
  title,
  count,
  percent,
  problem,
  impact,
  estimatedLost,
  worstManagersNode,
  solution,
}) => {
  const [showSolution, setShowSolution] = useState(true);
  const [showManagers, setShowManagers] = useState(false);
  const c = COLOR_MAP[color];

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col h-full"
      style={{
        background: "var(--ds-bg-surface)",
        border: `1px solid ${c.borderVar}`,
        borderTopWidth: 3,
        borderTopColor: c.accentVar,
      }}
    >
      {/* Header */}
      <div className="p-4 flex-1">
        <div className="flex items-start gap-3 mb-3">
          <div
            className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: c.bgVar, color: c.accentVar }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold leading-snug" style={{ color: "var(--ds-text-primary)" }}>
              {title}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="text-2xs font-bold px-2 py-0.5 rounded"
                style={{ background: c.bgVar, color: c.accentVar, border: `1px solid ${c.borderVar}` }}
              >
                {count} ta · {percent}%
              </span>
            </div>
          </div>
        </div>

        <p className="text-sm leading-snug mb-3" style={{ color: "var(--ds-text-secondary)" }}>
          {problem}
        </p>

        {/* Oqibati */}
        <div className="flex items-start gap-2 mb-3 text-xs">
          <TrendingDown size={14} style={{ color: c.accentVar }} className="flex-shrink-0 mt-0.5" />
          <span style={{ color: "var(--ds-text-secondary)" }}>
            <span className="font-semibold" style={{ color: c.accentVar }}>Oqibati:</span> {impact}
          </span>
        </div>

        {/* Yo'qotilgan bitim */}
        {estimatedLost !== undefined && estimatedLost > 0 && (
          <div
            className="text-xs font-semibold mb-3 px-2 py-1.5 rounded"
            style={{ color: c.accentVar, background: c.bgVar }}
          >
            ≈ {estimatedLost} ta bitim yo'qoldi
          </div>
        )}

        {/* Yomon menejerlar — collapsible */}
        {worstManagersNode && (
          <>
            <button
              onClick={() => setShowManagers(!showManagers)}
              className="w-full flex items-center justify-between text-2xs py-2"
              style={{
                color: "var(--ds-text-muted)",
                borderTop: "1px solid var(--ds-border-subtle)",
              }}
            >
              <span>Ko'p qo'yib yuboruvchilar</span>
              {showManagers ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showManagers && worstManagersNode}
          </>
        )}
      </div>

      {/* Yechim bloki — har doim success (yashil) */}
      <div
        className="p-4"
        style={{
          background: "var(--ds-success-bg)",
          borderTop: "1px solid var(--ds-success-br)",
        }}
      >
        <button
          onClick={() => setShowSolution(!showSolution)}
          className="w-full flex items-center justify-between mb-2"
          style={{ color: "var(--ds-success)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Lightbulb size={16} className="flex-shrink-0" />
            <span className="font-bold text-xs truncate">Yechim: {solution.technique}</span>
          </div>
          {showSolution ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showSolution && (
          <div className="space-y-3 mt-3">
            <ol className="space-y-2">
              {solution.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-xs leading-snug">
                  <span
                    className="flex-shrink-0 w-4 h-4 rounded-full font-bold flex items-center justify-center text-[9px]"
                    style={{ background: "var(--ds-success)", color: "var(--ds-text-inverted)" }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ color: "var(--ds-text-primary)" }}>{step}</span>
                </li>
              ))}
            </ol>

            <div
              className="rounded-lg p-2.5"
              style={{
                background: "var(--ds-bg-surface)",
                border: "1px solid var(--ds-success-br)",
              }}
            >
              <div
                className="text-2xs font-bold mb-1 uppercase tracking-wide"
                style={{ color: "var(--ds-success)" }}
              >
                Misol
              </div>
              <pre
                className="text-xs whitespace-pre-wrap font-sans leading-relaxed"
                style={{ color: "var(--ds-text-primary)" }}
              >
                {solution.example}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface Props {
  data: FunnelLeakage;
}

const FunnelLeaksBlock: React.FC<Props> = ({ data }) => {
  const { funnelLeaks, totalEstimatedLostDeals, conversionRate, totalCalls } = data;
  const hasLeaks =
    (funnelLeaks.speechRatioViolations?.count || 0) > 0 ||
    (funnelLeaks.surrenderedObjections?.count || 0) > 0 ||
    (funnelLeaks.openEndings?.count || 0) > 0;

  if (!hasLeaks) {
    return (
      <div
        className="rounded-xl p-6 text-center"
        style={{
          background: "var(--ds-success-bg)",
          border: "1px solid var(--ds-success-br)",
        }}
      >
        <div className="text-xl font-bold mb-1" style={{ color: "var(--ds-success)" }}>
          ✓ Hammasi yaxshi
        </div>
        <p className="text-sm" style={{ color: "var(--ds-text-secondary)" }}>
          So'nggi 30 kun ichida sotuvni yo'qotuvchi sabablar topilmadi. Konversiya: <span className="font-semibold">{conversionRate}%</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Asosiy xabar — toza card, qizil gradient olib tashlandi */}
      <div
        className="rounded-xl p-5 md:p-6"
        style={{
          background: "var(--ds-bg-surface)",
          border: "1px solid var(--ds-danger-br)",
          borderLeftWidth: 4,
          borderLeftColor: "var(--ds-danger)",
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--ds-danger-bg)", color: "var(--ds-danger)" }}
          >
            <AlertTriangle size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="text-2xs font-bold uppercase tracking-wider mb-1"
              style={{ color: "var(--ds-danger)" }}
            >
              Sotuvni yo'qotish sabablari · so'nggi 30 kun
            </div>
            <div
              className="font-bold leading-none mb-2"
              style={{
                fontSize: "clamp(1.75rem, 4vw, 2.5rem)",
                color: "var(--ds-text-primary)",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.02em",
              }}
            >
              ≈ {totalEstimatedLostDeals} ta sotuv
            </div>
            <p className="text-sm leading-snug mb-3" style={{ color: "var(--ds-text-secondary)" }}>
              Shuncha bitimni yo'qotgansiz, chunki menejerlar quyidagi 3 ta xatoga yo'l qo'yyapti.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: "var(--ds-text-muted)" }}>
              <span>📞 {totalCalls} ta qo'ng'iroq</span>
              <span>
                💰 Konversiya: <span className="font-bold" style={{ color: "var(--ds-text-primary)" }}>{conversionRate}%</span>
              </span>
            </div>
          </div>
        </div>

        <div
          className="mt-4 pt-3 text-xs leading-relaxed"
          style={{ color: "var(--ds-text-muted)", borderTop: "1px dashed var(--ds-border-default)" }}
        >
          💡 <span className="font-semibold" style={{ color: "var(--ds-text-secondary)" }}>
            "≈ {totalEstimatedLostDeals} ta" qayerdan?
          </span>{" "}
          Har xato turi uchun: e'tirozda taslim bo'lganlarning konversiya foiziga ko'paytirildi + zaif
          yakunlashlardan 15% saqlash mumkin deb hisoblandi.
        </div>
      </div>

      {/* 3 ta muammo karta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        {funnelLeaks.surrenderedObjections && (
          <ProblemCard
            icon={<MessageCircle size={22} />}
            color="orange"
            title={funnelLeaks.surrenderedObjections.title}
            count={funnelLeaks.surrenderedObjections.count}
            percent={funnelLeaks.surrenderedObjections.percent}
            problem={funnelLeaks.surrenderedObjections.problem}
            impact={funnelLeaks.surrenderedObjections.impact}
            estimatedLost={funnelLeaks.surrenderedObjections.estimatedLostDeals}
            solution={funnelLeaks.surrenderedObjections.solution}
            worstManagersNode={
              <div className="space-y-1.5 mt-2">
                {funnelLeaks.surrenderedObjections.worstManagers.slice(0, 3).map((m) => (
                  <div key={m.managerName} className="flex items-center justify-between text-xs px-2 py-1.5 rounded" style={{ background: "var(--ds-bg-overlay)" }}>
                    <span className="text-secondary truncate">{m.managerName}</span>
                    <span className="font-semibold" style={{ color: "var(--ds-warning)" }}>{m.surrendered}/{m.total}</span>
                  </div>
                ))}
              </div>
            }
          />
        )}

        {funnelLeaks.openEndings && (
          <ProblemCard
            icon={<AlertTriangle size={22} />}
            color="yellow"
            title={funnelLeaks.openEndings.title}
            count={funnelLeaks.openEndings.count}
            percent={funnelLeaks.openEndings.percent}
            problem={funnelLeaks.openEndings.problem}
            impact={funnelLeaks.openEndings.impact}
            estimatedLost={funnelLeaks.openEndings.estimatedLostDeals}
            solution={funnelLeaks.openEndings.solution}
            worstManagersNode={
              <div className="space-y-1.5 mt-2">
                {funnelLeaks.openEndings.worstManagers.slice(0, 3).map((m) => (
                  <div key={m.managerName} className="flex items-center justify-between text-xs px-2 py-1.5 rounded" style={{ background: "var(--ds-bg-overlay)" }}>
                    <span className="text-secondary truncate">{m.managerName}</span>
                    <span className="font-semibold" style={{ color: "var(--ds-info)" }}>{m.count} ta</span>
                  </div>
                ))}
              </div>
            }
          />
        )}

        {funnelLeaks.speechRatioViolations && (
          <ProblemCard
            icon={<Mic size={22} />}
            color="red"
            title={funnelLeaks.speechRatioViolations.title}
            count={funnelLeaks.speechRatioViolations.count}
            percent={funnelLeaks.speechRatioViolations.percent}
            problem={funnelLeaks.speechRatioViolations.problem}
            impact={funnelLeaks.speechRatioViolations.impact}
            solution={funnelLeaks.speechRatioViolations.solution}
            worstManagersNode={
              <div className="space-y-1.5 mt-2">
                {funnelLeaks.speechRatioViolations.worstManagers.slice(0, 3).map((m) => (
                  <div key={m.managerName} className="flex items-center justify-between text-xs px-2 py-1.5 rounded" style={{ background: "var(--ds-bg-overlay)" }}>
                    <span className="text-secondary truncate">{m.managerName}</span>
                    <span className="font-semibold" style={{ color: "var(--ds-danger)" }}>{m.ratio}%</span>
                  </div>
                ))}
              </div>
            }
          />
        )}
      </div>
    </div>
  );
};

export default FunnelLeaksBlock;
