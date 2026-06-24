import React, { useState } from "react";
import { ChevronRight, AlertTriangle } from "lucide-react";
import {
  ErrorData,
  ErrorSummaryEntry,
  ErrorItem,
} from "../../../services/dashboard.service";

interface ErrorsBlockProps {
  data: ErrorData;
  managerName?: string;
}

const timeToSeconds = (ts: string): number => {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const ErrorsBlock: React.FC<ErrorsBlockProps> = ({ data, managerName }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  if (!data || data.total === 0) return null;

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getTitle = (description: string): string => {
    const firstSentence = description.split(/[.!?]/)[0];
    if (firstSentence.length <= 80) return firstSentence;
    return description.slice(0, 80) + "...";
  };

  const renderErrorCard = (item: ErrorItem, index: number, showTinglash = false) => (
    <div
      key={index}
      className="p-3 bg-primary/30 border border-border rounded-lg"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          className="text-amber-500 mt-0.5 flex-shrink-0"
        />
        <div className="flex-1">
          <p className="text-sm text-white font-medium mb-1">
            {getTitle(item.description)}
          </p>
          <span className="inline-block text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 mb-2">
            Tavsiya
          </span>
          <p className="text-xs text-secondary leading-relaxed mb-2">
            {item.description}
          </p>
          <div className="flex items-center gap-3 text-[11px]">
            <span
              onClick={() => window.open(`/audio/${item.audioFileId}/transcription?t=${timeToSeconds(item.timestamp)}`, '_blank')}
              className="text-blue-400 hover:underline cursor-pointer"
            >
              Vaqt: {item.timestamp}
            </span>
            {showTinglash && (
              <span
                onClick={() => window.open(`/audio/${item.audioFileId}/transcription?t=${timeToSeconds(item.timestamp)}`, '_blank')}
                className="text-blue-400 hover:underline cursor-pointer"
              >
                Tinglash
              </span>
            )}
            <span className="text-secondary">
              Menejer: {item.managerName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTypeAccordion = (
    entry: ErrorSummaryEntry,
    keyPrefix: string,
    showTinglash = false
  ) => {
    const key = `${keyPrefix}-${entry.type}`;
    const isExpanded = expandedSections.has(key);
    const showing = entry.items.length;

    return (
      <div key={key} className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection(key)}
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
              {entry.type}{" "}
              <span className="text-secondary font-normal">
                ({entry.count} ta, {entry.percent}%)
              </span>
              {showing < entry.count && (
                <span className="text-secondary font-normal">
                  {" "}— oxirgi {showing} tasi
                </span>
              )}
            </span>
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-3">
            {entry.items.map((item, i) => renderErrorCard(item, i, showTinglash))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`grid grid-cols-1 ${managerName ? "" : "lg:grid-cols-2"} gap-6`}>
      {/* Left column — Jamoa / Manager */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          Aniqlangan xatoliklar va tavsiyalar ({data.total}){managerName ? ` — ${managerName}` : " — Jamoa"}
        </h4>
        <p className="text-xs text-secondary mb-4">
          Quyidagi xatoliklar menejerning mezonlarga qanday rioya qilmaganini
          ko'rsatadi.
        </p>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {data.summary
            .filter((e) => e.count > 0)
            .map((entry) => renderTypeAccordion(entry, "team", !!managerName))}
        </div>
      </div>

      {/* Right column — Menejerlar (only in team view) */}
      {!managerName && (
      <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
        <h4 className="text-sm font-semibold text-white mb-1">
          Aniqlangan xatoliklar va tavsiyalar ({data.total}) — Menejerlar
        </h4>
        <p className="text-xs text-secondary mb-4">
          Quyidagi xatoliklar menejerning mezonlarga qanday rioya qilmaganini
          ko'rsatadi.
        </p>

        <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {data.managerSummary.map((manager) => {
            const managerKey = `mgr-${manager.managerName}`;
            const isManagerExpanded = expandedSections.has(managerKey);

            return (
              <div
                key={managerKey}
                className="border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleSection(managerKey)}
                  className="w-full flex items-center justify-between py-3 px-4 hover:bg-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight
                      size={14}
                      className={`text-secondary transition-transform duration-200 ${
                        isManagerExpanded ? "rotate-90" : ""
                      }`}
                    />
                    <span className="text-sm text-white font-medium">
                      {manager.managerName}{" "}
                      <span className="text-secondary font-normal">
                        ({manager.total} ta)
                      </span>
                    </span>
                  </div>
                </button>

                {isManagerExpanded && (
                  <div className="px-4 pb-4 space-y-2">
                    {manager.types
                      .filter((t) => t.count > 0)
                      .map((entry) =>
                        renderTypeAccordion(
                          entry,
                          `mgr-${manager.managerName}`,
                          true
                        )
                      )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      )}
    </div>
  );
};

export default ErrorsBlock;
