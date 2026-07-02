import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Clock, Trophy, TrendingUp, AlertTriangle, X, Users, UserPlus, Trash2, Play, ListChecks, Filter, Target, Sparkles, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { voiceExamService, examAdminService, ExamScenario } from "../../services/voice-exam.service";
import { useAuth } from "../../store/authStore";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import toast from "react-hot-toast";

const difficultyColors: Record<string, string> = {
  easy: "#10b981",
  medium: "#f59e0b",
  hard: "#ef4444",
};

const difficultyLabels: Record<string, string> = {
  easy: "Oson",
  medium: "O'rta",
  hard: "Qiyin",
};

/* ───── Pro-audit uslubidagi statistika kartasi (AuditPage bilan bir xil) ───── */
const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  suffix?: string;
  icon: React.ReactNode;
  accentColor: string;
  hint?: string;
}> = ({ label, value, suffix, icon, accentColor, hint }) => (
  <div
    className="relative overflow-hidden rounded-2xl p-5 border"
    style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}
  >
    <div
      className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-15 blur-2xl"
      style={{ background: accentColor }}
    />
    <div className="relative flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)", opacity: 0.75 }}
        >
          {label}
        </p>
        <div className="mt-2 flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {value}
          </span>
          {suffix && (
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {suffix}
            </span>
          )}
        </div>
        {hint && (
          <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
            {hint}
          </p>
        )}
      </div>
      <div
        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
      >
        {icon}
      </div>
    </div>
  </div>
);

/* ───── SHARED: ALL RESULTS (boss + ROP) ───── */
const AllResultsView: React.FC = () => {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSalesperson, setFilterSalesperson] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "abandoned">("all");

  useEffect(() => {
    voiceExamService
      .history()
      .then((d) => setSessions(Array.isArray(d) ? d : []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, []);

  const salespeople = useMemo(() => {
    const map = new Map<string, { id: string; name: string; role?: string }>();
    sessions.forEach((s) => {
      const sp = s.salesperson;
      if (sp?.id && !map.has(sp.id)) map.set(sp.id, sp);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions]);

  const filtered = sessions.filter((s) => {
    if (filterSalesperson && s.salesperson?.id !== filterSalesperson) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    return true;
  });

  const completed = filtered.filter((s) => s.status === "completed");
  const avgScore = completed.length > 0
    ? Math.round(completed.reduce((a, b) => a + (b.overallScore || 0), 0) / completed.length)
    : 0;
  const totalMinutes = Math.round(filtered.reduce((a, b) => a + (b.duration || 0), 0) / 60);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-3 rounded-xl border border-border space-y-2"
              style={{ backgroundColor: "var(--color-card-bg)" }}
            >
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" rounded="xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <div className="text-xs text-secondary mb-1">Jami imtihon</div>
          <div className="text-xl font-bold">{filtered.length}</div>
        </div>
        <div className="p-3 rounded-xl border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <div className="text-xs text-secondary mb-1">O'rtacha ball</div>
          <div className="text-xl font-bold" style={{
            color: avgScore >= 80 ? "#10b981" : avgScore >= 60 ? "#f59e0b" : avgScore > 0 ? "#ef4444" : undefined,
          }}>
            {completed.length > 0 ? avgScore : "—"}
          </div>
        </div>
        <div className="p-3 rounded-xl border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <div className="text-xs text-secondary mb-1">Jami vaqt</div>
          <div className="text-xl font-bold">{totalMinutes} daq</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter size={14} className="text-secondary" />
        <select
          value={filterSalesperson}
          onChange={(e) => setFilterSalesperson(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-border bg-transparent text-xs focus:outline-none focus:border-accent"
          style={{ color: "var(--text-primary)", backgroundColor: "var(--color-card-bg)" }}
        >
          <option value="">Barcha sotuvchilar</option>
          {salespeople.map((sp) => (
            <option key={sp.id} value={sp.id}>{sp.name}{sp.role === "rop" ? " (ROP)" : ""}</option>
          ))}
        </select>
        <div className="flex gap-1 p-1 rounded-lg border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
          {[
            { k: "all", label: "Hammasi" },
            { k: "completed", label: "Topshirilgan" },
            { k: "abandoned", label: "Bekor" },
          ].map((o) => (
            <button
              key={o.k}
              onClick={() => setFilterStatus(o.k as any)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                filterStatus === o.k ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border p-8 text-center" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <ListChecks size={32} className="mx-auto mb-2 text-secondary/50" />
          <p className="text-sm text-secondary">Natijalar topilmadi</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((h) => (
            <button
              key={h.id}
              onClick={() => h.status === "completed" ? navigate(`/exam/result/${h.id}`) : null}
              className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                h.status === "completed" ? "hover:shadow-md cursor-pointer" : "opacity-70 cursor-default"
              }`}
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
            >
              <span className="text-2xl flex-shrink-0">{h.scenario?.icon || "—"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{h.salesperson?.name || "—"}</span>
                  {h.salesperson?.role === "rop" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-500 font-medium">ROP</span>
                  )}
                </div>
                <div className="text-xs text-secondary truncate">
                  {h.scenario?.name || "Imtihon"}
                  {h.clientName ? ` · ${h.clientGender === "female" ? "👩" : "👨"} ${h.clientName}${h.clientAge ? ", " + h.clientAge : ""}` : ""}
                </div>
                <div className="text-[10px] text-secondary mt-0.5">
                  {h.completedAt ? new Date(h.completedAt).toLocaleString("uz-UZ") : (h.startedAt ? new Date(h.startedAt).toLocaleString("uz-UZ") : "—")}
                  {h.duration ? ` · ${Math.round(h.duration / 60)} daq` : ""}
                </div>
              </div>
              {h.status === "completed" ? (
                <div
                  className="text-xl font-bold flex-shrink-0"
                  style={{
                    color: h.overallScore >= 80 ? "#10b981" : h.overallScore >= 60 ? "#f59e0b" : "#ef4444",
                  }}
                >
                  {h.overallScore}
                </div>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium flex-shrink-0">
                  {h.status === "abandoned" ? "Bekor" : "Jarayonda"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ───── ADMIN VIEW (Vision-style AI flow + target score + maxAttempts) ───── */
type AiPreview = {
  managerId: string;
  managerName: string;
  scenarioName: string;
  scenarioIcon: string;
  scenarioDifficulty: string;
  clientAge: number;
  clientGender: "male" | "female";
  clientName: string;
  reason: string;
  targetScore: number;
  maxAttempts: number;
};

const AdminExamView: React.FC = () => {
  const [tab, setTab] = useState<"assign" | "results">("assign");
  const [managers, setManagers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null);
  const [aiPicking, setAiPicking] = useState(false);
  const [previewTargetScore, setPreviewTargetScore] = useState<number>(70);
  const [previewMaxAttempts, setPreviewMaxAttempts] = useState<number>(5);
  const [savingTarget, setSavingTarget] = useState(false);

  const loadData = () => {
    setLoading(true);
    examAdminService.getManagers()
      .then((m) => setManagers(m))
      .catch(() => setManagers([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const runAiAndPreview = async (managerId: string, managerName: string, target?: number, attempts?: number) => {
    setAiPicking(true);
    try {
      const t = typeof target === "number" ? target : previewTargetScore || 70;
      const a = typeof attempts === "number" ? attempts : previewMaxAttempts || 5;
      const r = await examAdminService.assignAuto(managerId, t, a);
      setAiPreview({
        managerId,
        managerName,
        scenarioName: r.scenario.name,
        scenarioIcon: r.scenario.icon,
        scenarioDifficulty: r.scenario.difficulty,
        clientAge: r.clientAge,
        clientGender: r.clientGender,
        clientName: r.clientName,
        reason: r.reason,
        targetScore: r.targetScore,
        maxAttempts: r.maxAttempts,
      });
      setPreviewTargetScore(r.targetScore);
      setPreviewMaxAttempts(r.maxAttempts);
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.slice(0, 200) || "AI tanlovida xatolik");
    } finally {
      setAiPicking(false);
    }
  };

  const assignAiDirect = (managerId: string, managerName: string, prevTarget?: number, prevAttempts?: number) => {
    setPreviewTargetScore(prevTarget ?? 70);
    setPreviewMaxAttempts(prevAttempts ?? 5);
    runAiAndPreview(managerId, managerName, prevTarget ?? 70, prevAttempts ?? 5);
  };

  const confirmAiAssign = async () => {
    if (!aiPreview) return;
    const changed =
      previewTargetScore !== aiPreview.targetScore ||
      previewMaxAttempts !== aiPreview.maxAttempts;
    if (changed) {
      try {
        setSavingTarget(true);
        await examAdminService.updateTarget(aiPreview.managerId, previewTargetScore, previewMaxAttempts);
      } catch {/* noop */} finally {
        setSavingTarget(false);
      }
    }
    setAiPreview(null);
    loadData();
  };

  const closePreview = () => {
    if (aiPicking || savingTarget) return;
    setAiPreview(null);
  };

  const unassign = async (managerId: string) => {
    try {
      await examAdminService.unassign(managerId);
      loadData();
    } catch { /* noop */ }
  };

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-10 w-48" rounded="xl" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-border space-y-2"
              style={{ backgroundColor: "var(--color-card-bg)" }}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-6 w-12" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" rounded="xl" />
          ))}
        </div>
      </div>
    );
  }

  const assignedCount = managers.filter((m) => m.pendingExam).length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
          <Mic size={28} className="text-red-500" /> Imtihon boshqaruvi
        </h1>
        <p className="text-sm text-secondary">
          Har bir sotuvchiga imtihon tayinlang va natijalarni ko'ring
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl border border-border mb-5 w-full sm:w-fit" style={{ backgroundColor: "var(--color-card-bg)" }}>
        <button
          onClick={() => setTab("assign")}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === "assign" ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
          }`}
        >
          <UserPlus size={14} /> Tayinlash
        </button>
        <button
          onClick={() => setTab("results")}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === "results" ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
          }`}
        >
          <ListChecks size={14} /> Natijalar
        </button>
      </div>

      {tab === "results" ? (
        <AllResultsView />
      ) : (
      <>
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="p-3 md:p-4 rounded-xl border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <div className="flex items-center gap-2 text-xs text-secondary mb-1">
            <Users size={14} /> Jami sotuvchilar
          </div>
          <div className="text-xl font-bold">{managers.length}</div>
        </div>
        <div className="p-3 md:p-4 rounded-xl border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <div className="flex items-center gap-2 text-xs text-secondary mb-1">
            <UserPlus size={14} /> Tayinlangan
          </div>
          <div className="text-xl font-bold text-green-500">{assignedCount}</div>
        </div>
        <div className="p-3 md:p-4 rounded-xl border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <div className="flex items-center gap-2 text-xs text-secondary mb-1">
            <Trophy size={14} /> O'rtacha ball
          </div>
          <div className="text-xl font-bold">
            {managers.filter((m) => m.stats?.averageScore).length > 0
              ? Math.round(
                  managers
                    .filter((m) => m.stats?.averageScore)
                    .reduce((s, m) => s + m.stats.averageScore, 0) /
                    managers.filter((m) => m.stats?.averageScore).length
                )
              : "—"}
          </div>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {managers.map((m) => (
          <div key={m.id} className="rounded-xl border border-border p-3" style={{ backgroundColor: "var(--color-card-bg)" }}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{m.name}</div>
                <div className="text-xs text-secondary">{m.role} · {m.stats?.completedExams || 0} imtihon · {m.stats?.averageScore ? Math.round(m.stats.averageScore) + " ball" : "—"}</div>
              </div>
            </div>
            {m.pendingExam ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-2 mb-2">
                <div className="flex items-center gap-2 text-xs">
                  <span>{m.pendingExam.scenario?.icon}</span>
                  <span className="font-medium flex-1 truncate">{m.pendingExam.scenario?.name}</span>
                </div>
                <div className="text-[10px] text-secondary mt-0.5">
                  {m.pendingExam.gender === "female" ? "👩" : "👨"} {m.pendingExam.name || "—"}
                  {m.pendingExam.age ? `, ${m.pendingExam.age}` : ""}
                </div>
                {m.pendingExam.targetScore != null && (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium">🎯 {m.pendingExam.targetScore} ball</span>
                      <span className="text-secondary font-medium">{m.pendingExam.attemptsUsed}/{m.pendingExam.maxAttempts} bajarildi</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: m.pendingExam.maxAttempts }).map((_: any, i: number) => (
                        <div key={i} className={`flex-1 h-1 rounded-full ${i < m.pendingExam.attemptsUsed ? "bg-amber-500/80" : "bg-border"}`} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-secondary mb-2">Imtihon tayinlanmagan</div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => assignAiDirect(m.id, m.name, m.pendingExam?.targetScore, m.pendingExam?.maxAttempts)}
                disabled={aiPicking}
                className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold !text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #3b5ef5)" }}
              >
                <Sparkles size={12} /> {m.pendingExam ? "Qayta belgilash" : "Imtihon belgilash"}
              </button>
              {m.pendingExam && (
                <button
                  onClick={() => unassign(m.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border border-border overflow-hidden" style={{ backgroundColor: "var(--color-card-bg)" }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm text-secondary font-medium">Sotuvchi</th>
                <th className="text-left py-3 px-4 text-sm text-secondary font-medium">Tayinlangan imtihon</th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">Imtihonlar</th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">O'rtacha</th>
                <th className="text-right py-3 px-4 text-sm text-secondary font-medium">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m) => (
                <tr key={m.id} className="border-b border-border/50 hover:bg-accent/5 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-secondary">{m.role}</div>
                  </td>
                  <td className="py-3 px-4">
                    {m.pendingExam ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{m.pendingExam.scenario?.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{m.pendingExam.scenario?.name}</div>
                          <div className="text-[11px] text-secondary">
                            {m.pendingExam.gender === "female" ? "👩" : "👨"} {m.pendingExam.name || "—"}
                            {m.pendingExam.age ? `, ${m.pendingExam.age}` : ""}
                          </div>
                          {m.pendingExam.targetScore != null && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 font-medium">🎯 {m.pendingExam.targetScore} ball</span>
                              <span className="text-[10px] font-medium text-secondary">{m.pendingExam.attemptsUsed}/{m.pendingExam.maxAttempts} bajarildi</span>
                              <div className="flex items-center gap-0.5" style={{ minWidth: 40 }}>
                                {Array.from({ length: m.pendingExam.maxAttempts }).map((_: any, i: number) => (
                                  <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < m.pendingExam.attemptsUsed ? "bg-amber-500" : "bg-border"}`} />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-secondary">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center text-secondary">{m.stats?.completedExams || 0}</td>
                  <td className="py-3 px-4 text-center">
                    {m.stats?.averageScore ? (
                      <Badge variant={m.stats.averageScore >= 80 ? "success" : m.stats.averageScore >= 60 ? "warning" : "danger"}>
                        {Math.round(m.stats.averageScore)}
                      </Badge>
                    ) : <span className="text-secondary">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => assignAiDirect(m.id, m.name, m.pendingExam?.targetScore, m.pendingExam?.maxAttempts)}
                        disabled={aiPicking}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold !text-white disabled:opacity-50 flex items-center gap-1"
                        style={{ background: "linear-gradient(135deg, #8b5cf6, #3b5ef5)" }}
                        title="AI imtihon tayinlash (scenariy + persona o'zi tanlaydi)"
                      >
                        <Sparkles size={12} /> {m.pendingExam ? "Qayta" : "Imtihon belgilash"}
                      </button>
                      {m.pendingExam && (
                        <button
                          onClick={() => unassign(m.id)}
                          className="p-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Bekor qilish"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* AI preview modal — Vision style + target score + max attempts */}
      {aiPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div
            className="rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 relative border border-border"
            style={{ backgroundColor: "var(--color-card-bg)" }}
          >
            <button
              onClick={closePreview}
              disabled={aiPicking || savingTarget}
              className="absolute top-3 right-3 text-secondary hover:opacity-70 transition-colors disabled:opacity-30"
            >
              <X size={20} />
            </button>

            <div className="mb-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Sparkles size={18} className="text-purple-500" /> AI imtihon
              </h3>
              <p className="text-xs text-secondary">{aiPreview.managerName} uchun</p>
            </div>

            {aiPicking ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Loader2 size={28} className="animate-spin text-purple-500" />
                <p className="text-sm text-secondary">AI scenariy tanlamoqda...</p>
              </div>
            ) : (
              <>
                <div
                  className="rounded-xl p-4 border-2 mb-4"
                  style={{
                    borderColor: "#a78bfa",
                    background: "linear-gradient(135deg, rgba(167,139,250,0.08) 0%, rgba(59,94,245,0.08) 100%)",
                  }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-3xl">{aiPreview.scenarioIcon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                          {aiPreview.scenarioName}
                        </h4>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: `${difficultyColors[aiPreview.scenarioDifficulty]}20`,
                            color: difficultyColors[aiPreview.scenarioDifficulty],
                          }}
                        >
                          {difficultyLabels[aiPreview.scenarioDifficulty]}
                        </span>
                      </div>
                      <div className="text-xs text-secondary">
                        {aiPreview.clientGender === "female" ? "👩" : "👨"}{" "}
                        {aiPreview.clientName}, {aiPreview.clientAge} yosh
                      </div>
                    </div>
                  </div>
                  {aiPreview.reason && (
                    <div className="text-[11px] pt-3 border-t border-purple-300/30 text-secondary">
                      <span className="font-semibold">AI sababi: </span>
                      {aiPreview.reason}
                    </div>
                  )}
                </div>

                {/* Maqsadli ball */}
                <div className="mb-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                      <Target size={12} className="text-amber-500" />
                      Maqsadli o'rtacha ball
                    </label>
                    <span className="text-lg font-bold text-amber-500">{previewTargetScore}/100</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={previewTargetScore}
                    onChange={(e) => setPreviewTargetScore(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {[50, 60, 70, 80, 90].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setPreviewTargetScore(v)}
                        className={`py-1 rounded-md text-xs font-medium border transition-all ${
                          previewTargetScore === v ? "bg-amber-500 !text-white border-transparent" : "border-border hover:opacity-80"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Urinishlar soni */}
                <div className="mb-5 p-3 rounded-xl border border-blue-500/30 bg-blue-500/5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                      <RefreshCw size={12} className="text-blue-500" />
                      Urinishlar soni
                    </label>
                    <span className="text-lg font-bold text-blue-500">{previewMaxAttempts}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={previewMaxAttempts}
                    onChange={(e) => setPreviewMaxAttempts(Number(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                  <div className="grid grid-cols-5 gap-1.5 mt-2">
                    {[3, 5, 7, 8, 10].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setPreviewMaxAttempts(v)}
                        className={`py-1 rounded-md text-xs font-medium border transition-all ${
                          previewMaxAttempts === v ? "bg-blue-500 !text-white border-transparent" : "border-border hover:opacity-80"
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-secondary mt-2 leading-relaxed">
                    Sotuvchi <strong>{previewTargetScore} ball</strong> topishi uchun <strong>{previewMaxAttempts} ta urinish</strong> oladi.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => runAiAndPreview(aiPreview.managerId, aiPreview.managerName, previewTargetScore, previewMaxAttempts)}
                    disabled={aiPicking || savingTarget}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 border-purple-400/40 text-purple-500 hover:bg-purple-500/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw size={14} className={aiPicking ? "animate-spin" : ""} />
                    Qayta tanla
                  </button>
                  <button
                    type="button"
                    onClick={confirmAiAssign}
                    disabled={aiPicking || savingTarget}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold !text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
                    style={{ background: "linear-gradient(135deg, #8b5cf6, #3b5ef5)" }}
                  >
                    {savingTarget ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Tasdiqlash
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ───── MANAGER/SOTUVCHI VIEW ───── */
type PendingExam = {
  scenario: ExamScenario;
  age: number | null;
  gender: "male" | "female" | null;
  name: string | null;
  assignedAt: string;
  targetScore: number | null;
  maxAttempts: number;
  attemptsUsed: number;
  attemptsLeft: number;
};

const ManagerExamView: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const navigate = useNavigate();
  const { managerUser } = useAuth();
  const [pending, setPending] = useState<PendingExam | null>(null);
  const [examEnabled, setExamEnabled] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);

  const loadPreview = async () => {
    const r = await voiceExamService
      .getPending()
      .catch(() => ({ examEnabled: false, pending: null }));
    setExamEnabled(r.examEnabled);
    setPending((r.pending as PendingExam | null) ?? null);
  };

  useEffect(() => {
    // ROP uchun backend barcha natijalarni qaytaradi — shuning uchun embedded
    // rejimida faqat o'z natijalarimizni so'raymiz.
    const mySalespersonId = embedded ? managerUser?.id : undefined;
    Promise.all([
      loadPreview(),
      voiceExamService.history(mySalespersonId).catch(() => []),
    ])
      .then(([_, h]) => {
        setHistory(h);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, managerUser?.id]);

  const refreshPreview = async () => {
    try {
      setRefreshing(true);
      await loadPreview();
    } finally {
      setRefreshing(false);
    }
  };

  const startExam = async () => {
    try {
      setStarting(true);
      const data = await voiceExamService.start();
      sessionStorage.setItem(`exam-${data.sessionId}`, JSON.stringify(data));
      navigate(`/exam/session/${data.sessionId}`);
    } catch (e: any) {
      setErrorModal(e?.response?.data?.error || "Imtihonni boshlashda xatolik");
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className={embedded ? "space-y-5" : "p-4 md:p-6 space-y-5"}>
        {!embedded && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-border space-y-2"
              style={{ backgroundColor: "var(--color-card-bg)" }}
            >
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <div
          className="p-6 rounded-xl border border-border space-y-3"
          style={{ backgroundColor: "var(--color-card-bg)" }}
        >
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-10 w-32 mt-2" rounded="xl" />
        </div>
      </div>
    );
  }

  const completedCount = history.filter((h) => h.status === "completed").length;
  const avgScore =
    completedCount > 0
      ? Math.round(
          history
            .filter((h) => h.status === "completed" && h.overallScore)
            .reduce((a, b) => a + (b.overallScore || 0), 0) / completedCount
        )
      : 0;

  const content = (
    <>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
            <Mic size={28} className="text-red-500" /> Ovozli Imtihon
          </h1>
          <p className="text-sm text-secondary">
            AI mijoz bilan gaplashib o'z ko'nikmalaringizni sinab ko'ring
          </p>
        </div>
      )}

      {/* Stats — pro-audit uslubidagi kartalar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <StatCard
          label="Imtihonlar"
          value={completedCount}
          icon={<Trophy size={18} />}
          accentColor="#6366f1"
          hint="Topshirilgan"
        />
        <StatCard
          label="O'rtacha ball"
          value={avgScore}
          suffix="/100"
          icon={<TrendingUp size={18} />}
          accentColor="#10b981"
        />
        <StatCard
          label="Oxirgi imtihon"
          value={
            history[0]?.completedAt
              ? new Date(history[0].completedAt).toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" })
              : "—"
          }
          icon={<Clock size={18} />}
          accentColor="#0ea5e9"
        />
      </div>

      {/* Auto-generated exam preview */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles size={18} className="text-amber-500" />
            Tayinlangan imtihon
          </h2>
          {examEnabled && pending && (
            <button
              onClick={refreshPreview}
              disabled={refreshing}
              className="text-xs text-secondary hover:opacity-70 flex items-center gap-1 disabled:opacity-40"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
              Yangilash
            </button>
          )}
        </div>
        {!examEnabled ? (
          <div className="rounded-2xl border border-border p-6 text-center" style={{ backgroundColor: "var(--color-card-bg)" }}>
            <AlertTriangle size={32} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm text-secondary">
              Imtihon sizga hali ochilmagan. Rahbaringiz bilan bog'laning.
            </p>
          </div>
        ) : !pending ? (
          <div className="rounded-2xl border border-border p-6 text-center" style={{ backgroundColor: "var(--color-card-bg)" }}>
            <Target size={32} className="mx-auto mb-2 text-secondary/60" />
            <p className="text-sm text-secondary">
              Sizga imtihon tayinlanmagan. Rahbaringiz tayinlashini kuting.
            </p>
          </div>
        ) : (
          <div
            className="relative overflow-hidden rounded-2xl border-2 p-5"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: `${difficultyColors[pending.scenario.difficulty]}60`,
            }}
          >
            {/* Audit uslubidagi accent blob */}
            <div
              className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-15 blur-2xl pointer-events-none"
              style={{ background: difficultyColors[pending.scenario.difficulty] }}
            />
            <div className="flex items-start gap-4 mb-4">
              <div className="text-4xl">{pending.scenario.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="font-semibold text-lg">{pending.scenario.name}</h3>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: `${difficultyColors[pending.scenario.difficulty]}20`,
                      color: difficultyColors[pending.scenario.difficulty],
                    }}
                  >
                    {difficultyLabels[pending.scenario.difficulty]}
                  </span>
                </div>
                <p className="text-sm text-secondary mb-3">{pending.scenario.description}</p>
              </div>
            </div>

            {/* Standart — maqsadli ball + urinishlar */}
            {pending.targetScore != null && (
              <div className="rounded-lg p-3 mb-3 border border-amber-500/30 bg-amber-500/5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Target size={14} className="text-amber-500" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-600">Standart</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold text-amber-500">{pending.targetScore}</span>
                    <span className="text-xs text-secondary">/100 ball</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-1">
                    {Array.from({ length: pending.maxAttempts }).map((_, i) => (
                      <div
                        key={i}
                        className={`flex-1 h-1.5 rounded-full ${i < pending.attemptsUsed ? "bg-amber-500/70" : "bg-border"}`}
                      />
                    ))}
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: "var(--text-primary)" }}>
                    {pending.attemptsLeft}/{pending.maxAttempts} urinish qoldi
                  </span>
                </div>
              </div>
            )}

            {/* Persona */}
            <div className="flex items-center gap-3 text-xs text-secondary flex-wrap mb-4">
              <span className="flex items-center gap-1">
                <span className="text-base">{pending.gender === "female" ? "👩" : "👨"}</span>
                <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {pending.name || "—"}{pending.age ? `, ${pending.age} yosh` : ""}
                </span>
              </span>
            </div>

            <button
              onClick={startExam}
              disabled={starting || pending.attemptsLeft === 0}
              className="w-full py-3.5 rounded-xl text-sm font-semibold bg-accent !text-white hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {starting ? (
                <><Loader2 size={18} className="animate-spin" /> Boshlanmoqda...</>
              ) : pending.attemptsLeft === 0 ? (
                <>Urinishlar tugadi</>
              ) : (
                <><Play size={18} /> Imtihonni boshlash ({pending.attemptsUsed + 1}/{pending.maxAttempts})</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Recent history */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Oxirgi imtihonlar</h2>
          <div className="space-y-2">
            {history.slice(0, 5).map((h: any) => (
              <button
                key={h.id}
                onClick={() => h.status === "completed" ? navigate(`/exam/result/${h.id}`) : null}
                className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-center gap-3 ${
                  h.status === "completed" ? "hover:shadow-md cursor-pointer" : "opacity-70 cursor-default"
                }`}
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
              >
                <span className="text-2xl">{h.scenario?.icon || "—"}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{h.scenario?.name || "Imtihon"}</div>
                  <div className="text-xs text-secondary">
                    {h.completedAt ? new Date(h.completedAt).toLocaleString("uz-UZ") : "—"}
                  </div>
                </div>
                {h.status === "completed" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
                      Topshirildi
                    </span>
                    <div
                      className="text-xl font-bold"
                      style={{
                        color: h.overallScore >= 80 ? "#10b981" : h.overallScore >= 60 ? "#f59e0b" : "#ef4444",
                      }}
                    >
                      {h.overallScore}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">
                    {h.status === "abandoned" ? "Bekor qilindi" : "Topshirilmadi"}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error Modal */}
      {errorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl shadow-xl max-w-sm w-full p-6 relative border border-border" style={{ backgroundColor: "var(--color-card-bg)" }}>
            <button
              onClick={() => setErrorModal(null)}
              className="absolute top-3 right-3 text-secondary hover:opacity-70 transition-colors"
            >
              <X size={20} />
            </button>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle size={24} className="text-amber-500" />
              </div>
              <h3 className="text-lg font-semibold">Diqqat</h3>
              <p className="text-sm text-secondary">{errorModal}</p>
              <button
                onClick={() => setErrorModal(null)}
                className="mt-2 px-6 py-2 bg-accent rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
                style={{ color: "#ffffff" }}
              >
                Tushundim
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return content;
  return <div className="p-4 md:p-6 max-w-3xl mx-auto">{content}</div>;
};

/* ───── ROP VIEW: o'z imtihoni + barcha natijalar tabi ───── */
const RopExamView: React.FC = () => {
  const [tab, setTab] = useState<"mine" | "results">("mine");
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl md:text-3xl font-bold mb-1 flex items-center gap-2">
          <Mic size={28} className="text-red-500" /> Imtihon
        </h1>
        <p className="text-sm text-secondary">O'z imtihonlaringiz va barcha sotuvchilar natijalari</p>
      </div>
      <div className="flex gap-1 p-1 rounded-xl border border-border mb-5 w-full sm:w-fit" style={{ backgroundColor: "var(--color-card-bg)" }}>
        <button
          onClick={() => setTab("mine")}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === "mine" ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
          }`}
        >
          <Play size={14} /> Mening imtihonim
        </button>
        <button
          onClick={() => setTab("results")}
          className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            tab === "results" ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
          }`}
        >
          <ListChecks size={14} /> Barcha natijalar
        </button>
      </div>
      {tab === "mine" ? <ManagerExamView embedded /> : <AllResultsView />}
    </div>
  );
};

/* ───── MAIN: role bo'yicha tanlash ───── */
const ExamHomePage: React.FC = () => {
  const { userRole, managerUser } = useAuth();
  if (userRole === "company") return <AdminExamView />;
  if (managerUser?.role === "rop") return <RopExamView />;
  return <ManagerExamView />;
};

export default ExamHomePage;
