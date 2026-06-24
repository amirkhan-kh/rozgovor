import React, { useEffect, useState } from "react";
import { BookOpen, X, Sparkles } from "lucide-react";
import { agentsService, DailyLesson } from "../../services/agents.service";

/**
 * Dashboard yuqorisidagi "Bugungi dars" banner.
 * Knowledge-Distiller Agent (Layer 5) har kuni ertalab saboq yaratadi.
 * Menejer "O'qidim" bosgach, shu kun uchun localStorage'da belgilanadi.
 */
const DailyLessonBanner: React.FC = () => {
  const [lesson, setLesson] = useState<DailyLesson | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const storageKey = `daily-lesson-dismissed-${today}`;

  useEffect(() => {
    // localStorage dismiss tekshiruvi
    try {
      if (localStorage.getItem(storageKey) === "1") {
        setDismissed(true);
        return;
      }
    } catch {}

    (async () => {
      try {
        const l = await agentsService.getTodayLesson();
        setLesson(l);
      } catch {
        setLesson(null);
      }
    })();
  }, [storageKey]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(storageKey, "1");
    } catch {}
    setDismissed(true);
  };

  if (dismissed || !lesson) return null;

  return (
    <div
      className="relative rounded-2xl p-5 md:p-6 overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, rgba(250,204,21,0.12), rgba(251,146,60,0.10), rgba(239,68,68,0.08))",
        border: "1px solid rgba(250,204,21,0.3)",
      }}
    >
      <div className="flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #facc15, #f59e0b)" }}
        >
          <BookOpen size={22} color="#fff" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} style={{ color: "#f59e0b" }} />
            <span
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "#f59e0b" }}
            >
              Bugungi dars · 30 soniya
            </span>
          </div>
          <h3
            className="text-lg md:text-xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {lesson.title}
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {lesson.summary}
          </p>
          <button
            onClick={handleDismiss}
            className="mt-3 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105"
            style={{
              background: "rgba(250,204,21,0.15)",
              border: "1px solid rgba(250,204,21,0.35)",
              color: "#f59e0b",
            }}
          >
            ✓ O'qidim
          </button>
        </div>
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg hover:bg-black/10 transition-colors"
          style={{ color: "var(--text-secondary)" }}
          title="Yopish"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default DailyLessonBanner;
