// Modul ichidagi darslar ro'yxati + modul meta.
// Manager biriktirish KURS darajasiga ko'chirildi — bu sahifada faqat darslar boshqariladi.
import React, { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Layers,
  Clock,
  CheckCircle2,
  Loader2,
  AlertCircle,
  PlayCircle,
  FileText,
  Users,
  Trash2,
  Edit2,
  Save,
  X,
  Sparkles,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { lessonsService, LessonSummary } from "../../services/lessons.service";
import { useAuth } from "../../store/authStore";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}s ${m}daq` : `${m} daq`;
};

// ─── Lesson Row Card ─────────────────────────────────────────
const LessonRow: React.FC<{
  lesson: LessonSummary;
  onOpen: () => void;
}> = ({ lesson, onOpen }) => {
  const statusCfg =
    lesson.status === "ready"
      ? { color: "#10b981", text: "Tayyor", Icon: CheckCircle2 }
      : lesson.status === "processing"
      ? { color: "#f59e0b", text: "Tayyorlanmoqda", Icon: Loader2 }
      : { color: "#ef4444", text: "Xato", Icon: AlertCircle };

  return (
    <div
      onClick={onOpen}
      className="group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md"
      style={{
        backgroundColor: "var(--color-card-bg)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
        style={{ backgroundColor: "#667eea22", color: "#667eea" }}
      >
        {lesson.sortOrder + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="font-semibold text-sm truncate"
          style={{ color: "var(--ds-text-primary)" }}
        >
          {lesson.title}
        </div>
        <div
          className="flex items-center gap-2 text-xs mt-0.5 flex-wrap"
          style={{ color: "var(--ds-text-secondary)" }}
        >
          <span className="inline-flex items-center gap-1">
            <Clock size={10} />
            {fmtDuration(lesson.videoDurationSec)}
          </span>
          <span className="inline-flex items-center gap-1">
            <FileText size={10} />
            {lesson.testCount} savol
          </span>
          <span className="inline-flex items-center gap-1">
            <Users size={10} />
            {lesson.assignedCount}
          </span>
        </div>
      </div>
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold flex-shrink-0"
        style={{ backgroundColor: `${statusCfg.color}22`, color: statusCfg.color }}
      >
        <statusCfg.Icon size={11} className={lesson.status === "processing" ? "animate-spin" : ""} />
        {statusCfg.text}
      </span>
      <PlayCircle
        size={18}
        className="opacity-40 group-hover:opacity-100 transition-opacity flex-shrink-0"
        style={{ color: "var(--text-secondary)" }}
      />
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────
const AdminModuleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userRole, managerUser } = useAuth();

  const canManage =
    userRole === "company" ||
    managerUser?.role === "rop" ||
    managerUser?.role === "admin" ||
    managerUser?.role === "boss";

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: mod, isLoading, isError } = useQuery({
    queryKey: ["admin-module", id],
    queryFn: () => lessonsService.getModule(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const d = query.state.data as any;
      return d?.lessons?.some((l: any) => l.status === "processing") ? 5000 : false;
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      lessonsService.updateModule(id!, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-module", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-lesson-modules"] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course"] });
      setEditing(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => lessonsService.removeModule(id!),
    onSuccess: () => {
      // Kursga qaytamiz agar courseId bor bo'lsa, aks holda kurslar ro'yxatiga
      const courseId = mod?.courseId;
      navigate(courseId ? `/admin/lessons/courses/${courseId}` : "/admin/lessons");
    },
  });

  const stats = useMemo(() => {
    if (!mod) return { total: 0, ready: 0, processing: 0, duration: 0 };
    return {
      total: mod.lessons.length,
      ready: mod.lessons.filter((l) => l.status === "ready").length,
      processing: mod.lessons.filter((l) => l.status === "processing").length,
      duration: mod.lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0),
    };
  }, [mod]);

  if (!canManage) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Ruxsat yo'q
        </h1>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        Yuklanmoqda...
      </div>
    );
  }
  if (isError || !mod) {
    return <div className="p-6 text-sm text-red-400">Modul topilmadi</div>;
  }

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <button
        onClick={() =>
          navigate(mod.courseId ? `/admin/lessons/courses/${mod.courseId}` : "/admin/lessons")
        }
        className="inline-flex items-center gap-2 text-sm mb-3 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        {mod.courseId ? "Kurs" : "Kurslar"}
      </button>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-5"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20"
          style={{ backgroundColor: "#fff" }}
        />
        <div className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}
            >
              <Layers size={26} color="#fff" />
            </div>
            <div className="flex-1 min-w-0">
              {editing ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-2xl font-bold px-2 py-1 rounded-lg"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.25)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.5)",
                    }}
                    placeholder="Modul nomi"
                  />
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
                    className="text-sm px-2 py-1 rounded-lg"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.25)",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.5)",
                    }}
                    placeholder="Tavsif"
                  />
                </div>
              ) : (
                <>
                  <div className="text-xs font-semibold mb-1 opacity-80" style={{ color: "#fff" }}>
                    MODUL #{mod.sortOrder + 1}
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold break-words text-white-imp" style={{ color: "#fff" }}>
                    {mod.title}
                  </h1>
                  {mod.description && (
                    <p className="text-sm mt-1 opacity-90 max-w-2xl" style={{ color: "#fff" }}>
                      {mod.description}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {editing ? (
              <>
                <button
                  onClick={() => setEditing(false)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}
                >
                  <X size={14} className="inline mr-1" />
                  Bekor
                </button>
                <button
                  onClick={() => updateMutation.mutate()}
                  disabled={!editTitle.trim() || updateMutation.isPending}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-105"
                  style={{ backgroundColor: "#fff", color: "#667eea" }}
                >
                  <Save size={14} className="inline mr-1" />
                  Saqlash
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setEditTitle(mod.title);
                    setEditDesc(mod.description || "");
                    setEditing(true);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}
                >
                  <Edit2 size={14} className="inline mr-1" />
                  Tahrirlash
                </button>
                <button
                  onClick={() => navigate(`/admin/lessons/new?moduleId=${mod.id}`)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-105"
                  style={{ backgroundColor: "#fff", color: "#667eea" }}
                >
                  <Plus size={14} className="inline mr-1" />
                  Dars qo'shish
                </button>
                <button
                  onClick={() => setDeleteOpen(true)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}
                >
                  <Trash2 size={14} className="inline mr-1" />
                  O'chirish
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats inline */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--text-primary)",
          }}
        >
          <Layers size={14} style={{ color: "#667eea" }} />
          <strong>{stats.total}</strong> dars
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--text-primary)",
          }}
        >
          <CheckCircle2 size={14} style={{ color: "#10b981" }} />
          <strong>{stats.ready}</strong> tayyor
        </div>
        {stats.processing > 0 && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
            style={{
              backgroundColor: "var(--color-card-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--text-primary)",
            }}
          >
            <Loader2 size={14} className="animate-spin" style={{ color: "#f59e0b" }} />
            <strong>{stats.processing}</strong> jarayonda
          </div>
        )}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--text-primary)",
          }}
        >
          <Clock size={14} style={{ color: "#8b5cf6" }} />
          <strong>{fmtDuration(stats.duration)}</strong>
        </div>
      </div>

      {/* Content — darslar ro'yxati (manager biriktirish KURS darajasiga ko'chirilgan) */}
      <div
        className="rounded-2xl p-4"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            Darslar
            <span
              className="text-xs font-normal ml-2 px-2 py-0.5 rounded-md"
              style={{ backgroundColor: "#667eea22", color: "#667eea" }}
            >
              {mod.lessons.length}
            </span>
          </h3>
          <Button
            size="sm"
            onClick={() => navigate(`/admin/lessons/new?moduleId=${mod.id}`)}
          >
            <Plus size={14} />
            Qo'shish
          </Button>
        </div>

        {mod.lessons.length === 0 ? (
          <div
            className="py-10 text-center rounded-xl"
            style={{
              backgroundColor: "var(--color-primary-bg)",
              border: "1px dashed var(--color-border)",
            }}
          >
            <FileText
              size={32}
              className="mx-auto mb-2"
              style={{ color: "var(--text-secondary)" }}
            />
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Modulda hali dars yo'q
            </p>
            <Button
              size="sm"
              onClick={() => navigate(`/admin/lessons/new?moduleId=${mod.id}`)}
            >
              <Sparkles size={14} />
              Birinchi darsni qo'shish
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {mod.lessons.map((l) => (
              <LessonRow
                key={l.id}
                lesson={l}
                onOpen={() => navigate(`/admin/lessons/${l.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete modal */}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Modulni o'chirish"
        size="sm"
      >
        <div>
          {mod.lessons.length > 0 ? (
            <div
              className="flex items-start gap-3 p-3 rounded-lg mb-4"
              style={{ backgroundColor: "#f59e0b11", border: "1px solid #f59e0b33" }}
            >
              <AlertCircle
                size={20}
                className="flex-shrink-0 mt-0.5"
                style={{ color: "#f59e0b" }}
              />
              <div>
                <p className="font-medium text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                  Avval darslarni o'chirib oling
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Modulda {mod.lessons.length} ta dars bor. Avval ularni alohida o'chiring.
                </p>
              </div>
            </div>
          ) : (
            <div
              className="flex items-start gap-3 p-3 rounded-lg mb-4"
              style={{ backgroundColor: "#ef444411", border: "1px solid #ef444433" }}
            >
              <AlertCircle
                size={20}
                className="flex-shrink-0 mt-0.5"
                style={{ color: "#ef4444" }}
              />
              <div>
                <p className="font-medium text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                  Bu amalni qaytarib bo'lmaydi
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  "<strong>{mod.title}</strong>" moduli o'chiriladi.
                </p>
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(false)}>
              Bekor
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                deleteMutation.mutate();
                setDeleteOpen(false);
              }}
              disabled={mod.lessons.length > 0}
              loading={deleteMutation.isPending}
            >
              <Trash2 size={14} />
              O'chirish
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminModuleDetailPage;
