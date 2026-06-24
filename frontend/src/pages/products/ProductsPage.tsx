import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, ResponsiveContainer,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { Package, TrendingUp, Headphones, Search } from "lucide-react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { productsService, ProductWithStats } from "../../services/products.service";

type Mode = "sotuv" | "audit";
type Period = "today" | "week" | "month" | "all";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Bugun" },
  { key: "week", label: "Bu hafta" },
  { key: "month", label: "Bu oy" },
  { key: "all", label: "Barchasi" },
];

const formatSum = (uzs: number): string => {
  if (uzs >= 1_000_000_000) return `${(uzs / 1_000_000_000).toFixed(1)} mlrd`;
  if (uzs >= 1_000_000) return `${(uzs / 1_000_000).toFixed(1)} mln`;
  if (uzs >= 1_000) return `${(uzs / 1_000).toFixed(0)} ming`;
  return String(uzs);
};

const fmtDuration = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}s ${m}d`;
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}`;
  return `${s}s`;
};

const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("sotuv");
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["products-stats", period],
    queryFn: () => productsService.withStats(period),
    staleTime: 30_000,
  });

  const products = useMemo(
    () => (data || []).filter((p) =>
      search.trim() === "" ? true : p.name.toLowerCase().includes(search.trim().toLowerCase())
    ),
    [data, search],
  );

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Package size={28} className="text-violet-500" />
          Mahsulotlar
        </h1>
      </div>

      {/* Sotuv / Audit toggle (Vision style) */}
      <div className="flex items-center gap-2 flex-wrap">
        <ModeButton active={mode === "sotuv"} onClick={() => setMode("sotuv")} icon={<TrendingUp size={14} />} label="Sotuv" color="#22c55e" />
        <ModeButton active={mode === "audit"} onClick={() => setMode("audit")} icon={<Headphones size={14} />} label="Audit" color="#22c55e" />
      </div>

      {/* Filter row */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            type="text"
            placeholder="Mahsulot qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 pr-3 rounded-lg border text-sm bg-transparent focus:outline-none focus:ring-1 focus:ring-accent"
            style={{ borderColor: "var(--color-border)", color: "var(--text-primary)", minWidth: 220 }}
          />
        </div>
        <div className="flex gap-1 p-1 rounded-lg border"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}>
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  active ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards — 3 col on lg, 2 col on md, 1 col on mobile */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" rounded="xl" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card>
          <div className="py-12 text-center text-sm text-secondary">
            <Package size={32} className="mx-auto mb-2 opacity-40" />
            Mahsulotlar topilmadi
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) =>
            mode === "sotuv" ? (
              <SotuvCard key={p.id} product={p} onClick={() => navigate(`/products/${p.id}`)} />
            ) : (
              <AuditCard key={p.id} product={p} onClick={() => navigate(`/products/${p.id}`)} />
            )
          )}
        </div>
      )}
    </div>
  );
};

const ModeButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; color: string }> = ({ active, onClick, icon, label, color }) => (
  <button
    onClick={onClick}
    className="px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
    style={{
      backgroundColor: active ? color : "transparent",
      color: active ? "#fff" : "var(--text-secondary)",
      border: `1px solid ${active ? color : "var(--color-border)"}`,
    }}
  >
    {icon}
    {label}
  </button>
);

/* ─── Sotuv card — KPI + mini line chart ─── */
const SotuvCard: React.FC<{ product: ProductWithStats; onClick: () => void }> = ({ product, onClick }) => {
  const s = product.sales;
  return (
    <button
      onClick={onClick}
      className="text-left p-5 rounded-2xl border transition-all hover:shadow-lg hover:border-violet-500/40"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "rgba(245, 158, 11, 0.15)" }}>
          <Package size={22} className="text-amber-500" />
        </div>
        <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>{product.name}</h3>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <KV label="LID" value={String(s.lid)} />
        <KV label="KONV" value={`${s.konv}%`} />
        <KV label="SOTUV" value={String(s.sotuv)} />
        <KV label="SUMMA" value={`${formatSum(s.summa)}`} />
      </div>

      <div className="rounded-xl border p-3"
        style={{ borderColor: "var(--color-border)", backgroundColor: "rgba(245,158,11,0.04)" }}>
        <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-wider text-secondary">
          <span>KUNLIK SOTUV</span>
          <span className="font-bold" style={{ color: "var(--text-primary)" }}>{s.sotuv} ta</span>
        </div>
        <div style={{ width: "100%", height: 60 }}>
          {s.dailyTrend.length > 0 ? (
            <ResponsiveContainer>
              <LineChart data={s.dailyTrend}>
                <Line type="monotone" dataKey="count" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-secondary">
              Ma'lumot yo'q
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

/* ─── Audit card — score + radar ─── */
const AuditCard: React.FC<{ product: ProductWithStats; onClick: () => void }> = ({ product, onClick }) => {
  const a = product.audit;
  const radarData = Object.entries(a.criteria).map(([key, value]) => ({
    subject: key.length > 12 ? key.substring(0, 10) + "..." : key,
    fullName: key,
    value,
  }));

  const scoreColor = a.score >= 80 ? "#22c55e" : a.score >= 60 ? "#f59e0b" : a.score >= 40 ? "#fb923c" : "#ef4444";

  return (
    <button
      onClick={onClick}
      className="text-left p-5 rounded-2xl border transition-all hover:shadow-lg hover:border-violet-500/40"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
    >
      <div className="flex items-start gap-4 mb-3">
        <div className="text-center" style={{ minWidth: 80 }}>
          <div className="text-3xl font-bold" style={{ color: scoreColor }}>
            {a.score || "—"}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-secondary mt-0.5">SCORE</div>
        </div>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgba(245, 158, 11, 0.15)" }}>
          <Package size={22} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <KVRow label="UMUMIY VAQT" value={fmtDuration(a.totalDuration)} />
          <KVRow label="O'RTACHA" value={fmtDuration(a.avgDuration)} />
          <KVRow label="SDELKA" value={a.deals} />
        </div>
      </div>

      <h3 className="font-bold text-lg mb-2 text-center" style={{ color: "var(--text-primary)" }}>{product.name}</h3>

      <div className="rounded-xl border p-3"
        style={{ borderColor: "var(--color-border)", backgroundColor: "rgba(245,158,11,0.04)" }}>
        <div className="text-[10px] uppercase tracking-wider text-secondary text-center mb-1">MEZONLAR BO'YICHA</div>
        <div style={{ width: "100%", height: 160 }}>
          {radarData.length > 0 ? (
            <ResponsiveContainer>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(148,163,184,0.25)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "var(--text-secondary)" }} />
                <PolarRadiusAxis tick={false} domain={[0, 100]} stroke="transparent" />
                <Radar name="Mezon" dataKey="value" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.45} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-secondary">
              Audio tahlili yo'q
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

const KV: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="font-bold" style={{ color: "var(--text-primary)" }}>{value}</span>
    <span className="text-[10px] uppercase tracking-wider text-secondary">{label}</span>
  </div>
);

const KVRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-[10px] uppercase tracking-wider text-secondary">{label}</span>
    <span className="font-bold" style={{ color: "var(--text-primary)" }}>{value}</span>
  </div>
);

export default ProductsPage;
