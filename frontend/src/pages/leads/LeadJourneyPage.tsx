import React from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Phone, Calendar, Clock, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle, Target
} from "lucide-react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { leadsService } from "../../services/leads.service";

const sentimentConfig = {
  positive: { color: "#2fcc6e", bg: "rgba(47,204,110,0.1)", label: "Ijobiy", emoji: "😊" },
  neutral: { color: "#6b7280", bg: "rgba(107,114,128,0.1)", label: "Neytral", emoji: "😐" },
  negative: { color: "#e64545", bg: "rgba(230,69,69,0.1)", label: "Salbiy", emoji: "😞" },
};

const trajectoryIcon = (t: "improving" | "stable" | "declining") => {
  if (t === "improving") return <TrendingUp size={18} style={{ color: "#2fcc6e" }} />;
  if (t === "declining") return <TrendingDown size={18} style={{ color: "#e64545" }} />;
  return <Minus size={18} style={{ color: "#6b7280" }} />;
};

const riskConfig = {
  low: { color: "#2fcc6e", label: "Past xavf" },
  medium: { color: "#e6a020", label: "O'rta xavf" },
  high: { color: "#e64545", label: "Yuqori xavf" },
};

const LeadJourneyPage: React.FC = () => {
  const { leadId } = useParams<{ leadId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["lead-journey", leadId],
    queryFn: () => leadsService.getJourney(leadId!),
    enabled: !!leadId,
  });

  if (isLoading) {
    return (
      <div className="px-4 md:px-6 py-4 space-y-4 max-w-7xl mx-auto">
        <Skeleton className="h-12 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 md:px-6 py-4 max-w-7xl mx-auto">
        <Card>
          <div className="py-12 text-center">
            <AlertTriangle size={32} className="mx-auto mb-2 text-secondary opacity-40" />
            <p className="text-secondary">Lead topilmadi yoki qo'ng'iroqlar yo'q</p>
            <Link to="/audio" className="text-accent mt-4 inline-block hover:underline">
              ← Audio
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const risk = riskConfig[data.aiSummary.riskLevel];

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          to="/audio"
          className="flex items-center gap-1 text-sm text-secondary hover:text-primary transition-colors"
        >
          <ArrowLeft size={16} /> Audio
        </Link>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "rgba(59,94,245,0.15)" }}
          >
            <Phone size={22} style={{ color: "#3b5ef5" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {data.clientPhone || "Nomalum mijoz"}
            </h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Lead #{data.leadId} · {data.totalCalls} ta qo'ng'iroq
              {data.pipelineName && ` · ${data.pipelineName}`}
            </p>
          </div>
        </div>

        {data.isSale && (
          <div
            className="px-3 py-2 rounded-lg flex items-center gap-2"
            style={{ backgroundColor: "rgba(47,204,110,0.15)", color: "#2fcc6e" }}
          >
            <CheckCircle size={18} />
            <span className="font-semibold text-sm">
              Sotildi{data.saleAmount ? ` · ${data.saleAmount.toLocaleString()}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* AI Summary — top */}
      <Card className="border-l-4" >
        <div className="flex items-start gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: risk.color + "22" }}
          >
            <Target size={18} style={{ color: risk.color }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                🤖 AI Xulosa
              </h3>
              <span
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: risk.color + "22", color: risk.color }}
              >
                {risk.label}
              </span>
              <div className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                {trajectoryIcon(data.sentimentTrajectory)}
                <span>
                  {data.sentimentTrajectory === "improving"
                    ? "Yaxshilanmoqda"
                    : data.sentimentTrajectory === "declining"
                    ? "Sovib bormoqda"
                    : "Barqaror"}
                </span>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Mijoz nima xohlayapti: </span>
                <span style={{ color: "var(--text-primary)" }}>{data.aiSummary.whatClientWants}</span>
              </div>
              <div>
                <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Hozirgi holat: </span>
                <span style={{ color: "var(--text-primary)" }}>{data.aiSummary.currentStatus}</span>
              </div>
              {data.aiSummary.mainObjections.length > 0 && (
                <div>
                  <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>Asosiy e'tirozlar: </span>
                  <span className="inline-flex flex-wrap gap-1">
                    {data.aiSummary.mainObjections.map((o, i) => (
                      <span
                        key={i}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "rgba(230,160,32,0.15)", color: "#e6a020" }}
                      >
                        {o}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>

            <div
              className="mt-4 p-3 rounded-lg border"
              style={{ backgroundColor: "rgba(59,94,245,0.1)", borderColor: "rgba(59,94,245,0.3)" }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: "#3b5ef5" }}>🎯 KEYINGI HARAKAT:</p>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{data.aiSummary.nextAction}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* #8 — Transfer tarixi (kim → kim) */}
      {((data.transfers && data.transfers.length > 0) || (data.involvedManagers && data.involvedManagers.length > 1)) && (
        <Card title="🔄 Transfer tarixi (kim → kim)">
          {data.involvedManagers && data.involvedManagers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Qatnashgan menejerlar:</span>
              {data.involvedManagers.map((m) => (
                <span key={m} className="px-2.5 py-1 rounded-full text-[12px] font-medium" style={{ background: "rgba(79,70,229,0.15)", color: "var(--text-primary)" }}>{m}</span>
              ))}
            </div>
          )}
          {data.transfers && data.transfers.length > 0 ? (
            <div className="space-y-2">
              {data.transfers.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm rounded-lg px-3 py-2" style={{ background: "var(--ds-bg-base,#0b0b0f)", border: "1px solid var(--color-border,#1f1f2a)" }}>
                  <span style={{ color: "var(--text-secondary)" }}>{t.from}</span>
                  <span style={{ color: "#f59e0b" }}>→</span>
                  <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{t.to}</span>
                  {t.at && <span className="ml-auto text-[12px]" style={{ color: "var(--text-muted,#64748b)" }}>{new Date(t.at).toLocaleDateString("uz")}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--text-muted,#64748b)" }}>Transfer aniqlanmadi — bitta menejer ishlagan.</p>
          )}
        </Card>
      )}

      {/* Timeline */}
      <Card title="📅 Qo'ng'iroqlar tarixi">
        <div className="relative">
          <div
            className="absolute left-4 top-0 bottom-0 w-0.5"
            style={{ backgroundColor: "var(--color-border)" }}
          />
          <div className="space-y-4">
            {data.calls.map((c) => {
              const sent = sentimentConfig[c.sentiment];
              return (
                <div key={c.audioFileId} className="relative pl-12">
                  <div
                    className="absolute left-2 top-1 w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{ backgroundColor: sent.color, borderColor: "var(--color-bg)" }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>

                  <Link
                    to={`/audio/${c.audioFileId}`}
                    className="block p-3 rounded-lg border hover:shadow-md transition-all"
                    style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} style={{ color: "var(--text-secondary)" }} />
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {c.callDate ? new Date(c.callDate).toLocaleString("uz-UZ") : "—"}
                        </span>
                        {c.duration && (
                          <>
                            <span style={{ color: "var(--text-secondary)" }}>·</span>
                            <Clock size={14} style={{ color: "var(--text-secondary)" }} />
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                              {Math.floor(c.duration / 60)}:{String(c.duration % 60).padStart(2, "0")}
                            </span>
                          </>
                        )}
                        <span
                          className="text-xs px-2 py-0.5 rounded-full ml-1"
                          style={{ backgroundColor: sent.bg, color: sent.color }}
                        >
                          {sent.emoji} {sent.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.isSale && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: "rgba(47,204,110,0.15)", color: "#2fcc6e" }}
                          >
                            ✅ Sotildi
                          </span>
                        )}
                        {c.score !== null && (
                          <span
                            className="text-xs font-bold"
                            style={{
                              color: c.score >= 70 ? "#2fcc6e" : c.score >= 50 ? "#e6a020" : "#e64545",
                            }}
                          >
                            {c.score}%
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-sm line-clamp-2" style={{ color: "var(--text-primary)" }}>
                      {c.summary || "Xulosa yo'q"}
                    </p>

                    <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span style={{ color: "var(--text-secondary)" }}>{c.managerName || "—"}</span>
                        {c.topObjections.length > 0 && (
                          <>
                            <span style={{ color: "var(--text-secondary)" }}>·</span>
                            {c.topObjections.slice(0, 2).map((o, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded"
                                style={{
                                  backgroundColor: "rgba(230,160,32,0.15)",
                                  color: "#e6a020",
                                }}
                              >
                                {o.type}
                              </span>
                            ))}
                          </>
                        )}
                      </div>
                      {c.requiresFollowup && (
                        <span
                          className="text-xs font-semibold"
                          style={{ color: c.followupCompleted ? "#2fcc6e" : "#e64545" }}
                        >
                          {c.followupCompleted ? "✅ Follow-up bajarildi" : "🚨 Follow-up kerak"}
                        </span>
                      )}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LeadJourneyPage;
