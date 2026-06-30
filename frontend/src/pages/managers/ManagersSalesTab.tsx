import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { User } from "lucide-react";
import ManagerActions from "./ManagerActions";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import Skeleton from "../../components/ui/Skeleton";
import { salesService, ManagerSalesCard } from "../../services/sales.service";

interface Props {
  queryParams: {
    period: string;
    dateFrom?: string;
    dateTo?: string;
    pipelineIds?: string;
    sourceIds?: string;
    search?: string;
  };
  enabled?: boolean;
}

const formatMoney = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} mlrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mln`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return String(Math.round(n));
};

// Hamma cardlar saytning umumiy theme'iga mos — faqat shadow va top-accent
// rank bo'yicha farq qiladi (gold/silver/bronze warm gradient shadow)
type Tier = "gold" | "silver" | "bronze";

// Tier — faqat shadow/accent ranglari farq qiladi, card fon har doim theme'dan
const TIER_STYLES: Record<
  Tier,
  {
    accent: string; // rank ko'rsatkichi va small accent
    chart: string;
    shadow: string; // bronze-like warm glow
  }
> = {
  gold: {
    accent: "#d4a437",
    chart: "#d4a437",
    shadow: "0 10px 35px -10px rgba(218,165,32,0.4), 0 2px 8px rgba(0,0,0,0.15)",
  },
  silver: {
    accent: "#9ca3af",
    chart: "#9ca3af",
    shadow: "0 10px 35px -10px rgba(156,163,175,0.35), 0 2px 8px rgba(0,0,0,0.15)",
  },
  bronze: {
    accent: "#a45a2a",
    chart: "#a45a2a",
    shadow: "0 10px 35px -10px rgba(163,92,42,0.4), 0 2px 8px rgba(0,0,0,0.15)",
  },
};

// ── Kunlik sotuv chart with hover tooltip ──
const UZ_MONTHS = [
  "yan", "fev", "mar", "apr", "may", "iyn",
  "iyl", "avg", "sen", "okt", "noy", "dek",
];

const formatDayLabel = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()} ${UZ_MONTHS[d.getMonth()]}`;
};

const ChartTooltip: React.FC<{ active?: boolean; payload?: unknown[] }> = ({
  active,
  payload,
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0] as { payload?: { date: string; count: number } };
  if (!p.payload) return null;
  const { date, count } = p.payload;
  return (
    <div
      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-lg"
      style={{
        backgroundColor: "rgba(0,0,0,0.85)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.1)",
      }}
    >
      <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 10 }}>
        {formatDayLabel(date)}
      </div>
      <div>{count} ta sotuv</div>
    </div>
  );
};

const DailySalesChart: React.FC<{
  points: { date: string; count: number }[];
  color: string;
}> = ({ points, color }) => {
  if (points.length === 0) {
    return (
      <div
        className="h-24 flex items-center justify-center rounded-lg text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        Ma'lumot yo'q
      </div>
    );
  }
  const gradId = `g_${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className="h-24 -mx-1">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.55} />
              <stop offset="100%" stopColor={color} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 3"
            vertical={false}
            stroke="var(--color-border)"
          />
          <XAxis dataKey="date" hide />
          <YAxis hide domain={[0, "dataMax + 1"]} />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
            activeDot={{ r: 4, fill: color, stroke: "#fff", strokeWidth: 1.5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// Site theme'iga mos card + tier bronza tipidagi warm shadow
const ManagerCard: React.FC<{ m: ManagerSalesCard; tier: Tier }> = ({ m, tier }) => {
  const style = TIER_STYLES[tier];

  return (
    <div
      className="relative rounded-2xl px-4 pt-4 pb-3 border overflow-hidden transition-transform hover:-translate-y-0.5"
      style={{
        backgroundColor: "var(--color-card-bg)",
        borderColor: "var(--color-border)",
        boxShadow: style.shadow,
      }}
    >
      {/* Tier top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${style.accent} 50%, transparent 100%)`,
        }}
      />

      {/* Photo + Name (clickable → manager detail) */}
      <Link to={`/managers/${m.managerId}`} className="block group">
        <div className="flex items-center justify-center mt-1 mb-3">
          {m.photoUrl ? (
            <img
              src={m.photoUrl}
              alt={m.managerName}
              className="w-24 h-24 object-cover rounded-full transition-transform group-hover:scale-105"
              style={{ border: `2px solid ${style.accent}` }}
            />
          ) : (
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center transition-transform group-hover:scale-105"
              style={{
                backgroundColor: `${style.accent}15`,
                border: `2px solid ${style.accent}`,
                color: "var(--text-primary)",
              }}
            >
              <User size={40} />
            </div>
          )}
        </div>

        <div className="text-center mb-2 pb-2" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <p
            className="font-bold text-sm truncate group-hover:underline"
            style={{ color: "var(--text-primary)" }}
          >
            {m.managerName}
          </p>
        </div>
      </Link>

      {/* stats */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mb-3">
        {[
          { label: "Lid", value: m.leadCount.toString() },
          { label: "Qual lid", value: m.qualifiedLeadCount.toString() },
          { label: "Konv", value: `${m.conversionRate}%` },
          { label: "Sotuv", value: m.salesCount.toString() },
          { label: "Summa", value: formatMoney(m.revenue), full: true },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex items-baseline gap-1.5${s.full ? " col-span-2" : ""}`}
          >
            <span
              className="text-sm font-bold leading-none"
              style={{ color: "var(--text-primary)" }}
            >
              {s.value}
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-secondary)" }}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Kunlik sotuv chart */}
      <div
        className="rounded-lg px-2.5 py-2 mb-3"
        style={{
          backgroundColor: `${style.accent}08`,
          border: `1px solid ${style.accent}20`,
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--text-secondary)" }}
          >
            Kunlik sotuv
          </span>
          <span className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>
            {m.salesCount} ta
          </span>
        </div>
        <DailySalesChart points={m.sparkline} color={style.chart} />
      </div>

      {/* Action buttons */}
      <ManagerActions
        managerId={m.managerId}
        managerName={m.managerName}
      />
    </div>
  );
};

const ManagersSalesTab: React.FC<Props> = ({ queryParams, enabled = true }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["managers-sales", queryParams],
    queryFn: () => salesService.getManagers(queryParams),
    enabled,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-80 w-full" rounded="xl" />
        ))}
      </div>
    );
  }

  const managers = data?.managers || [];

  if (managers.length === 0) {
    return (
      <div
        className="py-12 text-center text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        Bu davrda menejerlar bo'yicha ma'lumot yo'q
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* FIFA-style Manager cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {managers.map((m, i) => {
          // Revenue rank bo'yicha tier (managerlar revenue bo'yicha sorted keladi)
          const n = managers.length;
          const tier: Tier =
            i < Math.ceil(n / 3)
              ? "gold"
              : i < Math.ceil((2 * n) / 3)
              ? "silver"
              : "bronze";
          return <ManagerCard key={m.managerId} m={m} tier={tier} />;
        })}
      </div>
    </div>
  );
};

export default ManagersSalesTab;
