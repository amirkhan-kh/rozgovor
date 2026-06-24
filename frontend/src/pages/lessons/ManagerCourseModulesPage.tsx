// Manager tomon: kurs ichidagi modullar grid. Modulga bosilsa — ManagerModuleMapPage ochiladi.
// URL: /lessons/courses/:courseId  yoki  /lessons/courses/__orphan__ (kursga tegishli bo'lmagan modullar)
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  AlertCircle,
  Clock,
  CheckCircle2,
  GraduationCap,
  PlayCircle,
  Award,
  Lock,
} from "lucide-react";
import { lessonsService, MyModuleSummary } from "../../services/lessons.service";
import CertificateModal from "../../components/CertificateModal";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}s ${m}daq` : `${m} daq`;
};

const ModuleCard: React.FC<{
  module: MyModuleSummary;
  locked: boolean;
  onOpen: () => void;
}> = ({ module, locked, onOpen }) => {
  const gradients = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  ];
  const bg = gradients[module.sortOrder % gradients.length];
  const pct =
    module.lessonCount > 0
      ? Math.round((module.completedCount / module.lessonCount) * 100)
      : 0;
  const isComplete = module.completedCount === module.lessonCount && module.lessonCount > 0;

  return (
    <div
      onClick={locked ? undefined : onOpen}
      className={`group transition-all duration-200 ${
        locked ? "cursor-not-allowed" : "cursor-pointer hover:-translate-y-1"
      }`}
      title={locked ? "Oldingi modulni tugating — keyin ochiladi" : undefined}
    >
      <div
        className={`rounded-2xl overflow-hidden transition-shadow duration-200 ${
          locked ? "" : "group-hover:shadow-xl"
        }`}
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: `1px solid ${
            isComplete ? "#10b98155" : locked ? "var(--color-border)" : "var(--color-border)"
          }`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          opacity: locked ? 0.55 : 1,
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            aspectRatio: "16 / 8",
            background: locked ? "linear-gradient(135deg, #6b7280 0%, #4b5563 100%)" : bg,
          }}
        >
          <div
            className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-20"
            style={{ backgroundColor: "#fff" }}
          />
          <div
            className="absolute -bottom-12 -left-12 w-40 h-40 rounded-full opacity-10"
            style={{ backgroundColor: "#fff" }}
          />

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

          {isComplete && (
            <div
              className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
              style={{
                backgroundColor: "#10b981",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(16,185,129,0.5)",
              }}
            >
              <CheckCircle2 size={12} />
              Tugallangan
            </div>
          )}

          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-transform ${
                locked ? "" : "group-hover:scale-105"
              }`}
              style={{
                backgroundColor: "rgba(255,255,255,0.25)",
                backdropFilter: "blur(8px)",
                border: "2px solid rgba(255,255,255,0.5)",
                color: "#fff",
              }}
            >
              {locked ? (
                <>
                  <Lock size={16} color="#fff" />
                  Qulflangan
                </>
              ) : (
                <>
                  <PlayCircle size={18} color="#fff" />
                  Boshlash
                </>
              )}
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

        <div className="p-4">
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

          <div className="mb-1.5">
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "var(--ds-text-secondary)" }}>
                {module.completedCount} / {module.lessonCount} dars
              </span>
              <span
                className="font-bold"
                style={{ color: isComplete ? "#10b981" : "var(--ds-text-primary)" }}
              >
                {pct}%
              </span>
            </div>
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--color-primary-bg)" }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  background: isComplete
                    ? "linear-gradient(90deg, #10b981 0%, #34d399 100%)"
                    : "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ManagerCourseModulesPage: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const isOrphan = courseId === "__orphan__";

  const [certOpen, setCertOpen] = useState(false);

  const { data: courses } = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => lessonsService.myCourses(),
  });
  const course = courses?.find((c) =>
    isOrphan ? c.id === null : c.id === courseId
  );

  // Orphan case — courseId query param "undefined" bo'lishi kerak (backend orphan modullarni ajratmaydi,
  // shuning uchun hamma modullarni olamiz va courseId=null larni filtrlaymiz).
  const { data: allModules, isLoading, isError } = useQuery({
    queryKey: ["my-modules", isOrphan ? "__orphan__" : courseId],
    queryFn: () =>
      isOrphan
        ? lessonsService.myModules().then((mods) => mods.filter((m) => m.courseId === null))
        : lessonsService.myModules(courseId),
    enabled: !!courseId,
  });

  // Hooklar har doim bir xil tartibda chaqirilishi kerak — early return'lardan
  // OLDIN useEffect'ni qo'yamiz (aks holda "Rendered more hooks than during
  // the previous render" → sahifa crash).
  const modulesData = allModules || [];
  const totalLessonsAll = modulesData.reduce((s, m) => s + m.lessonCount, 0);
  const totalCompletedAll = modulesData.reduce((s, m) => s + m.completedCount, 0);
  const isCourseCompleteEarly =
    !isOrphan && totalLessonsAll > 0 && totalCompletedAll === totalLessonsAll;
  const certKeyEarly = `cert_shown_${courseId}`;

  useEffect(() => {
    if (isCourseCompleteEarly && !localStorage.getItem(certKeyEarly)) {
      localStorage.setItem(certKeyEarly, "1");
      setCertOpen(true);
    }
  }, [isCourseCompleteEarly, certKeyEarly]);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
        Yuklanmoqda...
      </div>
    );
  }
  if (isError) {
    return (
      <div className="py-12 text-center">
        <AlertCircle size={36} className="mx-auto mb-2" style={{ color: "#ef4444" }} />
        <p className="text-sm" style={{ color: "#ef4444" }}>
          Xatolik
        </p>
      </div>
    );
  }

  const modules = allModules || [];

  if (modules.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <button
          onClick={() => navigate("/lessons")}
          className="inline-flex items-center gap-2 text-sm mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={16} />
          Kurslar
        </button>
        <div className="py-12 text-center">
          <BookOpen
            size={48}
            className="mx-auto mb-3 opacity-50"
            style={{ color: "var(--text-secondary)" }}
          />
          <h2 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Kursda modul yo'q
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Admin kursga modul qo'shgach yoki sizga biriktirilgach bu yerda ko'rinadi.
          </p>
        </div>
      </div>
    );
  }

  const totalLessons = totalLessonsAll;
  const totalCompleted = totalCompletedAll;
  const overallPct =
    totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;
  const isCourseComplete = isCourseCompleteEarly;

  return (
    <div className="max-w-6xl mx-auto pb-8">
      <button
        onClick={() => navigate("/lessons")}
        className="inline-flex items-center gap-2 text-sm mb-4 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Kurslar
      </button>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-6"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20"
          style={{ backgroundColor: "#fff" }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
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
              <div className="text-xs font-semibold mb-1 opacity-80" style={{ color: "#fff" }}>
                KURS
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white-imp" style={{ color: "#fff" }}>
                {course?.title || "Kurs"}
              </h1>
              <p className="text-sm mt-1 opacity-90" style={{ color: "#fff" }}>
                {modules.length} modul · {totalCompleted} / {totalLessons} dars tugallandi
              </p>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15" fill="none"
                  stroke={isCourseComplete ? "#fde68a" : "#fff"}
                  strokeWidth="3"
                  strokeDasharray={`${overallPct * 0.942} 94.2`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 0.5s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-bold text-lg" style={{ color: "#fff" }}>
                {overallPct}%
              </div>
            </div>

            {/* Sertifikat button — only when 100% complete */}
            {isCourseComplete && (
              <button
                onClick={() => setCertOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all hover:scale-105"
                style={{
                  background: "rgba(253,230,138,0.2)",
                  color: "#fde68a",
                  border: "1.5px solid rgba(253,230,138,0.5)",
                  boxShadow: "0 0 14px rgba(253,230,138,0.25)",
                }}
              >
                <Award size={13} />
                Sertifikat olish
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Course complete banner */}
      {isCourseComplete && (
        <div
          className="mb-5 px-5 py-4 rounded-2xl flex items-center justify-between gap-4"
          style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(124,58,237,0.06) 100%)",
            border: "1px solid rgba(124,58,237,0.3)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#7c3aed,#9333ea)" }}
            >
              <Award size={20} color="#fff" />
            </div>
            <div>
              <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                Kurs muvaffaqiyatli tugatildi! 🎉
              </div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Sertifikatingizni yuklab oling
              </div>
            </div>
          </div>
          <button
            onClick={() => setCertOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all hover:opacity-90 hover:scale-[1.02]"
            style={{
              background: "linear-gradient(135deg,#7c3aed,#9333ea)",
              color: "#fff",
              boxShadow: "0 4px 14px rgba(124,58,237,0.4)",
            }}
          >
            <Award size={14} />
            Sertifikat olish
          </button>
        </div>
      )}

      {/* Modullar grid — ketma-ket qulf logikasi:
          birinchi modul ochiq, har keyingisi oldingisi to'liq tugagandagina ochiladi */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(() => {
          const sorted = [...modules].sort(
            (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
          );
          let prevDone = true;
          return sorted.map((m) => {
            const moduleDone =
              m.lessonCount > 0 && m.completedCount >= m.lessonCount;
            const locked = !prevDone && !moduleDone;
            const node = (
              <ModuleCard
                key={m.id}
                module={m}
                locked={locked}
                onOpen={() => navigate(`/lessons/modules/${m.id}`)}
              />
            );
            prevDone = moduleDone;
            return node;
          });
        })()}
      </div>

      {/* Certificate modal */}
      <CertificateModal
        isOpen={certOpen}
        onClose={() => setCertOpen(false)}
        courseName={course?.title}
      />
    </div>
  );
};

export default ManagerCourseModulesPage;
