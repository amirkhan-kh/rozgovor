import React, { useRef } from "react";
import { Bold, Italic, Underline, Strikethrough, Code, Link2, EyeOff } from "lucide-react";

/**
 * Telegram-style rich editor. Markdown belgilarini ishlatadi:
 *   *bold*, _italic_, __underline__, ~strike~, `code`, ||spoiler||, [text](url)
 * Klaviatura: Ctrl+B / Ctrl+I / Ctrl+U / Ctrl+Shift+X (strike) / Ctrl+E (code)
 * `value` — Markdown string.
 */
interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

const TelegramEditor: React.FC<Props> = ({ value, onChange, placeholder, rows = 8, className }) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrap = (before: string, after: string = before) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + (selected || "matn") + after + value.slice(end);
    onChange(next);
    setTimeout(() => {
      ta.focus();
      const newStart = start + before.length;
      const newEnd = newStart + (selected || "matn").length;
      ta.setSelectionRange(newStart, newEnd);
    }, 0);
  };

  const link = () => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || "matn";
    const url = window.prompt("Havola URL'i:", "https://");
    if (!url) return;
    const next = value.slice(0, start) + `[${selected}](${url})` + value.slice(end);
    onChange(next);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === "b" || e.key === "B") {
      e.preventDefault();
      wrap("*");
    } else if (e.key === "i" || e.key === "I") {
      e.preventDefault();
      wrap("_");
    } else if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      wrap("__");
    } else if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      wrap("`");
    } else if (e.shiftKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      wrap("~");
    }
  };

  return (
    <div className={`border border-border rounded-xl overflow-hidden ${className || ""}`}>
      <div className="flex items-center gap-1 p-2 border-b border-border bg-primary/30">
        <ToolbarBtn icon={<Bold size={14} />} label="Qalin (Ctrl+B)" onClick={() => wrap("*")} />
        <ToolbarBtn icon={<Italic size={14} />} label="Kursiv (Ctrl+I)" onClick={() => wrap("_")} />
        <ToolbarBtn icon={<Underline size={14} />} label="Tagchiziq (Ctrl+U)" onClick={() => wrap("__")} />
        <ToolbarBtn icon={<Strikethrough size={14} />} label="O'chirilgan (Ctrl+Shift+X)" onClick={() => wrap("~")} />
        <ToolbarBtn icon={<Code size={14} />} label="Kod (Ctrl+E)" onClick={() => wrap("`")} />
        <ToolbarBtn icon={<EyeOff size={14} />} label="Spoiler" onClick={() => wrap("||")} />
        <ToolbarBtn icon={<Link2 size={14} />} label="Havola" onClick={link} />
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        rows={rows}
        placeholder={placeholder}
        className="w-full p-3 bg-card text-sm outline-none resize-y"
      />
    </div>
  );
};

const ToolbarBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({
  icon,
  label,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={label}
    className="p-1.5 rounded hover:bg-card transition-colors"
  >
    {icon}
  </button>
);

/**
 * Markdown → HTML rendering (Telegram subset)
 */
export function renderTelegramMarkdown(md: string): string {
  let h = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Order matters: spoiler/underline before italic/bold
  h = h.replace(/\|\|([^|]+)\|\|/g, '<span class="bg-secondary text-secondary px-1 rounded">$1</span>');
  h = h.replace(/__([^_]+)__/g, "<u>$1</u>");
  h = h.replace(/\*([^*]+)\*/g, "<b>$1</b>");
  h = h.replace(/(^|\s)_([^_]+)_/g, "$1<i>$2</i>");
  h = h.replace(/~([^~]+)~/g, "<s>$1</s>");
  h = h.replace(/`([^`]+)`/g, '<code class="px-1 bg-primary rounded text-[0.9em]">$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent underline" target="_blank" rel="noopener">$1</a>');
  h = h.replace(/\n/g, "<br/>");
  return h;
}

export default TelegramEditor;
