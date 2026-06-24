// Kurs ichidagi modullar grid + kurs meta (tahrir, o'chirish, modul qo'shish).
// Admin/ROP/Boss kursga tegishli modullarni boshqaradi. Modulga kirsa —
// AdminModuleDetailPage (modul ichidagi darslar) ochiladi.
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
  Users,
  Trash2,
  Edit2,
  Save,
  X,
  Search,
  Sparkles,
  GraduationCap,
  BookOpen,
  UserPlus,
  UserMinus,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import {
  lessonsService,
  LessonModuleSummary,
  CourseAssignmentItem,
} from "../../services/lessons.service";
import { managersService } from "../../services/managers.service";
import { useAuth } from "../../store/authStore";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}s ${m}daq` : `${m} daq`;
};

// ─── Module Card (kurs ichida) ────────────────────────────────
const ModuleCard: React.FC<{
  module: LessonModuleSummary;
  onClick: () => void;
}> = ({ module, onClick }) => {
  const gradients = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  ];
  const bg = gradients[module.sortOrder % gradients.length];

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer transition-all duration-200 hover:-translate-y-1"
    >
      <div
        className="rounded-2xl overflow-hidden transition-shadow duration-200 group-hover:shadow-xl"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div className="relative overflow-hidden" style={{ aspectRatio: "16 / 8", background: bg }}>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20" style={{ backgroundColor: "#fff" }} />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full opacity-10" style={{ backgroundColor: "#fff" }} />
          <div
            className="absolute top-3 left-3 w-11 h-11 rounded-xl flex items-center justify-center font-bold text-lg"
            style={{
              backgroundColor: "rgba(255,255,255,0.95)",
              color: "#1f2937",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            {module.sortOrder + 1}
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm transition-transform group-hover:scale-105"
              style={{
                backgroundColor: "rgba(255,255,255,0.25)",
                backdropFilter: "blur(8px)",
                border: "2px solid rgba(255,255,255,0.5)",
                color: "#fff",
              }}
            >
              <Layers size={16} color="#fff" />
              {module.lessonCount} dars
            </div>
          </div>
          {module.totalDurationSec > 0 && (
            <div
              className="absolute bottom-3 right-3 px-2 py-1 rounded-md text-xs font-semibold font-mono inline-flex items-center gap-1"
              style={{
                backgroundColor: "rgba(255,255,255,0.95)",
                color: "#1f2937",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}
            >
              <Clock size={10} />
              {fmtDuration(module.totalDurationSec)}
            </div>
          )}
        </div>

        <div className="p-4" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <h3
            className="font-bold text-base mb-1 line-clamp-2 leading-snug"
            style={{ color: "var(--ds-text-primary)" }}
            title={module.title}
          >
            {module.title}
          </h3>
          {module.description ? (
            <p
              className="text-xs line-clamp-2 mb-3 min-h-[2rem]"
              style={{ color: "var(--ds-text-secondary)" }}
            >
              {module.description}
            </p>
          ) : (
            <div className="min-h-[2rem]" />
          )}

          <div
            className="flex items-center justify-between pt-3 text-xs"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            <div className="flex items-center gap-2">
              <div
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                style={{ backgroundColor: "#10b98115", color: "#10b981", fontWeight: 600 }}
              >
                <CheckCircle2 size={11} />
                {module.readyCount}/{module.lessonCount}
              </div>
              {module.processingCount > 0 && (
                <div
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                  style={{ backgroundColor: "#f59e0b15", color: "#f59e0b", fontWeight: 600 }}
                >
                  <Loader2 size={11} className="animate-spin" />
                  {module.processingCount}
                </div>
              )}
              <div
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                style={{ backgroundColor: "#3b82f615", color: "#3b82f6", fontWeight: 600 }}
              >
                <Users size={11} />
                {module.assignedCount}
              </div>
            </div>
            <span
              className="font-semibold opacity-70 group-hover:opacity-100 transition-opacity"
              style={{ color: "var(--ds-text-secondary)" }}
            >
              Ochish →
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Create Module Modal (in course context) ─────────────────
const CreateModuleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  onCreated: (id: string) => void;
}> = ({ isOpen, onClose, courseId, onCreated }) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      lessonsService.createModule(title.trim(), description.trim() || undefined, courseId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-course", courseId] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      setTitle("");
      setDescription("");
      setErr(null);
      onClose();
      onCreated(data.id);
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.error || e?.message || "Xato");
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Yangi modul" size="sm">
      <div>
        <div className="mb-3">
          <label
            className="block text-sm font-semibold mb-1.5"
            style={{ color: "var(--text-primary)" }}
          >
            Nom <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masalan: 1-Modul: Kirish va asoslar"
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{
              backgroundColor: "var(--color-primary-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>
        <div className="mb-3">
          <label
            className="block text-sm font-semibold mb-1.5"
            style={{ color: "var(--text-primary)" }}
          >
            Tavsif (ixtiyoriy)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Modulning qisqa tavsifi..."
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-y"
            style={{
              backgroundColor: "var(--color-primary-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>

        {err && (
          <div
            className="mb-3 p-2 rounded-lg text-xs"
            style={{
              backgroundColor: "#ef444411",
              border: "1px solid #ef444433",
              color: "#ef4444",
            }}
          >
            {err}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Bekor
          </Button>
          <Button
            size="sm"
            onClick={() => createMutation.mutate()}
            loading={createMutation.isPending}
            disabled={!title.trim()}
          >
            <Plus size={14} />
            Yaratish
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// ─── Course Assign Panel (Managerlar bo'limi) ────────────────
// Kursga managerlarni biriktirish. Biriktirilgan manager kurs ichidagi BARCHA
// modullardagi barcha darslarga kirish huquqini oladi.
const CourseAssignPanel: React.FC<{
  courseId: string;
  existing: CourseAssignmentItem[];
}> = ({ courseId, existing }) => {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dueDate, setDueDate] = useState<string>("");

  const { data: managers } = useQuery({
    queryKey: ["managers-for-assign"],
    queryFn: () => managersService.getAll(),
  });

  const assignedIds = new Set(existing.map((a) => a.managerId));

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-course", courseId] });
    queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
  };

  const assignMutation = useMutation({
    mutationFn: (payload: { managerIds: string[]; dueDate?: string }) =>
      lessonsService.assignCourse(courseId, payload.managerIds, payload.dueDate),
    onSuccess: () => invalidateAll(),
  });
  const unassignMutation = useMutation({
    mutationFn: (mgrId: string) => lessonsService.unassignCourse(courseId, mgrId),
    onSuccess: () => invalidateAll(),
  });

  const activeMgrs = (managers || []).filter((m: any) => m.isActive !== false);
  const candidates = activeMgrs.filter((m: any) =>
    search ? m.name?.toLowerCase().includes(search.toLowerCase()) : true
  );

  return (
    <div
      className="rounded-2xl p-4 mb-5"
      style={{
        backgroundColor: "var(--color-card-bg)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
          Managerlar
          <span
            className="text-xs font-normal ml-2 px-2 py-0.5 rounded-md"
            style={{ backgroundColor: "#3b82f622", color: "#3b82f6" }}
          >
            {existing.length}
          </span>
        </h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <UserPlus size={14} />
          Tayinlash
        </Button>
      </div>

      {existing.length === 0 ? (
        <div
          className="py-8 text-center rounded-xl"
          style={{
            backgroundColor: "var(--color-primary-bg)",
            border: "1px dashed var(--color-border)",
          }}
        >
          <Users
            size={28}
            className="mx-auto mb-2"
            style={{ color: "var(--text-secondary)" }}
          />
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
            Hali manager tayinlanmagan
          </p>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <UserPlus size={14} />
            Manager qo'shish
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {existing.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between p-2.5 rounded-xl"
              style={{
                backgroundColor: "var(--color-primary-bg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                {a.manager.photoUrl ? (
                  <img
                    src={a.manager.photoUrl}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: "#3b82f633", color: "#3b82f6" }}
                  >
                    {(a.manager.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {a.manager.name}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {a.manager.role}
                    {a.dueDate
                      ? ` · ${new Date(a.dueDate).toLocaleDateString("uz-UZ")}gacha`
                      : ""}
                  </div>
                </div>
              </div>
              <button
                onClick={() => unassignMutation.mutate(a.managerId)}
                disabled={unassignMutation.isPending}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-transform hover:scale-110 disabled:opacity-50"
                style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
                title="Bekor qilish"
              >
                <UserMinus size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Assign modal */}
      <Modal
        isOpen={addOpen}
        onClose={() => {
          setAddOpen(false);
          setSearch("");
        }}
        title="Managerlarni tayinlash"
        size="md"
      >
        <div className="flex flex-col">
          <div className="mb-3">
            <label
              className="block text-sm font-semibold mb-1.5"
              style={{ color: "var(--text-primary)" }}
            >
              Muddat (ixtiyoriy)
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                backgroundColor: "var(--color-primary-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--color-border)",
              }}
            />
          </div>

          {activeMgrs.length > 0 && (
            <button
              onClick={() => {
                const unassigned = activeMgrs
                  .filter((m: any) => !assignedIds.has(m.id))
                  .map((m: any) => m.id);
                if (unassigned.length > 0) {
                  assignMutation.mutate({
                    managerIds: unassigned,
                    dueDate: dueDate || undefined,
                  });
                }
              }}
              disabled={
                existing.length === activeMgrs.length || assignMutation.isPending
              }
              className="w-full mb-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#10b981", color: "#fff" }}
            >
              <UserPlus size={14} className="inline mr-1" />
              Barchasiga tayinlash
            </button>
          )}

          <div className="relative mb-3">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-secondary)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Qidirish..."
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                backgroundColor: "var(--color-primary-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--color-border)",
              }}
            />
          </div>

          <div
            className="overflow-y-auto space-y-2 pr-1"
            style={{ maxHeight: "50vh" }}
          >
            {candidates.length === 0 && (
              <p
                className="text-sm text-center py-4"
                style={{ color: "var(--text-secondary)" }}
              >
                {activeMgrs.length === 0 ? "Aktiv manager yo'q" : "Topilmadi"}
              </p>
            )}
            {candidates.map((m: any) => {
              const already = assignedIds.has(m.id);
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 rounded-xl transition-all"
                  style={{
                    border: `1px solid ${already ? "#3b82f655" : "var(--color-border)"}`,
                    backgroundColor: already ? "#3b82f611" : "var(--color-primary-bg)",
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {m.photoUrl ? (
                      <img
                        src={m.photoUrl}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ backgroundColor: "#3b82f633", color: "#3b82f6" }}
                      >
                        {(m.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {m.name}
                      </div>
                      <div
                        className="text-xs truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {m.role}
                        {already && " · tayinlangan"}
                      </div>
                    </div>
                  </div>
                  {already ? (
                    <button
                      onClick={() => unassignMutation.mutate(m.id)}
                      disabled={unassignMutation.isPending}
                      className="flex items-center justify-center w-8 h-8 rounded-lg transition-transform hover:scale-110 disabled:opacity-50"
                      style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
                      title="Bekor qilish"
                    >
                      <UserMinus size={15} />
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        assignMutation.mutate({
                          managerIds: [m.id],
                          dueDate: dueDate || undefined,
                        })
                      }
                      disabled={assignMutation.isPending}
                      className="flex items-center justify-center w-8 h-8 rounded-lg transition-transform hover:scale-110 disabled:opacity-50"
                      style={{ backgroundColor: "#10b98122", color: "#10b981" }}
                      title="Tayinlash"
                    >
                      <UserPlus size={15} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAddOpen(false);
                setSearch("");
              }}
            >
              Yopish
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────
const AdminCourseDetailPage: React.FC = () => {
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
  const [addModuleOpen, setAddModuleOpen] = useState(false);

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["admin-course", id],
    queryFn: () => lessonsService.getCourse(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const d = query.state.data as any;
      return d?.modules?.some((m: any) => m.processingCount > 0) ? 5000 : false;
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      lessonsService.updateCourse(id!, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-course", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      setEditing(false);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => lessonsService.removeCourse(id!),
    onSuccess: () => navigate("/admin/lessons"),
  });

  const stats = useMemo(() => {
    if (!course) return { totalModules: 0, totalLessons: 0, ready: 0, duration: 0 };
    return {
      totalModules: course.modules.length,
      totalLessons: course.modules.reduce((s, m) => s + m.lessonCount, 0),
      ready: course.modules.reduce((s, m) => s + m.readyCount, 0),
      duration: course.modules.reduce((s, m) => s + m.totalDurationSec, 0),
    };
  }, [course]);

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
  if (isError || !course) {
    return <div className="p-6 text-sm text-red-400">Kurs topilmadi</div>;
  }

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <button
        onClick={() => navigate("/admin/lessons")}
        className="inline-flex items-center gap-2 text-sm mb-3 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Kurslar
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
              <GraduationCap size={26} color="#fff" />
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
                    placeholder="Kurs nomi"
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
                    KURS #{course.sortOrder + 1}
                  </div>
                  <h1 className="text-2xl md:text-3xl font-bold break-words text-white-imp" style={{ color: "#fff" }}>
                    {course.title}
                  </h1>
                  {course.description && (
                    <p className="text-sm mt-1 opacity-90 max-w-2xl" style={{ color: "#fff" }}>
                      {course.description}
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
                    setEditTitle(course.title);
                    setEditDesc(course.description || "");
                    setEditing(true);
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}
                >
                  <Edit2 size={14} className="inline mr-1" />
                  Tahrirlash
                </button>
                <button
                  onClick={() => setAddModuleOpen(true)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-105"
                  style={{ backgroundColor: "#fff", color: "#667eea" }}
                >
                  <Plus size={14} className="inline mr-1" />
                  Modul qo'shish
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
          <strong>{stats.totalModules}</strong> modul
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--text-primary)",
          }}
        >
          <BookOpen size={14} style={{ color: "#8b5cf6" }} />
          <strong>{stats.totalLessons}</strong> dars
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
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--text-primary)",
          }}
        >
          <Clock size={14} style={{ color: "#f59e0b" }} />
          <strong>{fmtDuration(stats.duration)}</strong>
        </div>
      </div>

      {/* Managerlar (kurs butunligicha biriktiriladi) */}
      <CourseAssignPanel courseId={course.id} existing={course.assignments || []} />

      {/* Modullar grid */}
      <div
        className="rounded-2xl p-4"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
            Modullar
            <span
              className="text-xs font-normal ml-2 px-2 py-0.5 rounded-md"
              style={{ backgroundColor: "#667eea22", color: "#667eea" }}
            >
              {course.modules.length}
            </span>
          </h3>
          <Button size="sm" onClick={() => setAddModuleOpen(true)}>
            <Plus size={14} />
            Modul qo'shish
          </Button>
        </div>

        {course.modules.length === 0 ? (
          <div
            className="py-10 text-center rounded-xl"
            style={{
              backgroundColor: "var(--color-primary-bg)",
              border: "1px dashed var(--color-border)",
            }}
          >
            <Layers
              size={32}
              className="mx-auto mb-2"
              style={{ color: "var(--text-secondary)" }}
            />
            <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
              Kursda hali modul yo'q
            </p>
            <Button size="sm" onClick={() => setAddModuleOpen(true)}>
              <Sparkles size={14} />
              Birinchi modulni qo'shish
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {course.modules.map((m) => (
              <ModuleCard
                key={m.id}
                module={m}
                onClick={() => navigate(`/admin/lessons/modules/${m.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete modal */}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Kursni o'chirish"
        size="sm"
      >
        <div>
          {course.modules.length > 0 ? (
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
                  Avval modullarni o'chirib oling
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Kursda {course.modules.length} ta modul bor. Avval ularni alohida o'chiring.
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
                  "<strong>{course.title}</strong>" kursi o'chiriladi.
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
              disabled={course.modules.length > 0}
              loading={deleteMutation.isPending}
            >
              <Trash2 size={14} />
              O'chirish
            </Button>
          </div>
        </div>
      </Modal>

      <CreateModuleModal
        isOpen={addModuleOpen}
        onClose={() => setAddModuleOpen(false)}
        courseId={course.id}
        onCreated={(modId) => navigate(`/admin/lessons/modules/${modId}`)}
      />
    </div>
  );
};

export default AdminCourseDetailPage;
