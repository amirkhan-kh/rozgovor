// Manager tomon: kurslar grid (birinchi sahifa — 3-qatlamli hierarchy).
// Kursga kirganda — kurs ichidagi modullar (ManagerCourseModulesPage) ochiladi.
// Modulga kirganda — Duolingo-style map (ManagerModuleMapPage) ochiladi.
import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  AlertCircle,
  Layers,
  Clock,
  CheckCircle2,
  GraduationCap,
  PlayCircle,
} from "lucide-react";
import { lessonsService, MyCourseSummary } from "../../services/lessons.service";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}s ${m}daq` : `${m} daq`;
};

const CourseCard: React.FC<{
  course: MyCourseSummary;
  idx: number;
  onOpen: () => void;
}> = ({ course, idx, onOpen }) => {
  const gradients = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
  ];
  const bg = gradients[idx % gradients.length];
  const pct =
    course.lessonCount > 0
      ? Math.round((course.completedCount / course.lessonCount) * 100)
      : 0;
  const isComplete = course.completedCount === course.lessonCount && course.lessonCount > 0;

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer transition-all duration-200 hover:-translate-y-1"
    >
      <div
        className="rounded-2xl overflow-hidden transition-shadow duration-200 group-hover:shadow-xl"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: `1px solid ${isComplete ? "#10b98155" : "var(--color-border)"}`,
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div className="relative overflow-hidden" style={{ aspectRatio: "16 / 8", background: bg }}>
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
            {idx + 1}
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
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-transform group-hover:scale-105"
              style={{
                backgroundColor: "rgba(255,255,255,0.25)",
                backdropFilter: "blur(8px)",
                border: "2px solid rgba(255,255,255,0.5)",
                color: "#fff",
              }}
            >
              <PlayCircle size={18} color="#fff" />
              Ochish
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

        <div className="p-4">
          <h3
            className="font-bold text-base mb-1 line-clamp-2 leading-snug"
            style={{ color: "var(--ds-text-primary)" }}
            title={course.title}
          >
            {course.title}
          </h3>
          <div
            className="flex items-center gap-2 text-xs mb-2"
            style={{ color: "var(--ds-text-secondary)" }}
          >
            <span className="inline-flex items-center gap-1">
              <Layers size={11} />
              {course.moduleCount} modul
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <BookOpen size={11} />
              {course.lessonCount} dars
            </span>
          </div>

          <div className="mb-1.5">
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "var(--ds-text-secondary)" }}>
                {course.completedCount} / {course.lessonCount} dars
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

const LessonsMapPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: courses, isLoading, isError } = useQuery({
    queryKey: ["my-courses"],
    queryFn: () => lessonsService.myCourses(),
  });

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
  if (!courses || courses.length === 0) {
    return (
      <div className="py-16 text-center">
        <div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            boxShadow: "0 8px 24px rgba(102,126,234,0.3)",
          }}
        >
          <GraduationCap size={32} color="#fff" />
        </div>
        <h2
          className="font-bold text-xl mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Hali kurs yo'q
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Sizga modul biriktirilishi bilan bu yerda ko'rinadi.
        </p>
      </div>
    );
  }

  const totalLessons = courses.reduce((s, c) => s + c.lessonCount, 0);
  const totalCompleted = courses.reduce((s, c) => s + c.completedCount, 0);
  const overallPct =
    totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto pb-8">
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
                MENING DARSLIKLARIM
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-white-imp" style={{ color: "#fff" }}>
                Kurslar
              </h1>
              <p className="text-sm mt-1 opacity-90" style={{ color: "#fff" }}>
                {courses.length} kurs · {totalCompleted} / {totalLessons} dars tugallandi
              </p>
            </div>
          </div>

          {/* Overall progress circle */}
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeDasharray={`${overallPct * 0.942} 94.2`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center font-bold text-lg"
              style={{ color: "#fff" }}
            >
              {overallPct}%
            </div>
          </div>
        </div>
      </div>

      {/* Courses grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((c, i) => (
          <CourseCard
            key={c.id || "__orphan__"}
            course={c}
            idx={i}
            onOpen={() =>
              navigate(
                c.id ? `/lessons/courses/${c.id}` : "/lessons/courses/__orphan__"
              )
            }
          />
        ))}
      </div>
    </div>
  );
};

export default LessonsMapPage;
