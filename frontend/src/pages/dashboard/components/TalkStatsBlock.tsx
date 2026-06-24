import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { plansService, TalkStats } from "../../../services/plans.service";
import { Headphones, ChevronLeft, ChevronRight } from "lucide-react";

const formatMinutes = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} daq`;
  return `${h} soat ${m > 0 ? `${m} daq` : ""}`.trim();
};

const formatDate = (d: Date): string => {
  return d.toISOString().split("T")[0];
};

const MONTH_NAMES = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];

const formatLabel = (dateStr: string): string => {
  const d = new Date(dateStr);
  const today = new Date();
  const todayStr = formatDate(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (dateStr === todayStr) return "Bugun";
  if (dateStr === formatDate(yesterday)) return "Kecha";
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

const TalkStatsBlock: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(() => formatDate(new Date()));

  const { data } = useQuery<TalkStats>({
    queryKey: ["talk-stats", selectedDate],
    queryFn: () => plansService.getTalkStats(selectedDate),
  });

  const prevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(formatDate(d));
  };

  const nextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    const today = new Date();
    if (d <= today) setSelectedDate(formatDate(d));
  };

  const isToday = selectedDate === formatDate(new Date());

  if (!data || data.managers.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Headphones size={18} className="text-accent" />
          <h4 className="text-sm font-semibold text-white">Gaplashish vaqti</h4>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">
            Maqsad: {formatMinutes(data.target)}
          </span>
          <div className="flex items-center gap-1 ml-2">
            <button onClick={prevDay} className="p-1 text-secondary hover:text-white transition-colors">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-white font-medium min-w-[70px] text-center">
              {formatLabel(selectedDate)}
            </span>
            <button
              onClick={nextDay}
              disabled={isToday}
              className={`p-1 transition-colors ${isToday ? "text-border cursor-not-allowed" : "text-secondary hover:text-white"}`}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {data.managers.map((m) => {
          const barColor = m.percent >= 100 ? "#2fcc6e" : m.percent >= 50 ? "#e6a020" : "#e64545";
          return (
            <div key={m.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white">{m.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-secondary">
                    {formatMinutes(m.actualMinutes)}
                  </span>
                  <span
                    className="text-xs font-bold"
                    style={{ color: barColor }}
                  >
                    {m.percent}%
                  </span>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-primary overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(m.percent, 100)}%`,
                    backgroundColor: barColor,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TalkStatsBlock;
