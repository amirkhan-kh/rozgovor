import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Mic, MicOff, Loader2, Sparkles, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import Card from "../../components/ui/Card";
import {
  agentsService,
  TrainerScenario,
  TrainerResult,
} from "../../services/agents.service";
import CoachingMarkdown from "../../components/coaching/CoachingMarkdown";

/**
 * Practice Mode — menejer ovoz bilan mashq qiladi.
 * 1. Ssenariy tanlash
 * 2. Mikrofonni yoqib javob aytish
 * 3. Audio backend'ga yuboriladi → Yandex STT → Flash eval → Pro feedback
 * 4. Natija chiqadi, qayta urinish mumkin
 */
const PracticePage: React.FC = () => {
  const { managerId } = useParams<{ managerId: string }>();
  const navigate = useNavigate();

  const [scenarios, setScenarios] = useState<TrainerScenario[]>([]);
  const [isDynamic, setIsDynamic] = useState(false);
  const [selected, setSelected] = useState<TrainerScenario | null>(null);
  const [result, setResult] = useState<TrainerResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(1);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    (async () => {
      try {
        if (managerId) {
          // Avval Strategist asosidagi ssenariylarni so'rash
          const r = await agentsService.getStrategyBasedScenarios(managerId);
          setScenarios(r.scenarios);
          setIsDynamic(r.dynamic);
        } else {
          const list = await agentsService.getTrainerScenarios();
          setScenarios(list);
          setIsDynamic(false);
        }
      } catch {
        try {
          const list = await agentsService.getTrainerScenarios();
          setScenarios(list);
        } catch {
          toast.error("Ssenariylar yuklanmadi");
        }
      }
    })();
  }, [managerId]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        await sendAudio(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err: any) {
      toast.error("Mikrofon ruxsati kerak");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const sendAudio = async (blob: Blob) => {
    if (!managerId || !selected) return;
    setLoading(true);
    try {
      // Blob → base64
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const audioBase64 = btoa(binary);

      // Dinamik ssenariylar (dynamic-* / custom-* / auto-*) DB'da saqlanmaydi —
      // ular uchun to'liq obyektni backend'ga yuboramiz.
      const isCustom =
        isDynamic ||
        selected.id.startsWith("dynamic-") ||
        selected.id.startsWith("custom-") ||
        selected.id.startsWith("auto-");

      const res = await agentsService.submitPractice(managerId, {
        scenarioId: selected.id,
        audioBase64,
        fileName: `practice-${Date.now()}.webm`,
        attemptNumber,
        ...(isCustom && {
          customScenario: {
            title: selected.title,
            category: selected.category,
            difficulty: selected.difficulty,
            prompt: selected.prompt,
            idealResponse: selected.idealResponse,
          },
        }),
      });
      setResult(res);
      toast.success(`Baholandi: ${res.evaluation.score}/100`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Baholash xatolik");
    } finally {
      setLoading(false);
    }
  };

  const tryAgain = () => {
    setResult(null);
    setAttemptNumber((n) => n + 1);
  };

  const changeScenario = () => {
    setSelected(null);
    setResult(null);
    setAttemptNumber(1);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <button
        onClick={() => {
          if (selected || result) {
            // Senariy ichidasiz — ro'yxatga qaytish
            setSelected(null);
            setResult(null);
            setAttemptNumber(1);
          } else {
            navigate(-1);
          }
        }}
        className="flex items-center gap-2 text-sm text-secondary hover:text-primary"
      >
        <ChevronLeft size={16} />
        {selected || result ? "Ssenariylar ro'yxatiga qaytish" : "Orqaga"}
      </button>

      <div>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          🎓 Amaliyot rejimi
        </h1>
        <p className="text-sm text-secondary mt-1">
          Trainer ssenariy beradi, siz ovoz bilan javob berasiz. AI tonni, texnikani va mazmunni baholaydi.
        </p>
      </div>

      {/* Ssenariy tanlash */}
      {!selected && (
        <Card title={isDynamic ? "🧭 Haftalik strategiyangizdan ssenariylar" : "Ssenariy tanlang"}>
          {isDynamic && (
            <p className="text-xs text-secondary mb-3">
              Bu ssenariylar Strategist Agent tomonidan sizning haftalik diqqat joylaringizga mos ravishda tanlandi.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className="text-left p-4 rounded-xl transition-colors hover:shadow-md"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-bg-secondary)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded"
                    style={{
                      background:
                        s.difficulty === "easy"
                          ? "rgba(47,204,110,0.15)"
                          : s.difficulty === "medium"
                          ? "rgba(230,160,32,0.15)"
                          : "rgba(230,69,69,0.15)",
                      color:
                        s.difficulty === "easy"
                          ? "#2fcc6e"
                          : s.difficulty === "medium"
                          ? "#e6a020"
                          : "#e64545",
                    }}
                  >
                    {s.difficulty}
                  </span>
                  <span className="text-[10px] text-secondary">{s.category}</span>
                </div>
                <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                  {s.title}
                </p>
                <p className="text-xs text-secondary line-clamp-2">{s.prompt}</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Yozish sahifasi */}
      {selected && !result && (
        <Card>
          <div className="space-y-4">
            <div className="p-4 rounded-xl" style={{ background: "rgba(59,94,245,0.08)" }}>
              <p className="text-xs font-bold text-secondary uppercase mb-1">Mijoz:</p>
              <p className="text-base font-medium italic" style={{ color: "var(--text-primary)" }}>
                "{selected.prompt}"
              </p>
            </div>

            <div className="text-center py-8">
              {!recording && !loading && (
                <button
                  onClick={startRecording}
                  className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl font-semibold text-base transition-transform hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #e64545, #f59e0b)",
                    color: "#ffffff",
                  }}
                >
                  <Mic size={22} />
                  Yozishni boshlash
                </button>
              )}
              {recording && (
                <button
                  onClick={stopRecording}
                  className="inline-flex items-center gap-3 px-6 py-4 rounded-2xl font-semibold text-base animate-pulse"
                  style={{ background: "#e64545", color: "#ffffff" }}
                >
                  <MicOff size={22} />
                  To'xtatish va yuborish
                </button>
              )}
              {loading && (
                <div className="inline-flex items-center gap-2 text-sm text-secondary">
                  <Loader2 size={18} className="animate-spin" />
                  Audio baholanmoqda...
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-secondary">
              <span>Urinish: {attemptNumber}</span>
              <button onClick={changeScenario} className="underline hover:text-primary">
                Boshqa ssenariy tanlash
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Natija */}
      {result && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={18} style={{ color: "#3b5ef5" }} />
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                  Baholash natijasi
                </span>
              </div>
              <div
                className="px-3 py-1 rounded-full font-bold text-sm"
                style={{
                  background:
                    result.evaluation.score >= 75
                      ? "rgba(47,204,110,0.15)"
                      : result.evaluation.score >= 50
                      ? "rgba(230,160,32,0.15)"
                      : "rgba(230,69,69,0.15)",
                  color:
                    result.evaluation.score >= 75
                      ? "#2fcc6e"
                      : result.evaluation.score >= 50
                      ? "#e6a020"
                      : "#e64545",
                }}
              >
                {result.evaluation.score}/100
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Ton", value: result.evaluation.tone },
                { label: "Tezlik", value: result.evaluation.speed },
                { label: "Texnika", value: result.evaluation.technique },
                { label: "Kontent", value: result.evaluation.content },
              ].map((m) => (
                <div
                  key={m.label}
                  className="p-3 rounded-lg text-center"
                  style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}
                >
                  <p className="text-[10px] text-secondary uppercase">{m.label}</p>
                  <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                    {m.value}
                  </p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-bold text-secondary uppercase mb-2">Siz aytdingiz:</p>
              <div
                className="p-3 rounded-lg text-sm italic"
                style={{
                  background: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border)",
                  color: "var(--text-primary)",
                }}
              >
                "{result.userTranscript}"
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-secondary uppercase mb-2">Ustoz feedback:</p>
              <div
                className="p-4 rounded-xl"
                style={{ background: "var(--color-bg-secondary)", border: "1px solid var(--color-border)" }}
              >
                <CoachingMarkdown text={result.feedback} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={tryAgain}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                style={{
                  background: "linear-gradient(135deg, #3b5ef5, #8b5cf6)",
                  color: "#ffffff",
                }}
              >
                <RotateCcw size={16} />
                Qayta urinib ko'rish
              </button>
              <button
                onClick={changeScenario}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ border: "1px solid var(--color-border)", color: "var(--text-secondary)" }}
              >
                Boshqa ssenariy
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default PracticePage;
