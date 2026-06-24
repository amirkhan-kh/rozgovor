// Manager dars detali — Video + Test + AI suhbat (3 bosqich).
// C3: Custom video player (center play, glass progress, forward-seek block, speed after watched)
// C4: Creative test UI — gradient option buttons, progress dots, NO-SPOIL result grid
// C5: Auto-advance + celebration — hammasi tugagach confetti modal → keyingi dars
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Play,
  Pause,
  CheckCircle2,
  Lock,
  BookOpen,
  FileText,
  MessageSquare,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Check,
  X as XIcon,
  Gauge,
} from "lucide-react";
import Button from "../../components/ui/Button";
import {
  lessonsService,
  TestStartResult,
  TestSubmitResult,
} from "../../services/lessons.service";
import CelebrationModal from "./CelebrationModal";

type Step = "video" | "test" | "ai" | "done";

const fmtDuration = (sec: number): string => {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// ══════════════════════════════════════════════════════════════
// C3 — Custom Video Player
// ══════════════════════════════════════════════════════════════
const VideoStep: React.FC<{
  lessonId: string;
  durationSec: number;
  initialMaxSec: number;
  videoCompleted: boolean;
  onCompleted: () => void;
}> = ({ lessonId, durationSec, initialMaxSec, videoCompleted, onCompleted }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [maxSec, setMaxSec] = useState(initialMaxSec);
  const [watchedSec, setWatchedSec] = useState(initialMaxSec);
  const [completed, setCompleted] = useState(videoCompleted);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const maxSecRef = useRef(initialMaxSec);
  const lastSyncRef = useRef(0);
  const controlsHideTimer = useRef<number | null>(null);

  const token = localStorage.getItem("token") || "";
  const streamUrl = lessonsService.videoStreamUrl(lessonId, token);

  useEffect(() => {
    maxSecRef.current = maxSec;
  }, [maxSec]);

  const syncProgress = async (ws: number, ms: number) => {
    try {
      await lessonsService.videoProgress(lessonId, Math.floor(ws), Math.floor(ms));
    } catch {
      // ignore
    }
  };

  // Controls auto-hide
  const revealControls = () => {
    setShowControls(true);
    if (controlsHideTimer.current) window.clearTimeout(controlsHideTimer.current);
    if (isPlaying) {
      controlsHideTimer.current = window.setTimeout(() => setShowControls(false), 2500);
    }
  };
  useEffect(() => {
    revealControls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play();
    else v.pause();
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;
    setWatchedSec(t);
    if (t > maxSecRef.current) {
      maxSecRef.current = t;
      setMaxSec(t);
    }
    if (Math.floor(t) - lastSyncRef.current >= 5) {
      lastSyncRef.current = Math.floor(t);
      syncProgress(t, maxSecRef.current);
    }
    if (!completed && durationSec > 0 && maxSecRef.current >= durationSec * 0.95) {
      setCompleted(true);
      syncProgress(t, maxSecRef.current).then(onCompleted);
    }
  };

  // Anti-skip-forward — FORCED keep existing logic
  const handleSeeking = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.currentTime > maxSecRef.current + 1) {
      video.currentTime = maxSecRef.current;
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !durationSec) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const target = pct * durationSec;
    // BLOCK forward past max
    if (target > maxSecRef.current + 1) {
      video.currentTime = maxSecRef.current;
    } else {
      video.currentTime = Math.max(0, target);
    }
  };

  const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!durationSec) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setHoverTime(pct * durationSec);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };

  const changeVolume = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = val;
    v.muted = val === 0;
    setVolume(val);
    setMuted(val === 0);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const changeSpeed = (rate: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = rate;
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  };

  const watchedPct = durationSec > 0 ? Math.min(100, (maxSec / durationSec) * 100) : 0;
  const currentPct = durationSec > 0 ? Math.min(100, (watchedSec / durationSec) * 100) : 0;

  // Speedni ko'rsatish faqat to'liq ko'rilgandan keyin
  const canChangeSpeed = completed;

  return (
    <div>
      <div
        ref={containerRef}
        className="relative rounded-2xl overflow-hidden bg-black group select-none"
        style={{
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
          aspectRatio: isFullscreen ? undefined : "16 / 9",
        }}
        onMouseMove={revealControls}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        <video
          ref={videoRef}
          src={streamUrl}
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onSeeking={handleSeeking}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
          onEnded={() => {
            const video = videoRef.current;
            if (video) {
              maxSecRef.current = Math.max(maxSecRef.current, video.duration);
              setMaxSec(maxSecRef.current);
              setIsPlaying(false);
              if (!completed) {
                setCompleted(true);
                syncProgress(video.duration, video.duration).then(onCompleted);
              }
            }
          }}
          playsInline
        />

        {/* Center play/pause overlay */}
        {(!isPlaying || showControls) && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{
              background: !isPlaying
                ? "radial-gradient(circle at center, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%)"
                : "transparent",
            }}
          >
            <button
              onClick={togglePlay}
              className="pointer-events-auto w-20 h-20 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{
                backgroundColor: "rgba(102,126,234,0.9)",
                backdropFilter: "blur(8px)",
                border: "3px solid rgba(255,255,255,0.4)",
                boxShadow: "0 8px 32px rgba(102,126,234,0.5)",
                opacity: !isPlaying ? 1 : 0,
                transition: "opacity 0.3s",
              }}
              aria-label={isPlaying ? "Pauza" : "Boshlash"}
            >
              {isPlaying ? (
                <Pause size={32} color="#fff" fill="#fff" />
              ) : (
                <Play size={32} color="#fff" fill="#fff" style={{ marginLeft: 3 }} />
              )}
            </button>
          </div>
        )}

        {/* Controls bottom bar — glassmorphism */}
        <div
          className="absolute left-0 right-0 bottom-0 px-4 pb-3 pt-8 transition-opacity duration-300"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
            opacity: showControls ? 1 : 0,
            pointerEvents: showControls ? "auto" : "none",
          }}
        >
          {/* Progress */}
          <div
            className="relative group/progress cursor-pointer h-2 rounded-full mb-3 overflow-visible"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            onClick={handleProgressClick}
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverTime(null)}
          >
            {/* Watched max (gradient) — user skip qilishi mumkin bo'lgan max */}
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all"
              style={{
                width: `${watchedPct}%`,
                background: "linear-gradient(90deg, rgba(102,126,234,0.5) 0%, rgba(118,75,162,0.5) 100%)",
              }}
            />
            {/* Current position (bright) */}
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all"
              style={{
                width: `${currentPct}%`,
                background: "linear-gradient(90deg, #667eea 0%, #764ba2 100%)",
                boxShadow: "0 0 8px rgba(102,126,234,0.6)",
              }}
            />
            {/* Hover thumb */}
            {hoverTime != null && (
              <div
                className="absolute -top-8 px-2 py-1 rounded text-xs font-mono pointer-events-none"
                style={{
                  left: `${(hoverTime / durationSec) * 100}%`,
                  transform: "translateX(-50%)",
                  backgroundColor: "rgba(0,0,0,0.8)",
                  color: "#fff",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtDuration(hoverTime)}
              </div>
            )}
            {/* Scrub thumb (current) */}
            <div
              className="absolute top-1/2 w-4 h-4 rounded-full transition-all opacity-0 group-hover/progress:opacity-100"
              style={{
                left: `${currentPct}%`,
                transform: "translate(-50%, -50%)",
                backgroundColor: "#fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                aria-label={isPlaying ? "Pauza" : "Boshlash"}
              >
                {isPlaying ? (
                  <Pause size={18} color="#fff" fill="#fff" />
                ) : (
                  <Play size={18} color="#fff" fill="#fff" style={{ marginLeft: 2 }} />
                )}
              </button>

              {/* Volume */}
              <div className="flex items-center gap-2 group/vol">
                <button
                  onClick={toggleMute}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                  aria-label={muted ? "Ovozni yoqish" : "Ovozni o'chirish"}
                >
                  {muted || volume === 0 ? (
                    <VolumeX size={18} color="#fff" />
                  ) : (
                    <Volume2 size={18} color="#fff" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={(e) => changeVolume(parseFloat(e.target.value))}
                  className="w-0 opacity-0 group-hover/vol:w-20 group-hover/vol:opacity-100 transition-all"
                  style={{ accentColor: "#667eea" }}
                  aria-label="Ovoz sathi"
                />
              </div>

              {/* Time */}
              <div className="font-mono text-xs tabular-nums" style={{ color: "#fff" }}>
                {fmtDuration(watchedSec)} / {fmtDuration(durationSec)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Playback speed (after fully watched) */}
              {canChangeSpeed && (
                <div className="relative">
                  <button
                    onClick={() => setShowSpeedMenu((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-mono transition-colors hover:bg-white/10"
                    style={{ color: "#fff" }}
                    aria-label="Tezlik"
                  >
                    <Gauge size={14} />
                    {playbackRate}x
                  </button>
                  {showSpeedMenu && (
                    <div
                      className="absolute bottom-full right-0 mb-2 rounded-lg overflow-hidden"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.9)",
                        backdropFilter: "blur(8px)",
                        minWidth: 80,
                      }}
                    >
                      {[0.5, 1, 1.5, 2].map((r) => (
                        <button
                          key={r}
                          onClick={() => changeSpeed(r)}
                          className="w-full px-3 py-2 text-xs font-mono text-left transition-colors hover:bg-white/10"
                          style={{
                            color: r === playbackRate ? "#667eea" : "#fff",
                            fontWeight: r === playbackRate ? 700 : 400,
                          }}
                        >
                          {r}x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={toggleFullscreen}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
                aria-label={isFullscreen ? "Normal" : "To'liq ekran"}
              >
                {isFullscreen ? (
                  <Minimize2 size={18} color="#fff" />
                ) : (
                  <Maximize2 size={18} color="#fff" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Below-player info */}
      <div
        className="mt-3 p-3 rounded-xl flex items-center gap-3 flex-wrap"
        style={{
          backgroundColor: "var(--color-primary-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2 text-sm">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: completed ? "#10b98122" : "#667eea22",
              color: completed ? "#10b981" : "#667eea",
            }}
          >
            {completed ? <CheckCircle2 size={16} /> : <Play size={16} />}
          </div>
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {Math.round(watchedPct)}% ko'rildi
          </span>
        </div>
        <div className="flex-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Oldinga o'tkazish qulflangan. 95% ko'rgach keyingi bosqich ochiladi.
          {canChangeSpeed && " Tezlikni tanlash mumkin!"}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// C4 — Creative Test UI + No-spoil result
// ══════════════════════════════════════════════════════════════
const OPTION_LETTERS = ["A", "B", "C", "D"];
const OPTION_GRADIENTS: Array<{ bg: string; accent: string }> = [
  { bg: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", accent: "#667eea" },
  { bg: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)", accent: "#f5576c" },
  { bg: "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)", accent: "#4facfe" },
  { bg: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)", accent: "#43e97b" },
];

const TestStep: React.FC<{
  lessonId: string;
  totalQuestions: number;
  passScore: number;
  onPassed: () => void;
}> = ({ lessonId, totalQuestions, passScore, onPassed }) => {
  const [attempt, setAttempt] = useState<TestStartResult | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [result, setResult] = useState<TestSubmitResult | null>(null);

  const startMutation = useMutation({
    mutationFn: () => lessonsService.testStart(lessonId),
    onSuccess: (data) => {
      setAttempt(data);
      setAnswers(new Array(data.questions.length).fill(-1));
      setCurrentIdx(0);
      setResult(null);
    },
  });

  const retryWrongMutation = useMutation({
    mutationFn: (idxs: number[]) => lessonsService.testRetryWrong(lessonId, idxs),
    onSuccess: (data) => {
      setAttempt(data);
      setAnswers(new Array(data.questions.length).fill(-1));
      setCurrentIdx(0);
      setResult(null);
    },
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      lessonsService.testSubmit(lessonId, attempt!.orderIdxs, attempt!.optionsOrder, answers),
    onSuccess: (data) => {
      setResult(data);
      if (data.passed) onPassed();
    },
  });

  // ─── Start screen — hero card ───
  if (!attempt && !result) {
    return (
      <div className="py-4">
        <div
          className="relative overflow-hidden rounded-2xl p-6 text-center"
          style={{
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          }}
        >
          <div
            className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20"
            style={{ backgroundColor: "#fff" }}
          />
          <div
            className="absolute -bottom-12 -left-8 w-40 h-40 rounded-full opacity-10"
            style={{ backgroundColor: "#fff" }}
          />

          <div className="relative">
            <div
              className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
              style={{
                backgroundColor: "rgba(255,255,255,0.25)",
                backdropFilter: "blur(8px)",
                border: "2px solid rgba(255,255,255,0.3)",
              }}
            >
              <FileText size={28} color="#fff" />
            </div>
            <h3 className="text-2xl font-extrabold mb-1" style={{ color: "#fff" }}>
              Test boshlanmoqda
            </h3>
            <p className="text-sm opacity-90 mb-4" style={{ color: "#fff" }}>
              Darslik bo'yicha bilimingizni tekshiring
            </p>

            <div className="grid grid-cols-2 gap-3 max-w-md mx-auto mb-5">
              <div
                className="rounded-xl p-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="text-3xl font-extrabold mb-0.5" style={{ color: "#fff" }}>
                  {totalQuestions}
                </div>
                <div className="text-xs opacity-90" style={{ color: "#fff" }}>
                  ta savol
                </div>
              </div>
              <div
                className="rounded-xl p-3"
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div className="text-3xl font-extrabold mb-0.5" style={{ color: "#fff" }}>
                  {passScore}%
                </div>
                <div className="text-xs opacity-90" style={{ color: "#fff" }}>
                  o'tish bali
                </div>
              </div>
            </div>

            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-bold text-base transition-all hover:scale-105 disabled:opacity-50"
              style={{
                backgroundColor: "#fff",
                color: "#667eea",
                boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
              }}
            >
              <Play size={18} fill="#667eea" />
              {startMutation.isPending ? "Boshlanmoqda..." : "Testni boshlash"}
            </button>

            <p className="text-xs opacity-80 mt-3" style={{ color: "#fff" }}>
              Savollar har urinishda boshqa tartibda ko'rsatiladi
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Result screen — no-spoil grid ───
  if (result) {
    const passed = result.passed;
    const wrongIdxs = result.wrongQuestionIndices;

    return (
      <div className="py-4">
        {/* Big hero */}
        <div
          className="text-center mb-5 p-5 rounded-2xl"
          style={{
            background: passed
              ? "linear-gradient(135deg, #10b981 0%, #34d399 100%)"
              : "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
            color: "#fff",
          }}
        >
          <div
            className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: "rgba(255,255,255,0.25)",
              border: "2px solid rgba(255,255,255,0.4)",
            }}
          >
            {passed ? <Trophy size={30} color="#fff" /> : <RotateCcw size={30} color="#fff" />}
          </div>
          <div className="text-5xl font-extrabold mb-1" style={{ color: "#fff" }}>
            {Math.round(result.score)}%
          </div>
          <div className="text-sm opacity-95" style={{ color: "#fff" }}>
            {result.correctCount} / {result.total} to'g'ri javob
            {passed ? " — zo'r natija!" : ` — ${passScore}% kerak edi`}
          </div>
        </div>

        {/* Dots grid — no spoil (faqat tick/cross, to'g'ri javobni ko'rsatmaydi) */}
        <div className="mb-5">
          <div
            className="text-xs font-semibold mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Javoblaringiz (to'g'ri javob ko'rsatilmaydi — o'zingiz toping!)
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
            {result.perQuestion.map((r, i) => (
              <div
                key={i}
                className="aspect-square rounded-xl flex items-center justify-center relative transition-transform hover:scale-110"
                style={{
                  background: r.correct
                    ? "linear-gradient(135deg, #10b981 0%, #34d399 100%)"
                    : "linear-gradient(135deg, #ef4444 0%, #f87171 100%)",
                  boxShadow: `0 4px 12px ${r.correct ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}`,
                }}
                title={`Savol ${i + 1}: ${r.correct ? "To'g'ri" : "Noto'g'ri"}`}
              >
                {r.correct ? (
                  <Check size={20} color="#fff" strokeWidth={3} />
                ) : (
                  <XIcon size={20} color="#fff" strokeWidth={3} />
                )}
                <span
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    backgroundColor: "#fff",
                    color: r.correct ? "#10b981" : "#ef4444",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-center flex-wrap">
          {!passed && wrongIdxs.length > 0 && (
            <Button
              onClick={() => retryWrongMutation.mutate(wrongIdxs)}
              loading={retryWrongMutation.isPending}
            >
              <Sparkles size={16} />
              Xato topilganlarni qayta ishlash ({wrongIdxs.length})
            </Button>
          )}
          {!passed && (
            <Button
              variant="secondary"
              onClick={() => startMutation.mutate()}
              loading={startMutation.isPending}
            >
              <RotateCcw size={16} />
              Yangidan boshlash
            </Button>
          )}
          {passed && (
            <Button onClick={onPassed}>
              <Sparkles size={16} />
              AI suhbatga o'tish
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!attempt) return null;

  const q = attempt.questions[currentIdx];
  const total = attempt.questions.length;
  const answered = answers.filter((a) => a >= 0).length;

  // ─── Question screen ───
  return (
    <div>
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 mb-5 flex-wrap">
        {attempt.questions.map((_, i) => {
          const answered = answers[i] >= 0;
          const active = i === currentIdx;
          return (
            <button
              key={i}
              onClick={() => setCurrentIdx(i)}
              className="rounded-full transition-all"
              style={{
                width: active ? 28 : answered ? 10 : 8,
                height: active ? 10 : answered ? 10 : 8,
                backgroundColor: active
                  ? "#667eea"
                  : answered
                  ? "#667eea88"
                  : "var(--color-border)",
                boxShadow: active ? "0 2px 8px rgba(102,126,234,0.4)" : "none",
              }}
              aria-label={`Savol ${i + 1}`}
            />
          );
        })}
      </div>

      {/* Question count label */}
      <div className="flex items-center justify-between text-xs mb-3">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-semibold"
          style={{ backgroundColor: "#667eea22", color: "#667eea" }}
        >
          Savol {currentIdx + 1} / {total}
        </span>
        <span style={{ color: "var(--text-secondary)" }}>
          {answered} / {total} javob berilgan
        </span>
      </div>

      {/* Question card */}
      <div
        className="rounded-2xl p-5 mb-4"
        style={{
          background: "linear-gradient(135deg, var(--color-card-bg) 0%, var(--color-primary-bg) 100%)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
        }}
      >
        <div
          className="font-bold text-lg mb-4 leading-snug"
          style={{ color: "var(--ds-text-primary)" }}
        >
          {q.q}
        </div>

        {/* Gradient option buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {q.options.map((opt, i) => {
            const selected = answers[currentIdx] === i;
            const grad = OPTION_GRADIENTS[i % OPTION_GRADIENTS.length];
            return (
              <button
                key={i}
                onClick={() => {
                  const next = [...answers];
                  next[currentIdx] = i;
                  setAnswers(next);
                }}
                className="group text-left p-3 rounded-2xl transition-all hover:-translate-y-0.5"
                style={{
                  background: selected ? grad.bg : "var(--color-card-bg)",
                  border: `2px solid ${selected ? grad.accent : "var(--color-border)"}`,
                  boxShadow: selected
                    ? `0 8px 24px ${grad.accent}55`
                    : "0 1px 3px rgba(0,0,0,0.03)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-lg flex-shrink-0"
                    style={{
                      backgroundColor: selected ? "rgba(255,255,255,0.25)" : `${grad.accent}1a`,
                      color: selected ? "#fff" : grad.accent,
                      border: selected ? "2px solid rgba(255,255,255,0.4)" : `2px solid ${grad.accent}33`,
                    }}
                  >
                    {OPTION_LETTERS[i]}
                  </div>
                  <div
                    className="flex-1 pt-1 text-sm font-medium leading-snug"
                    style={{
                      color: selected ? "#fff" : "var(--ds-text-primary)",
                      wordBreak: "break-word",
                    }}
                  >
                    {opt}
                  </div>
                  {selected && (
                    <Check
                      size={20}
                      color="#fff"
                      strokeWidth={3}
                      className="flex-shrink-0 mt-1"
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Nav buttons */}
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))}
          disabled={currentIdx === 0}
        >
          Oldingi
        </Button>
        {currentIdx < total - 1 ? (
          <Button
            size="sm"
            onClick={() => setCurrentIdx(currentIdx + 1)}
            disabled={answers[currentIdx] < 0}
          >
            Keyingi
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => submitMutation.mutate()}
            loading={submitMutation.isPending}
            disabled={answers.some((a) => a < 0)}
          >
            <Check size={14} />
            Yuborish
          </Button>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// AI Step — (mavjud dizayn, kichik tozaash)
// ══════════════════════════════════════════════════════════════
const AiStep: React.FC<{
  lessonId: string;
  keyTopics: string[] | null;
  initialMessages: { role: string; text: string }[];
  initialStatus: string;
  initialScore: number | null;
  initialFeedback: string | null;
  initialStrengths: string[] | null;
  initialWeaknesses: string[] | null;
  onCompleted: () => void;
}> = ({
  lessonId,
  keyTopics,
  initialMessages,
  initialStatus,
  initialScore,
  initialFeedback,
  initialStrengths,
  initialWeaknesses,
  onCompleted,
}) => {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(initialStatus === "completed");
  const [canFinish, setCanFinish] = useState(false);
  const [result, setResult] = useState<{
    score: number | null;
    feedback: string | null;
    strengths: string[] | null;
    weaknesses: string[] | null;
  }>({
    score: initialScore,
    feedback: initialFeedback,
    strengths: initialStrengths,
    weaknesses: initialWeaknesses,
  });
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (msg?: string) => lessonsService.aiChat(lessonId, msg),
    onSuccess: (data, variables) => {
      const msgs = [...messages];
      if (variables) msgs.push({ role: "user", text: variables });
      msgs.push({ role: "assistant", text: data.reply });
      setMessages(msgs);
      if (data.done) setCanFinish(true);
      setInput("");
    },
  });

  const finishMutation = useMutation({
    mutationFn: () => lessonsService.aiFinish(lessonId),
    onSuccess: (data) => {
      setResult({
        score: data.aiScore,
        feedback: data.feedback,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
      });
      setDone(true);
      onCompleted();
    },
  });

  const userMsgCount = messages.filter((m) => m.role === "user").length;

  // Result
  if (done && result.score != null) {
    const passed = result.score >= 60;
    return (
      <div className="py-4">
        <div
          className="text-center mb-5 p-5 rounded-2xl"
          style={{
            background: passed
              ? "linear-gradient(135deg, #10b981 0%, #34d399 100%)"
              : "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
            color: "#fff",
          }}
        >
          <div
            className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
            style={{
              backgroundColor: "rgba(255,255,255,0.25)",
              border: "2px solid rgba(255,255,255,0.4)",
            }}
          >
            {passed ? <Trophy size={30} color="#fff" /> : <AlertCircle size={30} color="#fff" />}
          </div>
          <div className="text-5xl font-extrabold mb-1" style={{ color: "#fff" }}>
            {Math.round(result.score)}%
          </div>
          <div className="text-sm opacity-95" style={{ color: "#fff" }}>
            AI suhbat bahosi
          </div>
        </div>

        {result.feedback && (
          <div
            className="p-3 rounded-xl mb-3 text-sm"
            style={{
              backgroundColor: "var(--color-card-bg)",
              border: "1px solid var(--color-border)",
              color: "var(--text-primary)",
            }}
          >
            {result.feedback}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {result.strengths && result.strengths.length > 0 && (
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: "#10b98111", border: "1px solid #10b98133" }}
            >
              <h4 className="font-semibold mb-2 text-sm" style={{ color: "#10b981" }}>
                Kuchli tomonlar
              </h4>
              <ul
                className="text-xs space-y-1 list-disc pl-4"
                style={{ color: "var(--text-secondary)" }}
              >
                {result.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.weaknesses && result.weaknesses.length > 0 && (
            <div
              className="p-3 rounded-xl"
              style={{ backgroundColor: "#f59e0b11", border: "1px solid #f59e0b33" }}
            >
              <h4 className="font-semibold mb-2 text-sm" style={{ color: "#f59e0b" }}>
                Yaxshilash kerak
              </h4>
              <ul
                className="text-xs space-y-1 list-disc pl-4"
                style={{ color: "var(--text-secondary)" }}
              >
                {result.weaknesses.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {keyTopics && keyTopics.length > 0 && (
        <div
          className="mb-3 text-xs flex flex-wrap gap-1.5"
          style={{ color: "var(--text-secondary)" }}
        >
          Mavzular:
          {keyTopics.map((t, i) => (
            <span
              key={i}
              className="px-1.5 py-0.5 rounded font-semibold"
              style={{ backgroundColor: "#667eea22", color: "#667eea" }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div
        className="rounded-xl p-3 mb-3 max-h-[50vh] overflow-y-auto space-y-2"
        style={{
          backgroundColor: "var(--color-primary-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Sparkles
              size={32}
              className="mx-auto mb-2"
              style={{ color: "#667eea" }}
            />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              AI instruktor bilan suhbat. "Boshlash" tugmasini bosing.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[80%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap"
              style={{
                backgroundColor: m.role === "user" ? "#667eea33" : "#8b5cf633",
                color: "var(--text-primary)",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {!canFinish ? (
        <div className="flex gap-2">
          {messages.length === 0 ? (
            <Button
              onClick={() => chatMutation.mutate(undefined)}
              loading={chatMutation.isPending}
              className="w-full"
            >
              <Sparkles size={16} />
              Suhbatni boshlash
            </Button>
          ) : (
            <>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim() && !chatMutation.isPending) {
                    chatMutation.mutate(input.trim());
                  }
                }}
                placeholder="Javobingizni yozing..."
                className="flex-1 px-3 py-2 rounded-lg focus:outline-none"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--color-border)",
                }}
                disabled={chatMutation.isPending}
              />
              <Button
                onClick={() => chatMutation.mutate(input.trim())}
                loading={chatMutation.isPending}
                disabled={!input.trim()}
              >
                Yuborish
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="text-center py-3">
          <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
            Suhbat tugadi. Yakuniy bahoni olishingiz mumkin.
          </p>
          <Button
            onClick={() => finishMutation.mutate()}
            loading={finishMutation.isPending}
          >
            <Trophy size={16} />
            Yakuniy bahoni olish
          </Button>
        </div>
      )}

      <div
        className="mt-2 text-xs text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        {userMsgCount} ta javob bergansiz (min 3, max 10)
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// Main page
// ══════════════════════════════════════════════════════════════
const LessonDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("video");
  const [celebration, setCelebration] = useState<{
    open: boolean;
    type: "lesson" | "moduleComplete";
  }>({ open: false, type: "lesson" });
  const hasShownCelebration = useRef(false);

  const { data: lesson, isLoading, error: lessonError } = useQuery({
    queryKey: ["my-lesson", id],
    queryFn: () => lessonsService.myGet(id!),
    enabled: !!id,
    retry: false,
  });

  // Initial step resolution
  useEffect(() => {
    if (!lesson) return;
    const p = lesson.progress;
    if (p.completedAt) setStep("done");
    else if (p.testPassed && p.aiStatus !== "completed") setStep("ai");
    else if (p.videoCompleted && !p.testPassed) setStep("test");
    else setStep("video");
  }, [lesson?.id]);

  // Auto-advance celebration when freshly completed
  useEffect(() => {
    if (!lesson) return;
    const p = lesson.progress;
    if (p.completedAt && !hasShownCelebration.current) {
      hasShownCelebration.current = true;
      setCelebration({
        open: true,
        type: lesson.isLastInModule ? "moduleComplete" : "lesson",
      });
    }
  }, [lesson?.progress.completedAt, lesson?.isLastInModule]);

  if (isLoading) {
    return (
      <div className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        Yuklanmoqda...
      </div>
    );
  }
  if (!lesson) {
    const errMsg =
      (lessonError as any)?.response?.data?.error ||
      (lessonError as any)?.response?.data?.message ||
      (lessonError as Error)?.message ||
      "Darslik topilmadi";
    const status = (lessonError as any)?.response?.status;
    return (
      <div className="max-w-xl mx-auto py-10 px-4">
        <div
          className="p-6 rounded-xl border text-center"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <AlertCircle
            size={40}
            className="mx-auto mb-2"
            style={{ color: "#ef4444" }}
          />
          <h2
            className="text-lg font-semibold mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Darslikni ochib bo'lmadi
          </h2>
          <p
            className="text-sm mb-3"
            style={{ color: "var(--text-secondary)" }}
          >
            {status ? `${status}: ` : ""}
            {errMsg}
          </p>
          <Button variant="secondary" onClick={() => navigate("/lessons")}>
            <ArrowLeft size={14} />
            Darsliklar ro'yxati
          </Button>
        </div>
      </div>
    );
  }
  if (lesson.locked) {
    return (
      <div className="max-w-xl mx-auto py-10 text-center">
        <Lock size={48} className="mx-auto mb-3" style={{ color: "var(--text-secondary)" }} />
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Qulflangan
        </h1>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Avval oldingi darsni tugating.
        </p>
        <Button
          variant="secondary"
          onClick={() =>
            lesson.moduleId
              ? navigate(`/lessons/modules/${lesson.moduleId}`)
              : navigate("/lessons")
          }
        >
          Orqaga
        </Button>
      </div>
    );
  }
  if (lesson.status !== "ready") {
    return (
      <div className="max-w-xl mx-auto py-10 text-center">
        <div
          className="w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "#f59e0b22" }}
        >
          <BookOpen size={24} style={{ color: "#f59e0b" }} />
        </div>
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Darslik tayyorlanmoqda
        </h1>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Biroz kutib turing.
        </p>
      </div>
    );
  }

  const p = lesson.progress;

  const steps: { key: Step; label: string; icon: any; enabled: boolean; done: boolean }[] = [
    { key: "video", label: "Video", icon: Play, enabled: true, done: p.videoCompleted },
    {
      key: "test",
      label: "Test",
      icon: FileText,
      enabled: p.videoCompleted,
      done: p.testPassed,
    },
    {
      key: "ai",
      label: "AI suhbat",
      icon: MessageSquare,
      enabled: p.testPassed,
      done: p.aiStatus === "completed",
    },
  ];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["my-lesson", id] });

  // Celebration keyingi darsga/modulga navigatsiya qiladi
  const handleCelebrationNext = () => {
    setCelebration({ open: false, type: "lesson" });
    if (lesson.nextLessonId) {
      navigate(`/lessons/${lesson.nextLessonId}`);
    } else if (lesson.moduleId) {
      navigate(`/lessons/modules/${lesson.moduleId}`);
    } else {
      navigate("/lessons");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <button
        onClick={() =>
          lesson.moduleId
            ? navigate(`/lessons/modules/${lesson.moduleId}`)
            : navigate("/lessons")
        }
        className="inline-flex items-center gap-2 text-sm mb-3 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Modulga qaytish
      </button>

      <h1
        className="text-2xl font-bold mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        {lesson.title}
      </h1>
      {lesson.description && (
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          {lesson.description}
        </p>
      )}

      {/* Stepper */}
      <div className="flex items-center justify-center gap-2 mb-5 flex-wrap">
        {steps.map((s, i) => {
          const active = step === s.key;
          const color = s.done ? "#10b981" : active ? "#667eea" : s.enabled ? "#8b5cf6" : "#6b7280";
          return (
            <React.Fragment key={s.key}>
              <button
                onClick={() => s.enabled && setStep(s.key)}
                disabled={!s.enabled}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  s.enabled ? "cursor-pointer" : "cursor-not-allowed"
                }`}
                style={{
                  backgroundColor: active ? `${color}22` : "transparent",
                  color,
                  border: `1px solid ${active ? color : `${color}33`}`,
                  opacity: s.enabled ? 1 : 0.5,
                }}
              >
                {s.done ? <CheckCircle2 size={14} /> : <s.icon size={14} />}
                {i + 1}. {s.label}
              </button>
              {i < steps.length - 1 && (
                <div
                  className="w-6 h-0.5"
                  style={{ backgroundColor: "var(--color-border)" }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step content */}
      <div
        className="rounded-2xl p-4"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        {step === "video" && (
          <VideoStep
            lessonId={id!}
            durationSec={lesson.videoDurationSec}
            initialMaxSec={p.videoMaxSec}
            videoCompleted={p.videoCompleted}
            onCompleted={() => {
              refresh();
              setStep("test");
            }}
          />
        )}
        {step === "test" && (
          <TestStep
            lessonId={id!}
            totalQuestions={lesson.testCount}
            passScore={lesson.testPassScore}
            onPassed={() => {
              refresh();
              setStep("ai");
            }}
          />
        )}
        {step === "ai" && (
          <AiStep
            lessonId={id!}
            keyTopics={lesson.aiKeyTopics}
            initialMessages={[]}
            initialStatus={p.aiStatus}
            initialScore={p.aiScore}
            initialFeedback={p.aiFeedback}
            initialStrengths={p.aiStrengths}
            initialWeaknesses={p.aiWeaknesses}
            onCompleted={() => {
              refresh();
              setStep("done");
            }}
          />
        )}
        {step === "done" && (
          <div className="py-6 text-center">
            <div
              className="w-16 h-16 mx-auto mb-3 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
                boxShadow: "0 8px 24px rgba(16,185,129,0.4)",
              }}
            >
              <Trophy size={32} color="#fff" />
            </div>
            <h3
              className="text-2xl font-bold mb-1"
              style={{ color: "#10b981" }}
            >
              Darslik tugatildi!
            </h3>
            {p.finalScore != null && (
              <p className="text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
                Yakuniy bal:{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  {Math.round(p.finalScore)}%
                </strong>
              </p>
            )}
            <div className="flex gap-2 justify-center flex-wrap">
              {lesson.nextLessonId && (
                <Button onClick={() => navigate(`/lessons/${lesson.nextLessonId}`)}>
                  <Sparkles size={16} />
                  Keyingi darsga
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() =>
                  lesson.moduleId
                    ? navigate(`/lessons/modules/${lesson.moduleId}`)
                    : navigate("/lessons")
                }
              >
                Modulga qaytish
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Celebration modal — confetti + auto-advance */}
      <CelebrationModal
        isOpen={celebration.open}
        type={celebration.type}
        title={lesson.title}
        score={p.finalScore}
        nextAction={
          celebration.type === "moduleComplete"
            ? "Modullarga qaytish"
            : lesson.nextLessonId
            ? "Keyingi darsga"
            : undefined
        }
        onClose={() => setCelebration({ open: false, type: "lesson" })}
        onNext={
          lesson.nextLessonId || celebration.type === "moduleComplete"
            ? handleCelebrationNext
            : undefined
        }
      />
    </div>
  );
};

export default LessonDetailPage;
