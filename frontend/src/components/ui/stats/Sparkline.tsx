import React from "react";

type Variant = "primary" | "success" | "warning" | "danger" | "info" | "muted";

interface Props {
  data: number[];
  width?: number;
  height?: number;
  variant?: Variant;
  strokeWidth?: number;
  showDots?: boolean;
  fill?: boolean;
  className?: string;
}

/**
 * Minimal SVG sparkline — KPI card ichida ishlatiladi.
 * Axes yo'q, labels yo'q — faqat chiziq va ixtiyoriy nuqtalar.
 *
 * Design inspirations: Vercel, Linear KPI widgets.
 */
const COLOR_MAP: Record<Variant, string> = {
  primary: "var(--ds-primary)",
  success: "var(--ds-success)",
  warning: "var(--ds-warning)",
  danger:  "var(--ds-danger)",
  info:    "var(--ds-info)",
  muted:   "var(--ds-text-muted)",
};

const Sparkline: React.FC<Props> = ({
  data,
  width = 100,
  height = 28,
  variant = "primary",
  strokeWidth = 1.75,
  showDots = false,
  fill = true,
  className,
}) => {
  if (!data || data.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="var(--ds-border-default)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const color = COLOR_MAP[variant];
  const padY = 3;
  const minV = Math.min(...data);
  const maxV = Math.max(...data);
  const range = Math.max(1, maxV - minV);

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2;
    const y = height - padY - ((v - minV) / range) * (height - padY * 2);
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

  // Fill path (closed to bottom)
  const fillPath = [
    `M ${points[0].x.toFixed(2)} ${height}`,
    ...points.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
    `L ${points[points.length - 1].x.toFixed(2)} ${height}`,
    "Z",
  ].join(" ");

  const gradientId = `sparkline-grad-${variant}-${width}-${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <path d={fillPath} fill={`url(#${gradientId})`} />}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {showDots &&
        points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} />
        ))}
    </svg>
  );
};

export default Sparkline;
