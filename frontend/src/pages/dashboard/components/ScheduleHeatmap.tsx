import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { plansService, ManagerScheduleData } from "../../../services/plans.service";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import toast from "react-hot-toast";

const MONTH_NAMES = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const STATUS_COLORS = ["transparent", "#e6a020", "#e64545"]; // 0=ish, 1=dam(sariq), 2=ishlamagan(qizil)
const STATUS_LABELS = ["Ish kuni", "Dam kuni", "Ishlamagan"];

const ScheduleHeatmap: React.FC = () => {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [noteModal, setNoteModal] = useState<{ managerId: string; date: string; currentNote: string } | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data: schedules } = useQuery<ManagerScheduleData[]>({
    queryKey: ["schedules", month],
    queryFn: () => plansService.getAllSchedules(month),
  });

  const updateMutation = useMutation({
    mutationFn: ({ managerId, date, status, note }: { managerId: string; date: string; status: number; note?: string }) =>
      plansService.updateScheduleDay(managerId, date, status, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  // Oy kunlarini hisoblash
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDayOfWeek = (new Date(year, mon - 1, 1).getDay() + 6) % 7; // 0=Du

  const prevMonth = () => {
    const d = new Date(year, mon - 2, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(year, mon, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = `${MONTH_NAMES[mon - 1]} ${year}`;

  // Click vs double-click farqlash uchun timer
  const clickTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCellClick = (managerId: string, day: number) => {
    // Double-click tekshirish uchun 250ms kutish
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      // Double-click — kelmadi (qizil)
      handleDoubleClick(managerId, day);
      return;
    }

    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      // Single click — dam kuni toggle
      const date = `${month}-${String(day).padStart(2, "0")}`;
      const manager = schedules?.find((m) => m.id === managerId);
      const existing = manager?.days.find((d) => d.date === date);
      const currentStatus = existing?.status || 0;

      if (currentStatus === 0) {
        updateMutation.mutate({ managerId, date, status: 1 });
      } else {
        updateMutation.mutate({ managerId, date, status: 0 });
      }
    }, 250);
  };

  // Double-click: kelmadi (qizil) + izoh modal
  const handleDoubleClick = (managerId: string, day: number) => {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const manager = schedules?.find((m) => m.id === managerId);
    const existing = manager?.days.find((d) => d.date === date);
    setNoteModal({ managerId, date, currentNote: existing?.note || "" });
    setNoteText(existing?.note || "");
  };

  const confirmNote = () => {
    if (!noteModal) return;
    updateMutation.mutate({
      managerId: noteModal.managerId,
      date: noteModal.date,
      status: 2,
      note: noteText || undefined,
    });
    setNoteModal(null);
    setNoteText("");
  };

  if (!schedules) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-5 overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-accent" />
          <h4 className="text-sm font-semibold text-white">Menejerlar ish jadvali</h4>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 text-secondary hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-white font-medium min-w-[120px] text-center capitalize">
            {monthLabel}
          </span>
          <button onClick={nextMonth} className="p-1 text-secondary hover:text-white transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-primary border border-border" />
          <span className="text-secondary">Ish kuni</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#e6a020" }} />
          <span className="text-secondary">Dam kuni (1x bosish)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#e64545" }} />
          <span className="text-secondary">Kelmadi (2x bosish)</span>
        </div>
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: "500px" }}>
          <thead>
            <tr>
              <th
                className="text-left py-2 px-2 text-xs text-secondary font-medium w-28 sticky left-0 z-10"
                style={{ backgroundColor: "var(--color-card-bg)" }}
              >Menejer</th>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <th
                  key={i}
                  className="text-center py-1 text-[10px] text-secondary font-normal"
                  style={{ width: "24px", minWidth: "24px" }}
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedules.map((manager) => (
              <tr key={manager.id}>
                <td
                  className="py-1 px-2 text-xs text-white font-medium truncate max-w-[100px] sticky left-0 z-10"
                  style={{ backgroundColor: "var(--color-card-bg)" }}
                >
                  {manager.name}
                </td>
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const date = `${month}-${String(day).padStart(2, "0")}`;
                  const schedule = manager.days.find((d) => d.date === date);
                  const status = schedule?.status || 0;
                  const bgColor = STATUS_COLORS[status];
                  const dayOfWeek = (firstDayOfWeek + i) % 7;
                  const isWeekend = dayOfWeek >= 5;

                  return (
                    <td key={day} className="p-0.5" style={{ width: "24px" }}>
                      <button
                        onClick={() => handleCellClick(manager.id, day)}
                        className="w-5 h-5 rounded-sm border transition-colors hover:opacity-80"
                        style={{
                          backgroundColor: status > 0 ? bgColor : isWeekend ? "rgba(124,124,154,0.1)" : "var(--color-primary-bg)",
                          borderColor: status > 0 ? bgColor : "var(--color-border)",
                        }}
                        title={`${day} ${monthLabel} — ${STATUS_LABELS[status]}${schedule?.note ? `: ${schedule.note}` : ""}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setNoteModal(null)} />
          <div className="relative bg-card border border-border rounded-xl p-5 w-80 z-10">
            <h4 className="text-white font-semibold text-sm mb-3">Ishlamagan kun — izoh</h4>
            <p className="text-xs text-secondary mb-3">
              Sana: {noteModal.date}
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Sabab (ixtiyoriy)..."
              className="w-full px-3 py-2 bg-primary border border-border rounded-lg text-sm text-white resize-none"
              rows={3}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setNoteModal(null)}
                className="px-3 py-1.5 text-sm text-secondary hover:text-white transition-colors"
              >
                Bekor
              </button>
              <button
                onClick={confirmNote}
                className="px-4 py-1.5 text-sm bg-danger text-white rounded-lg hover:bg-danger/80 transition-colors"
              >
                Tasdiqlash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleHeatmap;
