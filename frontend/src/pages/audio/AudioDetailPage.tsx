import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, FileText, Trash2, Zap, AlertTriangle, CheckCircle, TrendingUp, User, Phone, ChevronDown } from "lucide-react";
import type { CoachingInsights } from "../../types";
import {
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { SkeletonDetail } from "../../components/ui/Skeleton";
import AIChat from "../../components/audio/AIChat";
import ObjectionsAccordion from "../../components/audio/ObjectionsAccordion";
import { audioService } from "../../services/audio.service";
import { useAuth } from "../../store/authStore";

const parseTimeToSeconds = (timeStr: string): number => {
  if (!timeStr) return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseInt(timeStr, 10) || 0;
};


/**
 * Matn ichidagi [MM:SS] yoki [HH:MM:SS] timestamp'larni
 * bosiladigan tugmalarga almashtiradi.
 * Matnni alohida segmentlarga bo'ladi: text + tsButton + text + tsButton + ...
 */
const TimestampText: React.FC<{ text: string; onJump: (seconds: number) => void }> = ({ text, onJump }) => {
  const regex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;
  const parts: Array<{ type: "text" | "ts"; content: string }> = [];
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    parts.push({ type: "ts", content: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return (
    <>
      {parts.map((p, i) =>
        p.type === "ts" ? (
          <button
            key={i}
            onClick={() => onJump(parseTimeToSeconds(p.content))}
            className="inline-flex items-center gap-0.5 mx-0.5 px-1.5 py-0.5 rounded text-xs font-mono transition-all hover:shadow-md"
            style={{
              backgroundColor: "rgba(59,94,245,0.15)",
              color: "#3b5ef5",
            }}
            title="Audio shu vaqtga o'tadi"
          >
            [{p.content}] ▶
          </button>
        ) : (
          <span key={i}>{p.content}</span>
        )
      )}
    </>
  );
};

const scoreColor = (score: number): string => {
  if (score >= 80) return "#2fcc6e";
  if (score >= 60) return "#e6a020";
  if (score >= 40) return "#d97706";
  return "#e64545";
};

const SPEECH_COLORS = ["#3b5ef5", "#7c7c9a"];

const SectionHeader: React.FC<{ title: string; first?: boolean }> = ({ title, first }) => (
  <div
    className={first ? "mt-2 mb-1" : "mt-6 pt-8 mb-1"}
    style={first ? undefined : { borderTop: "2px solid var(--ds-border-default, var(--color-border))" }}
  >
    <h2
      className="text-xl md:text-2xl font-bold"
      style={{ color: "var(--ds-text-primary, var(--text-primary))" }}
    >
      {title}
    </h2>
  </div>
);

// ─── Coaching Insights Block ──────────────────────────────────────────────

const riskColor = (score: number) => {
  if (score >= 70) return "#2fcc6e";
  if (score >= 40) return "#e6a020";
  return "#e64545";
};

const CoachingInsightsBlock: React.FC<{ insights: CoachingInsights; audioId: string }> = ({ insights, audioId }) => {
  const navigate = useNavigate();
  const hasAlerts = insights.speechRatioAlert || insights.openEnding || insights.surrenderedObjections > 0;
  const hasMoments = insights.criticalMoments?.length > 0;

  const jumpTo = (timestamp: string) => {
    const seconds = parseTimeToSeconds(timestamp);
    navigate(`/audio/${audioId}/transcription?t=${seconds}`);
  };

  const riskC = riskColor(insights.dealRiskScore);
  return (
    <Card title="🎯 Coaching — Keyingi qo'ng'iroq uchun">
      <div className="space-y-3 sm:space-y-4">
        {/* Deal Risk Score — gradient hero strip */}
        <div
          className="relative rounded-xl p-3 sm:p-4 overflow-hidden transition-transform hover:-translate-y-0.5"
          style={{
            background: `linear-gradient(135deg, ${riskC}1a, ${riskC}05)`,
            border: `1px solid ${riskC}40`,
            boxShadow: `0 4px 14px -8px ${riskC}50`,
          }}
        >
          <span
            className="absolute top-0 left-0 right-0 h-0.5"
            style={{ background: `linear-gradient(90deg, transparent, ${riskC}, transparent)` }}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp size={18} style={{ color: riskC }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Lead qaytish ehtimoli
              </span>
            </div>
            <span className="text-2xl sm:text-3xl font-black leading-none" style={{ color: riskC }}>
              {insights.dealRiskScore}%
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${riskC}1a` }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${insights.dealRiskScore}%`, background: `linear-gradient(90deg, ${riskC}cc, ${riskC})` }}
            />
          </div>
        </div>

        {/* Alerts */}
        {hasAlerts && (
          <div className="space-y-2">
            {insights.speechRatioAlert && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg, rgba(230,100,69,0.12), rgba(230,100,69,0.04))", border: "1px solid rgba(230,100,69,0.35)" }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "#e64545" }} />
                <span className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  Menejer haddan ko'p gapirdi — mijoz eshitilmayapti. Savollar bering.
                </span>
              </div>
            )}
            {insights.openEnding && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg, rgba(230,100,69,0.12), rgba(230,100,69,0.04))", border: "1px solid rgba(230,100,69,0.35)" }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "#e64545" }} />
                <span className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  Keyingi qadam belgilanmadi — lead sovib qolishi mumkin.
                </span>
              </div>
            )}
            {insights.surrenderedObjections > 0 && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl transition-transform hover:-translate-y-0.5" style={{ background: "linear-gradient(135deg, rgba(230,160,32,0.12), rgba(230,160,32,0.04))", border: "1px solid rgba(230,160,32,0.35)" }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "#e6a020" }} />
                <span className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                  {insights.surrenderedObjections} ta e'tirozda taslim bo'lindi — javob bermasdan o'tib ketildi.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Critical Moments */}
        {hasMoments && (
          <div className="space-y-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--ds-text-muted)" }}>
              Muhim momentlar
            </p>
            {insights.criticalMoments.map((moment, i) => (
              <div
                key={i}
                className="relative rounded-xl overflow-hidden transition-transform hover:-translate-y-0.5"
                style={{
                  border: "1px solid var(--ds-border-default)",
                  background: "var(--ds-bg-surface)",
                  boxShadow: "0 4px 14px -8px rgba(230,160,32,0.3)",
                }}
              >
                <span
                  className="absolute top-0 bottom-0 left-0 w-1"
                  style={{ background: "linear-gradient(180deg, #e6a020, #f59e0b)" }}
                />
                <div
                  className="px-3 sm:px-4 py-2.5 flex items-start sm:items-center gap-2 flex-wrap"
                  style={{ backgroundColor: "var(--ds-bg-overlay)" }}
                >
                  <button
                    onClick={() => jumpTo(moment.timestamp)}
                    className="text-xs font-mono px-2 py-1 rounded-md transition-all hover:scale-105"
                    style={{
                      background: "var(--ds-primary-bg)",
                      border: "1px solid var(--ds-primary-br)",
                      color: "var(--ds-primary)",
                    }}
                    title="Audio'da shu vaqtga o'tish"
                  >
                    ▶ {moment.timestamp}
                  </button>
                  <span className="text-sm font-bold leading-snug flex-1 min-w-0" style={{ color: "var(--ds-text-primary)" }}>
                    {moment.whatHappened}
                  </span>
                </div>
                <div className="px-3 sm:px-4 py-3 space-y-2.5">
                  <div
                    className="flex items-start gap-2 p-2 rounded-lg"
                    style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
                  >
                    <span className="text-sm shrink-0 mt-0.5">❌</span>
                    <span className="text-xs sm:text-[13px] italic leading-relaxed" style={{ color: "var(--ds-text-secondary)" }}>
                      "{moment.whatManagerDid}"
                    </span>
                  </div>
                  <div
                    className="flex items-start gap-2 p-2 rounded-lg"
                    style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)" }}
                  >
                    <span className="text-sm shrink-0 mt-0.5">✅</span>
                    <span className="text-xs sm:text-[13px] leading-relaxed font-medium" style={{ color: "var(--ds-text-primary)" }}>
                      "{moment.whatToDoInstead}"
                    </span>
                  </div>
                  <div className="flex items-center gap-1 pt-0.5">
                    <span
                      className="text-[11px] px-2.5 py-0.5 rounded-full font-bold"
                      style={{
                        background: "var(--ds-primary-bg)",
                        border: "1px solid var(--ds-primary-br)",
                        color: "var(--ds-primary)",
                      }}
                    >
                      📚 {moment.technique}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Top Win */}
        {insights.topWin && (
          <div
            className="relative flex items-start gap-2.5 p-3 sm:p-4 rounded-xl overflow-hidden transition-transform hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, rgba(34,197,94,0.13), rgba(34,197,94,0.03))",
              border: "1px solid rgba(34,197,94,0.35)",
              boxShadow: "0 4px 14px -8px rgba(34,197,94,0.4)",
            }}
          >
            <span
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{ background: "linear-gradient(90deg, transparent, #22c55e, transparent)" }}
            />
            <CheckCircle size={18} className="mt-0.5 shrink-0" style={{ color: "var(--ds-success)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold mb-1 uppercase tracking-wider" style={{ color: "var(--ds-success)" }}>
                Eng yaxshi narsa
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--ds-text-primary)" }}>{insights.topWin}</p>
            </div>
          </div>
        )}

        {/* Quick Fix */}
        {insights.quickFix && (
          <div
            className="relative flex items-start gap-2.5 p-3 sm:p-4 rounded-xl overflow-hidden transition-transform hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, rgba(59,94,245,0.13), rgba(59,94,245,0.03))",
              border: "1px solid rgba(59,94,245,0.35)",
              boxShadow: "0 4px 14px -8px rgba(59,94,245,0.4)",
            }}
          >
            <span
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{ background: "linear-gradient(90deg, transparent, #3b5ef5, transparent)" }}
            />
            <Zap size={18} className="mt-0.5 shrink-0" style={{ color: "var(--ds-primary)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold mb-1 uppercase tracking-wider" style={{ color: "var(--ds-primary)" }}>
                Keyingi qo'ng'iroqda bitta o'zgarish
              </p>
              <p className="text-sm sm:text-[15px] font-semibold leading-relaxed" style={{ color: "var(--ds-text-primary)" }}>{insights.quickFix}</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

const AudioDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userRole, managerUser, isAuthenticated } = useAuth();
  const canOverrideJudge = isAuthenticated && (userRole === "company" || managerUser?.role === "rop");
  const [showErrors, setShowErrors] = useState(false);
  const [showSoprano, setShowSoprano] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);


  const { data: audio, isLoading } = useQuery({
    queryKey: ["audio", id, isAuthenticated],
    queryFn: () => audioService.getOne(id!),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? 3000 : false,
  });

  const judgeOverrideMutation = useMutation({
    mutationFn: (skipped: boolean) => audioService.overrideJudge(id!, skipped),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audio", id] });
      queryClient.invalidateQueries({ queryKey: ["audioFiles"] });
      toast.success("Sud qarori yangilandi");
    },
    onError: () => toast.error("Sud qarorini yangilashda xatolik"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => audioService.remove(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audioFiles"] });
      toast.success("Audio o'chirildi");
      navigate("/audio");
    },
    onError: () => toast.error("O'chirishda xatolik"),
  });

  if (isLoading) {
    return <SkeletonDetail />;
  }

  if (!audio) return <p className="text-secondary">Audio topilmadi</p>;

  const isNoConv = audio.status === "no_conversation";
  const analysis = audio.analysis;
  // Eski mezon nomlarini yangi nomlarga moslash (dashboard bilan bir xil)
  const normalizeCriterionName = (name: string): string => {
    // Backend dashboard.controller.ts bilan bir xil — yangi "— ..." qo'shimchali
    // mezon nomlarini ham qamrab oladi (aks holda radar'da to'liq chiqmaydi).
    const map: Record<string, string> = {
      // 1. Salomlashish
      "Salomlashish va suhbatni boshlash": "Salomlashish",
      // 2. Ehtiyojni aniqlash
      "Ehtiyojni aniqlash — SOPRANO texnikasi": "Ehtiyojni aniqlash",
      "Ehtiyojni aniqlash — SPIN texnikasi": "Ehtiyojni aniqlash",
      "SOPRANO texnikasi": "Ehtiyojni aniqlash",
      // 3. Taqdimot
      "Taqdimot — mahsulotni tushuntirish": "Taqdimot",
      "Mahsulotni tushuntirish": "Taqdimot",
      "Mahsulot taqdimoti": "Taqdimot",
      // 4. E'tiroz bilan ishlash
      "E'tirozlar bilan ishlash": "E'tiroz bilan ishlash",
      "E'tirozga yechim berish": "E'tiroz bilan ishlash",
      // 5. Bosim
      "Bosim — closing va keyingi qadamga olib kelish": "Bosim o'tkazish",
      "Bosim": "Bosim o'tkazish",
      // 6. Kayfiyat
      "Kayfiyat — ovoz tonusi va energiya": "Kayfiyati",
      "Kayfiyat": "Kayfiyati",
      // 7. Aktiv tinglash — as-is
      // Qayta uchun
      "Kontekstni eslatish — oldingi suhbatga bog'lash": "Kontekstni eslatish",
      "Oldingi to‘siqni tekshirish": "Oldingi to'siqni tekshirish",
      // Legacy
      "Keyingi qadamga yo'naltirish": "Keyingi qadam",
      "Yakunlash": "Keyingi qadam",
    };
    return map[name] || name;
  };
  // Kategoriyaga qarab cycle bo'yicha tartib — soat yo'nalishi (12'dan boshlab).
  // Audio category 'qayta' bo'lsa Kontekst birinchi.
  const SOTUV_ORDER = [
    "Salomlashish",
    "Ehtiyojni aniqlash",
    "Taqdimot",
    "E'tiroz bilan ishlash",
    "Bosim o'tkazish",
    "Keyingi qadam",
    "Kayfiyati",
    "Aktiv tinglash",
  ];
  const QAYTA_ORDER = [
    "Kontekstni eslatish",
    "E'tiroz bilan ishlash",
    "Bosim o'tkazish",
    "Kayfiyati",
    "Aktiv tinglash",
    // Legacy (eski 8-mezon strukturasidan qoldiq tahlillar uchun)
    "Oldingi to'siqni tekshirish",
    "Yangi sabab bilan chiqish",
    "Qaror holatini aniqlash",
    "Closing va keyingi qadamni kelishish",
  ];
  const CRITERIA_ORDER = audio?.category === "qayta" ? QAYTA_ORDER : SOTUV_ORDER;
  // Card view bilan bir xil — qisqa label radar uchun
  const shortCriterionLabel = (name: string): string => {
    const map: Record<string, string> = {
      Salomlashish: "Salom",
      "Ehtiyojni aniqlash": "Ehtiyoj",
      Taqdimot: "Taqdimot",
      "E'tiroz bilan ishlash": "E'tiroz",
      "Bosim o'tkazish": "Bosim",
      Kayfiyati: "Kayfiyat",
      "Aktiv tinglash": "Tinglash",
      "Kontekstni eslatish": "Kontekst",
      "Oldingi to'siqni tekshirish": "To'siq",
      "Yangi sabab bilan chiqish": "Sabab",
      "Qaror holatini aniqlash": "Qaror",
      "Closing va keyingi qadamni kelishish": "Closing",
      "Keyingi qadam": "Keyingi",
    };
    return map[name] || (name.length > 9 ? name.slice(0, 9) + "…" : name);
  };
  const criteriaData = analysis?.criteria
    ? Object.entries(analysis.criteria)
        .map(([key, val]) => {
          const fullName = normalizeCriterionName(key);
          return {
            fullName,
            name: shortCriterionLabel(fullName),
            score: val.score,
            fill: scoreColor(val.score),
          };
        })
        // Kategoriyaga tegishli mezonlarni saqlash (AI noto'g'ri qaytargan
        // kross-kategoriya mezonlari ko'rinmasin)
        .filter((c) => CRITERIA_ORDER.includes(c.fullName))
        // Dublikatlarni tashlab yuborish (canonical normalization tufayli)
        .filter((c, i, arr) => arr.findIndex((x) => x.fullName === c.fullName) === i)
        .sort((a, b) => {
          const ai = CRITERIA_ORDER.indexOf(a.fullName);
          const bi = CRITERIA_ORDER.indexOf(b.fullName);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        })
    : [];

  const overallScore = analysis?.overallScore ?? 0;
  const radarTier =
    overallScore >= 80
      ? { accent: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)" }
      : overallScore >= 60
        ? { accent: "#eab308", bg: "rgba(234,179,8,0.08)", border: "rgba(234,179,8,0.25)" }
        : overallScore >= 40
          ? { accent: "#f97316", bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.25)" }
          : { accent: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)" };

  const speechData = analysis
    ? [
        { name: "Menejer", value: analysis.managerSpeech },
        { name: "Mijoz", value: analysis.clientSpeech },
      ]
    : [];

  const isAnalysisComplete = !!(analysis && criteriaData.length > 0 && analysis.overallScore > 0);

  const objData = analysis?.objections
    ? analysis.objections.map((o) => ({
        name: o.type,
        value: o.count,
      }))
    : [];

  // Public (login'siz) rejimda — sidebar yo'q. Brendlangan mini-header + markaziy
  // kontainer. Login bilan kelganda MainLayout outer padding beradi.
  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    isAuthenticated ? (
      <div className="space-y-6 overflow-hidden pb-8">{children}</div>
    ) : (
      <div className="min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
        {/* Public sticky header */}
        <header
          className="sticky top-0 z-30 backdrop-blur border-b"
          style={{
            backgroundColor: "rgba(10, 10, 20, 0.85)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 h-12 sm:h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}
              >
                <span className="text-white font-bold text-xs sm:text-sm">SA</span>
              </div>
              <span
                className="text-sm sm:text-base font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                SalesAI
              </span>
              <span
                className="hidden sm:inline-block text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "rgba(168,85,247,0.15)",
                  color: "#a855f7",
                }}
              >
                Ulashilgan tahlil
              </span>
            </div>
            <a
              href="/login"
              className="text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors"
              style={{
                backgroundColor: "rgba(99, 102, 241, 0.15)",
                color: "#6366f1",
              }}
            >
              Kirish
            </a>
          </div>
        </header>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 pb-16">
          {children}
        </div>
      </div>
    );

  return (
    <Wrapper>
      {/* Sud Agent banner — skipped yoki admin override'dan keyin ikkala holatda ham */}
      {(analysis?.judgeSkipped || analysis?.judgeOverridden) && (
        <div
          className="flex items-start gap-3 px-4 py-3 rounded-xl border"
          style={{
            backgroundColor: analysis.judgeSkipped
              ? "rgba(245,158,11,0.10)"
              : "rgba(34,197,94,0.10)",
            borderColor: analysis.judgeSkipped
              ? "rgba(245,158,11,0.35)"
              : "rgba(34,197,94,0.35)",
          }}
        >
          <span className="text-xl leading-none">
            {analysis.judgeSkipped ? "⚖️" : "✅"}
          </span>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold"
              style={{ color: analysis.judgeSkipped ? "#f59e0b" : "#22c55e" }}
            >
              {analysis.judgeSkipped
                ? "Sud Agent: Menejer reytingiga kiritilmadi"
                : "Sud qarori bekor qilingan — reytingga kiritiladi"}
              {analysis.judgeOverridden && (
                <span
                  className="ml-2 text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "rgba(139,92,246,0.15)",
                    color: "#8b5cf6",
                  }}
                >
                  ADMIN
                </span>
              )}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {analysis.judgeReason || "Sud Agent qarori"}
            </p>
          </div>
          {canOverrideJudge && (
            <button
              type="button"
              onClick={() => judgeOverrideMutation.mutate(!analysis.judgeSkipped)}
              disabled={judgeOverrideMutation.isPending}
              className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              style={{
                backgroundColor: analysis.judgeSkipped
                  ? "rgba(34,197,94,0.15)"
                  : "rgba(245,158,11,0.15)",
                color: analysis.judgeSkipped ? "#22c55e" : "#f59e0b",
                border: `1px solid ${analysis.judgeSkipped ? "rgba(34,197,94,0.35)" : "rgba(245,158,11,0.35)"}`,
              }}
            >
              {judgeOverrideMutation.isPending
                ? "..."
                : analysis.judgeSkipped
                  ? "✓ Bekor qilish"
                  : "⚖️ Qaytadan skip"}
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {isAuthenticated ? (
          <button
            onClick={() => navigate("/audio")}
            className="flex items-center gap-1.5 sm:gap-2 text-secondary hover:text-white transition-colors text-sm"
          >
            <ArrowLeft size={18} />
            <span className="inline">Ortga</span>
          </button>
        ) : <div className="hidden sm:block" />}
        <div className="flex flex-wrap gap-2 ml-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/audio/${id}/transcription`)}
          >
            <FileText size={14} />
            <span>Transkripsiya</span>
          </Button>
          {isAuthenticated && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => deleteMutation.mutate()}
              loading={deleteMutation.isPending}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">O'chirish</span>
            </Button>
          )}
        </div>
      </div>

      {/* Audio player olib tashlandi — audio detalda ijro etilmaydi.
          Audioni tinglash uchun Transkripsiya sahifasidagi pleerdan foydalaniladi. */}

      {/* Info card — Score badge + manager details + status */}
      {(() => {
        const scoreAccent = analysis
          ? analysis.overallScore >= 80 ? "#22c55e"
          : analysis.overallScore >= 60 ? "#eab308"
          : analysis.overallScore >= 40 ? "#f97316"
          : "#ef4444"
          : "#9ca3af";
        const scoreBg = analysis
          ? analysis.overallScore >= 80 ? "rgba(34,197,94,0.12)"
          : analysis.overallScore >= 60 ? "rgba(234,179,8,0.12)"
          : analysis.overallScore >= 40 ? "rgba(249,115,22,0.12)"
          : "rgba(239,68,68,0.12)"
          : "rgba(156,163,175,0.08)";
        const scoreLabel = analysis
          ? analysis.overallScore >= 80 ? "A'LO"
          : analysis.overallScore >= 60 ? "YAXSHI"
          : analysis.overallScore >= 40 ? "O'RTACHA"
          : "PAST"
          : "BALL";
        const statusLabel =
          audio.status === "done" && isAnalysisComplete ? "Tayyor"
          : audio.status === "done" && !isAnalysisComplete ? "Qisman"
          : audio.status === "no_conversation" ? "Suhbat yo'q"
          : audio.status === "processing" ? "Jarayonda"
          : audio.status === "error" ? "Xatolik"
          : audio.status === "pending" ? "Kutilmoqda"
          : audio.status;
        const statusVariant =
          audio.status === "done" && isAnalysisComplete ? "success"
          : audio.status === "done" && !isAnalysisComplete ? "warning"
          : audio.status === "error" ? "danger"
          : audio.status === "processing" ? "warning"
          : audio.status === "no_conversation" ? "info"
          : "default";
        const leadAccent = analysis?.leadQuality === "issiq" ? "#ef4444"
          : analysis?.leadQuality === "iliq" ? "#f59e0b"
          : "#3b82f6";
        const durationStr = audio.duration
          ? `${Math.floor(audio.duration / 60)}:${String(audio.duration % 60).padStart(2, "0")}`
          : "—";
        return (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
                  {/* Score tile */}
                  <div
                    className="relative rounded-xl px-2 py-3 sm:p-3 flex flex-col items-center text-center overflow-hidden transition-transform hover:-translate-y-0.5"
                    style={{
                      background: `linear-gradient(135deg, ${scoreBg}, ${scoreAccent}05)`,
                      border: `1px solid ${scoreAccent}40`,
                      boxShadow: `0 4px 14px -8px ${scoreAccent}50`,
                    }}
                  >
                    <span
                      className="absolute top-0 left-0 right-0 h-0.5"
                      style={{ background: `linear-gradient(90deg, transparent, ${scoreAccent}, transparent)` }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: scoreAccent }}>
                      Score
                    </span>
                    <span className="text-3xl sm:text-4xl font-black leading-none mt-1.5" style={{ color: scoreAccent }}>
                      {analysis?.overallScore ?? "—"}
                    </span>
                    <span className="text-[10px] font-bold mt-1" style={{ color: scoreAccent, opacity: 0.85 }}>
                      {scoreLabel}
                    </span>
                  </div>

                  {/* Lid tile */}
                  <div
                    className="relative rounded-xl px-2 py-3 sm:p-3 flex flex-col items-center text-center overflow-hidden transition-transform hover:-translate-y-0.5"
                    style={{
                      background: analysis
                        ? `linear-gradient(135deg, ${leadAccent}14, ${leadAccent}03)`
                        : "rgba(156,163,175,0.08)",
                      border: `1px solid ${analysis ? `${leadAccent}30` : "rgba(156,163,175,0.2)"}`,
                      boxShadow: analysis ? `0 4px 14px -8px ${leadAccent}40` : "none",
                    }}
                  >
                    {analysis && (
                      <span
                        className="absolute top-0 left-0 right-0 h-0.5"
                        style={{ background: `linear-gradient(90deg, transparent, ${leadAccent}, transparent)` }}
                      />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: analysis ? leadAccent : "var(--ds-text-muted)" }}>
                      Lid sifati
                    </span>
                    {analysis ? (
                      <>
                        <span className="text-xl sm:text-2xl font-black mt-1.5 capitalize leading-none" style={{ color: leadAccent }}>
                          {analysis.leadQuality}
                        </span>
                        <span className="text-[10px] font-bold mt-1" style={{ color: leadAccent, opacity: 0.85 }}>
                          {analysis.leadScore}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xl mt-1" style={{ color: "var(--ds-text-muted)" }}>—</span>
                    )}
                  </div>

                  {/* Davomiyligi tile */}
                  <div
                    className="relative rounded-xl px-2 py-3 sm:p-3 flex flex-col items-center text-center overflow-hidden transition-transform hover:-translate-y-0.5"
                    style={{
                      background: "linear-gradient(135deg, rgba(6,182,212,0.14), rgba(6,182,212,0.03))",
                      border: "1px solid rgba(6,182,212,0.3)",
                      boxShadow: "0 4px 14px -8px rgba(6,182,212,0.4)",
                    }}
                  >
                    <span
                      className="absolute top-0 left-0 right-0 h-0.5"
                      style={{ background: "linear-gradient(90deg, transparent, #06b6d4, transparent)" }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#06b6d4" }}>
                      Davomiyligi
                    </span>
                    <span className="text-2xl sm:text-3xl font-black leading-none mt-1.5 font-mono" style={{ color: "#06b6d4" }}>
                      {durationStr}
                    </span>
                  </div>

                  {/* Voronka tile */}
                  <div
                    className="relative rounded-xl px-2 py-3 sm:p-3 flex flex-col items-center text-center overflow-hidden transition-transform hover:-translate-y-0.5"
                    style={{
                      background: "linear-gradient(135deg, rgba(168,85,247,0.14), rgba(168,85,247,0.03))",
                      border: "1px solid rgba(168,85,247,0.3)",
                      boxShadow: "0 4px 14px -8px rgba(168,85,247,0.4)",
                    }}
                  >
                    <span
                      className="absolute top-0 left-0 right-0 h-0.5"
                      style={{ background: "linear-gradient(90deg, transparent, #a855f7, transparent)" }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#a855f7" }}>
                      Voronka
                    </span>
                    <span className="text-sm sm:text-base font-bold mt-2 truncate max-w-full" style={{ color: "#a855f7" }}>
                      {audio.pipelineName || "Yangi lid"}
                    </span>
                  </div>

                  {/* Holat tile */}
                  {(() => {
                    const statusColor =
                      statusVariant === "success" ? "#22c55e"
                      : statusVariant === "warning" ? "#eab308"
                      : statusVariant === "danger" ? "#ef4444"
                      : "#3b82f6";
                    return (
                      <div
                        className="relative col-span-2 md:col-span-1 rounded-xl px-2 py-3 sm:p-3 flex flex-col items-center text-center overflow-hidden transition-transform hover:-translate-y-0.5"
                        style={{
                          background: `linear-gradient(135deg, ${statusColor}1f, ${statusColor}05)`,
                          border: `1px solid ${statusColor}40`,
                          boxShadow: `0 4px 14px -8px ${statusColor}50`,
                        }}
                      >
                        <span
                          className="absolute top-0 left-0 right-0 h-0.5"
                          style={{ background: `linear-gradient(90deg, transparent, ${statusColor}, transparent)` }}
                        />
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: statusColor }}>
                          Holat
                        </span>
                        <div className="mt-2">
                          <Badge variant={statusVariant as any}>{statusLabel}</Badge>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Bottom info */}
                <div
                  className="mt-4 pt-3 border-t flex items-center flex-wrap gap-4 text-xs"
                  style={{ borderColor: "var(--color-border)", color: "var(--ds-text-secondary)" }}
                >
                  <span className="flex items-center gap-1.5">
                    <User size={12} />
                    <span className="font-semibold" style={{ color: "var(--ds-text-primary)" }}>{audio.manager?.name || "—"}</span>
                  </span>
                  <span className="flex items-center gap-1.5 font-mono">
                    <Phone size={12} />
                    {audio.phoneNumber || "—"}
                  </span>
                  <span className="flex items-center gap-1.5 font-mono ml-auto" style={{ color: "var(--ds-text-muted)" }}>
                    <FileText size={12} />
                    {audio.fileName}
                  </span>
                </div>
          </Card>
        );
      })()}

      {/* "Suhbat aniqlanmadi" izoh — faqat no_conversation holat uchun */}
      {isNoConv && (
        <>
          <Card>
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-white mb-2">Suhbat aniqlanmadi</h3>
                <p className="text-secondary text-sm max-w-md">
                  Bu audio faylda suhbat aniqlanmadi. Audio faylni tinglash uchun yuqoridagi pleyer dan foydalaning.
                </p>
              </div>
            </div>
          </Card>
        </>
      )}

      {analysis && (
        <>
          <SectionHeader title="Umumiy natija" first />

          {/* Summary */}
          <Card title="Umumiy xulosa">
            {analysis.overallScore === 0 && criteriaData.length === 0 ? (
              <div className="flex flex-col items-center py-6">
                <p className="text-secondary text-sm mb-4">Bu audio tahlil qilinmagan yoki tahlil yakunlanmagan.</p>
                <Button
                  onClick={() => {
                    audioService.analyzeOne(id!).then(() => {
                      toast.success("Tahlil boshlandi");
                      queryClient.invalidateQueries({ queryKey: ["audio", id] });
                    }).catch(() => toast.error("Tahlil qilishda xatolik"));
                  }}
                >
                  Qayta tahlil qilish
                </Button>
              </div>
            ) : (
              <div>
                <p
                  className={`text-secondary leading-relaxed transition-all duration-300 ${
                    showFullSummary ? "" : "line-clamp-4 sm:line-clamp-none"
                  }`}
                >
                  {analysis.summary}
                </p>
                {analysis.summary && analysis.summary.length > 180 && (
                  <button
                    onClick={() => setShowFullSummary(!showFullSummary)}
                    className="sm:hidden mt-2 inline-flex items-center gap-1 text-sm font-bold transition-colors"
                    style={{ color: "#3b82f6" }}
                  >
                    {showFullSummary ? "Yopish" : "Ko'proq o'qish"}
                    <ChevronDown
                      size={14}
                      className="transition-transform duration-200"
                      style={{ transform: showFullSummary ? "rotate(180deg)" : "rotate(0deg)" }}
                    />
                  </button>
                )}
              </div>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Criteria chart */}
            <Card title="Mezonlarga rioya qilishi">
              {criteriaData.length === 0 ? (
                <p className="text-secondary text-sm py-8 text-center">Mezonlar bo'yicha ma'lumot yo'q</p>
              ) : (
              <div
                className="rounded-xl px-2 py-2"
                style={{
                  backgroundColor: radarTier.bg,
                  border: `1px solid ${radarTier.border}`,
                }}
              >
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={criteriaData} margin={{ top: 12, right: 28, bottom: 12, left: 28 }}>
                    <PolarGrid stroke="var(--color-border)" />
                    <PolarAngleAxis
                      dataKey="name"
                      tick={{ fill: "var(--text-secondary)", fontSize: 11, fontWeight: 600 }}
                    />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar
                      dataKey="score"
                      stroke={radarTier.accent}
                      fill={radarTier.accent}
                      fillOpacity={0.3}
                      strokeWidth={1.5}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const p = payload[0] as { payload: { fullName: string; score: number } };
                        return (
                          <div
                            className="px-2.5 py-1.5 rounded-lg shadow-lg"
                            style={{ backgroundColor: "rgba(0,0,0,0.85)", color: "#fff" }}
                          >
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)" }}>
                              {p.payload.fullName}
                            </div>
                            <div className="text-xs font-semibold">{p.payload.score} / 100</div>
                          </div>
                        );
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              )}
            </Card>

            {/* Speech ratio */}
            <Card title="Nutq nisbati">
              <div className="relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={speechData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={115}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {speechData.map((_, i) => (
                        <Cell key={i} fill={SPEECH_COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null;
                        const p = payload[0] as { payload: { name: string; value: number } };
                        return (
                          <div
                            className="px-2.5 py-1.5 rounded-lg shadow-lg"
                            style={{ backgroundColor: "rgba(0,0,0,0.85)", color: "#fff" }}
                          >
                            <div className="text-xs font-semibold">
                              {p.payload.name}: {p.payload.value}%
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                    Nisbat
                  </div>
                  <div className="text-3xl font-black tracking-tight" style={{ color: "var(--text-primary)" }}>
                    {speechData[0]?.value ?? 0}
                    <span className="mx-1.5" style={{ color: "var(--text-secondary)" }}>:</span>
                    {speechData[1]?.value ?? 0}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 mt-2">
                {speechData.map((s, i) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: `${SPEECH_COLORS[i]}14`,
                      border: `1px solid ${SPEECH_COLORS[i]}33`,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: SPEECH_COLORS[i] }}
                    />
                    <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      {s.name}
                    </span>
                    <span className="text-xs font-bold" style={{ color: SPEECH_COLORS[i] }}>
                      {s.value}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Errors — accordion dropdown */}
          {analysis.errors.length > 0 && (
            <div
              className="rounded-2xl overflow-hidden border"
              style={{
                borderColor: "rgba(239,68,68,0.25)",
                backgroundColor: "var(--color-card-bg)",
              }}
            >
              <button
                onClick={() => setShowErrors(!showErrors)}
                className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:brightness-105"
                style={{
                  backgroundColor: showErrors ? "rgba(239,68,68,0.08)" : "transparent",
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: "rgba(239,68,68,0.15)",
                      color: "#ef4444",
                    }}
                  >
                    <AlertTriangle size={18} />
                  </div>
                  <div className="text-left">
                    <div
                      className="text-base font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Aniqlangan xatoliklar
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                      {analysis.errors.length} ta xatolik topildi · {showErrors ? "yopish uchun bosing" : "ko'rish uchun bosing"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: "rgba(239,68,68,0.15)",
                      color: "#ef4444",
                    }}
                  >
                    {analysis.errors.length}
                  </span>
                  <ChevronDown
                    size={20}
                    className="transition-transform duration-200"
                    style={{
                      color: "var(--text-secondary)",
                      transform: showErrors ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  />
                </div>
              </button>
              <div
                className="overflow-hidden transition-all ease-out"
                style={{
                  maxHeight: showErrors ? "3000px" : "0px",
                  opacity: showErrors ? 1 : 0,
                  transitionDuration: showErrors ? "500ms" : "300ms",
                }}
              >
                <div
                  className="px-5 py-4 space-y-2 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {analysis.errors.map((err, i) => (
                    <div key={i} className="p-3 bg-danger/5 border border-danger/10 rounded-xl">
                      <div className="flex justify-between items-center">
                        <span className="text-danger font-medium text-sm">{err.type}</span>
                        <button
                          onClick={() => navigate(`/audio/${id}/transcription?t=${parseTimeToSeconds(err.timestamp)}`)}
                          className="flex items-center gap-1 text-accent text-xs hover:underline"
                        >
                          <span>{err.timestamp}</span>
                          <span>· Tinglash</span>
                        </button>
                      </div>
                      <p style={{ color: "#6b7280" }} className="text-sm mt-1">{err.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Win points — doim ko'rsatiladi, bo'sh bo'lsa chiroyli empty state */}
            <Card title={`✅ G'alaba nuqtalari (${analysis.winPoints.length})`}>
              {analysis.winPoints.length > 0 ? (
                <div className="space-y-2.5">
                  {analysis.winPoints.map((w, i) => (
                    <div
                      key={i}
                      className="relative p-3 rounded-xl transition-transform hover:-translate-y-0.5"
                      style={{
                        background: "linear-gradient(135deg, rgba(34,197,94,0.10), rgba(34,197,94,0.02))",
                        border: "1px solid rgba(34,197,94,0.25)",
                      }}
                    >
                      <span
                        className="absolute top-0 bottom-0 left-0 w-0.5 rounded-l-xl"
                        style={{ background: "linear-gradient(180deg, #22c55e, #16a34a)" }}
                      />
                      <p className="text-sm leading-relaxed pl-2" style={{ color: "var(--text-primary)" }}>{w.description}</p>
                      <div className="flex justify-end mt-1.5">
                        <button
                          onClick={() => navigate(`/audio/${id}/transcription?t=${parseTimeToSeconds(w.timestamp)}`)}
                          className="flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-md transition-all hover:scale-105"
                          style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
                        >
                          <span>▶ {w.timestamp}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center text-center py-8 rounded-xl"
                  style={{
                    backgroundColor: "rgba(156,163,175,0.05)",
                    border: "1px dashed rgba(156,163,175,0.25)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                    style={{ backgroundColor: "rgba(156,163,175,0.12)", color: "var(--text-secondary)" }}
                  >
                    <TrendingUp size={20} strokeWidth={2} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                    G'alaba nuqtalari aniqlanmadi
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>
                    Bu suhbatda kuchli momentlar yetarli emas
                  </p>
                </div>
              )}
            </Card>

            {/* Loss points */}
            <Card title={`❌ Yo'qotish nuqtalari (${analysis.lossPoints.length})`}>
              {analysis.lossPoints.length > 0 ? (
                <div className="space-y-2.5">
                  {analysis.lossPoints.map((l, i) => (
                    <div
                      key={i}
                      className="relative p-3 rounded-xl transition-transform hover:-translate-y-0.5"
                      style={{
                        background: "linear-gradient(135deg, rgba(239,68,68,0.10), rgba(239,68,68,0.02))",
                        border: "1px solid rgba(239,68,68,0.25)",
                      }}
                    >
                      <span
                        className="absolute top-0 bottom-0 left-0 w-0.5 rounded-l-xl"
                        style={{ background: "linear-gradient(180deg, #ef4444, #dc2626)" }}
                      />
                      <p className="text-sm leading-relaxed pl-2" style={{ color: "var(--text-primary)" }}>{l.description}</p>
                      <div className="flex justify-end mt-1.5">
                        <button
                          onClick={() => navigate(`/audio/${id}/transcription?t=${parseTimeToSeconds(l.timestamp)}`)}
                          className="flex items-center gap-1 text-xs font-mono font-semibold px-2 py-0.5 rounded-md transition-all hover:scale-105"
                          style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}
                        >
                          <span>▶ {l.timestamp}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center text-center py-8 rounded-xl"
                  style={{
                    backgroundColor: "rgba(34,197,94,0.06)",
                    border: "1px dashed rgba(34,197,94,0.3)",
                  }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
                    style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e" }}
                  >
                    <CheckCircle size={20} strokeWidth={2} />
                  </div>
                  <p className="text-sm font-semibold" style={{ color: "#22c55e" }}>
                    Yo'qotish momenti aniqlanmadi
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)", opacity: 0.8 }}>
                    Ajoyib! Bu suhbatda xatolik yo'q
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* ⭐ Top mijoz e'tirozlari — accordion + index-based critical moment matching */}
          {objData.length > 0 && analysis && (
            <ObjectionsAccordion
              objData={objData}
              analysis={analysis}
              audioId={id || ""}
              onJumpInPage={(seconds) => {
                // Audio detail page'da audio playerga ega emas — transcription'ga o'tamiz
                navigate(`/audio/${id}/transcription?t=${seconds}`);
              }}
            />
          )}
        </>
      )}

      {/* "Batafsil tahlil yo'q" — agar yangi maydonlardan hech biri yo'q bo'lsa */}
      {analysis &&
        !(typeof analysis.leadHeatScore === "number") &&
        !analysis.qualification &&
        !analysis.callStructure &&
        !analysis.voiceOfCustomer &&
        !analysis.coachingInsights && (
          <Card>
            <div
              className="flex items-start gap-3 p-4 rounded-xl"
              style={{
                background: "var(--ds-warning-bg)",
                border: "1px solid var(--ds-warning-br)",
              }}
            >
              <AlertTriangle
                size={22}
                className="flex-shrink-0 mt-0.5"
                style={{ color: "var(--ds-warning)" }}
              />
              <div className="flex-1 min-w-0">
                <p
                  className="font-semibold text-sm mb-1"
                  style={{ color: "var(--ds-text-primary)" }}
                >
                  Batafsil tahlil yo'q
                </p>
                <p
                  className="text-xs leading-relaxed mb-3"
                  style={{ color: "var(--ds-text-secondary)" }}
                >
                  Bu audio <strong>eski tahlil</strong> tizimi bilan qayta ishlangan —
                  Lead Heat, MEDDIC, qo'ng'iroq tuzilmasi, mijoz ovozi va coaching
                  ma'lumotlari mavjud emas. Yangi tizim bilan qayta tahlil qiling.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!id) return;
                    audioService
                      .analyzeOne(id)
                      .then(() => {
                        toast.success("Qayta tahlil boshlandi — 1-2 daqiqada tayyor");
                        setTimeout(() => {
                          queryClient.invalidateQueries({ queryKey: ["audio", id] });
                        }, 3000);
                      })
                      .catch((e) => {
                        toast.error(e?.response?.data?.error || "Qayta tahlil xatolik");
                      });
                  }}
                >
                  Qayta tahlil qilish
                </Button>
              </div>
            </div>
          </Card>
        )}

      {analysis &&
        (analysis.qualification && analysis.qualification.overallQualification > 0) && (
          <SectionHeader title="Deal kvalifikatsiyasi" />
        )}

      {/* SOPRANO — 7 bosqichli kashfiyot tekshiruvi (accordion, default yopiq) */}
      {analysis?.qualification && analysis.qualification.overallQualification > 0 && (() => {
        const sopranoColor =
          analysis.qualification.overallQualification >= 70
            ? "#2fcc6e"
            : analysis.qualification.overallQualification >= 40
              ? "#e6a020"
              : "#e64545";
        return (
        <div
          className="rounded-2xl overflow-hidden border"
          style={{
            borderColor: `${sopranoColor}40`,
            backgroundColor: "var(--color-card-bg)",
          }}
        >
          <button
            onClick={() => setShowSoprano(!showSoprano)}
            className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:brightness-105"
            style={{
              backgroundColor: showSoprano ? `${sopranoColor}12` : "transparent",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                style={{
                  backgroundColor: `${sopranoColor}26`,
                  color: sopranoColor,
                }}
              >
                🎯
              </div>
              <div className="text-left">
                <div
                  className="text-base font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Deal Kvalifikatsiyasi (SOPRANO)
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                  Umumiy kvalifikatsiya: {analysis.qualification.overallQualification}% · {showSoprano ? "yopish uchun bosing" : "ko'rish uchun bosing"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="px-2.5 py-1 rounded-full text-xs font-bold"
                style={{
                  backgroundColor: `${sopranoColor}26`,
                  color: sopranoColor,
                }}
              >
                {analysis.qualification.overallQualification}%
              </span>
              <ChevronDown
                size={20}
                className="transition-transform duration-200"
                style={{
                  color: "var(--text-secondary)",
                  transform: showSoprano ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </div>
          </button>
          <div
            className="overflow-hidden transition-all ease-out"
            style={{
              maxHeight: showSoprano ? "5000px" : "0px",
              opacity: showSoprano ? 1 : 0,
              transitionDuration: showSoprano ? "500ms" : "300ms",
            }}
          >
          <div className="px-5 py-5 border-t" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-4">
            <div className="flex items-center justify-between text-sm mb-1">
              <span style={{ color: "var(--text-secondary)" }}>Umumiy kvalifikatsiya</span>
              <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                {analysis.qualification.overallQualification}%
              </span>
            </div>
            <div className="w-full h-2 rounded-full" style={{ backgroundColor: "var(--color-bg)" }}>
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${analysis.qualification.overallQualification}%`,
                  backgroundColor: sopranoColor,
                }}
              />
            </div>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-3 md:grid-flow-col"
            style={{
              // 7 element / 2 ustun → 4 qator (column-first tartib: 1,2,3,4 | 5,6,7)
              gridTemplateRows: "repeat(4, minmax(0, 1fr))",
            }}
          >
            {(() => {
              const q = analysis.qualification as any;
              // Analyzer schema kalitlari: situation/objective/problem/resources/
              // alternatives/need/outcome (S-O-P-R-A-N-O). Eski analizlar uchun
              // legacy kalitlarga (experience/decisionMaker/nuances/limits) fallback.
              const stages: { letter: string; label: string; description: string; stage: any }[] = [
                { letter: "S", label: "Situatsiya", description: "Vaziyat haqida", stage: q.situation },
                { letter: "O", label: "Maqsad", description: "Mijoz nimaga erishmoqchi", stage: q.objective ?? q.experience },
                { letter: "P", label: "Muammolar", description: "Qiyinchiliklar", stage: q.problem },
                { letter: "R", label: "Resurslar", description: "Vaqt, byudjet, imkoniyat", stage: q.resources ?? q.decisionMaker },
                { letter: "A", label: "Tanlovlar", description: "Boshqa variantlar, hamkorliklar", stage: q.alternatives },
                { letter: "N", label: "Ehtiyoj", description: "Asl ehtiyoj va ahamiyati", stage: q.need ?? q.nuances },
                { letter: "O", label: "Natija", description: "Kutilayotgan natija", stage: q.outcome ?? q.limits },
              ];
              return stages.map((s, i) => {
                if (!s.stage) return null;
                const asked = s.stage.asked === true;
                const askedColor = "#2fcc6e";
                const skipColor = "#ef4444";
                const accent = asked ? askedColor : skipColor;
                return (
                  <div
                    key={i}
                    className="relative p-3 sm:p-4 rounded-xl transition-transform hover:-translate-y-0.5"
                    style={{
                      backgroundColor: asked
                        ? "rgba(47,204,110,0.06)"
                        : "var(--color-bg)",
                      border: `1px solid ${asked ? "rgba(47,204,110,0.25)" : "var(--color-border)"}`,
                      boxShadow: asked
                        ? "0 4px 14px -8px rgba(47,204,110,0.35)"
                        : "0 2px 8px -4px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* SOPRANO harf — inline, kartochka ichida */}
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center font-black text-base sm:text-lg"
                          style={{
                            backgroundColor: asked ? askedColor : "rgba(107,114,128,0.55)",
                            color: "#fff",
                            boxShadow: asked
                              ? `0 6px 16px -4px ${askedColor}66`
                              : "0 2px 6px rgba(0,0,0,0.12)",
                          }}
                        >
                          {s.letter}
                        </div>
                        {/* Tartib raqami — harf ostida kichik badge */}
                        <div
                          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                          style={{
                            backgroundColor: "var(--color-card-bg)",
                            border: "1px solid var(--color-border)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {i + 1}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                            {s.label}
                          </p>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{
                              backgroundColor: `${accent}1f`,
                              color: accent,
                            }}
                          >
                            {asked ? "✓ So'raldi" : "✗ Tashlab ketildi"}
                          </span>
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                          {s.description}
                        </p>
                        {s.stage.value && (
                          <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "var(--text-primary)" }}>
                            {s.stage.value}
                          </p>
                        )}
                        {s.stage.evidence && id && (
                          <div className="text-[11px] mt-1 italic leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                            <TimestampText
                              text={`"${s.stage.evidence}"`}
                              onJump={(sec) => navigate(`/audio/${id}/transcription?t=${sec}`)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          </div>
          </div>
        </div>
        );
      })()}

      {analysis &&
        ((analysis.callStructure && analysis.callStructure.phases.length > 0) ||
          (analysis.questionsData &&
            ((analysis.questionsData as any).managerTotal > 0 ||
              (analysis.questionsData as any).clientTotal > 0))) && (
          <SectionHeader title="Qo'ng'iroq tuzilishi va sifati" />
        )}

      {/* B4-1: Call Structure */}
      {analysis?.callStructure && analysis.callStructure.phases.length > 0 && id && (
        <Card title={`📞 Qo'ng'iroq tuzilmasi — ${analysis.callStructure.structureScore}% sifat`}>
          <div className="space-y-2.5">
            {analysis.callStructure.phases.map((phase, i) => {
              const color =
                phase.qualityScore >= 75 ? "#2fcc6e" :
                phase.qualityScore >= 50 ? "#e6a020" : "#e64545";
              return (
                <div
                  key={i}
                  className="relative rounded-xl p-3 transition-transform hover:-translate-y-0.5"
                  style={{
                    background: `linear-gradient(135deg, ${color}10, ${color}03)`,
                    border: `1px solid ${color}33`,
                  }}
                >
                  <span
                    className="absolute top-0 bottom-0 left-0 w-1 rounded-l-xl"
                    style={{ background: `linear-gradient(180deg, ${color}, ${color}cc)` }}
                  />
                  <div className="flex items-start gap-2.5 sm:gap-3 pl-2">
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>
                          {phase.name}
                        </span>
                        <button
                          onClick={() => navigate(`/audio/${id}/transcription?t=${parseTimeToSeconds(phase.startTime)}`)}
                          className="text-[11px] px-1.5 py-0.5 rounded-md font-mono font-semibold transition-all hover:scale-105"
                          style={{ backgroundColor: "rgba(59,94,245,0.15)", color: "#3b5ef5", border: "1px solid rgba(59,94,245,0.25)" }}
                        >
                          ▶ {phase.startTime}-{phase.endTime}
                        </button>
                      </div>
                      {phase.notes && (
                        <p className="text-xs sm:text-[13px] mt-1.5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          {phase.notes}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 flex flex-col items-end">
                      <p className="text-xl sm:text-2xl font-black leading-none" style={{ color }}>
                        {phase.qualityScore}%
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* B4-1: Questions Breakdown */}
      {analysis?.questionsData && (
        <Card title={`❓ Savollar tahlili — ${analysis.questionsData.questionQualityScore}% sifat`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3 mb-4">
            {[
              { label: "Menejer savollari", value: analysis.questionsData.managerTotal, color: "#3b5ef5" },
              { label: "Mijoz savollari", value: analysis.questionsData.clientTotal, color: "#8b5cf6" },
              { label: "Ochiq", value: analysis.questionsData.openCount, color: "#2fcc6e" },
              { label: "Yopiq", value: analysis.questionsData.closedCount, color: "#6b7280" },
            ].map((s) => (
              <div
                key={s.label}
                className="relative rounded-xl px-2 py-3 sm:p-3 text-center overflow-hidden transition-transform hover:-translate-y-0.5"
                style={{
                  background: `linear-gradient(135deg, ${s.color}14, ${s.color}03)`,
                  border: `1px solid ${s.color}33`,
                  boxShadow: `0 4px 14px -8px ${s.color}40`,
                }}
              >
                <span
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: `linear-gradient(90deg, transparent, ${s.color}, transparent)` }}
                />
                <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
                <p className="text-2xl sm:text-3xl font-black leading-none mt-1.5" style={{ color: s.color }}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {/* Questions breakdown — SOPRANO (yangi) yoki SPIN (eski analizlar) */}
          {(() => {
            const q = analysis.questionsData as any;
            const soprano = q.sopranoBreakdown;
            const spin = q.spinBreakdown;
            // Yangi: SOPRANO (7 faza)
            const sopranoCats = soprano
              ? [
                  { label: "S — Situation (Holat)", value: soprano.situation || 0 },
                  { label: "O — Objective (Maqsad)", value: soprano.objective || 0 },
                  { label: "P — Problem (Muammo)", value: soprano.problem || 0 },
                  { label: "R — Resources (Resurs)", value: soprano.resources || 0 },
                  { label: "A — Alternatives (Muqobil)", value: soprano.alternatives || 0 },
                  { label: "N — Need (Ehtiyoj)", value: soprano.need || 0 },
                  { label: "O — Outcome (Natija)", value: soprano.outcome || 0 },
                ]
              : null;
            // Eski: SPIN (4 faza)
            const spinCats = spin
              ? [
                  { label: "S — Situation (Holat)", value: spin.situation || 0 },
                  { label: "P — Problem (Muammo)", value: spin.problem || 0 },
                  { label: "I — Implication (Oqibat)", value: spin.implication || 0 },
                  { label: "N — Need-Payoff (Foyda)", value: spin.needPayoff || 0 },
                ]
              : null;
            const useSoprano = sopranoCats && sopranoCats.some((c) => c.value > 0);
            const useSpin = !useSoprano && spinCats && spinCats.some((c) => c.value > 0);
            if (!useSoprano && !useSpin) return null;
            const cats = useSoprano ? sopranoCats! : spinCats!;
            const title = useSoprano ? "SOPRANO METODOLOGIYASI" : "SPIN METODOLOGIYASI (eski tahlil)";
            return (
              <div className="mb-3">
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                  {title}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {cats.map((s, i) => (
                    <div
                      key={i}
                      className="p-2 rounded-lg text-center"
                      style={{ backgroundColor: "rgba(59,94,245,0.08)" }}
                    >
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</p>
                      <p className="text-lg font-bold mt-1" style={{ color: "#3b5ef5" }}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Top Questions */}
          {analysis.questionsData.topManagerQuestions.length > 0 && id && (
            <div className="mb-3">
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                📋 MENEJERNING ENG MUHIM SAVOLLARI
              </p>
              <div className="space-y-1">
                {analysis.questionsData.topManagerQuestions.slice(0, 5).map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <button
                      onClick={() => navigate(`/audio/${id}/transcription?t=${parseTimeToSeconds(q.timestamp)}`)}
                      className="flex-shrink-0 font-mono px-1.5 py-0.5 rounded hover:shadow-md"
                      style={{ backgroundColor: "rgba(59,94,245,0.15)", color: "#3b5ef5" }}
                    >
                      [{q.timestamp}] ▶
                    </button>
                    <span style={{ color: "var(--text-primary)" }}>{q.text}</span>
                    <span
                      className="px-1.5 py-0.5 rounded text-xs flex-shrink-0"
                      style={{
                        backgroundColor: q.type === "open" ? "rgba(47,204,110,0.15)" : "rgba(107,114,128,0.15)",
                        color: q.type === "open" ? "#2fcc6e" : "#6b7280",
                      }}
                    >
                      {q.type === "open" ? "ochiq" : "yopiq"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.questionsData.topClientQuestions.length > 0 && id && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                🔵 MIJOZ SAVOLLARI (engagement belgisi)
              </p>
              <div className="space-y-1">
                {analysis.questionsData.topClientQuestions.slice(0, 5).map((q, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <button
                      onClick={() => navigate(`/audio/${id}/transcription?t=${parseTimeToSeconds(q.timestamp)}`)}
                      className="flex-shrink-0 font-mono px-1.5 py-0.5 rounded hover:shadow-md"
                      style={{ backgroundColor: "rgba(139,92,246,0.15)", color: "#8b5cf6" }}
                    >
                      [{q.timestamp}] ▶
                    </button>
                    <span style={{ color: "var(--text-primary)" }}>{q.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* B4-1: Close Attempts */}
      {analysis?.closeAttempts && id && (
        <Card
          title={`🎯 Yopishga urinishlar — ${analysis.closeAttempts.totalCount} ta (${
            analysis.closeAttempts.quality === "none" ? "yo'q" :
            analysis.closeAttempts.quality === "weak" ? "zaif" :
            analysis.closeAttempts.quality === "good" ? "yaxshi" : "a'lo"
          })`}
        >
          {analysis.closeAttempts.attempts.length === 0 ? (
            <div className="p-3 rounded-lg" style={{ backgroundColor: "rgba(230,69,69,0.1)", border: "1px solid rgba(230,69,69,0.3)" }}>
              <p className="text-sm font-semibold" style={{ color: "#e64545" }}>
                ❌ Menejer umuman yopishga urinmagan
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-primary)" }}>
                Bu ko'p deallarning o'lishiga sabab. Har qo'ng'iroqda kamida 1 marta yopishga so'rang.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {analysis.closeAttempts.attempts.map((a, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg"
                  style={{
                    backgroundColor: a.successful ? "rgba(47,204,110,0.08)" : "rgba(230,160,32,0.08)",
                    borderLeft: `4px solid ${a.successful ? "#2fcc6e" : "#e6a020"}`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <button
                      onClick={() => navigate(`/audio/${id}/transcription?t=${parseTimeToSeconds(a.timestamp)}`)}
                      className="text-xs px-1.5 py-0.5 rounded font-mono hover:shadow-md"
                      style={{ backgroundColor: "rgba(59,94,245,0.15)", color: "#3b5ef5" }}
                    >
                      [{a.timestamp}] ▶
                    </button>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        backgroundColor: "var(--color-bg)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {a.type === "soft" ? "yumshoq" : a.type === "direct" ? "to'g'ridan" : a.type === "trial" ? "sinov" : "taxminiy"}
                    </span>
                    {a.successful && (
                      <span className="text-xs font-semibold" style={{ color: "#2fcc6e" }}>
                        ✅ Muvaffaqiyatli
                      </span>
                    )}
                  </div>
                  <p className="text-sm italic" style={{ color: "var(--text-primary)" }}>
                    💬 "{a.phrase}"
                  </p>
                  {a.clientResponse && (
                    <p className="text-xs mt-1 italic" style={{ color: "var(--text-secondary)" }}>
                      → Mijoz: "{a.clientResponse}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {analysis.closeAttempts.recommendation && (
            <div
              className="mt-3 p-3 rounded-lg"
              style={{ backgroundColor: "rgba(59,94,245,0.08)" }}
            >
              <p className="text-xs font-semibold mb-1" style={{ color: "#3b5ef5" }}>💡 TAVSIYA</p>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                {analysis.closeAttempts.recommendation}
              </p>
            </div>
          )}
        </Card>
      )}

      {analysis?.coachingInsights &&
        Object.keys(analysis.coachingInsights as any).length > 0 && (
          <SectionHeader title="Coaching" />
        )}

      {/* Follow-up alert — aniq sabab, nima qilish kerak va deadline bilan */}
      {analysis?.requiresFollowup && (() => {
        const reasonInfo: Record<string, { title: string; why: string; action: string }> = {
          thinking: {
            title: "Mijoz qaror qabul qilmagan ('o'ylayman')",
            why: "Mijoz aniq 'ha' yoki 'yo'q' demadi — ehtiyot bo'lyapti yoki ma'lumot yetarli emas.",
            action: "1–2 kun ichida qo'ng'iroq qiling. Mijozning o'ziga mos savollar tayyorlang, asosiy e'tirozni aniqlang va yechim taqdim eting.",
          },
          family_consultation: {
            title: "Yaqinlari bilan maslahat kerak",
            why: "Mijoz yakka qaror qabul qila olmaydi — oila/rahbar bilan kelishishi kerak.",
            action: "2–3 kun kuting, keyin qo'ng'iroq qiling. Mijozga maslahat uchun foydali materiallar (video, prezentatsiya, case) yuboring.",
          },
          boss_consultation: {
            title: "Rahbar bilan maslahat kerak",
            why: "Qaror qabul qiluvchi boshqa odam — menejer yakka so'ra olmaydi.",
            action: "Decision-maker bilan to'g'ridan-to'g'ri uchrashuv tashkil qiling. Mijozdan rahbarga yuboradigan qisqa materiallar so'rang.",
          },
          price: {
            title: "Narx masalasi hal bo'lmagan",
            why: "Mijoz narxdan shubhada — arzonroq variant yoki to'lov sharti kerak.",
            action: "1 kun ichida bo'lib to'lash, chegirma yoki alternativ paket bilan qayting.",
          },
          timing: {
            title: "Vaqt mos emas — keyinroq",
            why: "Hozir mijoz band yoki moliyaviy vaziyat mos emas.",
            action: "Mijoz aytgan vaqtda (1 hafta/oy) qayta qo'ng'iroq qiling. CRM-da reminder qo'ying.",
          },
          other: {
            title: "Follow-up kerak",
            why: "Suhbat yakunlanmadi — aniq keyingi qadam belgilanmagan.",
            action: "1–3 kun ichida qayta bog'laning. Oldingi suhbat kontekstini esga olib, aniq taklif bilan kiring.",
          },
        };
        const info = reasonInfo[analysis.followupReason || "other"] || reasonInfo.other;
        const deadlineLabel = analysis.followupDeadline
          ? (() => {
              const d = new Date(analysis.followupDeadline);
              const day = String(d.getDate()).padStart(2, "0");
              const month = String(d.getMonth() + 1).padStart(2, "0");
              return `${day}.${month}.${d.getFullYear()}`;
            })()
          : null;

        return (
          <Card className="border-l-4">
            <div
              className="flex items-start gap-3"
              style={{ borderLeft: `4px solid ${analysis.followupCompleted ? "#2fcc6e" : "#e64545"}`, paddingLeft: 8, marginLeft: -8 }}
            >
              <AlertTriangle
                size={22}
                className="mt-1 flex-shrink-0"
                style={{ color: analysis.followupCompleted ? "#2fcc6e" : "#e64545" }}
              />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                    🚨 FOLLOW-UP KERAK
                  </p>
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: analysis.followupCompleted
                        ? "rgba(47,204,110,0.15)"
                        : "rgba(230,69,69,0.15)",
                      color: analysis.followupCompleted ? "#2fcc6e" : "#e64545",
                    }}
                  >
                    {analysis.followupCompleted ? "✅ Bajarildi" : "❌ Hali bajarilmagan"}
                  </span>
                </div>

                <p className="text-sm font-bold mt-2" style={{ color: "var(--text-primary)" }}>
                  {info.title}
                </p>

                {analysis.followupPhrase && (
                  <div
                    className="mt-2 p-2 rounded-lg border-l-2 text-xs italic"
                    style={{
                      backgroundColor: "var(--color-bg)",
                      borderLeftColor: "#e6a020",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Mijoz dedi: "{analysis.followupPhrase}"
                  </div>
                )}

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div
                    className="p-2.5 rounded-lg"
                    style={{ backgroundColor: "rgba(230,160,32,0.08)" }}
                  >
                    <p className="text-2xs font-bold mb-1" style={{ color: "#e6a020" }}>
                      ❓ NEGA KERAK
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                      {info.why}
                    </p>
                  </div>
                  <div
                    className="p-2.5 rounded-lg"
                    style={{ backgroundColor: "rgba(47,204,110,0.08)" }}
                  >
                    <p className="text-2xs font-bold mb-1" style={{ color: "#2fcc6e" }}>
                      ✔️ NIMA QILISH
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-primary)" }}>
                      {info.action}
                    </p>
                  </div>
                </div>

                {deadlineLabel && !analysis.followupCompleted && (
                  <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                    ⏰ Muddati: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{deadlineLabel}</span>
                  </p>
                )}
              </div>
            </div>
          </Card>
        );
      })()}

      {/* Coaching Insights */}
      {analysis?.coachingInsights && id && (
        <CoachingInsightsBlock insights={analysis.coachingInsights} audioId={id} />
      )}

      {/* AI Chat */}
      {audio.status === "done" && id && isAuthenticated && <AIChat audioId={id} analysis={analysis} />}
    </Wrapper>
  );
};

export default AudioDetailPage;
