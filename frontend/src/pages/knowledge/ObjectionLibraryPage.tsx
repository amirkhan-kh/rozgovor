import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { BookOpen, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { knowledgeService } from "../../services/knowledge.service";

const ObjectionLibraryPage: React.FC = () => {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["objection-library"],
    queryFn: () => knowledgeService.getObjections(),
  });

  const refreshMut = useMutation({
    mutationFn: () => knowledgeService.refreshObjections(),
    onSuccess: () => {
      toast.success("Library yangilanmoqda, 1-2 daqiqadan keyin qayta yuklang");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["objection-library"] }), 90000);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            📚 E'tirozlar kutubxonasi
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Avtomatik yig'ilgan — muvaffaqiyatli javoblar va nimadan saqlanish kerak
          </p>
          {data?.updatedAt && (
            <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
              Oxirgi yangilanish: {new Date(data.updatedAt).toLocaleDateString("uz-UZ")}
            </p>
          )}
        </div>

        <button
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: "var(--ds-primary)", color: "var(--ds-text-inverted)" }}
        >
          <RefreshCw size={16} className={refreshMut.isPending ? "animate-spin" : ""} />
          Qayta yaratish
        </button>
      </div>

      <div className="flex gap-2 flex-wrap text-sm">
        <Link
          to="/knowledge/trackers"
          className="px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: "var(--color-border)", color: "var(--text-secondary)" }}
        >
          → Smart Trackers
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : !data?.library || data.library.entries.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <BookOpen size={32} className="mx-auto mb-2 opacity-40" style={{ color: "var(--text-secondary)" }} />
            <p className="text-secondary">E'tirozlar kutubxonasi hali yaratilmagan</p>
            <p className="text-xs mt-2 text-secondary">
              Birinchi marta yaratish uchun "Qayta yaratish" tugmasini bosing
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {data.library.totalCallsAnalyzed} ta qo'ng'iroq tahlil qilindi · {data.library.entries.length} ta e'tiroz turi
          </div>

          <div className="space-y-3">
            {data.library.entries.map((entry) => {
              const isOpen = expanded === entry.type;
              return (
                <Card key={entry.type} className="!p-0 overflow-hidden">
                  <button
                    onClick={() => setExpanded(isOpen ? null : entry.type)}
                    className="w-full flex items-center justify-between p-4 text-left transition-colors"
                    style={{ background: isOpen ? "var(--ds-bg-overlay)" : "transparent" }}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold truncate" style={{ color: "var(--ds-text-primary)" }}>
                          {entry.type}
                        </h3>
                        <p className="text-xs truncate" style={{ color: "var(--ds-text-secondary)" }}>
                          {entry.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                      <div className="text-right">
                        <p className="text-2xs uppercase font-semibold" style={{ color: "var(--ds-text-muted)" }}>Uchragan</p>
                        <p className="text-lg font-bold" style={{ color: "var(--ds-text-primary)" }}>
                          {entry.count}
                        </p>
                      </div>
                      <div className="text-right hidden md:block">
                        <p className="text-2xs uppercase font-semibold" style={{ color: "var(--ds-text-muted)" }}>Chastota</p>
                        <p className="text-lg font-bold" style={{ color: "var(--ds-warning)" }}>
                          {entry.frequency}%
                        </p>
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t p-4 space-y-4" style={{ borderColor: "var(--ds-border-default)" }}>
                      {entry.technique && (
                        <div
                          className="p-3 rounded-lg"
                          style={{
                            background: "var(--ds-primary-bg)",
                            border: "1px solid var(--ds-primary-br)",
                          }}
                        >
                          <p className="text-2xs font-bold uppercase tracking-wider mb-1" style={{ color: "var(--ds-primary)" }}>
                            🎯 Texnika
                          </p>
                          <p className="text-sm" style={{ color: "var(--ds-text-primary)" }}>
                            {entry.technique}
                          </p>
                        </div>
                      )}

                      {entry.bestResponses.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle size={16} style={{ color: "var(--ds-success)" }} />
                            <h4 className="text-sm font-semibold" style={{ color: "var(--ds-success)" }}>
                              Eng yaxshi javoblar
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {entry.bestResponses.map((r, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg border-l-4"
                                style={{
                                  background: "var(--ds-success-bg)",
                                  borderLeftColor: "var(--ds-success)",
                                  border: "1px solid var(--ds-success-br)",
                                  borderLeftWidth: 4,
                                }}
                              >
                                <p className="text-sm" style={{ color: "var(--ds-text-primary)" }}>
                                  "{r.quote}"
                                </p>
                                <div className="flex items-center justify-between mt-2 text-xs">
                                  <span style={{ color: "var(--ds-text-secondary)" }}>— {r.managerName}</span>
                                  {r.callId && (
                                    <Link
                                      to={`/audio/${r.callId}`}
                                      className="hover:underline font-semibold"
                                      style={{ color: "var(--ds-primary)" }}
                                    >
                                      Qo'ng'iroqni ko'rish →
                                    </Link>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {entry.avoidResponses.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <XCircle size={16} style={{ color: "var(--ds-danger)" }} />
                            <h4 className="text-sm font-semibold" style={{ color: "var(--ds-danger)" }}>
                              Qaysi javoblardan saqlaning
                            </h4>
                          </div>
                          <div className="space-y-2">
                            {entry.avoidResponses.map((r, i) => (
                              <div
                                key={i}
                                className="p-3 rounded-lg"
                                style={{
                                  background: "var(--ds-danger-bg)",
                                  border: "1px solid var(--ds-danger-br)",
                                  borderLeftWidth: 4,
                                  borderLeftColor: "var(--ds-danger)",
                                }}
                              >
                                <p className="text-sm" style={{ color: "var(--ds-text-primary)" }}>
                                  "{r.quote}"
                                </p>
                                <p className="text-xs mt-2" style={{ color: "var(--ds-text-secondary)" }}>
                                  Sababi: {r.why}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

export default ObjectionLibraryPage;
