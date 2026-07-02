import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Mic,
  MicOff,
  X,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Send,
} from "lucide-react";
import { voiceExamService } from "../../services/voice-exam.service";
import { MicCheck } from "../../components/exam/MicCheck";
import { useGeminiLiveExam } from "../../hooks/useGeminiLiveExam";

const MIC_ID_KEY = "exam-mic-id";

interface ChatMsg {
  role: "salesperson" | "client";
  text: string;
  ts: number;
}

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
  const [initialMessages, setInitialMessages] = useState<ChatMsg[]>([]);
  const [pageStatus, setPageStatus] = useState<"loading" | "ready" | "ended">("loading");
  const [confirmModal, setConfirmModal] = useState<"finish" | "abandon" | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Mikrofon tekshiruvi: imtihon faqat mikrofon tasdiqlangandan keyin boshlanadi.
  const [micConfirmed, setMicConfirmed] = useState(false);
  const [selectedMicId, setSelectedMicId] = useState<string | undefined>(
    () => localStorage.getItem(MIC_ID_KEY) || undefined
  );
  const [chatText, setChatText] = useState("");
  const [awaitingClientReply, setAwaitingClientReply] = useState(false);

  const startedAtRef = useRef<number>(Date.now());
  const autoFinishedRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

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
          if (Array.isArray(r.messages)) {
            setInitialMessages(
              (r.messages as ChatMsg[]).map((m) => ({
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
    lastUserText,
    lastAiText,
    messages: liveMessages,
    error: liveError,
    muted,
    micSilent,
    sendText,
    toggleMute,
    disconnect,
  } = useGeminiLiveExam({
    sessionId: id,
    enabled: pageStatus === "ready" && micConfirmed,
    deviceId: selectedMicId,
  });

  // Timer — faqat mikrofon tasdiqlanib, imtihon haqiqatan boshlangach
  useEffect(() => {
    if (pageStatus !== "ready" || !micConfirmed) return;
    startedAtRef.current = Date.now();
    const it = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 500);
    return () => clearInterval(it);
  }, [pageStatus, micConfirmed]);

  const handleMicConfirm = (deviceId: string | undefined) => {
    if (deviceId) localStorage.setItem(MIC_ID_KEY, deviceId);
    setSelectedMicId(deviceId);
    setMicConfirmed(true);
  };

  const handleMicCancel = () => {
    navigate("/exam");
  };

  // Imtihon davomida mikrofonni qayta tanlash — ulanishni uzib, tekshiruvni qayta ochamiz
  const reopenMicCheck = () => {
    try { disconnect(); } catch { /* noop */ }
    setMicConfirmed(false);
  };

  // Chat (matn) javobini yuborish
  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = chatText.trim();
    if (!t || liveStatus === "connecting") return;
    sendText(t);
    setAwaitingClientReply(true);
    setChatText("");
  };

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
  useEffect(() => {
    if (lastUserText || lastAiText) {
      setAwaitingClientReply(true);
    }
  }, [lastUserText, lastAiText]);

  useEffect(() => {
    const latest = liveMessages[liveMessages.length - 1];
    if (latest?.role === "client") {
      setAwaitingClientReply(false);
    }
  }, [liveMessages]);

  const allMessages: ChatMsg[] = useMemo(() => {
    return [...initialMessages, ...liveMessages];
  }, [initialMessages, liveMessages]);

  // Yangi xabar / yozilayotgan matnda pastga scroll
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [allMessages.length, lastUserText, lastAiText, awaitingClientReply]);

  const mySalespersonTurns = allMessages.filter((m) => m.role === "salesperson").length;
  const showClientDraft = Boolean(lastAiText) || awaitingClientReply;

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

  const genderEmoji = clientInfo.gender === "female" ? "👩" : clientInfo.gender === "male" ? "👨" : "🧑";

  return (
    <div
      className="h-screen h-[100dvh] flex flex-col relative overflow-hidden"
      style={{ backgroundColor: "var(--color-primary-bg)", color: "var(--text-primary)" }}
    >
      {/* Top bar — qotib turadi (sticky) */}
      <header className="relative z-10 px-4 pt-4 pb-3 flex items-center justify-between gap-3 flex-shrink-0 border-b border-[var(--color-border)]"
        style={{ backgroundColor: "var(--color-primary-bg)" }}
      >
        <button
          onClick={() => setConfirmModal("abandon")}
          className="w-9 h-9 rounded-full hover:bg-accent/10 flex items-center justify-center transition-all duration-200"
          aria-label="Chiqish"
        >
          <X size={20} className="text-secondary" />
        </button>

        <div className="flex flex-col items-center text-center min-w-0">
          <div className="text-sm font-semibold truncate max-w-[60vw]">
            {scenario?.name || "Imtihon"}
          </div>
          <div className="text-[11px] text-secondary flex items-center gap-1.5 mt-0.5 flex-wrap justify-center">
            {clientInfo.name && (
              <span>
                {genderEmoji} {clientInfo.name}
                {clientInfo.age ? `, ${clientInfo.age}` : ""}
              </span>
            )}
            <span className="opacity-50">·</span>
            <span>{mySalespersonTurns} ta javob</span>
            <span className="opacity-50">·</span>
            <span className="font-mono">{formatTime(elapsedMs)}</span>
          </div>
        </div>

        <button
          onClick={() => setConfirmModal("finish")}
          disabled={mySalespersonTurns < 1 || isGrading}
          className="px-3 py-1.5 rounded-full text-emerald-400 hover:bg-emerald-400/10 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
        >
          Yakunlash
        </button>
      </header>

      {/* Chat thread — faqat shu qism scroll bo'ladi */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto px-4 pb-4" style={{ scrollbarWidth: "thin" }}>
        <div className="max-w-2xl mx-auto space-y-3 py-2">
          {allMessages.length === 0 && pageStatus === "ready" && !lastUserText && !lastAiText && (
            <div className="text-center text-secondary text-sm py-10">
              {liveStatus === "connecting"
                ? "Ulanmoqda..."
                : "Mijoz bilan suhbatni boshlash uchun gapiring yoki javob yozing."}
            </div>
          )}

          {allMessages.map((m, i) => {
            const mine = m.role === "salesperson";
            return (
              <div key={i} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] min-w-0 flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  <span className="text-[10px] uppercase tracking-wide text-secondary mb-1 px-1">
                    {mine ? "Siz" : clientInfo.name || "Mijoz"}
                  </span>
                  <div
                    className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-lg whitespace-pre-wrap break-words ${
                      mine
                        ? "bg-gradient-to-br from-violet-500 to-indigo-500 text-white rounded-br-md"
                        : "bg-[var(--color-card-bg)] border border-[var(--color-border)] text-[var(--text-primary)] rounded-bl-md"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Siz hozir gapirayotgan (jonli STT) */}
          {lastUserText && (
            <div className="flex justify-end">
              <div className="max-w-[80%] min-w-0 flex flex-col items-end">
                <span className="text-[10px] uppercase tracking-wide text-secondary mb-1 px-1">Siz</span>
                <div className="px-4 py-2.5 rounded-2xl rounded-br-md text-sm leading-relaxed shadow-lg whitespace-pre-wrap break-words bg-gradient-to-br from-violet-500/70 to-indigo-500/70 text-white">
                  {lastUserText}
                </div>
              </div>
            </div>
          )}

          {/* Mijoz javobi: jonli matn yoki "yozmoqda" indikatori */}
          {showClientDraft && (
            <div className="flex justify-start">
              <div className="max-w-[80%] flex flex-col items-start">
                <span className="text-[10px] uppercase tracking-wide text-secondary mb-1 px-1">
                  {clientInfo.name || "Mijoz"}
                </span>
                <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-[var(--color-card-bg)] border border-[var(--color-border)] text-sm leading-relaxed whitespace-pre-wrap break-words">
                  {lastAiText ? (
                    lastAiText
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 rounded-full bg-secondary animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      {/* Bottom bar — qotib turadi (sticky) */}
      <footer
        className="relative z-20 px-4 pb-6 pt-3 flex-shrink-0 border-t border-[var(--color-border)]"
        style={{ backgroundColor: "var(--color-primary-bg)" }}
      >
        <form onSubmit={handleSendText} className="max-w-2xl mx-auto flex items-center gap-2">
          {/* Mikrofon yoqish/o'chirish (realtime — mute) */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={isGrading}
            className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 disabled:opacity-40 ${
              muted
                ? "bg-red-500/20 border border-red-400/40 text-red-300 hover:bg-red-500/30"
                : "bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/40"
            }`}
            aria-label={muted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
            title={muted ? "Mikrofonni yoqish" : "Mikrofonni o'chirish"}
          >
            {muted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Matn (chat) input */}
          <input
            type="text"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            placeholder="Mijozga javob yozing..."
            disabled={isGrading}
            className="flex-1 h-12 px-4 rounded-2xl text-sm bg-[var(--color-card-bg)] border border-[var(--color-border)] text-[var(--text-primary)] placeholder:text-secondary outline-none focus:border-indigo-400 disabled:opacity-50 transition-all"
          />

          {/* Yuborish */}
          <button
            type="submit"
            disabled={!chatText.trim() || liveStatus === "connecting" || isGrading}
            className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-500 text-white hover:from-violet-400 hover:to-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 shadow-lg shadow-indigo-500/40"
            aria-label="Yuborish"
          >
            <Send size={20} />
          </button>
        </form>
      </footer>

      {/* Mikrofon tekshiruvi — imtihon boshlanishidan oldin */}
      {pageStatus === "ready" && !micConfirmed && (
        <MicCheck
          initialDeviceId={selectedMicId}
          onConfirm={handleMicConfirm}
          onCancel={handleMicCancel}
        />
      )}

      {/* Imtihon davomida jimlik aniqlansa — qurilma muammosi ogohlantirishi */}
      {micConfirmed && micSilent && !muted && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)]">
          <div className="rounded-2xl bg-rose-500/15 backdrop-blur-xl border border-rose-400/30 px-4 py-3 flex items-start gap-3 shadow-lg">
            <AlertTriangle size={18} className="text-rose-300 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-rose-100">
              Mikrofondan ovoz kelmayapti. Gapirayotganingizga ishonch hosil qiling, yoki yozib davom eting / boshqa mikrofon tanlang.
            </div>
            <button
              onClick={reopenMicCheck}
              className="text-xs font-semibold px-2.5 py-1 rounded-full bg-rose-400/20 border border-rose-300/30 text-rose-100 hover:bg-rose-400/30 transition-colors whitespace-nowrap"
            >
              Mikrofon tanlash
            </button>
          </div>
        </div>
      )}

      {/* Grading overlay */}
      {isGrading && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="rounded-3xl shadow-2xl max-w-sm w-full p-8 bg-white/5 backdrop-blur-xl border border-white/10">
            <div className="flex flex-col items-center text-center gap-4">
              <Loader2 size={40} className="animate-spin text-violet-300" />
              <h3 className="text-lg font-semibold text-white">Tahlil qilinmoqda...</h3>
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
          <div className="rounded-3xl shadow-2xl max-w-sm w-full p-6 bg-white/5 backdrop-blur-xl border border-white/10 text-white">
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
