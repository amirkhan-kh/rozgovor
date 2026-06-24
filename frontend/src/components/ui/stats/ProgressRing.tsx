import React from "react";
import { scoreToVariant, StatVariant } from "./StatCard";

interface Props {
  /** 0-100 qiymati */
  value: number;
  /** Max (default 100) */
  max?: number;
  /** Ring kattaligi (px) */
  size?: number;
  strokeWidth?: number;
  /** Ichidagi label ("72", "17%", "A'lo") */
  label?: string;
  sublabel?: string;
  /** Semantic variant — score ga qarab avtomatik yoki qo'lda */
  variant?: StatVariant;
}

const VARIANT_COLORS: Record<StatVariant, string> = {
  primary: "var(--ds-primary)",
  success: "var(--ds-success)",
  warning: "var(--ds-warning)",
  danger:  "var(--ds-danger)",
  info:    "var(--ds-info)",
  neutral: "var(--ds-text-secondary)",
};

/**
 * ProgressRing — doiraviy progress.
 *
 * Qayerda ishlatiladi: Plan-Fact, conversion %, score.
 */
const ProgressRing: React.FC<Props> = ({
  value,
  max = 100,
  size = 100,
  strokeWidth = 8,
  label,
  sublabel,
  variant,
}) => {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  const v = variant || scoreToVariant(value);
  const color = VARIANT_COLORS[v];

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="var(--ds-border-default)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>

      {(label || sublabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {label && (
            <span
              className="font-bold font-variant-numeric-tabular leading-none"
              style={{
                color: "var(--ds-text-primary)",
                fontSize: size >= 100 ? "1.5rem" : "1.125rem",
              }}
            >
              {label}
            </span>
          )}
          {sublabel && (
            <span
              className="text-2xs uppercase tracking-wider font-semibold mt-0.5"
              style={{ color: "var(--ds-text-muted)" }}
            >
              {sublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ProgressRing;
