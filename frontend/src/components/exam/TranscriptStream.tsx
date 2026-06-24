import React, { useEffect, useRef } from "react";

export interface TranscriptMessage {
  role: "salesperson" | "client";
  text: string;
  ts: number;
}

interface TranscriptStreamProps {
  messages: TranscriptMessage[];
  pendingUser?: string;
  pendingAi?: string;
  max?: number;
}

export const TranscriptStream: React.FC<TranscriptStreamProps> = ({
  messages,
  pendingUser,
  pendingAi,
  max = 3,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const recent = messages.slice(-max);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pendingUser, pendingAi]);

  const hasPendingUser = !!(pendingUser && pendingUser.trim().length);
  const hasPendingAi = !!(pendingAi && pendingAi.trim().length);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div
        ref={containerRef}
        className="rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl px-5 py-4 max-h-[260px] overflow-y-auto space-y-3"
        style={{ scrollbarWidth: "thin" }}
      >
        {recent.length === 0 && !hasPendingUser && !hasPendingAi && (
          <div className="text-center text-white/40 text-sm py-3">
            Mikrofon yoqilgan. Gapiring...
          </div>
        )}

        {recent.map((m, i) => {
          const isUser = m.role === "salesperson";
          const age = Math.min(recent.length - 1 - i, 2);
          const opacity = 1 - age * 0.25;
          return (
            <div
              key={`${m.ts}-${i}`}
              className={`flex ${isUser ? "justify-end" : "justify-start"} transition-all duration-300`}
              style={{ opacity }}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 border backdrop-blur-sm ${
                  isUser
                    ? "bg-cyan-500/10 border-cyan-400/30 text-cyan-100 rounded-br-sm"
                    : "bg-violet-500/10 border-violet-400/30 text-violet-100 rounded-bl-sm"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">
                  {isUser ? "Siz" : "Mijoz"}
                </div>
                <div className="text-sm leading-relaxed">{m.text}</div>
              </div>
            </div>
          );
        })}

        {hasPendingUser && (
          <div className="flex justify-end transition-all duration-300">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2.5 bg-cyan-500/5 border border-cyan-400/20 text-cyan-200/80">
              <div className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">Siz (yozilmoqda)</div>
              <div className="text-sm leading-relaxed italic">{pendingUser}</div>
            </div>
          </div>
        )}

        {hasPendingAi && (
          <div className="flex justify-start transition-all duration-300">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2.5 bg-violet-500/5 border border-violet-400/20 text-violet-200/80">
              <div className="text-[10px] uppercase tracking-wide opacity-60 mb-0.5">Mijoz (gapirmoqda)</div>
              <div className="text-sm leading-relaxed italic">{pendingAi}</div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  );
};

export default TranscriptStream;
