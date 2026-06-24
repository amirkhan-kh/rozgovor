import React, { ReactNode } from "react";
import TrendIndicator from "./TrendIndicator";
import Sparkline from "./Sparkline";

export type StatVariant = "primary" | "success" | "warning" | "danger" | "info" | "neutral";

interface Props {
  /** Label (11px uppercase) — qisqa, aniq */
  label: string;
  /** Asosiy raqam (hero) — 28px yoki 44px */
  value: number | string;
  /** Raqam oldi/ortidagi birlik ("/100", "%", "₽") */
  unit?: string;
  /**
   * Delta — o'tgan davrga nisbatan o'zgarish
   * value: absolute yoki percent farqi
   */
  trend?: {
    value: number;
    format?: "percent" | "number";
    /** Bu yo'nalishda o'sish "yaxshi"mi? (ball uchun "up", xato stavkasi uchun "down") */
    positiveDirection?: "up" | "down";
    label?: string;
  };
  /** Taqqoslash ma'lumoti ("Jamoa: 68", "Davron: 92") */
  comparison?: {
    label: string;
    value: number | string;
  };
  /** Benchmark / target — progress bar uchun */
  target?: number;
  /** Sparkline uchun ma'lumot (oxirgi N qiymat) */
  sparkline?: number[];
  /** Vizual variant — rangi tanlaydi */
  variant?: StatVariant;
  /** Qisqa narrative ("Davronga 8 ball qolgan") */
  insight?: string;
  /** Katta hero ko'rinishi (3xl raqam) */
  hero?: boolean;
  /** Icon (ixtiyoriy) */
  icon?: ReactNode;
  /** Click handler (kartaga bosish uchun) */
  onClick?: () => void;
  className?: string;
}

const VARIANT_ACCENT: Record<StatVariant, { text: string; bg: string; br: string }> = {
  primary: { text: "var(--ds-primary)", bg: "var(--ds-primary-bg)", br: "var(--ds-primary-br)" },
  success: { text: "var(--ds-success)", bg: "var(--ds-success-bg)", br: "var(--ds-success-br)" },
  warning: { text: "var(--ds-warning)", bg: "var(--ds-warning-bg)", br: "var(--ds-warning-br)" },
  danger:  { text: "var(--ds-danger)",  bg: "var(--ds-danger-bg)",  br: "var(--ds-danger-br)" },
  info:    { text: "var(--ds-info)",    bg: "var(--ds-info-bg)",    br: "var(--ds-info-br)" },
  neutral: { text: "var(--ds-text-secondary)", bg: "var(--ds-bg-overlay)", br: "var(--ds-border-default)" },
};

/**
 * Score → variant avtomatik:
 *   80+ success, 60-79 warning, <60 danger
 * Agar `variant` berilgan bo'lsa, user qiymati saqlanadi.
 */
export function scoreToVariant(score: number): StatVariant {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
}

/**
 * StatCard — 4 qatlamli KPI widget.
 *
 * Qatlamlar:
 *   1. Label (xs uppercase) + icon
 *   2. Headline value (hero font + unit) + trend chip
 *   3. Comparison / benchmark (secondary text)
 *   4. Sparkline yoki progress + insight narrative
 *
 * Design: Linear / Vercel / Gong dashboards inspired.
 */
const StatCard: React.FC<Props> = ({
  label,
  value,
  unit,
  trend,
  comparison,
  target,
  sparkline,
  variant = "neutral",
  insight,
  hero = false,
  icon,
  onClick,
  className = "",
}) => {
  const accent = VARIANT_ACCENT[variant];
  const interactive = !!onClick;

  // Progress ring uchun raqam
  const numericValue = typeof value === "number" ? value : parseFloat(String(value));
  const hasProgress = typeof target === "number" && !isNaN(numericValue);
  const progressPercent = hasProgress
    ? Math.max(0, Math.min(100, (numericValue / target) * 100))
    : 0;

  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      className={`
        relative overflow-hidden ds-card
        ${hero ? "p-5 md:p-6" : "p-4"}
        ${interactive ? "cursor-pointer transition-all hover:shadow-ds-md" : ""}
        ${className}
      `.trim()}
    >
      {/* Accent strip — variant ko'rinishi */}
      {variant !== "neutral" && (
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: accent.text, opacity: 0.9 }}
        />
      )}

      {/* Row 1: Label + Icon */}
      <div className="flex items-center justify-between mb-2">
        <span className="ds-metric-label">{label}</span>
        {icon && (
          <span
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: accent.bg, color: accent.text }}
          >
            {icon}
          </span>
        )}
      </div>

      {/* Row 2: Headline value + Trend */}
      <div className="flex items-baseline gap-2.5 mb-1 flex-wrap">
        <span className={hero ? "ds-hero-value" : "ds-metric-value"}>
          {value}
          {unit && (
            <span
              className="ml-1 font-semibold"
              style={{
                fontSize: hero ? "1.25rem" : "0.875rem",
                color: "var(--ds-text-muted)",
              }}
            >
              {unit}
            </span>
          )}
        </span>
        {trend && (
          <TrendIndicator
            value={trend.value}
            format={trend.format}
            positiveDirection={trend.positiveDirection}
            label={trend.label}
            size={hero ? "md" : "sm"}
          />
        )}
      </div>

      {/* Row 3: Comparison + target */}
      {(comparison || hasProgress) && (
        <div className="flex items-center gap-2 text-2xs ds-text-muted mt-1.5">
          {comparison && (
            <span className="flex items-center gap-1">
              <span>{comparison.label}:</span>
              <span className="font-semibold" style={{ color: "var(--ds-text-secondary)" }}>
                {comparison.value}
              </span>
            </span>
          )}
          {comparison && hasProgress && <span>·</span>}
          {hasProgress && (
            <span className="flex items-center gap-1">
              Maqsad: {target}
              <span className="font-semibold" style={{ color: accent.text }}>
                ({Math.round(progressPercent)}%)
              </span>
            </span>
          )}
        </div>
      )}

      {/* Row 4: Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <div className="mt-3">
          <Sparkline data={sparkline} width={200} height={30} variant={variant === "neutral" ? "muted" : variant} />
        </div>
      )}

      {/* Target progress bar (agar sparkline yo'q va target bo'lsa) */}
      {hasProgress && !sparkline && (
        <div className="mt-3 h-1 rounded-full" style={{ background: "var(--ds-border-subtle)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressPercent}%`,
              background: accent.text,
            }}
          />
        </div>
      )}

      {/* Row 5: Insight narrative */}
      {insight && (
        <p
          className="mt-3 pt-3 text-xs leading-snug"
          style={{
            color: "var(--ds-text-secondary)",
            borderTop: "1px dashed var(--ds-border-subtle)",
          }}
        >
          {insight}
        </p>
      )}
    </div>
  );
};

export default StatCard;
