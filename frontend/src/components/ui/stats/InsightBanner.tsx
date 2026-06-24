import React, { ReactNode } from "react";
import { Target, AlertCircle, Lightbulb, Trophy, ArrowRight, X, Info } from "lucide-react";

export type InsightKind = "goal" | "warning" | "tip" | "success" | "info";

interface Props {
  kind?: InsightKind;
  /** Qisqa sarlavha ("Bugun nima qilish kerak") */
  title?: string;
  /** Asosiy narrative — 1-3 jumla */
  message: string | ReactNode;
  /** Aniq CTA tugma */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Ixtiyoriy "yopish" tugma */
  onDismiss?: () => void;
  className?: string;
}

/**
 * InsightBanner — "Bugun nima qilish kerak" narrative.
 *
 * Data → story → action zanjiri oxirgi bo'g'ini:
 *   raqam → kontekst → insight → HARAKAT
 *
 * 5 ta tur:
 *   - goal    (ko'k)   : "Maqsaddan X ortda"
 *   - warning (amber)  : "Diqqat qarating"
 *   - tip     (indigo) : "Sinab ko'ring"
 *   - success (yashil) : "Ajoyib natija"
 *   - info    (sky)    : "Umumiy ma'lumot"
 */
const KIND_STYLES: Record<InsightKind, { icon: ReactNode; color: string; bg: string; border: string }> = {
  goal: {
    icon: <Target size={18} />,
    color: "var(--ds-primary)",
    bg: "var(--ds-primary-bg)",
    border: "var(--ds-primary-br)",
  },
  warning: {
    icon: <AlertCircle size={18} />,
    color: "var(--ds-warning)",
    bg: "var(--ds-warning-bg)",
    border: "var(--ds-warning-br)",
  },
  tip: {
    icon: <Lightbulb size={18} />,
    color: "var(--ds-info)",
    bg: "var(--ds-info-bg)",
    border: "var(--ds-info-br)",
  },
  success: {
    icon: <Trophy size={18} />,
    color: "var(--ds-success)",
    bg: "var(--ds-success-bg)",
    border: "var(--ds-success-br)",
  },
  info: {
    icon: <Info size={18} />,
    color: "var(--ds-text-secondary)",
    bg: "var(--ds-bg-overlay)",
    border: "var(--ds-border-default)",
  },
};

const InsightBanner: React.FC<Props> = ({
  kind = "goal",
  title,
  message,
  action,
  onDismiss,
  className = "",
}) => {
  const style = KIND_STYLES[kind];

  return (
    <div
      className={`
        relative flex items-start gap-3 p-4 md:p-4.5 rounded-xl
        ${className}
      `.trim()}
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--ds-bg-surface)", color: style.color }}
      >
        {style.icon}
      </div>

      <div className="flex-1 min-w-0">
        {title && (
          <p
            className="text-2xs font-bold uppercase tracking-wider mb-1"
            style={{ color: style.color }}
          >
            {title}
          </p>
        )}
        <div
          className="text-base leading-snug"
          style={{ color: "var(--ds-text-primary)" }}
        >
          {message}
        </div>
      </div>

      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-opacity hover:opacity-90 flex-shrink-0"
          style={{ background: style.color, color: "var(--ds-text-inverted)" }}
        >
          {action.label}
          <ArrowRight size={14} />
        </button>
      )}

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="p-1 rounded-md opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
          style={{ color: "var(--ds-text-muted)" }}
          aria-label="Yopish"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default InsightBanner;
