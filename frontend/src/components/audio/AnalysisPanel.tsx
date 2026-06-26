import React from "react";
import {
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Lightbulb,
  Mic,
} from "lucide-react";
import { Analysis } from "../../types";
import Card from "../ui/Card";
import ScoreBadge from "../ui/stats/ScoreBadge";

const LEAD_QUALITY: Record<Analysis["leadQuality"], { label: string; color: string }> = {
  sovuq: { label: "Sovuq lid", color: "#3b82f6" },
  iliq: { label: "Iliq lid", color: "#f59e0b" },
  issiq: { label: "Issiq lid", color: "#ef4444" },
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({
  title,
  icon,
  children,
}) => (
  <Card>
    <div className="flex items-center gap-2 mb-3">
      <span style={{ color: "var(--text-secondary, #94a3b8)" }}>{icon}</span>
      <h3 className="font-semibold" style={{ color: "var(--text-primary, #fff)" }}>
        {title}
      </h3>
    </div>
    {children}
  </Card>
);

const AnalysisPanel: React.FC<{ analysis: Analysis }> = ({ analysis }) => {
  const quality = LEAD_QUALITY[analysis.leadQuality] ?? LEAD_QUALITY.sovuq;
  const criteria = analysis.criteria ? Object.entries(analysis.criteria) : [];
  const mgr = Math.max(0, Math.min(100, analysis.managerSpeech ?? 0));
  const cli = Math.max(0, Math.min(100, analysis.clientSpeech ?? 0));

  return (
    <div className="space-y-4">
      {/* Umumiy ball + lid sifati */}
      <Card>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-4xl font-bold" style={{ color: "var(--text-primary, #fff)" }}>
                {Math.round(analysis.overallScore)}
              </div>
              <div className="text-xs" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                / 100
              </div>
            </div>
            <ScoreBadge score={analysis.overallScore} size="lg" />
          </div>
          <span
            className="px-3 py-1 rounded-full text-sm font-medium"
            style={{ backgroundColor: `${quality.color}1a`, color: quality.color }}
          >
            {quality.label}
            {typeof analysis.leadScore === "number" ? ` · ${analysis.leadScore}` : ""}
          </span>
        </div>
        {analysis.summary && (
          <p
            className="mt-4 text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: "var(--text-secondary, #cbd5e1)" }}
          >
            {analysis.summary}
          </p>
        )}
        {analysis.judgeSkipped && (
          <div
            className="mt-3 text-xs px-3 py-2 rounded-lg"
            style={{ backgroundColor: "#f59e0b1a", color: "#f59e0b" }}
          >
            Sud agent: bu qo'ng'iroq reytingga kiritilmadi
            {analysis.judgeReason ? ` — ${analysis.judgeReason}` : ""}
          </div>
        )}
      </Card>

      {/* Nutq nisbati */}
      <Section title="Nutq nisbati" icon={<Mic size={18} />}>
        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "var(--text-secondary, #94a3b8)" }}>
          <span>Menejer {mgr}%</span>
          <span className="ml-auto">Mijoz {cli}%</span>
        </div>
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-border, #1f1f2a)" }}>
          <div style={{ width: `${mgr}%`, backgroundColor: "#3b82f6" }} />
          <div style={{ width: `${cli}%`, backgroundColor: "#22c55e" }} />
        </div>
      </Section>

      {/* Mezonlar */}
      {criteria.length > 0 && (
        <Section title="Mezonlar bo'yicha ball" icon={<ThumbsUp size={18} />}>
          <div className="space-y-3">
            {criteria.map(([name, c]) => (
              <div key={name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span style={{ color: "var(--text-primary, #e2e8f0)" }}>{name}</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary, #fff)" }}>
                    {c?.score ?? 0}
                  </span>
                </div>
                {c?.comment && (
                  <p className="text-xs" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                    {c.comment}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Yutuq nuqtalari */}
      {analysis.winPoints?.length > 0 && (
        <Section title="Yutuq nuqtalari" icon={<ThumbsUp size={18} />}>
          <ul className="space-y-2">
            {analysis.winPoints.map((p, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
                <span style={{ color: "#22c55e" }}>+</span>
                <span>
                  {p.description}
                  {p.timestamp && (
                    <span className="ml-1 text-xs opacity-60">[{p.timestamp}]</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Yo'qotish nuqtalari */}
      {analysis.lossPoints?.length > 0 && (
        <Section title="Yo'qotish nuqtalari" icon={<ThumbsDown size={18} />}>
          <ul className="space-y-2">
            {analysis.lossPoints.map((p, i) => (
              <li key={i} className="text-sm flex gap-2" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
                <span style={{ color: "#ef4444" }}>−</span>
                <span>
                  {p.description}
                  {p.timestamp && (
                    <span className="ml-1 text-xs opacity-60">[{p.timestamp}]</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Xatolar */}
      {analysis.errors?.length > 0 && (
        <Section title="Xatolar" icon={<AlertTriangle size={18} />}>
          <ul className="space-y-2">
            {analysis.errors.map((e, i) => (
              <li key={i} className="text-sm" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
                <span className="font-medium" style={{ color: "#f59e0b" }}>
                  {e.type}
                </span>
                {e.timestamp && <span className="ml-1 text-xs opacity-60">[{e.timestamp}]</span>}
                <p className="text-xs mt-0.5">{e.description}</p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* E'tirozlar */}
      {analysis.objections?.length > 0 && (
        <Section title="E'tirozlar" icon={<MessageCircle size={18} />}>
          <div className="flex flex-wrap gap-2">
            {analysis.objections.map((o, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-border, #1f1f2a)", color: "var(--text-secondary, #cbd5e1)" }}
              >
                {o.type} · {o.count}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Coaching */}
      {analysis.coachingInsights && (
        <Section title="Coaching tavsiyalari" icon={<Lightbulb size={18} />}>
          <div className="space-y-3 text-sm" style={{ color: "var(--text-secondary, #cbd5e1)" }}>
            {analysis.coachingInsights.topWin && (
              <p>
                <span className="font-medium" style={{ color: "#22c55e" }}>Eng yaxshi: </span>
                {analysis.coachingInsights.topWin}
              </p>
            )}
            {analysis.coachingInsights.quickFix && (
              <p>
                <span className="font-medium" style={{ color: "#f59e0b" }}>Tez tuzatish: </span>
                {analysis.coachingInsights.quickFix}
              </p>
            )}
            {analysis.coachingInsights.criticalMoments?.length > 0 && (
              <div className="space-y-2">
                {analysis.coachingInsights.criticalMoments.map((m, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: "var(--color-border, #1f1f2a)" }}
                  >
                    <p className="text-xs opacity-60 mb-1">{m.timestamp}</p>
                    <p className="text-sm">{m.whatHappened}</p>
                    {m.whatToDoInstead && (
                      <p className="text-xs mt-1" style={{ color: "#22c55e" }}>
                        → {m.whatToDoInstead}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
};

export default AnalysisPanel;
