import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mic,
  MicOff,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  PhoneOff,
  Sparkles,
} from "lucide-react";
import { voiceExamService } from "../../services/voice-exam.service";
import { VoiceSphere, type VoiceSphereStatus } from "../../components/exam/VoiceSphere";
import { TranscriptStream, type TranscriptMessage } from "../../components/exam/TranscriptStream";
import { AudioBars } from "../../components/exam/AudioBars";
import { useGeminiLiveExam } from "../../hooks/useGeminiLiveExam";

interface CachedExamData {
  scenario: { name: string; difficulty: string };
  clientName?: string | null;
  clientAge?: number | null;
  clientGender?: "male" | "female" | null;
  clientMessage?: string;
}

const MAX_EXAM_MS = 12 * 60 * 1000; // 12 daqiqa

function formatTime(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const ExamSessionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [scenario, setScenario] = useState<{ name: string; difficulty: string } | null>(null);
  const [clientInfo, setClientInfo] = useState<{
    name?: string | null;
    age?: number | null;
    gender?: "male" | "female" | null;
  }>({});
  const [initialMessages, setInitialMessages] = useState<TranscriptMessage[]>([]);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "ended">("loading");
  const [confirmModal, setConfirmModal] = useState<"finish" | "abandon" | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const startedAtRef = useRef<number>(Date.now());
  const autoFinishedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    const cachedRaw = sessionStorage.getItem(`exam-${id}`);
    if (cachedRaw) {
      try {
        const data: CachedExamData & { audioBase64?: string } = JSON.parse(cachedRaw);
        setScenario(data.scenario);
        setClientInfo({
          name: data.clientName,
          age: data.clientAge,
          gender: data.clientGender,
        });
        if (data.clientMessage) {
          setInitialMessages([{ role: "client", text: data.clientMessage, ts: Date.now() }]);
        }
        setPageStatus("ready");
      } catch {
        setPageStatus("ready");
      }
      sessionStorage.removeItem(`exam-${id}`);
    } else {
      voiceExamService
        .getResult(id)
        .then((r: any) => {
          if (r.status === "completed") {
            navigate(`/exam/result/${id}`);
            return;
          }
          if (r.messages) {
            setInitialMessages(
              (r.messages as TranscriptMessage[]).map((m) => ({
                role: m.role,
                text: m.text,
                ts: m.ts,
              }))
            );
          }
          if (r.scenarioName) {
            setScenario({ name: r.scenarioName, difficulty: r.difficulty || "medium" });
          }
          setClientInfo({
            name: r.clientName,
            age: r.clientAge,
            gender: r.clientGender,
          });
          setPageStatus("ready");
        })
        .catch(() => setPageStatus("ready"));
    }
  }, [id, navigate]);

  const {
    status: liveStatus,
    micLevel,
    aiLevel,
    frequencyData,
    lastUserText,
    lastAiText,
    messages: liveMessages,
    error: liveError,
    muted,
    toggleMute,
    disconnect,
  } = useGeminiLiveExam({ sessionId: id, enabled: pageStatus === "ready" });

  // Timer
  useEffect(() => {
    if (pageStatus !== "ready") return;
    startedAtRef.current = Date.now();
    const it = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 500);
    return () => clearInterval(it);
  }, [pageStatus]);

  // Auto-finish on hard cap
  useEffect(() => {
    if (elapsedMs >= MAX_EXAM_MS && !autoFinishedRef.current && !isGrading && id) {
      autoFinishedRef.current = true;
      doFinish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedMs]);

  // Surface live errors
  useEffect(() => {
    if (liveError) setErrorMsg(liveError);
  }, [liveError]);

  const allMessages: TranscriptMessage[] = useMemo(() => {
    return [...initialMessages, ...liveMessages];
  }, [initialMessages, liveMessages]);

  const sphereStatus: VoiceSphereStatus = useMemo(() => {
    if (liveStatus === "connecting") return "thinking";
    if (liveStatus === "speaking" || aiLevel > 0.02) return "speaking";
    if (micLevel > 0.04) return "listening";
    return "idle";
  }, [liveStatus, aiLevel, micLevel]);

  const mySalespersonTurns = allMessages.filter((m) => m.role === "salesperson").length;

  const doFinish = async () => {
    if (!id) return;
    try {
      setConfirmModal(null);
      setIsGrading(true);
      try {
        disconnect();
      } catch {
        // ignore
      }
      const r = await voiceExamService.finish(id);
      // Agar hech qanday sotuvchi javobi bo'lmasa — abandoned → /exam ga qaytamiz
      if ((r as any).status === "abandoned") {
        navigate("/exam");
        return;
      }
      // Standart natijasi (pass/fail/retry) — result page banner uchun
      if (r.examOutcome) {
        sessionStorage.setItem(`exam-outcome-${id}`, JSON.stringify({
          examOutcome: r.examOutcome,
          attemptsLeft: r.attemptsLeft,
          targetScore: r.targetScore,
        }));
      }
      navigate(`/exam/result/${id}`);
    } catch (e: any) {
      setIsGrading(false);
      setPageStatus("ready");
      setErrorMsg(e?.response?.data?.error || "Yakunlashda xatolik");
    }
  };

  const doAbandon = async () => {
    if (!id) return;
    setConfirmModal(null);
    try {
      disconnect();
    } catch {
      // ignore
    }
    await voiceExamService.abandon(id).catch(() => {});
    navigate("/exam");
  };

  const statusLabel = useMemo(() => {
    if (liveStatus === "connecting") return "Ulanyapti...";
    if (liveStatus === "speaking" || aiLevel > 0.02) return "Mijoz gapiryapti...";
    if (micLevel > 0.04) return "Tinglayapman...";
    if (muted) return "Mikrofon o'chirilgan";
    return "Gapirib boshlang";
  }, [liveStatus, aiLevel, micLevel, muted]);

  const genderEmoji = clientInfo.gender === "female" ? "F" : clientInfo.gender === "male" ? "M" : "";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-purple-950 text-white relative overflow-hidden">
      {/* Background blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full bg-purple-600/20 blur-[120px]" />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] rounded-full bg-cyan-500/10 blur-[100px]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 px-4 pt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => setConfirmModal("abandon")}
          className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center transition-all duration-300"
          aria-label="Chiqish"
        >
          <X size={18} className="text-white/80" />
        </button>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          {scenario && (
            <div className="px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 text-xs font-medium flex items-center gap-1.5">
              <Sparkles size={12} className="text-violet-300" />
              <span>{scenario.name}</span>
            </div>
          )}
          {clientInfo.name && (
            <div className="px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 text-xs font-medium flex items-center gap-1.5">
              <span className="opacity-60">{genderEmoji}</span>
              <span>
                {clientInfo.name}
                {clientInfo.age ? `, ${clientInfo.age}` : ""}
              </span>
            </div>
          )}
          <div className="px-3 py-1.5 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 text-xs font-mono tracking-wide">
            {formatTime(elapsedMs)}
          </div>
        </div>

        <button
          onClick={() => setConfirmModal("finish")}
          disabled={mySalespersonTurns < 1 || isGrading}
          className="px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500/20 to-emerald-400/20 hover:from-emerald-500/30 hover:to-emerald-400/30 border border-emerald-400/30 text-emerald-200 text-xs font-semibold backdrop-blur-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
        >
          Yakunlash
        </button>
      </header>

      {/* Center: Sphere */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-8 pb-4">
        <div className="w-full max-w-[520px]">
          <VoiceSphere
            aiLevel={aiLevel}
            micLevel={micLevel}
            frequencyData={frequencyData}
            status={sphereStatus}
          />
        </div>

        <div className="mt-2 text-center">
          <div className="text-lg md:text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-cyan-300 to-violet-300">
            {statusLabel}
          </div>
          <div className="text-xs text-white/40 mt-1">{mySalespersonTurns} ta javob</div>
        </div>

        {/* Google Meet uslubidagi audio bars — manager ovozi ritmiga qarab harakatlanadi */}
        <div className="mt-4 w-full max-w-md">
          <AudioBars
            frequencyData={frequencyData}
            level={Math.max(micLevel, aiLevel)}
            active={!muted}
            color={liveStatus === "speaking" || aiLevel > 0.02 ? "#a78bfa" : "#22d3ee"}
            height={50}
            bars={32}
          />
        </div>
      </main>

      {/* Transcript */}
      <section className="relative z-10 px-2 pb-32">
        <TranscriptStream
          messages={allMessages}
          pendingUser={lastUserText}
          pendingAi={lastAiText}
        />
      </section>

      {/* Bottom bar */}
      <footer className="fixed bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-3 bg-gradient-to-t from-slate-950/90 to-transparent backdrop-blur-sm">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center border backdrop-blur-xl transition-all duration-300 ${
              muted
                ? "bg-red-500/20 border-red-400/40 text-red-200 hover:bg-red-500/30"
                : "bg-white/5 border-white/10 text-white hover:bg-white/10"
            }`}
            aria-label={muted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
          >
            {muted ? <MicOff size={22} /> : <Mic size={22} />}
          </button>

          <button
            onClick={() => setConfirmModal("finish")}
            disabled={mySalespersonTurns < 1 || isGrading}
            className="flex-1 max-w-xs flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-400 hover:to-pink-400 text-white font-semibold shadow-lg shadow-pink-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300"
          >
            <PhoneOff size={18} />
            Tugatish
          </button>

          <div className="w-14 h-14" />
        </div>
      </footer>

      {/* Grading overlay */}
      {isGrading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="rounded-3xl shadow-2xl max-w-sm w-full p-8 bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="flex flex-col items-center text-center gap-4">
              <Loader2 size={40} className="animate-spin text-violet-300" />
              <h3 className="text-lg font-semibold">Tahlil qilinmoqda...</h3>
              <p className="text-sm text-white/60">
                AI suhbatingizni baholamoqda. Bu 10-20 sekund vaqt olishi mumkin.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Confirm modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="rounded-3xl shadow-2xl max-w-sm w-full p-6 bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="flex flex-col items-center text-center gap-3">
              {confirmModal === "finish" ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                    <CheckCircle2 size={24} className="text-emerald-300" />
                  </div>
                  <h3 className="text-lg font-semibold">Imtihonni yakunlash</h3>
                  <p className="text-sm text-white/60">Natija AI tomonidan baholanadi</p>
                  <div className="flex gap-3 mt-2 w-full">
                    <button
                      onClick={() => setConfirmModal(null)}
                      className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition-all"
                    >
                      Bekor qilish
                    </button>
                    <button
                      onClick={doFinish}
                      className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-emerald-500 to-emerald-400 text-white hover:from-emerald-400 hover:to-emerald-300 transition-all"
                    >
                      Yakunlash
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-400/30 flex items-center justify-center">
                    <AlertTriangle size={24} className="text-rose-300" />
                  </div>
                  <h3 className="text-lg font-semibold">Imtihondan chiqish</h3>
                  <p className="text-sm text-white/60">Natija saqlanmaydi</p>
                  <div className="flex gap-3 mt-2 w-full">
                    <button
                      onClick={() => setConfirmModal(null)}
                      className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition-all"
                    >
                      Ortga
                    </button>
                    <button
                      onClick={doAbandon}
                      className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-400 hover:to-pink-400 transition-all"
                    >
                      Chiqish
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)]">
          <div className="rounded-2xl bg-amber-500/15 backdrop-blur-xl border border-amber-400/30 px-4 py-3 flex items-start gap-3 shadow-lg">
            <AlertTriangle size={18} className="text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-amber-100">{errorMsg}</div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-amber-200 hover:text-white transition-colors"
              aria-label="Yopish"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamSessionPage;
