import React from "react";
import { AudioFile } from "../../types";

type Status = AudioFile["status"];

const CONFIG: Record<Status, { label: string; color: string }> = {
  pending: { label: "Kutilmoqda", color: "#f59e0b" },
  processing: { label: "Tahlil qilinmoqda", color: "#3b82f6" },
  done: { label: "Tayyor", color: "#22c55e" },
  error: { label: "Xatolik", color: "#ef4444" },
  no_conversation: { label: "Suhbat yo'q", color: "#6b7280" },
  disconnected: { label: "Uzilgan", color: "#ef4444" },
  transferred: { label: "O'tkazilgan", color: "#8b5cf6" },
  too_short: { label: "Juda qisqa", color: "#f59e0b" },
};

const AudioStatusBadge: React.FC<{ status: Status }> = ({ status }) => {
  const c = CONFIG[status] ?? { label: status, color: "#6b7280" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `${c.color}1a`, color: c.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
      {c.label}
    </span>
  );
};

export default AudioStatusBadge;
