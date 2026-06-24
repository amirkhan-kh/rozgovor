import React, { useEffect, useRef, useState, useCallback } from "react";
import { Scissors } from "lucide-react";

interface Props {
  musicUrl?: string | null;
  duration: number;
  startSec: number;
  endSec: number;
  currentTimeSec?: number | null;
  onChange: (range: { startSec: number; endSec: number }) => void;
  maxRangeSec?: number;
  label?: string;
  accentColor?: string;
}

const BAR_COUNT = 160;

const MusicWaveform: React.FC<Props> = ({
  musicUrl,
  duration,
  startSec,
  endSec,
  currentTimeSec = null,
  onChange,
  maxRangeSec,
  label,
  accentColor = "#818cf8",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [decodedPeaks, setDecodedPeaks] = useState<number[] | null>(null);
  const [decoding, setDecoding] = useState(false);

  // All drag state in refs — no re-render during drag
  const dragModeRef = useRef<null | "start" | "end" | "region">(null);
  const dragStartXRef = useRef(0);
  const dragStartValsRef = useRef({ start: 0, end: 0 });
  const widthRef = useRef(0);
  const durationRef = useRef(0);
  const startRef = useRef(startSec);
  const endRef = useRef(endSec);

  // Keep refs in sync
  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { startRef.current = startSec; }, [startSec]);
  useEffect(() => { endRef.current = endSec; }, [endSec]);

  // Measure container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      widthRef.current = el.clientWidth;
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    widthRef.current = el.clientWidth;
    return () => ro.disconnect();
  }, []);

  // Decode waveform peaks from audio URL
  useEffect(() => {
    if (!musicUrl) return;
    let cancelled = false;
    (async () => {
      try {
        setDecoding(true);
        const resp = await fetch(musicUrl);
        const buf = await resp.arrayBuffer();
        const AudioCtx =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();
        const audio = await ctx.decodeAudioData(buf);
        const channel = audio.getChannelData(0);
        const samplesPerBar = Math.floor(channel.length / BAR_COUNT);
        const out: number[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          let peak = 0;
          const base = i * samplesPerBar;
          for (let j = base; j < base + samplesPerBar; j++) {
            const v = Math.abs(channel[j]);
            if (v > peak) peak = v;
          }
          out.push(peak);
        }
        const max = Math.max(...out, 0.0001);
        if (!cancelled) {
          setDecodedPeaks(out.map((v) => v / max));
          ctx.close?.();
        }
      } catch {
        if (!cancelled) setDecodedPeaks(new Array(BAR_COUNT).fill(0.25));
      } finally {
        if (!cancelled) setDecoding(false);
      }
    })();
    return () => { cancelled = true; };
  }, [musicUrl]);

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const H = 68;
    canvas.width = width * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${H}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, H);

    const data = decodedPeaks || new Array(BAR_COUNT).fill(0.2);
    const barW = width / data.length;
    const mid = H / 2;
    const sX = duration > 0 ? (startSec / duration) * width : 0;
    const eX = duration > 0 ? (endSec / duration) * width : width;

    for (let i = 0; i < data.length; i++) {
      const h = Math.max(3, data[i] * (H - 14));
      const x = i * barW;
      const cx = x + barW / 2;
      const inside = cx >= sX && cx <= eX;
      const bw = Math.max(1.5, barW - 1.5);

      if (inside) {
        const grad = ctx.createLinearGradient(x, mid - h / 2, x, mid + h / 2);
        grad.addColorStop(0, accentColor + "cc");
        grad.addColorStop(0.5, accentColor);
        grad.addColorStop(1, accentColor + "cc");
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = "rgba(148,163,184,0.18)";
      }
      ctx.beginPath();
      ctx.roundRect(x + (barW - bw) / 2, mid - h / 2, bw, h, 2);
      ctx.fill();
    }
  }, [decodedPeaks, width, startSec, endSec, duration, accentColor]);

  const pxToSec = useCallback((px: number) => {
    const d = durationRef.current;
    const w = widthRef.current;
    return d > 0 && w > 0 ? (px / w) * d : 0;
  }, []);

  const clamp = useCallback((s: number, e: number) => {
    const d = durationRef.current;
    const max = maxRangeSec;
    let ns = s, ne = e;
    ns = Math.max(0, Math.min(ns, d));
    ne = Math.max(0, Math.min(ne, d));
    if (ne - ns < 0.1) ne = Math.min(d, ns + 0.1);
    if (max && ne - ns > max) {
      if (dragModeRef.current === "start") ns = ne - max;
      else ne = ns + max;
    }
    return { ns: Math.max(0, ns), ne: Math.min(d, ne) };
  }, [maxRangeSec]);

  // All pointer handling on the container — prevents capture loss on fast drag
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !durationRef.current) return;

    const x = e.clientX - rect.left;
    const w = widthRef.current;
    const dur = durationRef.current;
    const sX = (startRef.current / dur) * w;
    const eX = (endRef.current / dur) * w;
    const HIT = 14;

    let mode: "start" | "end" | "region" | null = null;
    if (Math.abs(x - sX) <= HIT) mode = "start";
    else if (Math.abs(x - eX) <= HIT) mode = "end";
    else if (x > sX - HIT && x < eX + HIT) mode = "region";

    if (!mode) return;
    e.preventDefault();
    dragModeRef.current = mode;
    dragStartXRef.current = e.clientX;
    dragStartValsRef.current = { start: startRef.current, end: endRef.current };
    containerRef.current?.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const mode = dragModeRef.current;
    if (!mode) return;
    e.preventDefault();
    const dx = e.clientX - dragStartXRef.current;
    const dSec = pxToSec(dx);
    const { start: s0, end: e0 } = dragStartValsRef.current;
    let ns = s0, ne = e0;

    if (mode === "start") {
      ns = s0 + dSec;
    } else if (mode === "end") {
      ne = e0 + dSec;
    } else {
      const len = e0 - s0;
      const dur = durationRef.current;
      ns = Math.max(0, Math.min(s0 + dSec, dur - len));
      ne = ns + len;
    }

    const { ns: fs, ne: fe } = clamp(ns, ne);
    onChange({ startSec: +fs.toFixed(2), endSec: +fe.toFixed(2) });
  }, [pxToSec, clamp, onChange]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragModeRef.current) {
      dragModeRef.current = null;
      try { containerRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    }
  }, []);

  const nudge = (side: "start" | "end", delta: number) => {
    const d = durationRef.current;
    if (side === "start") {
      const ns = Math.max(0, Math.min(startSec + delta, endSec - 0.1));
      onChange({ startSec: +ns.toFixed(2), endSec: +endSec.toFixed(2) });
    } else {
      const ne = Math.min(d, Math.max(endSec + delta, startSec + 0.1));
      onChange({ startSec: +startSec.toFixed(2), endSec: +ne.toFixed(2) });
    }
  };

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s - m * 60;
    return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
  };

  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct = duration > 0 ? (endSec / duration) * 100 : 100;
  const playPct = currentTimeSec != null && duration > 0
    ? Math.min(100, Math.max(0, (currentTimeSec / duration) * 100))
    : null;

  const regionDuration = endSec - startSec;
  const accent2 = accentColor;

  return (
    <div className="w-full select-none">
      {/* Label + time info row */}
      <div className="flex items-center justify-between mb-1.5 text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
        {label ? (
          <span className="font-semibold text-[11px] uppercase tracking-wider" style={{ color: accentColor }}>{label}</span>
        ) : (
          <span style={{ opacity: 0.5 }}>{fmt(0)}</span>
        )}
        <span className="flex items-center gap-1" style={{ color: accentColor }}>
          <Scissors size={10} style={{ opacity: 0.7 }} />
          <span>{fmt(startSec)} – {fmt(endSec)}</span>
          <span style={{ opacity: 0.5, fontSize: 10 }}>
            ({regionDuration.toFixed(1)}s{maxRangeSec ? ` / max ${maxRangeSec}s` : ""})
          </span>
        </span>
        <span style={{ opacity: 0.5 }}>{fmt(duration)}</span>
      </div>

      {/* Waveform area */}
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full rounded-xl overflow-hidden"
        style={{
          height: 86,
          background: "linear-gradient(180deg, #0e1019 0%, #131625 100%)",
          border: `1px solid ${accentColor}33`,
          cursor: dragModeRef.current ? "grabbing" : "default",
          touchAction: "none",
        }}
      >
        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 25%)",
          }}
        />

        {/* Outside-region dimming */}
        {duration > 0 && (
          <>
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: 0, width: `${startPct}%`, backgroundColor: "rgba(0,0,0,0.35)" }}
            />
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: `${endPct}%`, right: 0, backgroundColor: "rgba(0,0,0,0.35)" }}
            />
          </>
        )}

        {/* Canvas waveform */}
        <canvas ref={canvasRef} className="absolute top-[9px] left-0" style={{ display: "block" }} />

        {decoding && (
          <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "rgba(148,163,184,0.5)" }}>
            Yuklanmoqda...
          </div>
        )}

        {/* Region overlay */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${startPct}%`,
            width: `${endPct - startPct}%`,
            borderTop: `2px solid ${accent2}`,
            borderBottom: `2px solid ${accent2}`,
            background: `linear-gradient(180deg, ${accent2}18 0%, ${accent2}08 100%)`,
          }}
        />

        {/* Start handle */}
        <div
          className="absolute top-0 bottom-0 flex items-center justify-center z-10 pointer-events-none"
          style={{ left: `${startPct}%`, transform: "translateX(-50%)", width: 20 }}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2" style={{ backgroundColor: accent2 }} />
          <div
            className="relative w-3.5 h-8 rounded-full flex flex-col items-center justify-center gap-[3px]"
            style={{ backgroundColor: accent2, boxShadow: `0 0 10px ${accent2}80` }}
          >
            {[0,1,2].map((i) => (
              <div key={i} className="w-[5px] rounded-full" style={{ height: 2, backgroundColor: "rgba(255,255,255,0.8)" }} />
            ))}
          </div>
        </div>

        {/* End handle */}
        <div
          className="absolute top-0 bottom-0 flex items-center justify-center z-10 pointer-events-none"
          style={{ left: `${endPct}%`, transform: "translateX(-50%)", width: 20 }}
        >
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2" style={{ backgroundColor: accent2 }} />
          <div
            className="relative w-3.5 h-8 rounded-full flex flex-col items-center justify-center gap-[3px]"
            style={{ backgroundColor: accent2, boxShadow: `0 0 10px ${accent2}80` }}
          >
            {[0,1,2].map((i) => (
              <div key={i} className="w-[5px] rounded-full" style={{ height: 2, backgroundColor: "rgba(255,255,255,0.8)" }} />
            ))}
          </div>
        </div>

        {/* Playhead */}
        {playPct != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-20"
            style={{
              left: `${playPct}%`,
              background: "linear-gradient(180deg, transparent, #fbbf24 15%, #fbbf24 85%, transparent)",
              boxShadow: "0 0 8px rgba(251,191,36,0.7)",
            }}
          />
        )}
      </div>

      {/* Keyboard nudge hint */}
      <div className="flex items-center justify-between mt-1.5 text-[10px]" style={{ color: "var(--text-secondary)", opacity: 0.45 }}>
        <span>Bosing + torting yoki ← → bilan 0.1s sozlang</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => nudge("start", -0.1)}
            className="hover:opacity-80 font-mono"
            style={{ color: "var(--text-secondary)" }}
          >
            ← Boshliq
          </button>
          <button
            type="button"
            onClick={() => nudge("end", 0.1)}
            className="hover:opacity-80 font-mono"
            style={{ color: "var(--text-secondary)" }}
          >
            Oxiri →
          </button>
        </div>
      </div>
    </div>
  );
};

export default MusicWaveform;
