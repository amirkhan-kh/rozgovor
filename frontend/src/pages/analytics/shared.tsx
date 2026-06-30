import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer,
} from "recharts";
import Avatar from "../../components/ui/Avatar";

// Avatar palitrasi (rasmsiz menejerlar uchun, deterministik) — LeadTransfers bilan bir xil
const AV_PALETTE = [
  "#4f46e5", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6",
  "#14b8a6", "#ec4899", "#22c55e", "#f97316", "#3b82f6", "#eab308",
];
export const managerColor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
};

export const shortName = (n: string): string => {
  if (!n) return "";
  if (n.includes("#")) return n;
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
};

export const fmtMin = (m: number | null | undefined): string => {
  if (m == null) return "—";
  if (m < 60) return `${m} daq`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min ? `${h} soat ${min} daq` : `${h} soat`;
};

// Kompakt vaqt formati (chart label/tile uchun — o'ralmasligi uchun qisqa)
export const fmtMinShort = (m: number | null | undefined): string => {
  if (m == null) return "—";
  if (m < 60) return `${m} daq`;
  if (m < 1440) return `${Math.round(m / 60)} soat`;
  return `${Math.round(m / 1440)} kun`;
};

export const fmtDur = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const UZ_M = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
export const fmtDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()} ${UZ_M[d.getMonth()]}`;
};

export const fmtMoney = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} mln` : n.toLocaleString("ru-RU");

// ── KPI tile (raqamli) — LeadTransfers/QualityTrend uslubi ──
export const StatTile: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color?: string;
}> = ({ icon, label, value, sub, color = "#4f46e5" }) => (
  <div className="rounded-xl p-4 flex flex-col" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
    <div className="flex items-center gap-2 mb-2.5">
      {icon && (
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1f`, color }}>
          {icon}
        </div>
      )}
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary,#a1a1b5)" }}>{label}</span>
    </div>
    <div className="text-[28px] font-bold leading-none" style={{ color: "var(--text-primary,#f5f5f7)" }}>{value}</div>
    {sub && <div className="text-[12px] mt-1.5" style={{ color: "var(--text-muted,#64748b)" }}>{sub}</div>}
  </div>
);

// ── Menejer chip (avatar + qisqa ism, to'liq ism hoverda) ──
export const NameChip: React.FC<{ name: string; photo?: string | null; size?: number; strong?: boolean }> = ({
  name, photo, size = 24, strong,
}) => (
  <span className="flex items-center gap-2 min-w-0" title={name}>
    <Avatar name={name} src={photo || undefined} color={managerColor(name)} size={size} />
    <span
      className="text-[13px] truncate"
      style={{ color: strong ? "var(--text-primary,#f5f5f7)" : "var(--text-secondary,#a1a1b5)", fontWeight: strong ? 600 : 500 }}
    >
      {shortName(name)}
    </span>
  </span>
);

// ── Gorizontal nisbat bar (yo'nalish/segment) ──
export const SegmentBar: React.FC<{ segments: { label: string; count: number; color: string }[] }> = ({ segments }) => {
  const total = segments.reduce((s, x) => s + x.count, 0) || 1;
  return (
    <div className="flex h-2.5 rounded-full overflow-hidden" style={{ background: "var(--color-border,#1f1f2a)" }}>
      {segments.map((s, i) => (
        <div key={i} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
};

// ── Funnel-style qator (label + count + nisbiy bar) ──
export const FunnelRow: React.FC<{ label: string; count: number; max: number; pct?: number; color: string }> = ({
  label, count, max, pct, color,
}) => {
  const width = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1">
        <span style={{ color: "var(--text-primary,#e2e8f0)" }}>{label}</span>
        <span style={{ color: "var(--text-secondary,#94a3b8)" }}>
          {count.toLocaleString()}{pct != null ? ` · ${pct}%` : ""}
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-border,#1f1f2a)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

// ── Recharts dark tooltip uslubi ──────────────────────────────────────────
export const tooltipStyle: React.CSSProperties = {
  background: "var(--chart-tooltip-bg,#131319)",
  border: "1px solid var(--chart-tooltip-border,#1f1f2a)",
  borderRadius: 8,
  fontSize: 12,
  color: "var(--chart-tooltip-text,#f5f5f7)",
};

// ── Avatar Y-axis tick (gorizontal bar chart uchun) ───────────────────────
// Avatar HECH QACHON siqilmaydi (flex-shrink-0) — uzun ismda oval bo'lmaydi.
export const makeAvatarTick = (photoByName: Map<string, string | null>, width = 168) =>
  ({ x, y, payload }: any) => {
    const name = String(payload.value);
    const photo = photoByName.get(name);
    return (
      <foreignObject x={x - width} y={y - 15} width={width - 8} height={30}>
        <div className="flex items-center gap-2.5 h-full translate-x-3" title={name}>
          <span className="flex-shrink-0 flex items-center t">
            <Avatar name={name} src={photo || undefined} color={managerColor(name)} size={26} />
          </span>
          <span className="text-[12px] truncate" style={{ color: "var(--text-primary,#f5f5f7)" }}>{shortName(name)}</span>
        </div>
      </foreignObject>
    );
  };

// ── Taqsimot ustun-diagrammasi (proporsional, value label bilan) ──────────
// FunnelRow o'rniga: har ustun balandligi haqiqiy songa proporsional.
export const DistBars: React.FC<{
  data: { label: string; count: number; color: string }[];
  height?: number;
  unit?: string;
}> = ({ data, height = 200, unit }) => (
  <ResponsiveContainer width="100%" height={height}>
    <BarChart data={data} margin={{ top: 20, right: 8, left: -14, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#1f1f2a)" vertical={false} />
      <XAxis dataKey="label" tick={{ fill: "#a1a1b5", fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
      <YAxis tick={{ fill: "#a1a1b5", fontSize: 11 }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
      <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tooltipStyle} formatter={(v: number) => [`${v}${unit ? ` ${unit}` : ""}`, "Soni"]} />
      <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={72}>
        {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        <LabelList dataKey="count" position="top" fill="#cbd5e1" fontSize={12} fontWeight={600} />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

// ── Gorizontal menejer bar-chart (avatar tick + value label) ──────────────
export const ManagerBars: React.FC<{
  data: Array<{ name: string; photo: string | null; value: number; color?: string }>;
  barColor?: string;
  rowHeight?: number;
  maxVisible?: number;
  valueFormatter?: (v: number) => string;
  unitLabel?: string;
}> = ({ data, barColor = "#4f46e5", rowHeight = 46, maxVisible = 10, valueFormatter, unitLabel }) => {
  const photoByName = new Map<string, string | null>(data.map((d) => [d.name, d.photo]));
  const scrolls = data.length > maxVisible;
  const fullHeight = data.length * rowHeight + 12;
  // Bitta qatorli value label — SVG <text> (HECH QACHON o'ralmaydi)
  const ValueLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    return (
      <text
        x={x + width + 8}
        y={y + height / 2}
        dominantBaseline="central"
        textAnchor="start"
        fontSize={11}
        fontWeight={600}
        fill="#cbd5e1"
      >
        {valueFormatter ? valueFormatter(value) : `${value}${unitLabel ? ` ${unitLabel}` : ""}`}
      </text>
    );
  };
  return (
    <div style={{ maxHeight: scrolls ? maxVisible * rowHeight : undefined, overflowY: scrolls ? "auto" : "visible" }}>
      <ResponsiveContainer width="100%" height={fullHeight}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 88, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={176} interval={0} axisLine={false} tickLine={false} tick={makeAvatarTick(photoByName, 172)} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} contentStyle={tooltipStyle} formatter={(v: number) => [valueFormatter ? valueFormatter(v) : `${v}${unitLabel ? ` ${unitLabel}` : ""}`, ""]} />
          <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={18}>
            {data.map((d, i) => <Cell key={i} fill={d.color || barColor} />)}
            <LabelList dataKey="value" content={ValueLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
