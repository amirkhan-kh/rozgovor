// Admin / ROP / Boss: kurslar grid (birinchi sahifa — 3-qatlamli hierarchy).
// Kurs bosilganda — `/admin/lessons/courses/:id` (AdminCourseDetailPage) ochiladi.
// Ichkarida kursga tegishli modullar, modul ichida esa darslar.
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  BookOpen,
  CheckCircle2,
  Loader2,
  Users,
  Search,
  Sparkles,
  GraduationCap,
  Layers,
  Clock,
  X,
  PlayCircle,
  Trophy,
  TrendingUp,
  Award,
  Target,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { lessonsService, CourseSummary } from "../../services/lessons.service";
import { useAuth } from "../../store/authStore";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}s ${m}daq` : `${m} daq`;
};

// ─── Stat Card ────────────────────────────────────────────────
const StatCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}> = ({ icon: Icon, label, value, color }) => (
  <div
    className="relative overflow-hidden rounded-2xl p-4 transition-transform hover:scale-[1.02]"
    style={{
      backgroundColor: "var(--color-card-bg)",
      border: "1px solid var(--color-border)",
    }}
  >
    <div
      className="absolute top-0 left-0 right-0 h-1"
      style={{ backgroundColor: color }}
    />
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          {label}
        </div>
        <div className="text-3xl leading-none" style={{ color, fontWeight: 700 }}>
          {value}
        </div>
      </div>
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}1a` }}
      >
        <Icon size={20} style={{ color }} />
      </div>
    </div>
  </div>
);

// ─── Course Card ──────────────────────────────────────────────
const CourseCard: React.FC<{
  course: CourseSummary;
  onClick: () => void;
}> = ({ course, onClick }) => {
  const gradients = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  ];
  const bg = gradients[course.sortOrder % gradients.length];

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
        {/* Hero gradient top */}
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
            {course.sortOrder + 1}
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
              {course.moduleCount} modul · {course.lessonCount} dars
            </div>
          </div>
          {course.totalDurationSec > 0 && (
            <div
              className="absolute bottom-3 right-3 px-2 py-1 rounded-md text-xs font-semibold font-mono inline-flex items-center gap-1"
              style={{
                backgroundColor: "rgba(255,255,255,0.95)",
                color: "#1f2937",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
              }}
            >
              <Clock size={10} />
              {fmtDuration(course.totalDurationSec)}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-4" style={{ backgroundColor: "var(--color-card-bg)" }}>
          <h3
            className="font-bold text-base mb-1 line-clamp-2 leading-snug"
            style={{ color: "var(--ds-text-primary)" }}
            title={course.title}
          >
            {course.title}
          </h3>
          {course.description ? (
            <p
              className="text-xs line-clamp-2 mb-3 min-h-[2rem]"
              style={{ color: "var(--ds-text-secondary)" }}
            >
              {course.description}
            </p>
          ) : (
            <div className="min-h-[2rem]" />
          )}

          <div
            className="flex items-center justify-between pt-3 text-xs"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <div
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                style={{ backgroundColor: "#10b98115", color: "#10b981", fontWeight: 600 }}
              >
                <CheckCircle2 size={11} />
                {course.readyCount}/{course.lessonCount}
              </div>
              {course.processingCount > 0 && (
                <div
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                  style={{ backgroundColor: "#f59e0b15", color: "#f59e0b", fontWeight: 600 }}
                >
                  <Loader2 size={11} className="animate-spin" />
                  {course.processingCount}
                </div>
              )}
              <div
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md"
                style={{ backgroundColor: "#3b82f615", color: "#3b82f6", fontWeight: 600 }}
              >
                <Users size={11} />
                {course.assignedCount}
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

// ─── Create Course Modal ──────────────────────────────────────
const CreateCourseModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}> = ({ isOpen, onClose, onCreated }) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      lessonsService.createCourse(title.trim(), description.trim() || undefined),
    onSuccess: (data) => {
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
    <Modal isOpen={isOpen} onClose={onClose} title="Yangi kurs" size="sm">
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
            placeholder="Masalan: Pro Sotuvchi"
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
            style={{
              backgroundColor: "var(--color-primary-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#667eea")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
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
            placeholder="Kursning qisqa tavsifi..."
            className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-y"
            style={{
              backgroundColor: "var(--color-primary-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#667eea")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
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

// ─── Main Page ────────────────────────────────────────────────
const AdminLessonsPage: React.FC = () => {
  const navigate = useNavigate();
  const { userRole, managerUser } = useAuth();

  const canManage =
    userRole === "company" ||
    managerUser?.role === "rop" ||
    managerUser?.role === "admin" ||
    managerUser?.role === "boss";

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<"courses" | "managers">("courses");

  const { data: courses, isLoading, isError, error } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: () => lessonsService.listCourses(),
    refetchInterval: (query) => {
      const items = query.state.data as CourseSummary[] | undefined;
      return items?.some((c) => c.processingCount > 0) ? 5000 : false;
    },
  });

  const { data: mgrStats, isLoading: mgrLoading } = useQuery({
    queryKey: ["admin-lessons-managers-stats"],
    queryFn: () => lessonsService.allManagerStats(),
    enabled: tab === "managers",
  });

  const filtered = useMemo(() => {
    if (!courses) return [] as CourseSummary[];
    if (!search.trim()) return courses;
    const q = search.toLowerCase();
    return courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
    );
  }, [courses, search]);

  const filteredManagers = useMemo(() => {
    const items = mgrStats?.managers || [];
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.role || "").toLowerCase().includes(q)
    );
  }, [mgrStats, search]);

  const stats = useMemo(() => {
    const items = courses || [];
    return {
      totalCourses: items.length,
      totalModules: items.reduce((s, c) => s + c.moduleCount, 0),
      totalLessons: items.reduce((s, c) => s + c.lessonCount, 0),
      totalReady: items.reduce((s, c) => s + c.readyCount, 0),
    };
  }, [courses]);

  if (!canManage) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Ruxsat yo'q
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Darsliklarni faqat admin, boss yoki ROP boshqara oladi.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-8">
      {/* ─── Hero Header ─────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-6"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20"
          style={{ backgroundColor: "#fff" }}
        />
        <div
          className="absolute -bottom-20 left-20 w-36 h-36 rounded-full opacity-10"
          style={{ backgroundColor: "#fff" }}
        />

        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", backdropFilter: "blur(8px)" }}
            >
              <GraduationCap size={26} color="#fff" />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1 opacity-80" style={{ color: "#fff" }}>
                DARSLIKLAR / KURSLAR
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white-imp" style={{ color: "#fff" }}>
                Kurslar
              </h1>
              <p className="text-sm mt-1 opacity-90" style={{ color: "#fff" }}>
                Kurs → modullar → darslar. Manager'ga modul biriktiriladi, darslar avtomatik ochiladi.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105 shadow-lg"
            style={{ backgroundColor: "#fff", color: "#667eea" }}
          >
            <Plus size={18} />
            Yangi kurs
          </button>
        </div>
      </div>

      {/* ─── Stat Kartalar ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard icon={GraduationCap} label="Kurslar" value={stats.totalCourses} color="#667eea" />
        <StatCard icon={Layers} label="Modullar" value={stats.totalModules} color="#8b5cf6" />
        <StatCard icon={BookOpen} label="Darslar" value={stats.totalLessons} color="#3b82f6" />
        <StatCard icon={CheckCircle2} label="Tayyor" value={stats.totalReady} color="#10b981" />
      </div>

      {/* ─── Tabs: Kurslar / Managerlar ──────────────────── */}
      <div
        className="rounded-2xl p-1 mb-4 inline-flex gap-1"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        {([
          { id: "courses", label: "Kurslar", icon: GraduationCap },
          { id: "managers", label: "Managerlar", icon: Users },
        ] as const).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                backgroundColor: active ? "#667eea" : "transparent",
                color: active ? "#fff" : "var(--text-secondary)",
                boxShadow: active ? "0 4px 12px rgba(102,126,234,0.3)" : "none",
              }}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ─── Search ──────────────────────────────────────── */}
      <div
        className="rounded-2xl p-3 mb-5"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-secondary)" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Kurs qidirish..."
            className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm focus:outline-none transition-colors"
            style={{
              backgroundColor: "var(--ds-bg-overlay)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#667eea")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors hover:bg-black/5"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ─── Content ────────────────────────────────────────── */}
      {tab === "courses" && isLoading && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          Yuklanmoqda...
        </div>
      )}

      {tab === "courses" && isError && (
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: "#ef444411",
            border: "1px solid #ef444444",
            color: "#ef4444",
          }}
        >
          Xatolik: {(error as Error).message}
        </div>
      )}

      {tab === "courses" && courses && courses.length === 0 && (
        <div
          className="py-16 text-center rounded-3xl"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "2px dashed var(--color-border)",
          }}
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              boxShadow: "0 8px 24px rgba(102,126,234,0.3)",
            }}
          >
            <GraduationCap size={32} color="#fff" />
          </div>
          <h3 className="font-bold text-xl mb-1" style={{ color: "var(--text-primary)" }}>
            Hali kurs yo'q
          </h3>
          <p className="text-sm mb-5 max-w-md mx-auto" style={{ color: "var(--text-secondary)" }}>
            Avval kurs yarating, so'ng ichiga modullar, modullarga esa darslarni qo'shing.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Sparkles size={14} />
            Birinchi kursni yaratish
          </Button>
        </div>
      )}

      {tab === "courses" && courses && courses.length > 0 && filtered.length === 0 && (
        <div
          className="py-10 text-center rounded-2xl"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px dashed var(--color-border)",
          }}
        >
          <Search size={28} className="mx-auto mb-2" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Filter bo'yicha hech narsa topilmadi
          </p>
        </div>
      )}

      {tab === "courses" && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              onClick={() => navigate(`/admin/lessons/courses/${c.id}`)}
            />
          ))}
        </div>
      )}

      {/* ─── Managers Tab ──────────────────────────────────── */}
      {tab === "managers" && mgrLoading && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          Yuklanmoqda...
        </div>
      )}

      {tab === "managers" && !mgrLoading && filteredManagers.length === 0 && (
        <div
          className="py-12 text-center rounded-2xl"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px dashed var(--color-border)",
          }}
        >
          <Users size={32} className="mx-auto mb-2 opacity-50" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {search ? "Filter bo'yicha hech narsa topilmadi" : "Hali manager topilmadi"}
          </p>
        </div>
      )}

      {tab === "managers" && filteredManagers.length > 0 && (
        <>
          {/* Overall stats summary */}
          {mgrStats?.overall && (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <StatCard
                icon={Users}
                label="Barcha managerlar"
                value={mgrStats.overall.totalManagers}
                color="#667eea"
              />
              <StatCard
                icon={Sparkles}
                label="Faol (biriktirilgan)"
                value={mgrStats.overall.activeManagers}
                color="#10b981"
              />
              <StatCard
                icon={TrendingUp}
                label={`O'rtacha tugatish %`}
                value={mgrStats.overall.avgCompletionRate}
                color="#f59e0b"
              />
            </div>
          )}

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--color-card-bg)",
              border: "1px solid var(--color-border)",
            }}
          >
            {filteredManagers.map((m, idx) => {
              const pct =
                m.assignedCount > 0
                  ? Math.round((m.completedCount / m.assignedCount) * 100)
                  : 0;
              const scoreColor =
                m.avgFinalScore >= 80
                  ? "#10b981"
                  : m.avgFinalScore >= 50
                    ? "#f59e0b"
                    : m.avgFinalScore > 0
                      ? "#ef4444"
                      : "#9ca3af";
              return (
                <div
                  key={m.managerId}
                  onClick={() => navigate(`/admin/lessons/managers/${m.managerId}`)}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-white/[0.02]"
                  style={{
                    borderTop: idx === 0 ? "none" : "1px solid var(--color-border)",
                  }}
                >
                  {/* Rank */}
                  <div
                    className="w-7 text-center text-xs font-bold tabular-nums flex-shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {idx + 1}
                  </div>

                  {/* Avatar */}
                  {m.photoUrl ? (
                    <img
                      src={m.photoUrl}
                      alt={m.name}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm"
                      style={{
                        background: "linear-gradient(135deg,#667eea,#764ba2)",
                        color: "#fff",
                      }}
                    >
                      {m.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  {/* Name + role */}
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {m.name}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {m.role || "—"}
                    </div>
                  </div>

                  {/* Progress: completed / total */}
                  <div className="hidden md:flex flex-col items-center w-32 flex-shrink-0">
                    <div className="text-xs font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {m.completedCount}/{m.assignedCount}
                    </div>
                    <div
                      className="w-full h-1.5 mt-1 rounded-full overflow-hidden"
                      style={{ backgroundColor: "var(--color-primary-bg)" }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${pct}%`,
                          background:
                            pct === 100
                              ? "linear-gradient(90deg,#10b981,#34d399)"
                              : "linear-gradient(90deg,#667eea,#764ba2)",
                        }}
                      />
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {pct}%
                    </div>
                  </div>

                  {/* Avg score badge */}
                  <div
                    className="hidden sm:flex flex-col items-center justify-center w-16 h-12 rounded-xl flex-shrink-0"
                    style={{
                      backgroundColor: `${scoreColor}15`,
                      border: `1px solid ${scoreColor}33`,
                    }}
                    title="O'rtacha umumiy ball"
                  >
                    <Trophy size={11} style={{ color: scoreColor }} />
                    <div className="text-sm font-bold tabular-nums" style={{ color: scoreColor }}>
                      {m.avgFinalScore}
                    </div>
                  </div>

                  {/* Test/AI mini badges */}
                  <div className="hidden lg:flex items-center gap-2 flex-shrink-0">
                    <div
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold"
                      style={{ backgroundColor: "#3b82f615", color: "#3b82f6" }}
                      title="Test"
                    >
                      <Target size={10} />
                      {m.testPassedCount}
                    </div>
                    <div
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold"
                      style={{ backgroundColor: "#8b5cf615", color: "#8b5cf6" }}
                      title="AI suhbat"
                    >
                      <Award size={10} />
                      {m.aiCompletedCount}
                    </div>
                  </div>

                  {/* Arrow */}
                  <span
                    className="text-sm font-semibold opacity-50 flex-shrink-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    →
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      <CreateCourseModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => navigate(`/admin/lessons/courses/${id}`)}
      />

      {/* Suppress unused icon import warning */}
      <span style={{ display: "none" }} aria-hidden>
        <PlayCircle size={0} />
      </span>
    </div>
  );
};

export default AdminLessonsPage;
