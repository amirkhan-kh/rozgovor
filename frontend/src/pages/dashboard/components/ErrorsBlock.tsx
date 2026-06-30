import React, { useState } from "react";
import { ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import {
  ErrorData,
  ErrorSummaryEntry,
  ErrorItem,
  DashboardFilters,
  dashboardService,
} from "../../../services/dashboard.service";

interface ErrorsBlockProps {
  data: ErrorData;
  managerName?: string;
  filters: DashboardFilters;
}

const PAGE_SIZE = 20;

const timeToSeconds = (ts: string): number => {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const renderErrorCard = (
  item: ErrorItem,
  index: number,
  showTinglash: boolean
) => (
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
        <p className="text-sm text-white leading-relaxed mb-2">
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

// Bitta xatolik turi — ochilganda item'lar talab bo'yicha (20 tadan) yuklanadi
const ErrorTypeAccordion: React.FC<{
  entry: ErrorSummaryEntry;
  filters: DashboardFilters;
  managerId?: string | null;
  showTinglash: boolean;
}> = ({ entry, filters, managerId, showTinglash }) => {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<ErrorItem[]>([]);
  const [total, setTotal] = useState(entry.count);
  const [loading, setLoading] = useState(false);

  const fetchPage = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await dashboardService.getErrorItems(filters, {
        type: entry.type,
        managerId: managerId ?? undefined,
        offset: items.length,
        limit: PAGE_SIZE,
      });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  };

  const onToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && items.length === 0) fetchPage();
  };

  const remaining = Math.max(0, total - items.length);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-3 px-4 hover:bg-primary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronRight
            size={14}
            className={`text-secondary transition-transform duration-200 ${
              expanded ? "rotate-90" : ""
            }`}
          />
          <span className="text-sm text-white font-medium">
            {entry.type}{" "}
            <span className="text-secondary font-normal">
              ({entry.count} ta, {entry.percent}%)
            </span>
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {items.map((item, i) => renderErrorCard(item, i, showTinglash))}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-2 text-xs text-secondary">
              <Loader2 size={14} className="animate-spin" />
              Yuklanmoqda...
            </div>
          )}

          {!loading && remaining > 0 && (
            <button
              onClick={fetchPage}
              className="w-full py-2 rounded-lg text-xs font-medium border border-border text-blue-400 hover:bg-primary/30 transition-colors"
            >
              Ko'proq ko'rsatish ({remaining})
            </button>
          )}
        </div>
      )}
    </div>
  );
};

const ErrorsBlock: React.FC<ErrorsBlockProps> = ({ data, managerName, filters }) => {
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(
    new Set()
  );

  if (!data || data.total === 0) return null;

  // Filter o'zgarganda accordion'larni remount qilish uchun kalit
  const filtersKey = JSON.stringify(filters);

  const toggleManager = (key: string) => {
    setExpandedManagers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
            .map((entry) => (
              <ErrorTypeAccordion
                key={`team-${entry.type}-${filtersKey}`}
                entry={entry}
                filters={filters}
                showTinglash={!!managerName}
              />
            ))}
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
            const isManagerExpanded = expandedManagers.has(managerKey);

            return (
              <div
                key={managerKey}
                className="border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleManager(managerKey)}
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
                      .filter((ty) => ty.count > 0)
                      .map((entry) => (
                        <ErrorTypeAccordion
                          key={`mgr-${manager.managerName}-${entry.type}-${filtersKey}`}
                          entry={entry}
                          filters={filters}
                          managerId={manager.managerId}
                          showTinglash
                        />
                      ))}
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
