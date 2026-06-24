// Intervyu detail — audio player + AI summary + savol-javob ro'yxati
// Timestamp ga bosilsa — audio shu nuqtaga seek qiladi.
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Play,
  Pause,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mic,
  Clock,
  FileText,
} from "lucide-react";
import {
  custdevService,
  CustdevInterviewStatus,
} from "../../services/custdev.service";

const STATUS_BADGE: Record<
  CustdevInterviewStatus,
  { color: string; text: string; icon: React.ElementType }
> = {
  pending: { color: "#6b7280", text: "Navbatda", icon: Loader2 },
  processing: { color: "#f59e0b", text: "Tahlilda", icon: Loader2 },
  completed: { color: "#10b981", text: "Tayyor", icon: CheckCircle2 },
  failed: { color: "#ef4444", text: "Xato", icon: AlertCircle },
};

const fmtTime = (sec: number): string => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};

const CustdevInterviewPage: React.FC = () => {
  const { id, iid } = useParams<{ id: string; iid: string }>();
  const navigate = useNavigate();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["custdev-interview", iid],
    queryFn: () => custdevService.getInterview(iid!),
    enabled: !!iid,
    refetchInterval: (query) => {
      const cur = query.state.data;
      if (!cur) return false;
      const processing = cur.status === "pending" || cur.status === "processing";
      return processing ? 5000 : false;
    },
  });

  // Audio event handlers
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [data?.audioUrl]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const seekTo = (sec: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, sec);
    if (el.paused) void el.play();
  };

  if (!iid) return null;

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

  if (isError || !data) {
    return (
      <div
        className="max-w-2xl mx-auto p-4 rounded-xl"
        style={{
          backgroundColor: "#ef444411",
          border: "1px solid #ef444444",
          color: "#ef4444",
        }}
      >
        Xatolik: {(error as Error)?.message || "Intervyu topilmadi"}
      </div>
    );
  }

  const cfg = STATUS_BADGE[data.status];
  const StatusIcon = cfg.icon;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="max-w-4xl mx-auto pb-8">
      {/* Back */}
      <button
        onClick={() => navigate(`/custdev/${id}`)}
        className="inline-flex items-center gap-1 text-sm font-medium mb-4 hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Custdev: {data.custdevTitle}
      </button>

      {/* Audio Player card */}
      <div
        className="rounded-2xl p-5 mb-5"
        style={{
          background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
          boxShadow: "0 10px 30px rgba(6,182,212,0.25)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              style={{
                backgroundColor: "rgba(255,255,255,0.22)",
                backdropFilter: "blur(6px)",
              }}
            >
              <Mic size={22} color="#fff" />
            </div>
            <div>
              <div
                className="text-[11px] font-semibold uppercase tracking-wider opacity-80"
                style={{ color: "#fff" }}
              >
                INTERVYU
              </div>
              <div className="text-base font-bold" style={{ color: "#fff" }}>
                Mijoz bilan suhbat
              </div>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold"
            style={{
              backgroundColor: "rgba(255,255,255,0.22)",
              color: "#fff",
              backdropFilter: "blur(4px)",
            }}
          >
            <StatusIcon
              size={11}
              className={
                data.status === "processing" || data.status === "pending"
                  ? "animate-spin"
                  : ""
              }
            />
            {cfg.text}
          </span>
        </div>

        <audio ref={audioRef} src={data.audioUrl} preload="metadata" />

        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105"
            style={{ backgroundColor: "#fff", color: "#06b6d4" }}
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
          </button>
          <div className="flex-1">
            <div
              className="h-2 rounded-full overflow-hidden cursor-pointer"
              style={{ backgroundColor: "rgba(255,255,255,0.3)" }}
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                seekTo(pct * duration);
              }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-100"
                style={{
                  width: `${progress}%`,
                  backgroundColor: "#fff",
                }}
              />
            </div>
            <div
              className="flex items-center justify-between text-xs mt-1.5 font-mono"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              <span>{fmtTime(currentTime)}</span>
              <span>{fmtTime(duration || data.durationSec || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {data.status === "failed" && data.errorMessage && (
        <div
          className="mb-5 rounded-xl p-3 text-sm"
          style={{
            backgroundColor: "#ef444411",
            color: "#ef4444",
            border: "1px solid #ef444433",
          }}
        >
          <div className="font-semibold mb-0.5">AI tahlil tugatilmadi</div>
          <div className="text-xs opacity-90">{data.errorMessage}</div>
        </div>
      )}

      {/* Processing banner */}
      {(data.status === "pending" || data.status === "processing") && (
        <div
          className="mb-5 rounded-xl p-3 flex items-center gap-2 text-sm"
          style={{
            backgroundColor: "#f59e0b11",
            color: "#b45309",
            border: "1px solid #f59e0b33",
          }}
        >
          <Loader2 size={16} className="animate-spin" />
          AI intervyuni tahlil qilmoqda. Sahifa avtomatik yangilanadi.
        </div>
      )}

      {/* AI Summary */}
      {data.aiSummary && (
        <div
          className="rounded-2xl p-4 mb-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.02))",
            border: "1px solid #10b98144",
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#10b98122" }}
            >
              <Sparkles size={17} style={{ color: "#10b981" }} />
            </div>
            <div className="flex-1">
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: "#10b981" }}
              >
                AI Intervyu xulosasi
              </div>
              <div
                className="text-sm whitespace-pre-wrap leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                {data.aiSummary}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Savol-javoblar */}
      <div className="space-y-3 mb-5">
        <h2
          className="text-base font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Savol-javoblar
        </h2>
        {data.questions.length === 0 ? (
          <div
            className="py-6 text-center text-sm rounded-xl"
            style={{
              color: "var(--text-secondary)",
              border: "1px dashed var(--color-border)",
            }}
          >
            Bu Custdev'da hali savol yo'q.
          </div>
        ) : (
          data.questions.map((q, i) => {
            const ans = q.answer;
            return (
              <div
                key={q.id}
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{
                      backgroundColor: "#8b5cf615",
                      color: "#8b5cf6",
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-sm font-bold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {q.text}
                    </div>

                    {ans ? (
                      <>
                        <div
                          className="text-sm leading-relaxed whitespace-pre-wrap"
                          style={{ color: "var(--ds-text-secondary)" }}
                        >
                          {ans.answer}
                        </div>
                        {typeof ans.timestamp === "number" && ans.timestamp >= 0 && (
                          <button
                            onClick={() => seekTo(ans.timestamp as number)}
                            className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors"
                            style={{
                              backgroundColor: "#06b6d415",
                              color: "#06b6d4",
                            }}
                            title="Audio shu nuqtadan"
                          >
                            <Clock size={11} />
                            {fmtTime(ans.timestamp)}
                          </button>
                        )}
                      </>
                    ) : (
                      <div
                        className="text-xs italic"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {data.status === "completed"
                          ? "(javob topilmadi)"
                          : "Tahlil jarayonida..."}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Transkript */}
      {data.transcription && (
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <FileText size={16} style={{ color: "var(--text-secondary)" }} />
            <h2
              className="text-base font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              To'liq transkript
            </h2>
          </div>
          <pre
            className="text-xs whitespace-pre-wrap font-mono leading-relaxed max-h-[400px] overflow-y-auto"
            style={{ color: "var(--ds-text-secondary)" }}
          >
            {data.transcription}
          </pre>
        </div>
      )}
    </div>
  );
};

export default CustdevInterviewPage;
