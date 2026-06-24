import React, { useState } from "react";
import { ChevronRight, CheckCircle, XCircle } from "lucide-react";
import { WinLossData } from "../../../services/dashboard.service";

interface WinLossBlockProps {
  data: WinLossData;
  managerName?: string;
}

const timeToSeconds = (ts: string): number => {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const WinLossBlock: React.FC<WinLossBlockProps> = ({ data, managerName }) => {
  const [expandedWins, setExpandedWins] = useState<Set<string>>(new Set());
  const [expandedLosses, setExpandedLosses] = useState<Set<string>>(new Set());

  const hasWins = Object.keys(data.wins).length > 0;
  const hasLosses = Object.keys(data.losses).length > 0;

  if (!hasWins && !hasLosses) return null;

  const displayedWins = Object.values(data.wins).reduce((sum, pts) => sum + pts.length, 0);
  const displayedLosses = Object.values(data.losses).reduce((sum, pts) => sum + pts.length, 0);
  const totalWinPoints = data.totalWins ?? displayedWins;
  const totalLossPoints = data.totalLosses ?? displayedLosses;

  const toggleSet = (
    _set: Set<string>,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    key: string
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const formatTimestamp = (ts: string): string => {
    if (!ts) return "—";
    // HH:MM:SS bo'lsa, o'zini qaytarish
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(ts)) return ts;
    // MM:SS bo'lsa, 00:MM:SS formatiga o'tkazish
    if (/^\d{1,2}:\d{2}$/.test(ts)) {
      const [m, s] = ts.split(":");
      return `${m.padStart(2, "0")}:${s}`;
    }
    // Faqat raqam bo'lsa (sekund)
    if (/^\d+$/.test(ts)) {
      const totalSeconds = parseInt(ts, 10);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    return ts;
  };

  const renderPointsSection = (
    manager: string,
    points: Array<{ description: string; timestamp: string; audioFileId: string }>,
    total: number,
    expanded: Set<string>,
    setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>,
    variant: "win" | "loss"
  ) => {
    const isExpanded = expanded.has(manager);
    const percent =
      total > 0 ? ((points.length / total) * 100).toFixed(1) : "0";
    const showing = points.length;

    const iconColor = variant === "win" ? "text-emerald-400" : "text-red-400";
    const bgColor =
      variant === "win"
        ? "bg-emerald-500/5 border-emerald-500/10"
        : "bg-red-500/5 border-red-500/10";

    return (
      <div key={manager} className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSet(expanded, setExpanded, manager)}
          className="w-full flex items-center justify-between py-3 px-4 hover:bg-primary/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ChevronRight
              size={14}
              className={`text-secondary transition-transform duration-200 ${
                isExpanded ? "rotate-90" : ""
              }`}
            />
            <span className="text-sm text-white font-medium">
              {manager}{" "}
              <span className="text-secondary font-normal">
                ({showing} ta, {percent}%)
              </span>
            </span>
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-2">
            {points.map((p, i) => (
              <div
                key={i}
                className={`p-3 border rounded-lg ${bgColor}`}
              >
                <div className="flex items-start gap-2">
                  {variant === "win" ? (
                    <CheckCircle
                      size={14}
                      className={`${iconColor} mt-0.5 flex-shrink-0`}
                    />
                  ) : (
                    <XCircle
                      size={14}
                      className={`${iconColor} mt-0.5 flex-shrink-0`}
                    />
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-white leading-relaxed mb-1.5">
                      {p.description}
                    </p>
                    <span
                      onClick={() => window.open(`/audio/${p.audioFileId}/transcription?t=${timeToSeconds(p.timestamp)}`, '_blank')}
                      className="text-[11px] text-blue-400 hover:underline cursor-pointer"
                    >
                      Vaqt: {formatTimestamp(p.timestamp)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* G'alaba nuqtalari */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          G'alaba nuqtalari ({totalWinPoints}){managerName ? ` — ${managerName}` : " — Jamoa"}
        </h4>
        <p className="text-xs text-secondary mb-4">
          Menejer muvaffaqiyatli yutgan/yakunlagan momentlar (bosib oching)
        </p>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {Object.entries(data.wins).map(([manager, points]) =>
            renderPointsSection(
              manager,
              points,
              totalWinPoints,
              expandedWins,
              setExpandedWins,
              "win"
            )
          )}
        </div>

        {!hasWins && (
          <div className="text-center py-8">
            <p className="text-sm font-semibold" style={{ color: "var(--ds-text-primary)" }}>
              G'alaba nuqtalari topilmadi
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--ds-text-secondary)" }}>
              Sotuv tugagan qo'ng'iroqlar tahlil qilingach paydo bo'ladi
            </p>
          </div>
        )}
      </div>

      {/* Yo'qotish nuqtalari */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          Yo'qotish nuqtalari ({totalLossPoints}){managerName ? ` — ${managerName}` : " — Jamoa"}
        </h4>
        <p className="text-xs text-secondary mb-4">
          Savdo yo'qotilgan kritik momentlar (bosib oching)
        </p>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {Object.entries(data.losses).map(([manager, points]) =>
            renderPointsSection(
              manager,
              points,
              totalLossPoints,
              expandedLosses,
              setExpandedLosses,
              "loss"
            )
          )}
        </div>

        {!hasLosses && (
          <div className="text-center py-8">
            <p className="text-sm font-semibold" style={{ color: "var(--ds-text-primary)" }}>
              Yo'qotish nuqtalari yo'q
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--ds-success)" }}>
              ✓ Bu yaxshi — sotuvni yo'qotuvchi sabablar topilmadi
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WinLossBlock;
