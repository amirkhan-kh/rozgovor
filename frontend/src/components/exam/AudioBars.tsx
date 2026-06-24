import React, { useEffect, useRef } from "react";

interface AudioBarsProps {
  /** FFT frequency data (0-255 per bin) — useGeminiLiveExam.frequencyData */
  frequencyData?: Uint8Array;
  /** RMS level 0-1, fallback animator agar frequencyData bo'sh bo'lsa */
  level: number;
  /** Bars soni (default 28) */
  bars?: number;
  /** Pixel height, default 60 */
  height?: number;
  /** Active color (manager gapirayotgan paytda) */
  color?: string;
  /** Idle color (jim) */
  idleColor?: string;
  /** Faollik holati — false bo'lsa idle (mute yoki ulanmagan) */
  active?: boolean;
}

/**
 * Google Meet uslubidagi vertikal audio bars:
 * — markazidan radial chiqadi (chap+o'ng simmetrik)
 * — frequencyData mavjud bo'lsa real FFT bilan
 * — yo'q bo'lsa level + sinusoidal animation
 */
export const AudioBars: React.FC<AudioBarsProps> = ({
  frequencyData,
  level,
  bars = 28,
  height = 60,
  color = "#22d3ee",
  idleColor = "rgba(148, 163, 184, 0.35)",
  active = true,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const barRefs = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const els = barRefs.current;
      const half = Math.floor(bars / 2);
      const now = performance.now() / 1000;
      const baseColor = active && level > 0.02 ? color : idleColor;
      for (let i = 0; i < bars; i++) {
        const el = els[i];
        if (!el) continue;
        // Markazdan radial — i ni half'ga nisbatan
        const distFromCenter = Math.abs(i - (bars - 1) / 2);
        const radialFalloff = 1 - distFromCenter / half; // 1 markazda, 0 chetda
        let amp = 0;
        if (frequencyData && frequencyData.length > 0) {
          // FFT bin tanlash — markaz past chastotalar, chet baland
          const idx = Math.min(
            frequencyData.length - 1,
            Math.floor((distFromCenter / half) * (frequencyData.length * 0.8))
          );
          amp = frequencyData[idx] / 255; // 0-1
        }
        // Level/idle fallback: sinusoidal nafas + level miqdori
        const breath = 0.08 + Math.sin(now * 2.4 + i * 0.5) * 0.04;
        const combined = Math.max(amp * radialFalloff, level * radialFalloff * 1.2, breath);
        const h = Math.max(4, Math.min(1, combined) * height);
        el.style.height = `${h}px`;
        el.style.background = baseColor;
        el.style.opacity = String(active ? 0.7 + combined * 0.3 : 0.5);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bars, frequencyData, level, active, color, idleColor, height]);

  return (
    <div
      ref={ref}
      className="flex items-center justify-center gap-1"
      style={{ height }}
      aria-hidden
    >
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            if (el) barRefs.current[i] = el;
          }}
          className="rounded-full transition-colors duration-300"
          style={{
            width: 3,
            height: 6,
            background: idleColor,
            willChange: "height, opacity, background",
          }}
        />
      ))}
    </div>
  );
};

export default AudioBars;
