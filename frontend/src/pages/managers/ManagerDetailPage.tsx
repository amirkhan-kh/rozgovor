import React, { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, User, TrendingUp, Headphones, FileAudio } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import { managersService } from "../../services/managers.service";
import SalesPage from "../sales/SalesPage";
import AuditPage from "../audit/AuditPage";
import AudioFilesPage from "../audio/AudioFilesPage";

type Tab = "sales" | "audit" | "audio";

const TABS: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
  { key: "sales", label: "Sotuv", icon: <TrendingUp size={16} />, color: "#22c55e" },
  { key: "audit", label: "Audit", icon: <Headphones size={16} />, color: "#8b5cf6" },
  { key: "audio", label: "Audio", icon: <FileAudio size={16} />, color: "#3b5ef5" },
];

const ManagerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("sales");

  const { data: manager, isLoading } = useQuery({
    queryKey: ["manager-detail-header", id],
    queryFn: () => managersService.getDetail(id!, { period: "month" }),
    enabled: !!id,
  });

  if (!id) return null;

  const forceManagerIds = [id];

  return (
    <div className="px-4 md:px-6 py-4 space-y-5 max-w-7xl mx-auto">
      {/* Back + Breadcrumb */}
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
          title="Orqaga"
        >
          <ArrowLeft size={18} />
        </button>
        <Link to="/managers" className="hover:underline">
          Menejerlar
        </Link>
        <span>/</span>
        <span style={{ color: "var(--text-primary)" }}>
          {manager?.name || "..."}
        </span>
      </div>

      {/* Manager header */}
      <div
        className="rounded-2xl border px-5 py-4 flex items-center gap-4"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        {isLoading ? (
          <Skeleton className="w-16 h-16" rounded="full" />
        ) : (manager as any)?.photoUrl ? (
          <img
            src={(manager as any).photoUrl}
            alt={manager!.name}
            className="w-16 h-16 object-cover rounded-full"
            style={{ border: "2px solid var(--color-border)" }}
          />
        ) : (
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: "rgba(255,255,255,0.05)",
              border: "2px solid var(--color-border)",
              color: "var(--text-secondary)",
            }}
          >
            <User size={28} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1
            className="text-xl font-bold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {manager?.name || (isLoading ? "Yuklanmoqda..." : "Menejer")}
          </h1>
          {manager?.email && (
            <p
              className="text-sm truncate"
              style={{ color: "var(--text-secondary)" }}
            >
              {manager.email}
            </p>
          )}
        </div>
        {manager && (
          <div className="hidden md:flex items-center gap-5 pl-4" style={{ borderLeft: "1px solid var(--color-border)" }}>
            <Stat label="Qo'ng'iroq" value={String(manager.totalCalls ?? 0)} />
            <Stat label="Sotuv" value={String(manager.sales ?? 0)} />
            <Stat label="Konv" value={`${manager.conversionRate ?? 0}%`} />
            <Stat label="Score" value={String(manager.avgScore ?? 0)} />
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-xl border"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-card-bg)",
        }}
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: active ? t.color : "transparent",
                color: active ? "#ffffff" : "var(--text-secondary)",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {tab === "sales" && (
          <SalesPage forceManagerIds={forceManagerIds} embedded />
        )}
        {tab === "audit" && (
          <AuditPage forceManagerIds={forceManagerIds} embedded />
        )}
        {tab === "audio" && (
          <AudioFilesPage forceManagerIds={forceManagerIds} embedded />
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="text-center">
    <div className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
      {value}
    </div>
    <div
      className="text-[10px] font-semibold uppercase tracking-wider"
      style={{ color: "var(--text-secondary)" }}
    >
      {label}
    </div>
  </div>
);

export default ManagerDetailPage;
