import React, { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import ManagerDeptFilter from "./ManagerDeptFilter";

interface Props {
  selected: string[];
  onChange: (ids: string[]) => void;
  accentColor?: string;
  fallbackManagers?: { id: string; name: string }[];
  /** Tugma yorlig'i tanlanmagan paytda (default: "Menejer") */
  emptyLabel?: string;
  /** Popover paneli kengligi (px). Default 320 */
  panelWidth?: number;
  /** Tugma compactligi: sm, md (default md) */
  size?: "sm" | "md";
  /** Tanlash rejimi: "multi" (default) — bir nechta menejer; "single" — bittasi */
  mode?: "single" | "multi";
  className?: string;
}

const ManagerDeptFilterTrigger: React.FC<Props> = ({
  selected,
  onChange,
  accentColor = "#22c55e",
  fallbackManagers = [],
  emptyLabel = "Menejer",
  panelWidth = 320,
  size = "md",
  mode = "multi",
  className,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const handleChange = (ids: string[]) => {
    if (mode === "single") {
      // single-select: faqat oxirgi tanlangan, yoki bo'sh
      if (ids.length === 0) {
        onChange([]);
      } else {
        const last = ids[ids.length - 1];
        // shu bilan birga tanlangan bo'lsa — bekor qilish
        if (selected.length === 1 && selected[0] === last) {
          onChange([]);
        } else {
          onChange([last]);
        }
        setOpen(false);
      }
    } else {
      onChange(ids);
    }
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const label = (() => {
    if (selected.length === 0) return emptyLabel;
    if (selected.length === 1) {
      const m = fallbackManagers.find((x) => x.id === selected[0]);
      return m?.name ?? `${selected.length} menejer`;
    }
    return `${selected.length} menejer`;
  })();

  const isCompact = size === "sm";

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`inline-flex items-center gap-1.5 rounded-lg border font-medium ${
          isCompact ? "h-8 px-2.5 text-[11px]" : "h-9 px-3 text-xs"
        }`}
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: selected.length > 0 ? accentColor : "var(--color-border)",
          color: "var(--text-primary)",
        }}
      >
        <User size={isCompact ? 12 : 13} style={{ color: accentColor }} />
        <span className="truncate max-w-[140px]">{label}</span>
        {selected.length > 0 && (
          <span
            className="inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-4"
            style={{ backgroundColor: accentColor, color: "#fff" }}
          >
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div
          className="absolute z-40 mt-2 left-0 rounded-xl border shadow-xl overflow-hidden"
          style={{
            width: panelWidth,
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <ManagerDeptFilter
            selectedManagerIds={selected}
            onChange={handleChange}
            accentColor={accentColor}
            maxHeight={360}
            fallbackManagers={fallbackManagers}
          />
        </div>
      )}
    </div>
  );
};

export default ManagerDeptFilterTrigger;
