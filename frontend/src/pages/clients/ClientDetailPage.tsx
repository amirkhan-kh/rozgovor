import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Phone,
  MapPin,
  User,
  Heart,
  ShieldAlert,
  HelpCircle,
  MessageSquare,
  Clock,
  Headphones,
  Target,
  Sparkles,
} from "lucide-react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { clientsService } from "../../services/clients.service";

const formatPhone = (p: string): string => {
  const d = p.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("998")) {
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  }
  return p;
};

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("uz-UZ");
  } catch {
    return "—";
  }
};

const formatDuration = (sec: number | null): string => {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["client-detail", id],
    queryFn: () => clientsService.getOne(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32" rounded="xl" />
        <Skeleton className="h-64" rounded="xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-4 md:px-6 py-10 max-w-5xl mx-auto text-center">
        <p className="text-secondary">Mijoz topilmadi</p>
        <Link
          to="/clients"
          className="inline-flex items-center gap-1 mt-3 text-sm"
          style={{ color: "#3b5ef5" }}
        >
          <ArrowLeft size={14} /> Ro'yxatga qaytish
        </Link>
      </div>
    );
  }

  const c = data.client;

  return (
    <div className="px-4 md:px-6 py-4 max-w-5xl mx-auto space-y-5">
      {/* Back link */}
      <Link
        to="/clients"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={14} /> Mijozlar ro'yxati
      </Link>

      {/* Client summary card */}
      <Card>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="min-w-0">
            <h1
              className="text-2xl font-bold flex items-center gap-2"
              style={{ color: "var(--text-primary)" }}
            >
              <User size={24} style={{ color: "#06b6d4" }} />
              {c.name || "Nomalum mijoz"}
            </h1>
            <p
              className="text-sm mt-1 flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <Phone size={13} />
              {formatPhone(c.phoneNumber)}
            </p>
            {c.bitrixLeadIds.length > 0 && (
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-secondary)", opacity: 0.7 }}
              >
                Bitrix leadlar: {c.bitrixLeadIds.join(", ")}
              </p>
            )}
          </div>

          {/* Jinsi + yosh badge */}
          <div className="flex items-center gap-2 flex-wrap">
            {c.age != null && (
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold"
                style={{
                  backgroundColor: "rgba(139,92,246,0.15)",
                  color: "#8b5cf6",
                }}
              >
                {c.age} yosh
              </span>
            )}
            {c.gender && (
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold"
                style={{
                  backgroundColor:
                    c.gender === "male"
                      ? "rgba(59,94,245,0.15)"
                      : "rgba(236,72,153,0.15)",
                  color: c.gender === "male" ? "#3b5ef5" : "#ec4899",
                }}
              >
                {c.gender === "male" ? "Erkak" : "Ayol"}
              </span>
            )}
            {c.region && (
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold"
                style={{
                  backgroundColor: "rgba(6,182,212,0.15)",
                  color: "#06b6d4",
                }}
              >
                <MapPin size={12} />
                {c.region}
              </span>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <InfoCell label="Qo'ng'iroq" value={String(c.callsAnalyzed)} icon={<Headphones size={14} />} color="#06b6d4" />
          <InfoCell label="Voronka" value={c.pipelineName || "—"} icon={<Target size={14} />} color="#22c55e" />
          <InfoCell label="Manba" value={c.sourceName || c.sourceId || "—"} icon={<Sparkles size={14} />} color="#f59e0b" />
          <InfoCell
            label="Qaror vaqti"
            value={c.decisionTimeDays != null ? `${c.decisionTimeDays} kun` : "—"}
            icon={<Clock size={14} />}
            color="#8b5cf6"
          />
        </div>
      </Card>

      {/* AI profile grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <SectionHeader
            icon={<Heart size={16} style={{ color: "#ec4899" }} />}
            title="Qiziqishlari"
          />
          {c.interests.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {c.interests.map((it, i) => (
                <Chip key={i} text={it} color="#ec4899" />
              ))}
            </div>
          ) : (
            <EmptyNote text="AI hozircha qiziqishlarni aniqlamagan" />
          )}
        </Card>

        <Card>
          <SectionHeader
            icon={<ShieldAlert size={16} style={{ color: "#ef4444" }} />}
            title="Qo'rquvlari"
          />
          {c.fears.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {c.fears.map((f, i) => (
                <Chip key={i} text={f} color="#ef4444" />
              ))}
            </div>
          ) : (
            <EmptyNote text="AI hozircha qo'rquvlarni aniqlamagan" />
          )}
        </Card>

        <Card>
          <SectionHeader
            icon={<HelpCircle size={16} style={{ color: "#3b5ef5" }} />}
            title="Eng ko'p beriladigan savollar"
          />
          {c.topQuestions.length > 0 ? (
            <div className="space-y-1.5">
              {c.topQuestions.map((q, i) => (
                <CountRow key={i} text={q.value} count={q.count} color="#3b5ef5" />
              ))}
            </div>
          ) : (
            <EmptyNote text="Hozircha savollar yo'q" />
          )}
        </Card>

        <Card>
          <SectionHeader
            icon={<MessageSquare size={16} style={{ color: "#f59e0b" }} />}
            title="Eng ko'p beriladigan e'tirozlar"
          />
          {c.topObjections.length > 0 ? (
            <div className="space-y-1.5">
              {c.topObjections.map((o, i) => (
                <CountRow key={i} text={o.value} count={o.count} color="#f59e0b" />
              ))}
            </div>
          ) : (
            <EmptyNote text="Hozircha e'tirozlar yo'q" />
          )}
        </Card>
      </div>

      {/* Calls history */}
      <Card>
        <SectionHeader
          icon={<Headphones size={16} style={{ color: "#06b6d4" }} />}
          title={`Qo'ng'iroqlar tarixi (${data.calls.length})`}
        />
        {data.calls.length === 0 ? (
          <EmptyNote text="Bu mijoz bilan qo'ng'iroqlar topilmadi" />
        ) : (
          <div className="space-y-2">
            {data.calls.map((call) => (
              <Link
                key={call.id}
                to={`/audio/${call.id}`}
                className="block p-3 rounded-lg border hover:shadow-sm transition-all"
                style={{
                  backgroundColor: "var(--color-bg)",
                  borderColor: "var(--color-border)",
                }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {formatDate(call.callDate)}
                      </span>
                      {call.managerName && (
                        <span style={{ color: "var(--text-secondary)" }}>
                          · {call.managerName}
                        </span>
                      )}
                      <span style={{ color: "var(--text-secondary)" }}>
                        · {formatDuration(call.duration)}
                      </span>
                    </div>
                    {call.summary && (
                      <p
                        className="text-xs mt-1 line-clamp-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {call.summary}
                      </p>
                    )}
                  </div>
                  {call.overallScore != null && (
                    <span
                      className="inline-flex items-center justify-center text-xs font-bold px-2 py-1 rounded"
                      style={{
                        backgroundColor:
                          call.overallScore >= 80
                            ? "rgba(34,197,94,0.15)"
                            : call.overallScore >= 60
                            ? "rgba(245,158,11,0.15)"
                            : "rgba(239,68,68,0.15)",
                        color:
                          call.overallScore >= 80
                            ? "#22c55e"
                            : call.overallScore >= 60
                            ? "#f59e0b"
                            : "#ef4444",
                      }}
                    >
                      {call.overallScore}%
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Helper componentlar ───
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({
  icon,
  title,
}) => (
  <div className="flex items-center gap-2 mb-3">
    {icon}
    <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
      {title}
    </h3>
  </div>
);

const InfoCell: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}> = ({ label, value, icon, color }) => (
  <div className="flex items-center gap-2">
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: `${color}22`, color }}
    >
      {icon}
    </div>
    <div className="min-w-0">
      <p
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "var(--text-secondary)", opacity: 0.75 }}
      >
        {label}
      </p>
      <p
        className="text-sm font-semibold truncate"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  </div>
);

const Chip: React.FC<{ text: string; color: string }> = ({ text, color }) => (
  <span
    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
    style={{
      backgroundColor: `${color}22`,
      color,
    }}
  >
    {text}
  </span>
);

const CountRow: React.FC<{ text: string; count: number; color: string }> = ({
  text,
  count,
  color,
}) => (
  <div
    className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg"
    style={{ backgroundColor: "var(--color-bg)" }}
  >
    <span
      className="text-sm min-w-0 truncate"
      style={{ color: "var(--text-primary)" }}
    >
      {text}
    </span>
    <span
      className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: color, color: "#fff" }}
    >
      {count}
    </span>
  </div>
);

const EmptyNote: React.FC<{ text: string }> = ({ text }) => (
  <p
    className="text-xs"
    style={{ color: "var(--text-secondary)", opacity: 0.7 }}
  >
    {text}
  </p>
);

export default ClientDetailPage;
