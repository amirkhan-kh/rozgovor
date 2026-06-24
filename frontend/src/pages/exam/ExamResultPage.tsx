import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trophy, AlertCircle, CheckCircle, BookOpen, Lightbulb, Target, RefreshCw, XCircle } from "lucide-react";
import { voiceExamService, ExamResult } from "../../services/voice-exam.service";

type ExamOutcomeData = {
  examOutcome: "passed" | "failed" | "retry";
  attemptsLeft: number;
  targetScore: number | null;
};

const ExamResultPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcomeData, setOutcomeData] = useState<ExamOutcomeData | null>(null);

  useEffect(() => {
    if (!id) return;
    const stored = sessionStorage.getItem(`exam-outcome-${id}`);
    if (stored) {
      try { setOutcomeData(JSON.parse(stored)); } catch { /* ignore */ }
    }
    voiceExamService
      .getResult(id)
      .then((r) => setResult(r as any))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-40 bg-gray-200 rounded"></div>
          <div className="h-40 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (!result || result.status !== "completed") {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Natija mavjud emas</p>
        <button onClick={() => navigate("/exam")} className="mt-4 text-blue-500">
          Imtihonga qaytish
        </button>
      </div>
    );
  }

  const score = result.overallScore || 0;
  const scoreColor = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";
  const scoreLabel =
    score >= 90 ? "A'lo" : score >= 80 ? "Yaxshi" : score >= 60 ? "O'rtacha" : "Kuchaytirish kerak";

  const criteriaEntries = Object.entries(result.criteria || {});

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <button
        onClick={() => navigate("/exam")}
        className="flex items-center gap-2 text-sm text-gray-500 mb-4 hover:text-blue-500"
      >
        <ArrowLeft size={16} /> Imtihonga qaytish
      </button>

      {/* Standart natijasi — pass/fail/retry banner */}
      {outcomeData && outcomeData.targetScore != null && (
        <div
          className="p-4 rounded-xl border-2 mb-4 flex items-start gap-3"
          style={{
            borderColor:
              outcomeData.examOutcome === "passed" ? "#10b981" :
              outcomeData.examOutcome === "failed" ? "#ef4444" : "#f59e0b",
            backgroundColor:
              outcomeData.examOutcome === "passed" ? "rgba(16,185,129,0.08)" :
              outcomeData.examOutcome === "failed" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)",
          }}
        >
          {outcomeData.examOutcome === "passed" ? (
            <CheckCircle size={24} className="flex-shrink-0 text-green-500 mt-0.5" />
          ) : outcomeData.examOutcome === "failed" ? (
            <XCircle size={24} className="flex-shrink-0 text-red-500 mt-0.5" />
          ) : (
            <RefreshCw size={24} className="flex-shrink-0 text-amber-500 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="font-semibold text-base mb-0.5">
              {outcomeData.examOutcome === "passed" && "Maqsad bajarildi"}
              {outcomeData.examOutcome === "failed" && "Imkoniyatlar tugadi"}
              {outcomeData.examOutcome === "retry" && "Yana urinish bor"}
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300">
              {outcomeData.examOutcome === "passed" && (
                <>Standart {outcomeData.targetScore} balldan topdingiz. Tayinlangan imtihon yakunlandi.</>
              )}
              {outcomeData.examOutcome === "failed" && (
                <>Urinishlar tugadi, {outcomeData.targetScore} ball topilmadi. Rahbar yangi imtihon tayinlashi kerak.</>
              )}
              {outcomeData.examOutcome === "retry" && (
                <>Maqsad: <strong>{outcomeData.targetScore} ball</strong>. Yana <strong>{outcomeData.attemptsLeft} ta urinish</strong> qoldi.</>
              )}
            </div>
            {outcomeData.examOutcome === "retry" && (
              <button
                onClick={() => navigate("/exam")}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline"
              >
                <Target size={12} /> Yana urinish
              </button>
            )}
          </div>
        </div>
      )}

      {/* Overall score */}
      <div
        className="p-6 rounded-2xl border mb-6 text-center"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
      >
        <Trophy size={32} className="mx-auto mb-2" style={{ color: scoreColor }} />
        <div className="text-5xl md:text-6xl font-bold mb-1" style={{ color: scoreColor }}>
          {score}
          <span className="text-2xl text-gray-400">/100</span>
        </div>
        <div className="text-sm font-medium" style={{ color: scoreColor }}>
          {scoreLabel}
        </div>
        {result.summary && <p className="text-sm text-gray-500 mt-3 max-w-lg mx-auto">{result.summary}</p>}
      </div>

      {/* Criteria breakdown */}
      {criteriaEntries.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Mezonlar bo'yicha ballar</h2>
          <div className="space-y-3">
            {criteriaEntries.map(([name, v]) => {
              const s = v.score || 0;
              const color = s >= 80 ? "#10b981" : s >= 60 ? "#f59e0b" : "#ef4444";
              return (
                <div
                  key={name}
                  className="p-3 rounded-xl border"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-sm font-bold" style={{ color }}>
                      {s}/100
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div className="h-full rounded-full" style={{ width: `${s}%`, backgroundColor: color }} />
                  </div>
                  {v.comment && <p className="text-xs text-gray-500">{v.comment}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Win points */}
      {result.winPoints && result.winPoints.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-green-600">
            <CheckCircle size={18} /> Yaxshi tomonlar
          </h2>
          <div className="space-y-2">
            {result.winPoints.map((w, i) => (
              <div
                key={i}
                className="p-3 rounded-xl border-l-4 border-green-500 bg-green-50 dark:bg-green-900/20"
              >
                <p className="text-sm">{w.description}</p>
                {w.bookRef && <p className="text-xs text-gray-500 mt-1">📖 {w.bookRef}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {result.errors && result.errors.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-red-600">
            <AlertCircle size={18} /> Xatolar
          </h2>
          <div className="space-y-2">
            {result.errors.map((e, i) => (
              <div
                key={i}
                className="p-3 rounded-xl border-l-4 border-red-500 bg-red-50 dark:bg-red-900/20"
              >
                <div className="font-medium text-sm">{e.type}</div>
                <p className="text-sm text-gray-600 mt-1">{e.description}</p>
                {e.bookRef && <p className="text-xs text-gray-500 mt-1">📖 {e.bookRef}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coaching */}
      {result.coaching && result.coaching.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-blue-600">
            <Lightbulb size={18} /> Maslahatlar (Kitobdan)
          </h2>
          <div className="space-y-3">
            {result.coaching.map((c, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
              >
                <div className="flex items-start gap-2 mb-2">
                  <BookOpen size={14} className="mt-0.5 text-blue-500 flex-shrink-0" />
                  <div className="text-xs font-semibold text-blue-600">{c.bookChapter}</div>
                </div>
                <div className="mb-2">
                  <div className="text-xs text-gray-500 mb-0.5">Xato:</div>
                  <div className="text-sm">{c.mistake}</div>
                </div>
                <div className="mb-2">
                  <div className="text-xs text-gray-500 mb-0.5">Qanday qilish kerak edi:</div>
                  <div className="text-sm">{c.advice}</div>
                </div>
                {c.bookQuote && (
                  <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-2 border-blue-400">
                    <div className="text-xs italic text-gray-600">"{c.bookQuote}"</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {result.messages && result.messages.length > 0 && (
        <details className="mb-6">
          <summary className="text-sm font-semibold cursor-pointer mb-3">Suhbat matni</summary>
          <div className="space-y-2 mt-3">
            {result.messages.map((m, i) => (
              <div
                key={i}
                className={`p-2 rounded-lg text-sm ${
                  m.role === "salesperson" ? "bg-blue-50 dark:bg-blue-900/20" : "bg-gray-50 dark:bg-gray-800/50"
                }`}
              >
                <div className="text-xs text-gray-500 mb-0.5">
                  {m.role === "salesperson" ? "Siz" : "Mijoz"}
                </div>
                {m.text}
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => navigate("/exam")}
          className="flex-1 py-3 rounded-xl border text-sm font-medium transition-colors hover:opacity-80"
          style={{ borderColor: "var(--color-border)", color: "var(--text-primary)" }}
        >
          Imtihon ro'yxati
        </button>
        <button
          onClick={() => navigate("/exam")}
          className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Yana bir marta
        </button>
      </div>
    </div>
  );
};

export default ExamResultPage;
