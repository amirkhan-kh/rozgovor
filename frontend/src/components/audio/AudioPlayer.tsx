import React, { useEffect, useRef } from "react";

interface Props {
  src: string;
  className?: string;
  /** Sekundlarda — yuklanganda shu vaqtga seek qiladi (xato vaqtidan tinglash uchun). */
  startTime?: number;
  /** startTime berilganda avtomatik ijro etishga urinadi (brauzer bloklasa — jim o'tadi). */
  autoPlay?: boolean;
}

/** Native audio player — stream URL (auth token query param yoki public). */
const AudioPlayer: React.FC<Props> = ({ src, className = "", startTime, autoPlay = false }) => {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || startTime == null || startTime <= 0) return;
    const seek = () => {
      try {
        el.currentTime = startTime;
      } catch {
        /* metadata hali tayyor emas — e'tiborsiz */
      }
      if (autoPlay) el.play().catch(() => {});
    };
    if (el.readyState >= 1) seek();
    else el.addEventListener("loadedmetadata", seek, { once: true });
    return () => el.removeEventListener("loadedmetadata", seek);
  }, [src, startTime, autoPlay]);

  return (
    <audio
      ref={ref}
      src={src}
      controls
      preload="metadata"
      className={`w-full ${className}`}
      style={{ height: 40 }}
    />
  );
};

export default AudioPlayer;
