import React, { useEffect, useState } from "react";
import { Plus, Loader2, Sparkles, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { agentsService, Competitor } from "../../services/agents.service";

/**
 * Rivals (raqobatchilar) admin sahifasi — Rival Agent (Layer 5).
 * Admin yangi raqobatchi qo'shishi mumkin, AI counter-argumentlarini yaratadi.
 */
const RivalsPage: React.FC = () => {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Competitor | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    try {
      const list = await agentsService.listCompetitors();
      setCompetitors(list);
    } catch {
      setCompetitors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Raqobatchi nomi bo'sh bo'lmasin");
      return;
    }
    setSubmitting(true);
    try {
      await agentsService.analyzeCompetitor(name.trim(), context.trim() || undefined);
      toast.success(`"${name}" tahlili tayyor`);
      setName("");
      setContext("");
      setShowAdd(false);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Tahlil xatolik");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await agentsService.deleteCompetitor(deleteTarget.id);
      toast.success(`"${deleteTarget.name}" o'chirildi`);
      setCompetitors((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "O'chirishda xatolik");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold ds-text-primary">Raqobatchilar</h1>
          <p className="text-sm ds-text-secondary mt-1">
            Rival Agent har raqobatchi uchun counter-argumentlar va kuchli/zaif tomonlarni yaratadi
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--ds-primary)",
            color: "var(--ds-text-inverted)",
          }}
        >
          <Plus size={16} />
          Yangi raqobatchi
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-bold text-secondary uppercase">Raqobatchi nomi</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masalan: Skyeng, EnglishCentral, ..."
                className="w-full mt-1 p-2 rounded-lg text-sm"
                style={{
                  background: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-secondary uppercase">Qo'shimcha kontekst (ixtiyoriy)</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Bozor holati, mijoz savollari, narx farqi..."
                className="w-full mt-1 p-2 rounded-lg text-sm"
                style={{
                  background: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border)",
                  color: "var(--text-primary)",
                  minHeight: 80,
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={submit}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "var(--ds-primary)", color: "var(--ds-text-inverted)" }}
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {submitting ? "Tahlil qilinmoqda..." : "AI bilan tahlil qilish"}
              </button>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setName("");
                  setContext("");
                }}
                className="px-4 py-2 text-sm text-secondary"
              >
                Bekor qilish
              </button>
            </div>
          </div>
        </Card>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <div className="flex items-start justify-between mb-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
              <div className="space-y-2 mb-3">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-1/3 mb-1" />
                <Skeleton className="h-8 w-full" rounded="lg" />
                <Skeleton className="h-8 w-full" rounded="lg" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && competitors.length === 0 && (
        <Card>
          <div className="text-center py-8 text-sm text-secondary">
            Hali raqobatchi qo'shilmagan.
            <br />
            "Yangi" tugmasini bosib, birinchi tahlilni yarating.
          </div>
        </Card>
      )}

      {/* Competitor cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {competitors.map((c) => (
          <Card key={c.id}>
            <div className="flex items-start justify-between mb-3 gap-2">
              <h3 className="text-base font-bold flex-1" style={{ color: "var(--text-primary)" }}>
                {c.name}
              </h3>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] text-secondary">
                  {new Date(c.lastUpdated).toLocaleDateString("uz-UZ")}
                </span>
                <button
                  onClick={() => setDeleteTarget(c)}
                  className="p-1.5 rounded-lg transition-colors hover:opacity-80"
                  title="O'chirish"
                  style={{
                    background: "var(--ds-danger-bg)",
                    color: "var(--ds-danger)",
                    border: "1px solid var(--ds-danger-br)",
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {c.strengths.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "#e64545" }}>
                  ⚠ Kuchli tomonlari
                </p>
                <ul className="space-y-1">
                  {c.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-secondary">• {s}</li>
                  ))}
                </ul>
              </div>
            )}

            {c.weaknesses.length > 0 && (
              <div className="mb-3">
                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "#2fcc6e" }}>
                  ✓ Zaif tomonlari
                </p>
                <ul className="space-y-1">
                  {c.weaknesses.map((w, i) => (
                    <li key={i} className="text-xs text-secondary">• {w}</li>
                  ))}
                </ul>
              </div>
            )}

            {c.counterArgs.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase mb-1" style={{ color: "#3b5ef5" }}>
                  💬 Counter argumentlar
                </p>
                <div className="space-y-2">
                  {c.counterArgs.slice(0, 5).map((ca, i) => {
                    // Eski yozuvlar object shaklida bo'lishi mumkin — readable string'ga aylantiramiz
                    let text: string;
                    if (typeof ca === "string") {
                      text = ca;
                    } else if (ca && typeof ca === "object") {
                      const obj = ca as Record<string, unknown>;
                      const objection = obj.objection || obj.if || obj.situation || obj.question;
                      const response = obj.response || obj.then || obj.answer || obj.javob;
                      if (objection && response) {
                        text = `Agar mijoz "${String(objection)}" desa: "${String(response)}"`;
                      } else {
                        const values = Object.values(obj).filter((v) => typeof v === "string" && v);
                        text = values.join(" — ") || "—";
                      }
                    } else {
                      text = String(ca);
                    }
                    if (text === "[object Object]") text = "(eski format — qayta yaratish kerak)";
                    return (
                      <div
                        key={i}
                        className="p-2 rounded-lg text-xs italic"
                        style={{
                          background: "rgba(59,94,245,0.06)",
                          border: "1px solid rgba(59,94,245,0.2)",
                          color: "var(--text-primary)",
                        }}
                      >
                        {text}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title="Raqobatchini o'chirish"
        size="sm"
      >
        <div className="space-y-4">
          <div
            className="p-3 rounded-lg"
            style={{
              background: "var(--ds-danger-bg)",
              border: "1px solid var(--ds-danger-br)",
            }}
          >
            <p className="text-sm" style={{ color: "var(--ds-text-primary)" }}>
              <strong>"{deleteTarget?.name}"</strong> raqobatchisini o'chirmoqchimisiz?
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--ds-text-muted)" }}>
              Barcha tahlil natijalari (kuchli tomonlar, zaif tomonlar, counter-argumentlar) yo'qoladi.
              Bu amalni bekor qilib bo'lmaydi.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Bekor qilish
            </Button>
            <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "O'chirilmoqda..." : "Ha, o'chirish"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RivalsPage;
