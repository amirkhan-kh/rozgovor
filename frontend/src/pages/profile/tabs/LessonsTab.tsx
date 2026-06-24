import React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  Play,
  Lock,
  Clock,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { lessonsService } from "../../../services/lessons.service";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m} daq`;
};

const LessonsTab: React.FC = () => {
  const navigate = useNavigate();
  const { data: lessons, isLoading } = useQuery({
    queryKey: ["my-lessons"],
    queryFn: () => lessonsService.myList(),
  });

  if (isLoading) {
    return <div className="py-8 text-center text-secondary text-sm">Yuklanmoqda...</div>;
  }
  if (!lessons || lessons.length === 0) {
    return (
      <div className="py-12 text-center">
        <BookOpen size={40} className="mx-auto mb-2 text-secondary opacity-50" />
        <p className="text-sm text-secondary">Sizga darslik tayinlanmagan</p>
      </div>
    );
  }

  const completed = lessons.filter((l) => l.completedAt);
  const inProgress = lessons.filter(
    (l) => !l.completedAt && (l.videoCompleted || l.testBestScore != null || l.aiStatus !== "not_started")
  );
  const avgFinalScore = completed.length
    ? completed.reduce((s, l) => s + (l.finalScore || 0), 0) / completed.length
    : 0;
  const totalDurationSec = lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0);

  return (
    <div>
      {/* Stat kartalar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div
          className="p-3 rounded-xl border"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 text-xs text-secondary mb-1">
            <BookOpen size={14} />
            Jami
          </div>
          <div className="text-2xl font-bold text-white">{lessons.length}</div>
        </div>

        <div
          className="p-3 rounded-xl border"
          style={{
            backgroundColor: "#10b98111",
            borderColor: "#10b98144",
          }}
        >
          <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "#10b981" }}>
            <CheckCircle2 size={14} />
            Tugatilgan
          </div>
          <div className="text-2xl font-bold" style={{ color: "#10b981" }}>
            {completed.length}
          </div>
        </div>

        <div
          className="p-3 rounded-xl border"
          style={{
            backgroundColor: "#3b82f611",
            borderColor: "#3b82f644",
          }}
        >
          <div className="flex items-center gap-2 text-xs mb-1" style={{ color: "#3b82f6" }}>
            <TrendingUp size={14} />
            O'rtacha bal
          </div>
          <div className="text-2xl font-bold" style={{ color: "#3b82f6" }}>
            {avgFinalScore > 0 ? `${Math.round(avgFinalScore)}%` : "—"}
          </div>
        </div>

        <div
          className="p-3 rounded-xl border"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 text-xs text-secondary mb-1">
            <Clock size={14} />
            Jami vaqt
          </div>
          <div className="text-2xl font-bold text-white">
            {fmtDuration(totalDurationSec)}
          </div>
        </div>
      </div>

      {/* In-progress */}
      {inProgress.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-white mb-2">Davom etayotgan</h3>
          <div className="space-y-2">
            {inProgress.map((l) => (
              <div
                key={l.id}
                onClick={() => navigate(`/lessons/${l.id}`)}
                className="p-3 rounded-lg border cursor-pointer transition-all hover:border-blue-500/50"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  borderColor: "var(--color-border)",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Play size={12} className="text-blue-400" />
                      <span className="text-sm font-medium text-white truncate">
                        {l.title}
                      </span>
                    </div>
                    <div className="text-xs text-secondary">
                      {l.videoCompleted ? "Video ✓" : "Video"}
                      {" · "}
                      {l.testPassed
                        ? `Test ✓ ${Math.round(l.testBestScore || 0)}%`
                        : l.testBestScore != null
                        ? `Test ${Math.round(l.testBestScore)}%`
                        : "Test"}
                      {" · "}
                      {l.aiStatus === "completed"
                        ? `AI ✓ ${Math.round(l.aiScore || 0)}%`
                        : l.aiStatus === "in_progress"
                        ? "AI davom etmoqda"
                        : "AI"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-white mb-2">Tugatilgan</h3>
          <div className="space-y-2">
            {completed.map((l) => {
              const score = l.finalScore || 0;
              const color = score >= 85 ? "#10b981" : score >= 70 ? "#3b82f6" : "#f59e0b";
              return (
                <div
                  key={l.id}
                  onClick={() => navigate(`/lessons/${l.id}`)}
                  className="p-3 rounded-lg border cursor-pointer transition-all hover:border-green-500/50"
                  style={{
                    backgroundColor: "var(--color-card-bg)",
                    borderColor: "var(--color-border)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Trophy size={14} style={{ color }} />
                      <span className="text-sm font-medium text-white truncate">
                        {l.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs shrink-0">
                      <span className="text-secondary">
                        T: {Math.round(l.testBestScore || 0)}%
                      </span>
                      <span className="text-secondary">
                        AI: {Math.round(l.aiScore || 0)}%
                      </span>
                      <span
                        className="font-bold px-2 py-0.5 rounded"
                        style={{ backgroundColor: `${color}22`, color }}
                      >
                        {Math.round(score)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked */}
      {lessons.filter((l) => l.locked).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-2">Qulflangan</h3>
          <div className="space-y-2">
            {lessons
              .filter((l) => l.locked)
              .map((l) => (
                <div
                  key={l.id}
                  className="p-3 rounded-lg border"
                  style={{
                    backgroundColor: "var(--color-card-bg)",
                    borderColor: "var(--color-border)",
                    opacity: 0.6,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Lock size={12} className="text-secondary" />
                    <span className="text-sm text-secondary">{l.title}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonsTab;
