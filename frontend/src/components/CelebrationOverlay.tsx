import React, { useEffect, useRef } from "react";

const API_BASE = (import.meta.env.VITE_API_URL as string || "http://localhost:5002/api").replace(/\/api$/, "");

interface Props {
  videoPath: string; // e.g. "/videos/v1-arms-crossing-in-final.mp4"
  onEnd: () => void;
}

export const CelebrationOverlay: React.FC<Props> = ({ videoPath, onEnd }) => {
  const ref = useRef<HTMLVideoElement>(null);
  // finalVideoUrl to'liq URL (S3) bo'lishi mumkin — API_BASE qo'shilmaydi.
  const src = /^https?:\/\//.test(videoPath)
    ? videoPath
    : `${API_BASE}${videoPath}`;

  useEffect(() => {
    ref.current?.play().catch(() => {});
  }, [src]);

  return (
    <div
      className="fixed inset-0 z-[300] bg-black flex items-center justify-center"
      onClick={onEnd}
      style={{ cursor: "pointer" }}
    >
      <video
        ref={ref}
        src={src}
        className="w-full h-full object-contain"
        onEnded={onEnd}
        playsInline
      />
    </div>
  );
};
