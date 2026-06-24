import React from "react";

interface Props {
  src?: string | null;
  name?: string | null;
  size?: number; // px (default 36)
  className?: string;
  ring?: boolean;
}

// Telegram uslubidagi yumaloq avatar. Rasm yo'q bo'lsa — ism initial bilan
// rang generatsiya qilinadi (deterministic, ism bo'yicha).
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

const Avatar: React.FC<Props> = ({ src, name, size = 36, className = "", ring = false }) => {
  const initial = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const hue = hashHue(name || "?");
  const bg = `hsl(${hue} 65% 45%)`;
  const ringStyle: React.CSSProperties = ring
    ? { boxShadow: "0 0 0 2px var(--color-card-bg), 0 0 0 3px var(--color-border)" }
    : {};

  if (src) {
    return (
      <img
        src={src}
        alt={name || ""}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size, ...ringStyle }}
        onError={(e) => {
          // Rasm yuklanmasa fallback initial
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold select-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: bg,
        fontSize: Math.floor(size * 0.42),
        ...ringStyle,
      }}
    >
      {initial}
    </div>
  );
};

export default Avatar;
