import React, { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface Props {
  text: string;
  onTimestampClick?: (callId: string, seconds: number) => void;
  onFeedback?: (rating: "up" | "down", reason?: string) => void | Promise<void>;
}

type Token =
  | { type: "h2"; content: string }
  | { type: "h3"; content: string }
  | { type: "quote"; content: string }
  | { type: "code"; content: string; lang?: string }
  | { type: "li"; content: string; ordered: boolean; index?: number }
  | { type: "p"; content: string }
  | { type: "blank" };

function parseTimeToSeconds(time: string): number {
  const parts = time.split(":").map((p) => parseInt(p, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

const AUDIO_LINK_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]\(audio:([a-zA-Z0-9_-]+)\)/g;

function renderInline(text: string, onTimestampClick?: Props["onTimestampClick"]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;

  AUDIO_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = AUDIO_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      out.push(...renderInlineNoLinks(text.slice(lastIdx, match.index), key++));
    }
    const time = match[1];
    const callId = match[2];
    out.push(
      <button
        key={`a${key++}`}
        onClick={() => onTimestampClick?.(callId, parseTimeToSeconds(time))}
        className="underline font-mono text-xs mx-0.5"
        style={{ color: "#3b5ef5" }}
        title="Audio shu daqiqadan boshlanadi"
      >
        [{time}]
      </button>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    out.push(...renderInlineNoLinks(text.slice(lastIdx), key++));
  }
  return out;
}

function renderInlineNoLinks(text: string, baseKey: number): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts: Array<{ type: "text" | "bold" | "italic" | "code" | "btime"; value: string }> = [];

  let cursor = 0;
  const combined = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[(\d{1,2}:\d{2}(?::\d{2})?)\](?!\()/g;
  let m: RegExpExecArray | null;
  while ((m = combined.exec(text)) !== null) {
    if (m.index > cursor) parts.push({ type: "text", value: text.slice(cursor, m.index) });
    if (m[1] !== undefined) parts.push({ type: "bold", value: m[1] });
    else if (m[2] !== undefined) parts.push({ type: "italic", value: m[2] });
    else if (m[3] !== undefined) parts.push({ type: "code", value: m[3] });
    else if (m[4] !== undefined) parts.push({ type: "btime", value: m[4] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor) });

  parts.forEach((p, i) => {
    if (p.type === "text") {
      out.push(<React.Fragment key={`${baseKey}-t${i}`}>{p.value}</React.Fragment>);
    } else if (p.type === "bold") {
      out.push(
        <strong key={`${baseKey}-b${i}`} style={{ color: "var(--text-primary)", fontWeight: 700 }}>
          {p.value}
        </strong>
      );
    } else if (p.type === "italic") {
      out.push(
        <em key={`${baseKey}-i${i}`} style={{ fontStyle: "italic" }}>
          {p.value}
        </em>
      );
    } else if (p.type === "code") {
      out.push(
        <code
          key={`${baseKey}-c${i}`}
          className="font-mono text-[13px]"
          style={{ color: "var(--text-primary)" }}
        >
          {p.value}
        </code>
      );
    } else if (p.type === "btime") {
      out.push(
        <span
          key={`${baseKey}-x${i}`}
          className="font-mono text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          [{p.value}]
        </span>
      );
    }
  });
  return out;
}

function tokenize(src: string): Token[] {
  const lines = src.split("\n");
  const tokens: Token[] = [];
  let i = 0;
  let listCounter = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      tokens.push({ type: "code", content: buf.join("\n"), lang });
      i++;
      listCounter = 0;
      continue;
    }

    if (!trimmed) {
      tokens.push({ type: "blank" });
      i++;
      listCounter = 0;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      tokens.push({ type: "h3", content: trimmed.slice(4) });
      i++;
      listCounter = 0;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      tokens.push({ type: "h2", content: trimmed.slice(3) });
      i++;
      listCounter = 0;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      tokens.push({ type: "h2", content: trimmed.slice(2) });
      i++;
      listCounter = 0;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const buf: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        buf.push(lines[i].trim().slice(2));
        i++;
      }
      tokens.push({ type: "quote", content: buf.join("\n") });
      listCounter = 0;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      tokens.push({ type: "li", content: trimmed.replace(/^[-*]\s+/, ""), ordered: false });
      i++;
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      listCounter += 1;
      tokens.push({
        type: "li",
        content: trimmed.replace(/^\d+\.\s+/, ""),
        ordered: true,
        index: listCounter,
      });
      i++;
      continue;
    }

    tokens.push({ type: "p", content: trimmed });
    i++;
    listCounter = 0;
  }
  return tokens;
}

const CoachingMarkdown: React.FC<Props> = ({ text, onTimestampClick, onFeedback }) => {
  const tokens = tokenize(text);
  const [feedbackState, setFeedbackState] = useState<"idle" | "up" | "down" | "submitting">("idle");
  const [downReason, setDownReason] = useState<string>("");
  const [showReasonInput, setShowReasonInput] = useState(false);

  const handleUp = async () => {
    if (feedbackState !== "idle" || !onFeedback) return;
    setFeedbackState("submitting");
    try {
      await onFeedback("up");
      setFeedbackState("up");
    } catch {
      setFeedbackState("idle");
    }
  };

  const handleDown = () => {
    if (feedbackState !== "idle") return;
    setShowReasonInput(true);
  };

  const submitDown = async () => {
    if (!onFeedback) return;
    setFeedbackState("submitting");
    try {
      await onFeedback("down", downReason.trim() || undefined);
      setFeedbackState("down");
      setShowReasonInput(false);
    } catch {
      setFeedbackState("idle");
    }
  };

  let firstH2Seen = false;

  return (
    <div
      className="leading-relaxed text-[15px]"
      style={{ color: "var(--text-primary)" }}
    >
      {tokens.map((tok, i) => {
        switch (tok.type) {
          case "h2": {
            const isFirst = !firstH2Seen;
            firstH2Seen = true;
            return (
              <div
                key={i}
                className={isFirst ? "mb-4" : "mt-10 pt-8 mb-4"}
                style={
                  isFirst
                    ? undefined
                    : { borderTop: "2px solid var(--color-border)" }
                }
              >
                <h2
                  className="text-xl md:text-2xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {renderInline(tok.content, onTimestampClick)}
                </h2>
              </div>
            );
          }

          case "h3":
            return (
              <h3
                key={i}
                className="text-base md:text-lg font-bold mt-6 mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                {renderInline(tok.content, onTimestampClick)}
              </h3>
            );

          case "quote":
            return (
              <blockquote
                key={i}
                className="my-3 pl-4 italic text-[14px] whitespace-pre-line"
                style={{
                  borderLeft: "3px solid var(--color-border)",
                  color: "var(--text-secondary)",
                }}
              >
                {renderInline(tok.content, onTimestampClick)}
              </blockquote>
            );

          case "code":
            return (
              <pre
                key={i}
                className="my-3 p-3 overflow-x-auto text-[13px] leading-relaxed rounded"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--text-primary)",
                  fontFamily: "ui-monospace, monospace",
                  whiteSpace: "pre-wrap",
                }}
              >
                {tok.content}
              </pre>
            );

          case "li": {
            if (tok.ordered) {
              return (
                <div key={i} className="flex gap-2 ml-2 my-1">
                  <span
                    className="flex-shrink-0 font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {tok.index}.
                  </span>
                  <span className="flex-1">{renderInline(tok.content, onTimestampClick)}</span>
                </div>
              );
            }
            return (
              <div key={i} className="flex gap-2 ml-2 my-1">
                <span className="flex-shrink-0" style={{ color: "var(--text-primary)" }}>
                  •
                </span>
                <span className="flex-1">{renderInline(tok.content, onTimestampClick)}</span>
              </div>
            );
          }

          case "p":
            return (
              <p key={i} className="my-2 leading-relaxed">
                {renderInline(tok.content, onTimestampClick)}
              </p>
            );

          case "blank":
            return null;

          default:
            return null;
        }
      })}

      {onFeedback && (
        <div
          className="mt-10 pt-6 flex items-center justify-between gap-3"
          style={{ borderTop: "2px solid var(--color-border)" }}
        >
          {feedbackState === "up" && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "#2fcc6e" }}>
              <ThumbsUp size={16} />
              <span>Rahmat! Bu coaching sizga foydali bo'lganini yodda tutdik.</span>
            </div>
          )}
          {feedbackState === "down" && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "#e64545" }}>
              <ThumbsDown size={16} />
              <span>Fikringiz qabul qilindi — yaxshilash uchun ishlatamiz.</span>
            </div>
          )}
          {feedbackState === "idle" && !showReasonInput && (
            <>
              <span className="text-xs text-secondary">Bu maslahat foydali bo'ldimi?</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUp}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ThumbsUp size={14} />
                  Foydali
                </button>
                <button
                  onClick={handleDown}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--text-primary)",
                  }}
                >
                  <ThumbsDown size={14} />
                  Noto'g'ri
                </button>
              </div>
            </>
          )}
          {feedbackState === "idle" && showReasonInput && (
            <div className="w-full space-y-2">
              <p className="text-xs text-secondary">Nima noto'g'ri edi? (ixtiyoriy)</p>
              <textarea
                value={downReason}
                onChange={(e) => setDownReason(e.target.value)}
                placeholder="Masalan: mijoz aslida 'qayta qo'ng'iroq qiling' degan edi, taslim emas"
                className="w-full p-2 text-xs rounded"
                style={{
                  background: "var(--color-bg-secondary)",
                  border: "1px solid var(--color-border)",
                  color: "var(--text-primary)",
                  minHeight: 60,
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={submitDown}
                  className="px-3 py-1.5 rounded text-xs font-semibold"
                  style={{
                    border: "1px solid var(--color-border)",
                    color: "var(--text-primary)",
                  }}
                >
                  Yuborish
                </button>
                <button
                  onClick={() => {
                    setShowReasonInput(false);
                    setDownReason("");
                  }}
                  className="px-3 py-1.5 rounded text-xs text-secondary"
                >
                  Bekor qilish
                </button>
              </div>
            </div>
          )}
          {feedbackState === "submitting" && (
            <div className="text-xs text-secondary">Yuborilmoqda...</div>
          )}
        </div>
      )}
    </div>
  );
};

export default CoachingMarkdown;
