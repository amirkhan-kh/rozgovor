import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { User, Phone, Repeat } from "lucide-react";
import ManagerActions from "./ManagerActions";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from "recharts";
import Skeleton from "../../components/ui/Skeleton";
import { managersService, ManagerAuditCard } from "../../services/managers.service";

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

const formatTalkTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}s ${m}d`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

type Tier = "gold" | "silver" | "bronze";
const TIER_STYLES: Record<Tier, {
  accent: string;
  shadow: string;
  radarStroke: string;
}> = {
  gold: {
    accent: "#d4a437",
    shadow: "0 10px 35px -10px rgba(218,165,32,0.4), 0 2px 8px rgba(0,0,0,0.15)",
    radarStroke: "#d4a437",
  },
  silver: {
    accent: "#9ca3af",
    shadow: "0 10px 35px -10px rgba(156,163,175,0.35), 0 2px 8px rgba(0,0,0,0.15)",
    radarStroke: "#9ca3af",
  },
  bronze: {
    accent: "#a45a2a",
    shadow: "0 10px 35px -10px rgba(163,92,42,0.4), 0 2px 8px rgba(0,0,0,0.15)",
    radarStroke: "#a45a2a",
  },
};

const SHORT_LABELS: Record<string, string> = {
  "Salomlashish va suhbatni boshlash": "Salom",
  "Ehtiyojni aniqlash — SOPRANO texnikasi": "Ehtiyoj",
  "Mahsulotni tushuntirish": "Mahsulot",
  "E'tirozlar bilan ishlash": "E'tiroz",
  "Bosim o'tkazish": "Bosim",
  "Keyingi qadamga yo'naltirish": "Yakun",
  "Kayfiyati": "Kayfiyat",
  "Aktiv tinglash": "Aktiv",
  "Kontekstni eslatish": "Kontekst",
  "Yangi sabab bilan chiqish": "Sabab",
  "Qaror holatini aniqlash": "Qaror",
  "Closing va keyingi qadamni kelishish": "Closing",
  "Oldingi to'siqni tekshirish": "To'siq",
};

// Backend allaqachon kategoriya cycle bo'yicha to'g'ri tartibda qaytaradi
// (sotuv: Salom→Aktiv; qayta: Kontekst→Aktiv). Soat yo'nalishi 12'dan boshlanadi.

const shortenLabel = (name: string): string =>
  SHORT_LABELS[name] ?? (name.length > 8 ? name.slice(0, 7) + "…" : name);

const ManagerAuditCardView: React.FC<{ m: ManagerAuditCard; tier: Tier }> = ({ m, tier }) => {
  const style = TIER_STYLES[tier];
  const radarData = m.criteriaScores
    .map((c) => ({
      name: shortenLabel(c.name),
      fullName: c.name,
      score: c.score,
    }));

  return (
    <div
      className="relative rounded-2xl px-4 pt-4 pb-3 border overflow-visible transition-transform hover:-translate-y-0.5"
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

      {/* Top row: Score | Photo | 3 stats */}
      <div className="flex items-start gap-3 mt-1">
        {/* Score badge */}
        <div
          className="flex flex-col items-center justify-center rounded-xl px-2 py-1.5 shrink-0"
          style={{
            backgroundColor: `${style.accent}15`,
            border: `1px solid ${style.accent}40`,
            minWidth: 56,
          }}
        >
          <span
            className="text-3xl font-black leading-none"
            style={{ color: "var(--text-primary)" }}
          >
            {m.overallScore}
          </span>
          <span
            className="text-[9px] uppercase font-bold tracking-wider mt-0.5"
            style={{ color: style.accent }}
          >
            Score
          </span>
        </div>

        {/* Photo (clickable → manager detail) */}
        <Link to={`/managers/${m.managerId}`} className="shrink-0 group">
          {m.photoUrl ? (
            <img
              src={m.photoUrl}
              alt={m.managerName}
              className="w-16 h-16 object-cover rounded-xl transition-transform group-hover:scale-105"
              style={{ border: `2px solid ${style.accent}` }}
            />
          ) : (
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
              style={{
                backgroundColor: `${style.accent}15`,
                border: `2px solid ${style.accent}`,
                color: "var(--text-primary)",
              }}
            >
              <User size={28} />
            </div>
          )}
        </Link>

        {/* 3 stats */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Umumiy vaqt
            </span>
            <span className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              {formatTalkTime(m.totalTalkTime)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              O'rtacha
            </span>
            <span className="text-sm font-bold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
              {formatTalkTime(m.avgTalkTime)}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Sdelka
            </span>
            <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {m.dealCount} / {m.callCount}
            </span>
          </div>
        </div>
      </div>

      {/* Name (clickable) */}
      <Link to={`/managers/${m.managerId}`} className="block mt-3 text-center pb-2 group" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <p
          className="font-bold text-sm truncate group-hover:underline"
          style={{ color: "var(--text-primary)" }}
        >
          {m.managerName}
        </p>
      </Link>

      {/* Radar chart */}
      <div
        className="rounded-lg px-1 py-2 mt-2 overflow-visible"
        style={{
          backgroundColor: `${style.accent}08`,
          border: `1px solid ${style.accent}20`,
        }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-wider text-center mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Mezonlar bo'yicha
        </p>
        <div className="h-44 overflow-visible">
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} margin={{ top: 8, right: 18, bottom: 8, left: 18 }}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="name"
                  tick={{ fill: "var(--text-secondary)", fontSize: 9, fontWeight: 600 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={false}
                  axisLine={false}
                />
                <Radar
                  name={m.managerName}
                  dataKey="score"
                  stroke={style.radarStroke}
                  fill={style.radarStroke}
                  fillOpacity={0.35}
                  strokeWidth={1.5}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0] as { payload: { fullName: string; score: number } };
                    return (
                      <div
                        className="px-2 py-1 rounded-lg text-xs font-semibold shadow-lg"
                        style={{
                          backgroundColor: "rgba(0,0,0,0.85)",
                          color: "#fff",
                        }}
                      >
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                          {p.payload.fullName}
                        </div>
                        <div>{p.payload.score} ball</div>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex items-center justify-center h-full text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Ma'lumot yo'q
            </div>
          )}
        </div>

      </div>

      {/* Action buttons */}
      <div className="mt-3">
        <ManagerActions
          managerId={m.managerId}
          managerName={m.managerName}
        />
      </div>
    </div>
  );
};

const ManagersAuditTab: React.FC<Props> = ({ queryParams, enabled = true }) => {
  const [category, setCategory] = useState<"sotuv" | "qayta">("sotuv");

  const { data, isLoading } = useQuery({
    queryKey: ["managers-audit", queryParams, category],
    queryFn: () =>
      managersService.getAudit({ ...queryParams, category }),
    enabled,
  });

  // Category toggle (1-qong'iroq / Qayta)
  const toggle = (
    <div
      className="inline-flex items-center h-10 p-1 rounded-xl border text-sm mb-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-card-bg)",
      }}
    >
      {([
        { key: "sotuv" as const, label: "1-qong'iroq", icon: <Phone size={13} /> },
        { key: "qayta" as const, label: "Qayta", icon: <Repeat size={13} /> },
      ]).map((btn) => {
        const active = category === btn.key;
        return (
          <button
            key={btn.key}
            onClick={() => setCategory(btn.key)}
            className="h-full flex items-center gap-1.5 px-3 rounded-lg font-medium transition-colors"
            style={{
              backgroundColor: active ? "#22c55e" : "transparent",
              color: active ? "#ffffff" : "var(--text-secondary)",
            }}
          >
            {btn.icon}
            {btn.label}
          </button>
        );
      })}
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {toggle}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-full" rounded="xl" />
          ))}
        </div>
      </div>
    );
  }

  const managers = data?.managers || [];

  if (managers.length === 0) {
    return (
      <div>
        {toggle}
        <div
          className="py-12 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Bu davrda {category === "sotuv" ? "birinchi qo'ng'iroq" : "qayta qo'ng'iroq"} audit'i yo'q
        </div>
      </div>
    );
  }

  return (
    <div>
      {toggle}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {managers.map((m, i) => {
          const n = managers.length;
          const tier: Tier =
            i < Math.ceil(n / 3)
              ? "gold"
              : i < Math.ceil((2 * n) / 3)
              ? "silver"
              : "bronze";
          return <ManagerAuditCardView key={m.managerId} m={m} tier={tier} />;
        })}
      </div>
    </div>
  );
};

export default ManagersAuditTab;
