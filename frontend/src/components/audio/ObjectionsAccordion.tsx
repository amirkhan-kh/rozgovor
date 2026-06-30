import React, { useState } from "react";
import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";

interface CriticalMoment {
  timestamp: string;
  whatHappened?: string;
  whatManagerDid?: string;
  whatToDoInstead?: string;
  technique?: string;
}

interface AnalysisData {
  errors?: Array<{ type: string; description?: string; timestamp?: string }>;
  lossPoints?: Array<{ description: string; timestamp: string }>;
  coachingInsights?: {
    criticalMoments?: CriticalMoment[];
  } | null;
}

interface Objection {
  name: string;
  value: number;
}

interface Props {
  objData: Objection[];
  analysis: AnalysisData;
  audioId: string;
  /** Audio playerga ega bo'lsa — currentTime jump qiladi. Aks holda transcription'ga navigate. */
  onJumpInPage?: (seconds: number) => void;
}

const TYPE_COLOR: Record<string, string> = {
  Narx: "var(--ds-danger)",
  Vaqt: "var(--ds-warning)",
  Ishonch: "var(--ds-primary)",
  Raqobat: "#7c3aed",
  "Kerak emas": "var(--ds-text-muted)",
  Kechiktirish: "var(--ds-info)",
  Boshqa: "#9ca3af",
};

const TYPE_BG: Record<string, string> = {
  Narx: "var(--ds-danger-bg)",
  Vaqt: "var(--ds-warning-bg)",
  Ishonch: "var(--ds-primary-bg)",
  Raqobat: "rgba(124, 58, 237, 0.12)",
  "Kerak emas": "var(--ds-bg-overlay)",
  Kechiktirish: "var(--ds-info-bg)",
  Boshqa: "var(--ds-bg-overlay)",
};

const TYPE_SOLUTION: Record<string, string> = {
  Narx: "Narxni qiymat bilan bog'lang. Davron texnikasi: 'Bu 2.5M emas, balki bolangizning kelajagi'. Avval qiymatni ko'rsating, keyin narx aytiladi.",
  Vaqt: "Aniq sana va vaqt belgilang. 'Vaqtim yo'q' degan mijozga 'qulay vaqtingiz qachon — ertaga 10:00 yoki 14:00?' deb so'rang.",
  Ishonch: "Ijtimoiy dalil va kafolat bering. Real o'quvchilar misoli, sertifikat, kafolat sharti haqida gapiring.",
  Raqobat: "Raqobatchini yerga urmang — qiymatni solishtiring. 'X kompaniyada nima bor?' deb so'rab, keyin sizning afzalliklaringizni ayting.",
  "Kerak emas": "Ehtiyojni aniqlang. 'Hozir kerak emas' degan mijozga SOPRANO savollari bering: 'Sizning maqsadingiz nima?' va 'Bu maqsadga qachon yetmoqchisiz?'",
  Kechiktirish: "Sabab so'rang. 'O'ylab ko'rasizmi yoki konkret bir narsa qiyin?' Keyin shu sababga qarata javob bering.",
  Boshqa: "Avval mijozning his-tuyg'usini tasdiqlang, keyin aniq savol bilan e'tirozni AYNAN AYTTIRING.",
};

const FALLBACK_COLORS = ["#ef4444", "#f59e0b", "#3b5ef5", "#10b981", "#7c7c9a"];

const parseTimeToSeconds = (t: string): number => {
  const m = t.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  if (m[3]) return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

/**
 * ObjectionsAccordion — Top mijoz e'tirozlari (donut + accordion).
 *
 * Matching strategy (priority order):
 *  1. Critical moment matching by keyword (whatHappened/technique contains type)
 *  2. Loss point matching by keyword
 *  3. Error matching by keyword (errors with type containing "e'tiroz")
 *  4. INDEX-based fallback: i-th objection → i-th critical moment / loss point
 *
 * Birinchi item default ochiq holatda. Bosib ochish/yopish mumkin.
 */
const ObjectionsAccordion: React.FC<Props> = ({ objData, analysis, audioId, onJumpInPage }) => {
  const [expanded, setExpanded] = useState<string | null>(objData[0]?.name || null);

  const moments = (analysis.coachingInsights?.criticalMoments || []).filter(Boolean);
  const errors = analysis.errors || [];
  const losses = analysis.lossPoints || [];

  // Used moments tracking — index-based fallback uchun
  const usedMomentIndexes = new Set<number>();

  const enriched = objData.map((obj, i) => {
    const typeLower = obj.name.toLowerCase();

    // 1. Keyword match in critical moments
    let matchedMomentIdx = moments.findIndex((m) =>
      (m.whatHappened || "").toLowerCase().includes(typeLower) ||
      (m.technique || "").toLowerCase().includes(typeLower),
    );

    // 2. Index-based fallback
    if (matchedMomentIdx === -1 && i < moments.length) {
      // Topilmadi — i-chi positionga moslashtirib olamiz
      for (let j = 0; j < moments.length; j++) {
        if (!usedMomentIndexes.has(j)) {
          matchedMomentIdx = j;
          break;
        }
      }
    }

    if (matchedMomentIdx !== -1) usedMomentIndexes.add(matchedMomentIdx);
    const matchingMoment = matchedMomentIdx !== -1 ? moments[matchedMomentIdx] : null;

    // 3. Loss point fallback
    const matchingLoss = matchingMoment
      ? null
      : losses.find((l) => l.description.toLowerCase().includes(typeLower)) || losses[i];

    // 4. Error fallback
    const matchingError = (matchingMoment || matchingLoss)
      ? null
      : errors.find(
          (e) =>
            (e.description || "").toLowerCase().includes(typeLower) ||
            (e.type || "").toLowerCase().includes("e'tiroz"),
        );

    const description =
      matchingMoment?.whatHappened ||
      matchingLoss?.description ||
      matchingError?.description ||
      null;
    const timestamp =
      matchingMoment?.timestamp ||
      matchingLoss?.timestamp ||
      matchingError?.timestamp ||
      null;
    const managerSaid = matchingMoment?.whatManagerDid || null;
    const solution =
      matchingMoment?.whatToDoInstead ||
      TYPE_SOLUTION[obj.name] ||
      "Coach AI sahifasidan tegishli texnikani oling.";
    const technique = matchingMoment?.technique || null;

    return {
      ...obj,
      index: i,
      description,
      timestamp,
      managerSaid,
      solution,
      technique,
    };
  });

  const total = objData.reduce((s, o) => s + o.value, 0);
  const colorOf = (type: string, idx: number): string =>
    TYPE_COLOR[type] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
  const bgOf = (type: string): string => TYPE_BG[type] || "var(--ds-bg-overlay)";

  const handleJump = (timestamp: string) => {
    const seconds = parseTimeToSeconds(timestamp);
    if (onJumpInPage) {
      onJumpInPage(seconds);
    } else {
      window.location.href = `/audio/${audioId}/transcription?t=${seconds}`;
    }
  };

  const toggle = (name: string) => {
    setExpanded(expanded === name ? null : name);
  };

  return (
    <div className="ds-card p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle size={18} style={{ color: "var(--ds-text-secondary)" }} />
        <h3 className="ds-section-title">Mijoz e'tirozlari ({total})</h3>
      </div>

      <div>
        {/* Accordion only — donut chart olib tashlandi */}
        <div>
          <p
            className="text-2xs font-bold uppercase tracking-wider mb-3"
            style={{ color: "var(--ds-text-muted)" }}
          >
            Bosib ochish — mijoz nima degan + yechim
          </p>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {enriched.slice(0, 5).map((obj) => {
              const color = colorOf(obj.name, obj.index);
              const bg = bgOf(obj.name);
              const isOpen = expanded === obj.name;
              return (
                <div
                  key={obj.name}
                  className="rounded-lg overflow-hidden"
                  style={{
                    background: "var(--ds-bg-surface)",
                    border: "1px solid var(--ds-border-default)",
                    borderLeftWidth: 3,
                    borderLeftColor: color,
                  }}
                >
                  {/* Accordion header — clickable */}
                  <button
                    onClick={() => toggle(obj.name)}
                    className="w-full px-3 py-3 flex items-center justify-between transition-colors"
                    style={{ background: isOpen ? bg : "transparent" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-sm font-bold"
                        style={{ color: "var(--ds-text-primary)" }}
                      >
                        {obj.name}
                      </span>
                      <span
                        className="text-2xs font-bold px-1.5 py-0.5 rounded"
                        style={{ background: bg, color }}
                      >
                        {obj.value}
                      </span>
                      {obj.timestamp && (
                        <span
                          className="text-2xs font-mono"
                          style={{ color: "var(--ds-text-muted)" }}
                        >
                          {obj.timestamp}
                        </span>
                      )}
                    </div>
                    {isOpen ? (
                      <ChevronUp size={16} style={{ color: "var(--ds-text-muted)" }} />
                    ) : (
                      <ChevronDown size={16} style={{ color: "var(--ds-text-muted)" }} />
                    )}
                  </button>

                  {/* Accordion body — expanded */}
                  {isOpen && (
                    <div className="px-3 pb-3 space-y-3">
                      {/* Timestamp button */}
                      {obj.timestamp && (
                        <button
                          onClick={() => handleJump(obj.timestamp!)}
                          className="inline-flex items-center gap-1 text-xs font-mono px-2 py-1 rounded transition-opacity hover:opacity-80"
                          style={{
                            background: "var(--ds-primary-bg)",
                            border: "1px solid var(--ds-primary-br)",
                            color: "var(--ds-primary)",
                          }}
                          title="Audio'da shu vaqtga o'tish"
                        >
                          ▶ Vaqt: {obj.timestamp} · Tinglash
                        </button>
                      )}

                      {/* Mijoz nima degan */}
                      {obj.description && (
                        <div>
                          <p
                            className="text-2xs font-bold uppercase tracking-wider mb-1"
                            style={{ color: "var(--ds-text-muted)" }}
                          >
                            Mijoz nima degan
                          </p>
                          <p
                            className="text-sm leading-snug"
                            style={{ color: "var(--ds-text-primary)" }}
                          >
                            {obj.description}
                          </p>
                        </div>
                      )}

                      {/* Manager nima dedi */}
                      {obj.managerSaid && (
                        <div>
                          <p
                            className="text-2xs font-bold uppercase tracking-wider mb-1"
                            style={{ color: "var(--ds-danger)" }}
                          >
                            ❌ Menejer aytdi
                          </p>
                          <p
                            className="text-sm leading-snug italic"
                            style={{ color: "var(--ds-text-secondary)" }}
                          >
                            "{obj.managerSaid}"
                          </p>
                        </div>
                      )}

                      {/* Yechim */}
                      <div
                        className="pt-2"
                        style={{ borderTop: "1px dashed var(--ds-border-default)" }}
                      >
                        <p
                          className="text-2xs font-bold uppercase tracking-wider mb-1"
                          style={{ color: "var(--ds-success)" }}
                        >
                          💡 E'tiroz bo'yicha yechim
                        </p>
                        <p
                          className="text-sm leading-snug"
                          style={{ color: "var(--ds-text-primary)" }}
                        >
                          {obj.solution}
                        </p>
                        {obj.technique && (
                          <span
                            className="inline-block mt-2 text-2xs px-2 py-0.5 rounded-full font-semibold"
                            style={{
                              background: "var(--ds-primary-bg)",
                              border: "1px solid var(--ds-primary-br)",
                              color: "var(--ds-primary)",
                            }}
                          >
                            📚 {obj.technique}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ObjectionsAccordion;
