import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  /** Delta qiymati (absolute yoki percent) */
  value: number;
  /** "percent" → "+5.2%", "number" → "+12" */
  format?: "percent" | "number";
  /** Raqam oldidan label (masalan: "o'tgan haftaga nisbatan") */
  label?: string;
  /**
   * Yo'nalishning "yaxshi" ma'nosi:
   *  - "up" (default): ↑ = success, ↓ = danger (ball, konversiya, sotuv)
   *  - "down": ↑ = danger, ↓ = success (xato stavkasi, taslim %)
   *  - "neutral": ikkalasi ham neutral rang
   */
  positiveDirection?: "up" | "down" | "neutral";
  /** Delta 0 ga yaqin bo'lsa "stable" deb hisoblash uchun chek */
  stableThreshold?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Trend ko'rsatkichi — raqam yonida kichik chip.
 * Tuzilma: [↑/↓/→] [delta]
 *
 * Semantic rang `positiveDirection` ga qarab tanlanadi.
 * Score va konversiya uchun ↑ = yashil (yaxshi).
 * Xato stavkasi uchun ↓ = yashil (yaxshi).
 */
const SIZE_MAP: Record<NonNullable<Props["size"]>, { icon: number; text: string; gap: string; pad: string }> = {
  sm: { icon: 11, text: "text-2xs", gap: "gap-0.5", pad: "px-1 py-0.5" },
  md: { icon: 13, text: "text-xs",  gap: "gap-1",   pad: "px-1.5 py-0.5" },
  lg: { icon: 16, text: "text-sm",  gap: "gap-1.5", pad: "px-2 py-1" },
};

const TrendIndicator: React.FC<Props> = ({
  value,
  format = "number",
  label,
  positiveDirection = "up",
  stableThreshold = 0.01,
  size = "md",
  className = "",
}) => {
  const s = SIZE_MAP[size];
  const absValue = Math.abs(value);

  // Yo'nalish aniqlash
  const isStable = absValue < stableThreshold;
  const isUp = value > 0;
  const isDown = value < 0;

  // Rang aniqlash — positiveDirection ga qarab
  let color = "var(--ds-text-muted)";
  let bgColor = "transparent";
  if (positiveDirection === "up") {
    if (isUp) {
      color = "var(--ds-success)";
      bgColor = "var(--ds-success-bg)";
    } else if (isDown) {
      color = "var(--ds-danger)";
      bgColor = "var(--ds-danger-bg)";
    }
  } else if (positiveDirection === "down") {
    if (isUp) {
      color = "var(--ds-danger)";
      bgColor = "var(--ds-danger-bg)";
    } else if (isDown) {
      color = "var(--ds-success)";
      bgColor = "var(--ds-success-bg)";
    }
  }

  // Ikona
  const Icon = isStable ? Minus : isUp ? TrendingUp : TrendingDown;

  // Format
  const sign = isUp ? "+" : "";
  const displayValue = format === "percent" ? `${sign}${value.toFixed(1)}%` : `${sign}${value}`;

  return (
    <span
      className={`inline-flex items-center ${s.gap} ${s.pad} ${s.text} font-semibold rounded-md ${className}`}
      style={{ color, background: bgColor }}
      title={label}
    >
      <Icon size={s.icon} strokeWidth={2.25} />
      <span className="font-variant-numeric-tabular">{isStable ? "0" : displayValue}</span>
    </span>
  );
};

export default TrendIndicator;
