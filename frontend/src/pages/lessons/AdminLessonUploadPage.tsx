import React, { useState, useRef, useMemo, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Upload,
  Film,
  Loader2,
  Sparkles,
  FileVideo,
  GraduationCap,
  BookOpen,
  Layers,
  Lock,
} from "lucide-react";
import Button from "../../components/ui/Button";
import { lessonsService } from "../../services/lessons.service";

const MAX_FILE_SIZE = 2.5 * 1024 * 1024 * 1024; // 2.5 GB
const MAX_DURATION_HOURS = 2.5;

const fmtSize = (bytes: number): string => {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
};

const AdminLessonUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCourseId = searchParams.get("courseId") || "";
  const initialModuleId = searchParams.get("moduleId") || "";
  const [courseId, setCourseId] = useState<string>(initialCourseId);
  const [moduleId, setModuleId] = useState<string>(initialModuleId);
  const [lockSequential, setLockSequential] = useState<boolean>(true);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const { data: courses } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: () => lessonsService.listCourses(),
  });
  const { data: modules } = useQuery({
    queryKey: ["admin-modules", courseId || "all"],
    queryFn: () => lessonsService.listModules(courseId || undefined),
  });

  // Agar URLda moduleId berilgan bo'lsa — uning courseId'sini avtomatik aniqlash
  useEffect(() => {
    if (initialModuleId && !courseId && modules) {
      const m = modules.find((x) => x.id === initialModuleId);
      if (m?.courseId) setCourseId(m.courseId);
    }
  }, [initialModuleId, courseId, modules]);

  // Kurs o'zgarganda — modulni tozalash (agar boshqa kursga tegishli bo'lsa)
  useEffect(() => {
    if (moduleId && modules) {
      const m = modules.find((x) => x.id === moduleId);
      if (m && m.courseId !== (courseId || null)) setModuleId("");
    }
  }, [courseId, modules, moduleId]);

  const moduleOptions = useMemo(() => {
    if (!modules) return [];
    return modules.filter((m) => (courseId ? m.courseId === courseId : m.courseId === null));
  }, [modules, courseId]);

  const handleFile = (f: File) => {
    if (f.size > MAX_FILE_SIZE) {
      setError(`Fayl hajmi ${fmtSize(MAX_FILE_SIZE)} dan oshmasligi kerak`);
      return;
    }
    setFile(f);
    setError(null);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const submit = async () => {
    if (!file || !title.trim()) {
      setError("Video va nom majburiy");
      return;
    }
    if (!moduleId) {
      setError("Modulni tanlang — dars albatta modulga biriktirilishi kerak");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const result = await lessonsService.create(
        file,
        title.trim(),
        description.trim(),
        moduleId,
        (p) => setProgress(p)
      );
      navigate(`/admin/lessons/modules/${moduleId}`);
      void result;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Upload xatosi");
      setUploading(false);
    }
  };

  const createNewModule = async () => {
    const t = window.prompt("Yangi modul nomi:");
    if (!t || !t.trim()) return;
    try {
      const m = await lessonsService.createModule(t.trim(), undefined, courseId || undefined);
      setModuleId(m.id);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Modul yaratilmadi");
    }
  };

  const createNewCourse = async () => {
    const t = window.prompt("Yangi kurs nomi:");
    if (!t || !t.trim()) return;
    try {
      const c = await lessonsService.createCourse(t.trim());
      setCourseId(c.id);
      setModuleId("");
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Kurs yaratilmadi");
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-8">
      {/* Back */}
      <button
        onClick={() => navigate(initialModuleId ? `/admin/lessons/modules/${initialModuleId}` : "/admin/lessons")}
        disabled={uploading}
        className="inline-flex items-center gap-2 text-sm mb-4 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        {initialModuleId ? "Modulga qaytish" : "Darsliklar"}
      </button>

      {/* Hero header */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-6"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20"
          style={{ backgroundColor: "#fff" }}
        />
        <div className="relative flex items-start gap-3">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(8px)",
            }}
          >
            <GraduationCap size={26} color="#fff" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-1 text-white-imp" style={{ color: "#fff" }}>
              Yangi darslik
            </h1>
            <p className="text-sm opacity-90" style={{ color: "#fff" }}>
              Video yuklang — AI avtomatik transkript, testlar va suhbatni tayyorlaydi
            </p>
          </div>
        </div>
      </div>

      {/* Steps: Course → Module → Video */}
      {(() => {
        const steps = [
          { icon: BookOpen, label: "Kurs", done: !!courseId },
          { icon: Layers, label: "Modul", done: !!moduleId },
          { icon: FileVideo, label: "Video", done: !!file },
        ];
        return (
          <div className="mb-5 flex items-center justify-center gap-2 flex-wrap">
            {steps.map((s, i) => (
              <React.Fragment key={i}>
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: s.done ? "#10b98115" : "var(--color-card-bg)",
                    border: `1px solid ${s.done ? "#10b98155" : "var(--color-border)"}`,
                    color: s.done ? "#10b981" : "var(--text-secondary)",
                  }}
                >
                  <s.icon size={12} />
                  {i + 1}. {s.label}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className="w-4 h-0.5"
                    style={{
                      backgroundColor: s.done ? "#10b98155" : "var(--color-border)",
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        );
      })()}

      {/* Course + Module selectors */}
      <div className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="block text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              <BookOpen size={14} className="inline mr-1 mb-0.5" />
              Kurs
            </label>
            <button
              type="button"
              onClick={createNewCourse}
              disabled={uploading}
              className="text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-50"
              style={{ color: "#667eea" }}
            >
              + Yangi kurs
            </button>
          </div>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={uploading}
            className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-card-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <option value="">— Kurssiz (orphan modul) —</option>
            {courses?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.moduleCount} modul)
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="block text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              <Layers size={14} className="inline mr-1 mb-0.5" />
              Modul <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <button
              type="button"
              onClick={createNewModule}
              disabled={uploading}
              className="text-xs font-semibold transition-opacity hover:opacity-70 disabled:opacity-50"
              style={{ color: "#667eea" }}
            >
              + Yangi modul
            </button>
          </div>
          <select
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            disabled={uploading}
            className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-card-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
          >
            <option value="">— Modul tanlang —</option>
            {moduleOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({m.lessonCount} dars)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Lock toggle */}
      <div
        className="mb-5 p-3 rounded-xl flex items-center justify-between gap-3"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Lock
            size={16}
            style={{ color: lockSequential ? "#667eea" : "var(--text-secondary)" }}
          />
          <div className="min-w-0">
            <div className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Ketma-ket qulflash
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Yangi dars oldingi dars tugamaguncha qulflanadi (default — yoqilgan)
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLockSequential(!lockSequential)}
          disabled={uploading}
          className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 disabled:opacity-50"
          style={{
            backgroundColor: lockSequential ? "#667eea" : "var(--color-border)",
          }}
        >
          <span
            className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
            style={{
              transform: lockSequential ? "translateX(24px)" : "translateX(4px)",
            }}
          />
        </button>
      </div>

      {/* File picker */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileInput.current?.click()}
        className="rounded-2xl p-8 md:p-10 text-center cursor-pointer transition-all"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: `2px dashed ${file ? "#667eea" : dragActive ? "#667eea" : "var(--color-border)"}`,
          transform: dragActive ? "scale(1.01)" : "scale(1)",
        }}
      >
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {file ? (
          <div>
            <div
              className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                boxShadow: "0 8px 24px rgba(102,126,234,0.3)",
              }}
            >
              <Film size={28} color="#fff" />
            </div>
            <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {file.name}
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              {fmtSize(file.size)} · boshqasini tanlash uchun bosing
            </div>
          </div>
        ) : (
          <div>
            <div
              className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: dragActive ? "#667eea22" : "var(--color-primary-bg)",
                border: "1px dashed var(--color-border)",
              }}
            >
              <Upload
                size={28}
                style={{ color: dragActive ? "#667eea" : "var(--text-secondary)" }}
              />
            </div>
            <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Videoni bu yerga tashlang
            </div>
            <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
              yoki bosib tanlang · mp4/mov/webm · max {MAX_DURATION_HOURS} soat, {fmtSize(MAX_FILE_SIZE)}
            </div>
          </div>
        )}
      </div>

      {/* Form */}
      <div className="mt-5 space-y-4">
        <div>
          <label
            className="block text-sm font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Nom <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={uploading}
            placeholder="Masalan: Sotuv — 1-qo'ng'iroq asoslari"
            className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-card-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#667eea")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
        </div>

        <div>
          <label
            className="block text-sm font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Tavsif{" "}
            <span className="font-normal" style={{ color: "var(--text-secondary)" }}>
              (ixtiyoriy)
            </span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={uploading}
            rows={3}
            placeholder="Nima o'rgatadi, kim uchun mo'ljallangan..."
            className="w-full px-4 py-2.5 rounded-xl text-sm focus:outline-none transition-colors resize-y disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-card-bg)",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
            onFocus={(e) => (e.target.style.borderColor = "#667eea")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mt-4 p-3 rounded-xl text-sm flex items-start gap-2"
          style={{
            backgroundColor: "#ef444411",
            color: "#ef4444",
            border: "1px solid #ef444433",
          }}
        >
          <span className="font-semibold">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Progress */}
      {uploading && (
        <div
          className="mt-4 p-4 rounded-xl"
          style={{
            backgroundColor: "#667eea11",
            border: "1px solid #667eea33",
          }}
        >
          <div className="flex items-center justify-between text-sm mb-2">
            <span
              className="inline-flex items-center gap-2 font-semibold"
              style={{ color: "#667eea" }}
            >
              <Loader2 size={14} className="animate-spin" />
              Yuklanmoqda...
            </span>
            <span className="font-mono font-bold" style={{ color: "#667eea" }}>
              {progress}%
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--color-primary-bg)" }}
          >
            <div
              className="h-full transition-all"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
              }}
            />
          </div>
          <p
            className="text-xs mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Upload tugaganidan keyin AI 5-20 daq ichida transkript va testlarni tayyorlaydi.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 flex gap-2 flex-wrap">
        <Button
          onClick={submit}
          disabled={uploading || !file || !title.trim()}
          loading={uploading}
        >
          <Sparkles size={16} />
          {uploading ? "Yuklanmoqda..." : "Yuklash va tayyorlash"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(initialModuleId ? `/admin/lessons/modules/${initialModuleId}` : "/admin/lessons")}
          disabled={uploading}
        >
          Bekor qilish
        </Button>
      </div>
    </div>
  );
};

export default AdminLessonUploadPage;
