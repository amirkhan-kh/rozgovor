import React from "react";
import { scoreToVariant, StatVariant } from "./StatCard";

interface Props {
  score: number;
  /** Maksimal qiymat (default 100) */
  max?: number;
  /** O'zbekcha interpretatsiya label qo'shiladimi */
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  /** Score → variant avtomatik, lekin override qilish mumkin */
  variant?: StatVariant;
}

const INTERPRETATION_UZ: Array<{ min: number; label: string; variant: StatVariant }> = [
  { min: 90, label: "A'lo",     variant: "success" },
  { min: 80, label: "Yaxshi",   variant: "success" },
  { min: 70, label: "O'rta+",   variant: "warning" },
  { min: 60, label: "O'rta",    variant: "warning" },
  { min: 40, label: "Zaif",     variant: "danger" },
  { min: 0,  label: "Juda zaif", variant: "danger" },
];

function interpret(score: number): { label: string; variant: StatVariant } {
  for (const i of INTERPRETATION_UZ) {
    if (score >= i.min) return { label: i.label, variant: i.variant };
  }
  return INTERPRETATION_UZ[INTERPRETATION_UZ.length - 1];
}

const SIZE_CLASSES: Record<NonNullable<Props["size"]>, { wrapper: string; value: string; label: string }> = {
  sm: { wrapper: "px-2 py-0.5 gap-1",   value: "text-sm font-bold",  label: "text-2xs" },
  md: { wrapper: "px-2.5 py-1 gap-1.5", value: "text-base font-bold", label: "text-2xs" },
  lg: { wrapper: "px-3 py-1.5 gap-2",   value: "text-lg font-bold",  label: "text-xs" },
};

const VARIANT_COLORS: Record<StatVariant, { text: string; bg: string; br: string }> = {
  primary: { text: "var(--ds-primary)", bg: "var(--ds-primary-bg)", br: "var(--ds-primary-br)" },
  success: { text: "var(--ds-success)", bg: "var(--ds-success-bg)", br: "var(--ds-success-br)" },
  warning: { text: "var(--ds-warning)", bg: "var(--ds-warning-bg)", br: "var(--ds-warning-br)" },
  danger:  { text: "var(--ds-danger)",  bg: "var(--ds-danger-bg)",  br: "var(--ds-danger-br)" },
  info:    { text: "var(--ds-info)",    bg: "var(--ds-info-bg)",    br: "var(--ds-info-br)" },
  neutral: { text: "var(--ds-text-secondary)", bg: "var(--ds-bg-overlay)", br: "var(--ds-border-default)" },
};

/**
 * ScoreBadge — 72/100 ga semantic rang va interpretatsiya beradi.
 *
 * Tuzilma: [72][A'lo]  — rangi avtomatik
 *
 * Qayerda ishlatiladi: manager ro'yxati, audio card, benchmark jadval.
 */
const ScoreBadge: React.FC<Props> = ({
  score,
  max = 100,
  showLabel = true,
  size = "md",
  variant,
}) => {
  const { label, variant: autoVariant } = interpret(score);
  const v = variant || autoVariant || scoreToVariant(score);
  const colors = VARIANT_COLORS[v];
  const s = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center rounded-md border ${s.wrapper}`}
      style={{
        background: colors.bg,
        borderColor: colors.br,
        color: colors.text,
      }}
    >
      <span className={`${s.value} font-variant-numeric-tabular`}>
        {Math.round(score)}
        {max !== 100 && <span className="opacity-60">/{max}</span>}
      </span>
      {showLabel && (
        <span className={`${s.label} font-semibold uppercase tracking-wide opacity-80`}>
          {label}
        </span>
      )}
    </span>
  );
};

export default ScoreBadge;
