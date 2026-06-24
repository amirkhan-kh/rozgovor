// Modul ichi — Duolingo-style vertical path. Nodelar = darslar.
// Status: completed (yashil tick), current (pulsing), locked (gray), inProgress (progress bar).
// SVG path chiziqlar nodelarni bog'laydi (zigzag).
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Lock,
  Play,
  CheckCircle2,
  BookOpen,
  Star,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Clock,
} from "lucide-react";
import { lessonsService, MyLessonListItem } from "../../services/lessons.service";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

type NodeState = "done" | "current" | "inProgress" | "locked" | "processing";

const getNodeState = (
  lesson: MyLessonListItem,
  prevDone: boolean
): NodeState => {
  if (lesson.status !== "ready") return "processing";
  if (lesson.completedAt) return "done";
  if (lesson.locked || !prevDone) return "locked";
  const inProgress =
    lesson.videoCompleted || lesson.testBestScore != null || lesson.aiStatus !== "not_started";
  if (inProgress) return "inProgress";
  return "current";
};

const STATE_COLOR: Record<NodeState, string> = {
  done: "#10b981",
  current: "#667eea",
  inProgress: "#3b82f6",
  locked: "#6b7280",
  processing: "#f59e0b",
};

// ─── Lesson Node (circle on map) ────────────────────────────────
const LessonNode: React.FC<{
  lesson: MyLessonListItem;
  state: NodeState;
  offsetX: number; // -1, 0, 1 (left / center / right zigzag)
  onClick: () => void;
}> = ({ lesson, state, offsetX, onClick }) => {
  const color = STATE_COLOR[state];
  const clickable = state !== "locked" && state !== "processing";

  return (
    <div
      className="relative flex items-center"
      style={{
        justifyContent: offsetX < 0 ? "flex-start" : offsetX > 0 ? "flex-end" : "center",
      }}
    >
      <div
        className={`flex items-center gap-4 ${
          offsetX < 0 ? "flex-row" : offsetX > 0 ? "flex-row-reverse" : "flex-col"
        }`}
      >
        {/* Node circle */}
        <button
          onClick={clickable ? onClick : undefined}
          disabled={!clickable}
          className={`relative flex items-center justify-center transition-all ${
            clickable ? "cursor-pointer hover:scale-105" : "cursor-not-allowed"
          } ${state === "current" ? "animate-pulse" : ""}`}
          style={{
            width: 88,
            height: 88,
          }}
          aria-label={lesson.title}
        >
          {/* Shadow/pulse ring */}
          {state === "current" && (
            <span
              className="absolute inset-0 rounded-full animate-ping"
              style={{ backgroundColor: `${color}33` }}
            />
          )}

          {/* Outer ring */}
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background:
                state === "done"
                  ? "linear-gradient(135deg, #10b981 0%, #34d399 100%)"
                  : state === "current"
                  ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                  : state === "inProgress"
                  ? "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)"
                  : state === "processing"
                  ? "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
                  : "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
              opacity: state === "locked" ? 0.5 : 1,
              boxShadow:
                state === "done"
                  ? "0 6px 20px rgba(16,185,129,0.4)"
                  : state === "current"
                  ? "0 6px 24px rgba(102,126,234,0.5)"
                  : state === "inProgress"
                  ? "0 6px 20px rgba(59,130,246,0.4)"
                  : "0 4px 12px rgba(0,0,0,0.15)",
            }}
          />

          {/* Inner disc */}
          <span
            className="relative rounded-full flex items-center justify-center"
            style={{
              width: 70,
              height: 70,
              backgroundColor: "#fff",
              boxShadow: "inset 0 -4px 0 rgba(0,0,0,0.08)",
            }}
          >
            {state === "locked" && <Lock size={28} style={{ color: "#6b7280" }} />}
            {state === "processing" && (
              <Loader2 size={28} className="animate-spin" style={{ color: "#f59e0b" }} />
            )}
            {state === "done" && <CheckCircle2 size={34} style={{ color: "#10b981" }} strokeWidth={2.5} />}
            {state === "current" && <Play size={28} style={{ color: "#667eea", marginLeft: 3 }} strokeWidth={2.5} />}
            {state === "inProgress" && <BookOpen size={28} style={{ color: "#3b82f6" }} strokeWidth={2.5} />}
          </span>

          {/* Number badge */}
          <span
            className="absolute -top-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{
              backgroundColor: color,
              color: "#fff",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
              border: "2px solid #fff",
            }}
          >
            {lesson.sortOrder + 1}
          </span>
        </button>

        {/* Info label */}
        <div
          className={`max-w-[220px] ${offsetX === 0 ? "text-center" : offsetX < 0 ? "text-left" : "text-right"}`}
          style={{ opacity: state === "locked" ? 0.65 : 1 }}
        >
          <div
            className="font-bold text-sm leading-snug line-clamp-2"
            style={{ color: "var(--ds-text-primary)" }}
          >
            {lesson.title}
          </div>
          <div
            className={`mt-1 text-xs flex items-center gap-2 flex-wrap ${
              offsetX === 0 ? "justify-center" : offsetX < 0 ? "justify-start" : "justify-end"
            }`}
            style={{ color: "var(--ds-text-secondary)" }}
          >
            <span className="inline-flex items-center gap-1">
              <Clock size={10} />
              {fmtDuration(lesson.videoDurationSec)}
            </span>
            <span>· {lesson.testCount} savol</span>
            {state === "done" && lesson.finalScore != null && (
              <span
                className="inline-flex items-center gap-0.5 font-bold"
                style={{ color: "#10b981" }}
              >
                <Star size={10} />
                {Math.round(lesson.finalScore)}%
              </span>
            )}
          </div>
          {state === "inProgress" && (
            <div className="mt-1.5">
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ backgroundColor: "var(--color-primary-bg)" }}
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${
                      lesson.videoCompleted && lesson.testPassed && lesson.aiStatus === "completed"
                        ? 100
                        : lesson.videoCompleted && lesson.testPassed
                        ? 66
                        : lesson.videoCompleted
                        ? 33
                        : 0
                    }%`,
                    background: "linear-gradient(90deg, #3b82f6 0%, #6366f1 100%)",
                  }}
                />
              </div>
            </div>
          )}
          {state === "processing" && (
            <div className="mt-1 text-xs" style={{ color: "#f59e0b" }}>
              Tayyorlanmoqda
            </div>
          )}
          {state === "locked" && (
            <div className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
              Oldingi darsni bitiring
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ManagerModuleMapPage: React.FC = () => {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();

  const { data: modules } = useQuery({
    queryKey: ["my-modules-all"],
    queryFn: () => lessonsService.myModules(),
  });
  const mod = modules?.find((m) => m.id === moduleId);
  const backUrl = mod?.courseId
    ? `/lessons/courses/${mod.courseId}`
    : mod
    ? "/lessons/courses/__orphan__"
    : "/lessons";

  const { data: lessons, isLoading, isError } = useQuery({
    queryKey: ["my-lessons", moduleId],
    queryFn: () => lessonsService.myList(moduleId),
    enabled: !!moduleId,
  });

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
  if (!lessons || lessons.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <button
          onClick={() => navigate(backUrl)}
          className="inline-flex items-center gap-2 text-sm mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={16} />
          Modullar
        </button>
        <div className="py-12 text-center">
          <BookOpen size={48} className="mx-auto mb-3 opacity-50" style={{ color: "var(--text-secondary)" }} />
          <h2 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Modulda dars yo'q
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Admin modulga dars qo'shgach shu yerda ko'rinadi.
          </p>
        </div>
      </div>
    );
  }

  const completedCount = lessons.filter((l) => l.completedAt).length;
  const totalCount = lessons.length;
  const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // State hisoblash (prev-done kuzatish)
  let prevDone = true;
  const statedLessons = lessons.map((l) => {
    const state = getNodeState(l, prevDone);
    if (state === "done") prevDone = true;
    else prevDone = false;
    return { lesson: l, state };
  });

  // Zigzag offset: 0 markaz, keyin -1, 1, -1, 1, ...
  const offsets = statedLessons.map((_, i) => {
    if (i === 0) return 0;
    return i % 2 === 1 ? -1 : 1;
  });

  return (
    <div className="max-w-4xl mx-auto pb-16">
      <button
        onClick={() => navigate(backUrl)}
        className="inline-flex items-center gap-2 text-sm mb-4 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Modullar
      </button>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 mb-8"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20"
          style={{ backgroundColor: "#fff" }}
        />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold mb-1 opacity-80" style={{ color: "#fff" }}>
              MODUL {mod?.sortOrder != null ? `#${mod.sortOrder + 1}` : ""}
            </div>
            <h1 className="text-xl md:text-2xl font-bold" style={{ color: "#fff" }}>
              {mod?.title || "Modul"}
            </h1>
            <p className="text-xs mt-1 opacity-90" style={{ color: "#fff" }}>
              {completedCount} / {totalCount} dars tugallandi
            </p>
          </div>
          <div className="relative w-16 h-16 flex-shrink-0">
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
              />
            </svg>
            <div
              className="absolute inset-0 flex items-center justify-center font-bold text-base"
              style={{ color: "#fff" }}
            >
              {overallPct}%
            </div>
          </div>
        </div>
      </div>

      {/* Duolingo map — vertical zigzag */}
      <div className="relative">
        <div className="flex flex-col gap-14">
          {statedLessons.map((item, i) => {
            const offset = offsets[i];
            const prevOffset = i > 0 ? offsets[i - 1] : 0;
            const thisColor = STATE_COLOR[item.state];
            const prevColor = i > 0 ? STATE_COLOR[statedLessons[i - 1].state] : thisColor;

            return (
              <div key={item.lesson.id} className="relative">
                {/* Connecting SVG path from previous to this */}
                {i > 0 && (
                  <svg
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: -90,
                      height: 90,
                      width: "100%",
                      zIndex: 0,
                    }}
                    viewBox="0 0 100 50"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient
                        id={`grad-${i}`}
                        x1={prevOffset < 0 ? "15%" : prevOffset > 0 ? "85%" : "50%"}
                        y1="0%"
                        x2={offset < 0 ? "15%" : offset > 0 ? "85%" : "50%"}
                        y2="100%"
                      >
                        <stop offset="0%" stopColor={prevColor} stopOpacity="0.6" />
                        <stop offset="100%" stopColor={thisColor} stopOpacity="0.6" />
                      </linearGradient>
                    </defs>
                    <path
                      d={`M ${prevOffset < 0 ? 15 : prevOffset > 0 ? 85 : 50} 0
                          Q ${prevOffset < 0 ? 15 : prevOffset > 0 ? 85 : 50} 25,
                            ${(prevOffset + offset) * 35 + 50} 25
                          T ${offset < 0 ? 15 : offset > 0 ? 85 : 50} 50`}
                      fill="none"
                      stroke={`url(#grad-${i})`}
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                  </svg>
                )}

                <div className="relative z-10">
                  <LessonNode
                    lesson={item.lesson}
                    state={item.state}
                    offsetX={offset}
                    onClick={() => navigate(`/lessons/${item.lesson.id}`)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Goal finish flag */}
        <div className="flex justify-center mt-12">
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-2xl font-bold text-sm"
            style={{
              background:
                completedCount === totalCount
                  ? "linear-gradient(135deg, #10b981 0%, #34d399 100%)"
                  : "var(--color-card-bg)",
              color: completedCount === totalCount ? "#fff" : "var(--text-secondary)",
              border:
                completedCount === totalCount
                  ? "2px solid #10b981"
                  : "2px dashed var(--color-border)",
              boxShadow:
                completedCount === totalCount
                  ? "0 8px 24px rgba(16,185,129,0.4)"
                  : "none",
            }}
          >
            <Star size={16} />
            {completedCount === totalCount
              ? "Modul yakunlandi! "
              : `Yana ${totalCount - completedCount} dars qoldi`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManagerModuleMapPage;
