import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  label: string;
  count?: number;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  minWidth?: number;
  /** Tag-style chiplar bilan tanlanganlar ko'rinishi (false = "X ta tanlangan") */
  showChips?: boolean;
}

const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Tanlang",
  minWidth = 140,
  showChips = false,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectedLabels = options.filter((o) => value.includes(o.value));
  const displayText =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? selectedLabels[0]?.label || value[0]
        : `${value.length} ta tanlangan`;

  return (
    <div ref={ref} className="relative" style={{ minWidth }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="h-10 w-full px-3 pr-8 rounded-lg border text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent flex items-center justify-between gap-2 text-left"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: value.length > 0 ? "var(--color-accent, #6366f1)" : "var(--color-border)",
          color: value.length === 0 ? "var(--text-secondary)" : "var(--text-primary)",
        }}
      >
        <span className="truncate flex-1">{displayText}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {value.length > 0 && (
            <span
              onClick={clearAll}
              className="p-0.5 rounded hover:bg-border/60 transition-colors"
              role="button"
              aria-label="Tozalash"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
            style={{ color: "var(--text-secondary)" }}
          />
        </div>
      </button>

      {showChips && value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedLabels.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
              style={{
                backgroundColor: "var(--color-accent-soft, rgba(99,102,241,0.12))",
                color: "var(--color-accent, #6366f1)",
              }}
            >
              {opt.label}
              <button
                type="button"
                onClick={() => toggle(opt.value)}
                className="hover:opacity-70"
                aria-label="Olib tashlash"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div
          className="absolute z-30 mt-1 left-0 right-0 max-h-72 overflow-y-auto rounded-lg border shadow-lg py-1"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
            minWidth,
          }}
        >
          {options.length === 0 ? (
            <div
              className="px-3 py-2 text-xs text-center"
              style={{ color: "var(--text-secondary)" }}
            >
              Ma'lumot yo'q
            </div>
          ) : (
            options.map((opt) => {
              const selected = value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-border/40 transition-colors"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span
                    className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0"
                    style={{
                      borderColor: selected ? "var(--color-accent, #6366f1)" : "var(--color-border)",
                      backgroundColor: selected ? "var(--color-accent, #6366f1)" : "transparent",
                    }}
                  >
                    {selected && <Check size={12} className="text-white" />}
                  </span>
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.count !== undefined && (
                    <span
                      className="text-xs flex-shrink-0"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {opt.count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default MultiSelect;
