import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Search,
  Sparkles,
  Phone,
  Calendar as CalendarIcon,
  X,
  MessageCircle,
  User,
  Wrench,
  Users as UsersIcon,
  Headphones,
  History as HistoryIcon,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import { searchService } from "../../services/search.service";
import { ConversationSearchResult, ConversationSearchSource } from "../../types";

const EXAMPLE_QUESTIONS = [
  "Oxirgi haftada qaysi mijozlarda narx e'tirozi bo'ldi?",
  "Qaysi qo'ng'iroqlarda mijoz CEO yoki direktor bilan gaplashishni so'radi?",
  "Kimlar 'o'ylayman' dedi va qaytarilmadi?",
  "Mijoz chegirma so'ragan qo'ng'iroqlar",
];

const UZ_MONTHS_SHORT = [
  "yan", "fev", "mar", "apr", "may", "iyn",
  "iyl", "avg", "sen", "okt", "noy", "dek",
];
const formatUzDate = (d: Date): string =>
  `${d.getDate()} ${UZ_MONTHS_SHORT[d.getMonth()]}`;

const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// "MM:SS" yoki "HH:MM:SS" → soniya. Noto'g'ri format bo'lsa 0.
const parseTimeToSeconds = (ts: string | null | undefined): number => {
  if (!ts) return 0;
  const parts = ts.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
};

// Audio ga link — agar timestamp bo'lsa transkripsiya sahifasiga ?t= bilan
const buildAudioLink = (audioId: string, ts: string | null): string => {
  const seconds = parseTimeToSeconds(ts);
  if (seconds > 0) return `/audio/${audioId}/transcription?t=${seconds}`;
  return `/audio/${audioId}`;
};

const defaultRange = (): DateRange => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
};

// ── Session cache — qidiruv natijasi sahifa ochilganda saqlansin ──
const SESSION_KEY = "ai-search-session";
interface SessionState {
  question: string;
  result: ConversationSearchResult | null;
  dateFrom?: string;
  dateTo?: string;
}
const loadSession = (): SessionState | null => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const saveSession = (s: SessionState) => {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {}
};

// ── Qidiruv tarixi (localStorage) ──────────────────────
const HISTORY_KEY = "ai-search-history";
const HISTORY_LIMIT = 10;

const loadHistory = (): string[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const saveHistory = (list: string[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch {}
};

const SearchPage: React.FC = () => {
  // Session cache'dan dastlabki state (qaytib kelganda tiklash)
  const cached = loadSession();
  const [question, setQuestion] = useState(cached?.question || "");
  const [range, setRange] = useState<DateRange | undefined>(() => {
    if (cached?.dateFrom && cached?.dateTo) {
      return {
        from: new Date(cached.dateFrom),
        to: new Date(cached.dateTo),
      };
    }
    return defaultRange();
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [result, setResult] = useState<ConversationSearchResult | null>(
    cached?.result || null
  );
  const [focusedRef, setFocusedRef] = useState<number | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchBarRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const sourceRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  // Suggest dropdown — search bar'dan tashqariga bosilganda yopiladi
  useEffect(() => {
    if (!suggestOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        searchBarRef.current &&
        !searchBarRef.current.contains(e.target as Node)
      ) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [suggestOpen]);

  // Tarix + misollarni bitta ro'yxatga yig'ish va query'ga mos filter
  // { text, isHistory } strukturasi — renderda history ga clock + X ko'rsatish uchun
  const filteredSuggestions = useMemo(() => {
    const q = question.trim().toLowerCase();
    const items: Array<{ text: string; isHistory: boolean }> = [];

    // 1) History — dublikatsiz, eng yaqinda yozilgan birinchi
    for (const h of history) {
      if (!q || h.toLowerCase().includes(q)) {
        items.push({ text: h, isHistory: true });
      }
    }
    // 2) Misollar — history'da yo'q bo'lganlar
    const historySet = new Set(history.map((h) => h.toLowerCase()));
    for (const ex of EXAMPLE_QUESTIONS) {
      if (historySet.has(ex.toLowerCase())) continue;
      if (!q || ex.toLowerCase().includes(q)) {
        items.push({ text: ex, isHistory: false });
      }
    }
    return items;
  }, [question, history]);

  // History'ga yangi savol qo'shish (eng yuqoriga, dublikatsiz)
  const pushToHistory = (text: string) => {
    const v = text.trim();
    if (!v) return;
    const next = [v, ...history.filter((h) => h.toLowerCase() !== v.toLowerCase())].slice(
      0,
      HISTORY_LIMIT
    );
    setHistory(next);
    saveHistory(next);
  };

  // Bitta history element'ni o'chirish
  const removeFromHistory = (text: string) => {
    const next = history.filter((h) => h !== text);
    setHistory(next);
    saveHistory(next);
  };

  // Hamma history'ni tozalash
  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const mut = useMutation({
    mutationFn: () =>
      searchService.ask(question, {
        dateFrom: range?.from ? toLocalDateStr(range.from) : undefined,
        dateTo: range?.to ? toLocalDateStr(range.to) : undefined,
      }),
    onSuccess: (data) => {
      setResult(data);
      setFocusedRef(null);
      pushToHistory(question);
      saveSession({
        question,
        result: data,
        dateFrom: range?.from?.toISOString(),
        dateTo: range?.to?.toISOString(),
      });
    },
  });

  const submit = () => {
    if (question.trim().length < 3) return;
    mut.mutate();
  };

  const rangeLabel = (): string => {
    if (!range?.from) return "Sana tanlang";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };

  // [1] [2] ref'larga ko'chish
  const scrollToRef = (n: number) => {
    const el = sourceRefs.current[n];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFocusedRef(n);
      setTimeout(() => setFocusedRef(null), 2000);
    }
  };

  return (
    <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto">
      {/* ── Header ──────────────────────────────── */}
      <div className="mb-5">
        <h1
          className="text-2xl font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <Sparkles size={24} style={{ color: "#3b5ef5" }} />
          AI Mode
        </h1>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Qo'ng'iroqlardan aniq, kontekst bilan javob va yechim
        </p>
      </div>

      {/* ── Search bar ──────────────────────────── */}
      <div
        ref={searchBarRef}
        onClick={(e) => {
          // Agar tugma/popover ichida bo'lmasa — inputga focus bering
          const target = e.target as HTMLElement;
          if (target.closest("button, a, input, [data-nofocus]")) return;
          inputRef.current?.focus();
        }}
        className="relative rounded-2xl border p-2 flex items-center gap-2 mb-5 flex-wrap cursor-text"
        style={{
          backgroundColor: "transparent",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex-1 min-w-[240px] relative flex items-center">
          <Search
            size={18}
            className="absolute left-3"
            style={{ color: "var(--text-secondary)" }}
          />
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              setSuggestOpen(true);
              setSuggestIndex(-1);
            }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && suggestOpen && filteredSuggestions.length > 0) {
                e.preventDefault();
                setSuggestIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
              } else if (e.key === "ArrowUp" && suggestOpen) {
                e.preventDefault();
                setSuggestIndex((i) => Math.max(i - 1, -1));
              } else if (e.key === "Escape") {
                setSuggestOpen(false);
                setSuggestIndex(-1);
              } else if (e.key === "Enter") {
                if (suggestIndex >= 0 && filteredSuggestions[suggestIndex]) {
                  setQuestion(filteredSuggestions[suggestIndex].text);
                  setSuggestOpen(false);
                  setSuggestIndex(-1);
                } else {
                  setSuggestOpen(false);
                  submit();
                }
              }
            }}
            placeholder="Biror savol bering..."
            className="w-full pl-10 pr-9 py-2.5 bg-transparent focus:outline-none text-sm"
            style={{ color: "var(--text-primary)" }}
          />
          {(question || result) && (
            <button
              onClick={() => {
                setQuestion("");
                setResult(null);
                setSuggestOpen(false);
                setSuggestIndex(-1);
                setFocusedRef(null);
                try {
                  sessionStorage.removeItem(SESSION_KEY);
                } catch {}
              }}
              className="absolute right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:opacity-80"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--text-secondary)",
              }}
              title="Tozalash (Esc)"
              aria-label="Tozalash"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Calendar */}
        <div className="relative" ref={popoverRef}>
          <button
            onClick={() => setCalendarOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all"
            style={{
              backgroundColor: "var(--color-bg)",
              borderColor: "var(--color-border)",
              color: "var(--text-primary)",
            }}
          >
            <CalendarIcon size={15} />
            <span className="hidden sm:inline">{rangeLabel()}</span>
          </button>

          {calendarOpen && (
            <div
              className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden"
              style={{
                backgroundColor: "var(--color-card-bg)",
                borderColor: "var(--color-border)",
                minWidth: 320,
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Sana oralig'i
                </span>
                <button
                  onClick={() => setCalendarOpen(false)}
                  className="p-1 rounded hover:opacity-70"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="p-3">
                <DayPicker
                  mode="range"
                  selected={range}
                  onSelect={setRange}
                  locale={uz}
                  weekStartsOn={1}
                  numberOfMonths={1}
                  className="sales-daypicker"
                />
              </div>
              <div
                className="flex items-center justify-between gap-2 px-4 py-3 border-t"
                style={{ borderColor: "var(--color-border)" }}
              >
                <button
                  onClick={() => setRange(defaultRange())}
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  30 kun
                </button>
                <button
                  onClick={() => setCalendarOpen(false)}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold"
                  style={{ backgroundColor: "#3b5ef5", color: "#fff" }}
                >
                  Qo'llash
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={submit}
          disabled={question.trim().length < 3 || mut.isPending}
          className="px-5 py-2.5 rounded-xl font-medium disabled:opacity-50 transition-all"
          style={{ backgroundColor: "#3b5ef5", color: "#fff" }}
        >
          {mut.isPending ? "Qidirilmoqda..." : "Qidirish"}
        </button>

        {/* ── Suggest dropdown (YouTube uslubi) ─────── */}
        {suggestOpen && filteredSuggestions.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full mt-2 z-40 rounded-2xl shadow-2xl border overflow-hidden"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
            }}
          >
            {filteredSuggestions.map((item, idx) => {
              const active = idx === suggestIndex;
              const s = item.text;
              // Foydalanuvchi yozgan qismni bold qilish
              const q = question.trim();
              const renderHighlighted = () => {
                if (!q) return s;
                const lower = s.toLowerCase();
                const qLower = q.toLowerCase();
                const matchIdx = lower.indexOf(qLower);
                if (matchIdx < 0) return s;
                return (
                  <>
                    {s.slice(0, matchIdx)}
                    <strong style={{ color: "var(--text-primary)" }}>
                      {s.slice(matchIdx, matchIdx + q.length)}
                    </strong>
                    {s.slice(matchIdx + q.length)}
                  </>
                );
              };
              return (
                <div
                  key={`${item.isHistory ? "h" : "e"}-${s}`}
                  onMouseEnter={() => setSuggestIndex(idx)}
                  className="group w-full flex items-center gap-2 pl-4 pr-2 py-2.5 text-sm transition-colors"
                  style={{
                    backgroundColor: active
                      ? "rgba(59,94,245,0.08)"
                      : "transparent",
                  }}
                >
                  <button
                    onClick={() => {
                      setQuestion(s);
                      setSuggestOpen(false);
                      setSuggestIndex(-1);
                    }}
                    className="flex-1 flex items-center gap-3 text-left min-w-0"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {item.isHistory ? (
                      <HistoryIcon
                        size={14}
                        className="flex-shrink-0"
                        style={{ color: "var(--text-secondary)" }}
                      />
                    ) : (
                      <Search
                        size={14}
                        className="flex-shrink-0"
                        style={{ color: "var(--text-secondary)" }}
                      />
                    )}
                    <span className="truncate">{renderHighlighted()}</span>
                  </button>

                  {/* X tugma — faqat history elementlarida (doim ko'rinadi) */}
                  {item.isHistory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromHistory(s);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all hover:bg-white/10"
                      style={{ color: "var(--text-secondary)" }}
                      title="Tarixdan o'chirish"
                      aria-label="O'chirish"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Hamma tarixni tozalash footer (faqat history bor bo'lsa) */}
            {history.length > 0 && (
              <div
                className="flex items-center justify-between border-t px-4 py-2"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)", opacity: 0.7 }}
                >
                  Qidiruv tarixi
                </span>
                <button
                  onClick={() => {
                    clearHistory();
                  }}
                  className="text-xs font-medium hover:underline"
                  style={{ color: "#ef4444" }}
                >
                  Hammasini tozalash
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Loading ─────────────────────────────── */}
      {mut.isPending && (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <Sparkles
            size={24}
            className="mx-auto mb-2 animate-pulse"
            style={{ color: "#3b5ef5" }}
          />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Transkripsiyalar tahlil qilinmoqda...
          </p>
        </div>
      )}

      {/* ── Error banner ────────────────────────── */}
      {mut.isError && !mut.isPending && (
        <div
          className="rounded-2xl border p-5 flex items-start gap-3"
          style={{
            backgroundColor: "rgba(239,68,68,0.05)",
            borderColor: "rgba(239,68,68,0.4)",
          }}
        >
          <AlertTriangle
            size={20}
            className="flex-shrink-0 mt-0.5"
            style={{ color: "#ef4444" }}
          />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {(() => {
                const e: any = mut.error;
                const status = e?.response?.status;
                if (status === 429) return "AI limiti tugadi";
                if (status === 504) return "Javob juda uzoq kutildi";
                if (status === 502) return "AI javob berdi, lekin o'qib bo'lmadi";
                return "AI javob generatsiyada xatolik";
              })()}
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {(() => {
                const e: any = mut.error;
                return (
                  e?.response?.data?.error ||
                  e?.message ||
                  "Qayta urinib ko'ring yoki biroz kuting."
                );
              })()}
            </p>
          </div>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: "#ef4444", color: "#fff" }}
          >
            <RefreshCw size={13} />
            Qayta urinish
          </button>
        </div>
      )}

      {/* ── Result ──────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          {/* 1) Statistika tepada — faqat mazmunli javob bo'lsa va natija bor bo'lsa */}
          {result.sources.length > 0 && (
            <StatsBar result={result} />
          )}

          {/* 2) AI javob */}
          <div
            className="rounded-2xl border p-5"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
            }}
          >
            <AiMarkdown markdown={result.answer} onRefClick={scrollToRef} />
          </div>

          {/* 3) Batafsil kartalar — faqat AI tahlil qilgan qo'ng'iroqlar */}
          {result.sources.length > 0 && (
            <div className="space-y-3">
              <h2
                className="text-base font-bold flex items-center gap-2 px-1"
                style={{ color: "var(--text-primary)" }}
              >
                <Phone size={18} style={{ color: "#3b5ef5" }} />
                Batafsil qo'ng'iroqlar ({result.sources.length})
              </h2>

              {result.sources.map((s, i) => (
                <SourceCard
                  key={s.audioFileId}
                  source={s}
                  index={i + 1}
                  isFocused={focusedRef === i + 1}
                  innerRef={(el) => (sourceRefs.current[i + 1] = el)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Markdown renderer + [N] ref'larga click ────────────
const AiMarkdown: React.FC<{
  markdown: string;
  onRefClick: (n: number) => void;
}> = ({ markdown, onRefClick }) => {
  // [N] ni special placeholder'ga almashtirib, ReactMarkdown'da custom render
  const processed = useMemo(
    () => markdown.replace(/\[(\d+)\]/g, "`__REF_$1__`"),
    [markdown]
  );

  return (
    <div
      className="prose-ai max-w-none"
      style={{ color: "var(--text-primary)" }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-2 text-[15px] leading-relaxed">{children}</p>
          ),
          strong: ({ children }) => (
            <strong
              className="font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="my-3 space-y-1.5 list-disc pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-3 space-y-1.5 list-decimal pl-5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-[15px] leading-relaxed">{children}</li>
          ),
          h1: ({ children }) => (
            <h1 className="text-lg font-bold mt-4 mb-2">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold mt-4 mb-2">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold mt-3 mb-2 uppercase tracking-wider">
              {children}
            </h3>
          ),
          blockquote: ({ children }) => (
            <blockquote
              className="border-l-4 pl-3 my-3 italic text-sm"
              style={{
                borderColor: "#f59e0b",
                backgroundColor: "rgba(245,158,11,0.06)",
                color: "var(--text-secondary)",
              }}
            >
              {children}
            </blockquote>
          ),
          code: ({ children }) => {
            const text = String(children);
            const refMatch = text.match(/^__REF_(\d+)__$/);
            if (refMatch) {
              const n = Number(refMatch[1]);
              return (
                <button
                  onClick={() => onRefClick(n)}
                  className="inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded mx-0.5 align-middle transition-all hover:scale-110"
                  style={{
                    backgroundColor: "rgba(59,94,245,0.15)",
                    color: "#3b5ef5",
                    minWidth: 20,
                  }}
                  title={`Manba ${n} — ko'rish`}
                >
                  {n}
                </button>
              );
            }
            return (
              <code
                className="px-1.5 py-0.5 rounded text-[13px] font-mono"
                style={{
                  backgroundColor: "rgba(139,92,246,0.12)",
                  color: "var(--text-primary)",
                }}
              >
                {children}
              </code>
            );
          },
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "#3b5ef5" }}
            >
              {children}
            </a>
          ),
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
};

// ── Adaptive stats bar (tepada, faqat mazmunli statlar) ─────
interface StatItem {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
}

const StatsBar: React.FC<{ result: ConversationSearchResult }> = ({
  result,
}) => {
  const stats: StatItem[] = [];
  if (result.stats.totalCalls > 0) {
    stats.push({
      label: "Qo'ng'iroq",
      value: result.stats.totalCalls,
      icon: <Headphones size={18} />,
      color: "#3b5ef5",
    });
  }
  if (result.stats.uniqueClients > 0) {
    stats.push({
      label: "Mijoz",
      value: result.stats.uniqueClients,
      icon: <User size={18} />,
      color: "#22c55e",
    });
  }
  if (result.stats.uniqueManagers > 0) {
    stats.push({
      label: "Menejer",
      value: result.stats.uniqueManagers,
      icon: <UsersIcon size={18} />,
      color: "#f59e0b",
    });
  }
  if (result.stats.topPhrases.length > 0) {
    stats.push({
      label: "Iboralar",
      value: result.stats.topPhrases.length,
      icon: <MessageCircle size={18} />,
      color: "#8b5cf6",
    });
  }

  if (stats.length === 0) return null;

  return (
    <div className="space-y-3">
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))`,
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border p-4 flex items-center gap-3"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
            }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${s.color}22`, color: s.color }}
            >
              {s.icon}
            </div>
            <div className="min-w-0">
              <p
                className="text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--text-secondary)", opacity: 0.75 }}
              >
                {s.label}
              </p>
              <p
                className="text-2xl font-black leading-none mt-0.5"
                style={{ color: "var(--text-primary)" }}
              >
                {s.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Top iboralar — pill'lar ko'rinishida */}
      {result.stats.topPhrases.length > 0 && (
        <div
          className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-wider mr-1"
            style={{ color: "var(--text-secondary)", opacity: 0.75 }}
          >
            Top iboralar:
          </span>
          {result.stats.topPhrases.map((p, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: "rgba(139,92,246,0.15)",
                color: "var(--text-primary)",
              }}
            >
              {p.phrase}
              <span
                className="text-[10px] font-bold px-1.5 rounded-full"
                style={{ backgroundColor: "#8b5cf6", color: "#fff" }}
              >
                {p.count}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ── SourceCard — har qo'ng'iroq uchun batafsil ─────────
const SourceCard: React.FC<{
  source: ConversationSearchSource;
  index: number;
  isFocused: boolean;
  innerRef: (el: HTMLDivElement | null) => void;
}> = ({ source: s, index, isFocused, innerRef }) => (
  <div
    ref={innerRef}
    className="rounded-2xl border overflow-hidden transition-all"
    style={{
      backgroundColor: "var(--color-card-bg)",
      borderColor: isFocused ? "#3b5ef5" : "var(--color-border)",
      boxShadow: isFocused ? "0 0 0 3px rgba(59,94,245,0.15)" : "none",
    }}
  >
    {/* Header */}
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold flex-shrink-0"
          style={{
            backgroundColor: "rgba(59,94,245,0.15)",
            color: "#3b5ef5",
          }}
        >
          {index}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Phone size={14} style={{ color: "var(--text-secondary)" }} />
            <span
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {s.clientName || s.clientPhone || "Nomalum"}
            </span>
            {s.clientName && s.clientPhone && (
              <span
                className="text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                · {s.clientPhone}
              </span>
            )}
          </div>
          {s.managerName && (
            <div
              className="text-xs mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Menejer: {s.managerName}
              {s.callDate && (
                <> · {new Date(s.callDate).toLocaleDateString("uz-UZ")}</>
              )}
            </div>
          )}
        </div>
      </div>
      <Link
        to={buildAudioLink(s.audioFileId, s.timestamp)}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-1"
        style={{
          backgroundColor: "rgba(59,94,245,0.1)",
          color: "#3b5ef5",
        }}
      >
        {s.timestamp && s.timestamp !== "00:00" ? (
          <>▶ {s.timestamp}ga o'tish</>
        ) : (
          <>Qo'ng'iroqqa o'tish →</>
        )}
      </Link>
    </div>

    {/* Body */}
    <div className="p-4 space-y-3">
      {/* Kontekst — ixcham, kichik, faqat agar mazmunli bo'lsa */}
      {s.context && s.context.trim().length > 0 && (
        <p
          className="text-xs leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-wider mr-2"
            style={{ color: "#06b6d4" }}
          >
            Kontekst:
          </span>
          {s.context}
        </p>
      )}

      {s.clientQuote && (
        <div
          className="rounded-lg p-3 border-l-4"
          style={{
            backgroundColor: "rgba(245,158,11,0.08)",
            borderColor: "#f59e0b",
          }}
        >
          <div
            className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "#f59e0b" }}
          >
            <User size={11} />
            Mijoz aytdi
          </div>
          <p
            className="text-sm italic"
            style={{ color: "var(--text-primary)" }}
          >
            "{s.clientQuote}"
          </p>
        </div>
      )}

      {s.managerResponse && (
        <div
          className="rounded-lg p-3 border-l-4"
          style={{
            backgroundColor: "rgba(107,114,128,0.08)",
            borderColor: "#6b7280",
          }}
        >
          <div
            className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "#6b7280" }}
          >
            <Phone size={11} />
            Menejer javobi
          </div>
          <p
            className="text-sm italic"
            style={{ color: "var(--text-primary)" }}
          >
            "{s.managerResponse}"
          </p>
        </div>
      )}

      <div
        className="rounded-lg p-3 border-l-4"
        style={{
          backgroundColor: "rgba(34,197,94,0.08)",
          borderColor: "#22c55e",
        }}
      >
        <div
          className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: "#22c55e" }}
        >
          <Wrench size={11} />
          Tavsiya qilingan yechim
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--text-primary)" }}
        >
          {s.suggestedSolution}
        </p>
      </div>
    </div>
  </div>
);

export default SearchPage;
