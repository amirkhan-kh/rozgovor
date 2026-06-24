// Custdev detail — sarlavha + AI summary + savol boshqarish + intervyu ro'yxati
// Intervyular ustiga bosganda — CustdevInterviewPage ga yuboriladi.
import React, { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Upload,
  Mic,
  Sparkles,
  Clock,
  Plus,
  Trash2,
  GripVertical,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Pencil,
  Save,
  X,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  ListChecks,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  custdevService,
  CustdevInterviewStatus,
  CustdevQuestion,
} from "../../services/custdev.service";

const UZ_MONTHS_SHORT = [
  "yan", "fev", "mar", "apr", "may", "iyn",
  "iyl", "avg", "sen", "okt", "noy", "dek",
];
const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()} ${UZ_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtDuration = (sec: number | null): string => {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const STATUS_BADGE: Record<
  CustdevInterviewStatus,
  { color: string; text: string; icon: React.ElementType }
> = {
  pending: { color: "#6b7280", text: "Navbatda", icon: Loader2 },
  processing: { color: "#f59e0b", text: "Tahlilda", icon: Loader2 },
  completed: { color: "#10b981", text: "Tayyor", icon: CheckCircle2 },
  failed: { color: "#ef4444", text: "Xato", icon: AlertCircle },
};

// ─── Savol item (drag-drop) ───────────────────────────────────────
const SortableQuestionRow: React.FC<{
  q: CustdevQuestion;
  index: number;
  onEdit: (id: string, text: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}> = ({ q, index, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(q.text);
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed || trimmed === q.text) {
      setEditing(false);
      setText(q.text);
      return;
    }
    setBusy(true);
    try {
      await onEdit(q.id, trimmed);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: "var(--color-card-bg)",
        border: "1px solid var(--color-border)",
      }}
      className="flex items-center gap-2 rounded-xl p-2.5"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-black/5"
        style={{ color: "var(--text-secondary)" }}
      >
        <GripVertical size={16} />
      </button>
      <div
        className="flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: "#8b5cf615", color: "#8b5cf6" }}
      >
        {index + 1}
      </div>
      {editing ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 bg-transparent focus:outline-none text-sm"
          style={{ color: "var(--text-primary)" }}
          autoFocus
        />
      ) : (
        <div
          className="flex-1 text-sm leading-snug"
          style={{ color: "var(--text-primary)" }}
        >
          {q.text}
        </div>
      )}
      {editing ? (
        <>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="p-1.5 rounded-lg transition-colors hover:bg-green-500/10"
            style={{ color: "#10b981" }}
            aria-label="Saqlash"
          >
            <Save size={15} />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setText(q.text);
            }}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Bekor"
          >
            <X size={15} />
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-secondary)" }}
            aria-label="Tahrirlash"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(q.id)}
            className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
            style={{ color: "#ef4444" }}
            aria-label="O'chirish"
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
};

const CustdevDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState("");
  const [addingQ, setAddingQ] = useState(false);
  const [questionsOpen, setQuestionsOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["custdev", id],
    queryFn: () => custdevService.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const cur = query.state.data;
      if (!cur) return false;
      const hasProcessing = cur.interviews.some(
        (iv) => iv.status === "pending" || iv.status === "processing"
      );
      return hasProcessing ? 5000 : false;
    },
  });

  if (!id) return null;

  const handleReorder = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !data || active.id === over.id) return;
    const oldIdx = data.questions.findIndex((q) => q.id === active.id);
    const newIdx = data.questions.findIndex((q) => q.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(data.questions, oldIdx, newIdx);
    // Optimistic update
    qc.setQueryData(["custdev", id], {
      ...data,
      questions: reordered.map((q, i) => ({ ...q, sortOrder: i })),
    });
    try {
      await custdevService.reorderQuestions(
        id,
        reordered.map((q) => q.id)
      );
    } catch {
      refetch();
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;
    setAddingQ(true);
    try {
      await custdevService.addQuestion(id, newQuestion.trim());
      setNewQuestion("");
      refetch();
    } finally {
      setAddingQ(false);
    }
  };

  const handleEditQuestion = async (qid: string, text: string) => {
    await custdevService.updateQuestion(qid, text);
    refetch();
  };

  const handleDeleteQuestion = async (qid: string) => {
    if (!confirm("Savolni o'chirishni tasdiqlaysizmi?")) return;
    await custdevService.deleteQuestion(qid);
    refetch();
  };

  const handleFilePick = () => fileRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    try {
      await custdevService.uploadInterview(id, file, (pct) =>
        setUploadProgress(pct)
      );
      refetch();
    } catch (err: any) {
      setUploadError(
        err?.response?.data?.error || err?.message || "Yuklashda xatolik"
      );
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDeleteInterview = async (iid: string) => {
    if (!confirm("Intervyuni o'chirishni tasdiqlaysizmi?")) return;
    await custdevService.deleteInterview(iid);
    refetch();
  };

  if (isLoading) {
    return (
      <div
        className="py-12 text-center text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        Yuklanmoqda...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="max-w-2xl mx-auto p-4 rounded-xl"
        style={{
          backgroundColor: "#ef444411",
          border: "1px solid #ef444444",
          color: "#ef4444",
        }}
      >
        Xatolik: {(error as Error)?.message || "Custdev topilmadi"}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-8">
      {/* Back */}
      <button
        onClick={() => navigate("/custdev")}
        className="inline-flex items-center gap-1 text-sm font-medium mb-4 hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Custdev ro'yxati
      </button>

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl p-5 md:p-6 mb-5"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <div className="relative flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(8px)",
            }}
          >
            <MessageCircle size={24} color="#fff" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-white-imp" style={{ color: "#fff" }}>
              {data.title}
            </h1>
            {data.description && (
              <p className="text-sm mt-1 opacity-90" style={{ color: "#fff" }}>
                {data.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "#fff" }}>
              <span className="opacity-80">
                {data.questions.length} savol · {data.interviews.length} intervyu
              </span>
              <span className="opacity-60">·</span>
              <span className="opacity-80">{fmtDate(data.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI summary */}
      {data.aiSummary && (
        <div
          className="rounded-2xl p-4 mb-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))",
            border: "1px solid #10b98144",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#10b98122" }}
            >
              <Sparkles size={17} style={{ color: "#10b981" }} />
            </div>
            <div className="flex-1">
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "#10b981" }}
              >
                AI Umumiy xulosa
              </div>
              <div
                className="text-sm whitespace-pre-wrap leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                {data.aiSummary}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Savollar */}
      <div
        className="rounded-2xl p-4 mb-5"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setQuestionsOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 group"
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "rgba(139,92,246,0.12)" }}
            >
              <ListChecks size={14} style={{ color: "#8b5cf6" }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Savollar
            </span>
            {data.questions.length > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}
              >
                {data.questions.length} ta
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {questionsOpen ? "Yig'ish" : "Ko'rish"}
            </span>
            {questionsOpen
              ? <ChevronUp size={15} style={{ color: "var(--text-secondary)" }} />
              : <ChevronDown size={15} style={{ color: "var(--text-secondary)" }} />
            }
          </div>
        </button>

        {questionsOpen && (
          <div className="mt-3 space-y-3">
            {data.questions.length === 0 ? (
              <div
                className="text-xs py-6 text-center rounded-xl"
                style={{ color: "var(--text-secondary)", border: "1px dashed var(--color-border)" }}
              >
                Hali savol yo'q. Quyida qo'shing.
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
                <SortableContext
                  items={data.questions.map((q) => q.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {data.questions.map((q, i) => {
                      const showSection =
                        q.section && (i === 0 || data.questions[i - 1].section !== q.section);
                      return (
                        <React.Fragment key={q.id}>
                          {showSection && (
                            <div className="flex items-center gap-2 pt-2 pb-1">
                              <div className="h-px flex-1" style={{ backgroundColor: "var(--color-border)" }} />
                              <span
                                className="text-[10px] font-bold uppercase tracking-widest px-2"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {q.section}
                              </span>
                              <div className="h-px flex-1" style={{ backgroundColor: "var(--color-border)" }} />
                            </div>
                          )}
                          <SortableQuestionRow
                            q={q}
                            index={i}
                            onEdit={handleEditQuestion}
                            onDelete={handleDeleteQuestion}
                          />
                        </React.Fragment>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            )}

            <div className="flex gap-2 pt-1">
              <input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder="Yangi savol matni..."
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none"
                style={{
                  backgroundColor: "var(--ds-bg-overlay, rgba(0,0,0,0.03))",
                  color: "var(--text-primary)",
                  border: "1px solid var(--color-border)",
                }}
                onKeyDown={(e) => { if (e.key === "Enter") handleAddQuestion(); }}
              />
              <button
                onClick={handleAddQuestion}
                disabled={addingQ || !newQuestion.trim()}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ backgroundColor: "#8b5cf6", color: "#fff" }}
              >
                <Plus size={14} />
                Qo'shish
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Intervyular */}
      <div
        className="rounded-2xl p-4"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-base font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Intervyular ({data.interviews.length})
          </h2>
          <button
            onClick={handleFilePick}
            disabled={uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-sm"
            style={{
              background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
              color: "#fff",
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Yuklanmoqda {uploadProgress}%
              </>
            ) : (
              <>
                <Upload size={14} />
                Audio yuklash
              </>
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {uploadError && (
          <div
            className="mb-3 px-3 py-2 rounded-xl text-xs"
            style={{
              backgroundColor: "#ef444411",
              color: "#ef4444",
              border: "1px solid #ef444433",
            }}
          >
            {uploadError}
          </div>
        )}

        {data.interviews.length === 0 ? (
          <div
            className="py-8 text-center rounded-xl text-sm"
            style={{
              color: "var(--text-secondary)",
              border: "1px dashed var(--color-border)",
            }}
          >
            Hali intervyu yuklanmagan. Yuqoridagi "Audio yuklash" tugmasidan
            boshlang.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.interviews.map((iv, idx) => {
              const cfg = STATUS_BADGE[iv.status];
              const Icon = cfg.icon;
              return (
                <div
                  key={iv.id}
                  className="rounded-xl p-3 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
                  style={{
                    backgroundColor: "var(--color-card-bg)",
                    border: "1px solid var(--color-border)",
                  }}
                  onClick={() =>
                    navigate(`/custdev/${id}/interviews/${iv.id}`)
                  }
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: "#06b6d415" }}
                      >
                        <Mic size={16} style={{ color: "#06b6d4" }} />
                      </div>
                      <div>
                        <div
                          className="text-sm font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          Intervyu #{data.interviews.length - idx}
                        </div>
                        <div
                          className="text-[11px]"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {fmtDate(iv.createdAt)}
                        </div>
                      </div>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0"
                      style={{
                        backgroundColor: `${cfg.color}dd`,
                        color: "#fff",
                      }}
                    >
                      <Icon
                        size={10}
                        className={
                          iv.status === "processing" || iv.status === "pending"
                            ? "animate-spin"
                            : ""
                        }
                      />
                      {cfg.text}
                    </span>
                  </div>

                  <div
                    className="flex items-center gap-3 text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {fmtDuration(iv.durationSec)}
                    </span>
                  </div>

                  {iv.aiSummary && (
                    <div
                      className="mt-2 text-xs line-clamp-2"
                      style={{ color: "var(--ds-text-secondary)" }}
                    >
                      {iv.aiSummary}
                    </div>
                  )}

                  {iv.status === "failed" && iv.errorMessage && (
                    <div
                      className="mt-2 text-[11px] px-2 py-1 rounded truncate"
                      style={{
                        backgroundColor: "#ef444411",
                        color: "#ef4444",
                      }}
                      title={iv.errorMessage}
                    >
                      ⚠ {iv.errorMessage}
                    </div>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteInterview(iv.id);
                    }}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded opacity-60 hover:opacity-100"
                    style={{ color: "#ef4444" }}
                  >
                    <Trash2 size={11} /> O'chirish
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustdevDetailPage;
