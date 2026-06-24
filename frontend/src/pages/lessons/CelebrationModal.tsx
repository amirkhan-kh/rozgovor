// Taqdirlash modali — dars yoki modul tugagach avto ko'rsatiladi.
// CSS-only confetti (paket kerak emas). Auto-close 3.5s, tugma bilan ham yopiladi.
import React, { useEffect, useMemo } from "react";
import { Trophy, Sparkles, ArrowRight, Star } from "lucide-react";

interface CelebrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: "lesson" | "moduleComplete";
  title?: string;
  score?: number | null;
  nextAction?: string;
  onNext?: () => void;
}

// Random rang palette
const CONFETTI_COLORS = [
  "#10b981",
  "#667eea",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
];

const CelebrationModal: React.FC<CelebrationModalProps> = ({
  isOpen,
  onClose,
  type,
  title,
  score,
  nextAction,
  onNext,
}) => {
  // Confetti partikullarni bir marta yaratamiz — har renderda qayta tug'ilmasin
  const particles = useMemo(() => {
    const count = type === "moduleComplete" ? 80 : 50;
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2.5 + Math.random() * 2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
      shape: Math.random() > 0.5 ? "circle" : "square",
    }));
  }, [type, isOpen]);

  // Auto-close faqat nextAction berilmagan bo'lsa
  useEffect(() => {
    if (!isOpen) return;
    if (!onNext) {
      const t = setTimeout(() => onClose(), 3500);
      return () => clearTimeout(t);
    }
  }, [isOpen, onNext, onClose]);

  if (!isOpen) return null;

  const isModule = type === "moduleComplete";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      />

      {/* Confetti layer */}
      <div
        className="absolute inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        {particles.map((p) => (
          <span
            key={p.id}
            className="absolute top-0"
            style={{
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.shape === "circle" ? "50%" : "2px",
              animation: `celebFall ${p.duration}s linear ${p.delay}s infinite`,
              transform: `rotate(${p.rotation}deg)`,
            }}
          />
        ))}
      </div>

      {/* Modal body */}
      <div
        className="relative rounded-3xl p-8 max-w-md w-full text-center"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: isModule
            ? "linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)"
            : "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
          animation: "celebPop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {/* Stars (modul tugagan bo'lsa) */}
        {isModule && (
          <div className="flex justify-center gap-2 mb-4">
            {[0, 1, 2].map((i) => (
              <Star
                key={i}
                size={32}
                fill="#fde68a"
                color="#fde68a"
                style={{
                  filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.2))",
                  animation: `celebStarSpin 0.8s ease-out ${i * 0.15}s both`,
                }}
              />
            ))}
          </div>
        )}

        {/* Icon */}
        <div
          className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: "rgba(255,255,255,0.25)",
            backdropFilter: "blur(10px)",
            border: "3px solid rgba(255,255,255,0.4)",
            animation: "celebBounce 1s ease-in-out infinite alternate",
          }}
        >
          {isModule ? (
            <Trophy size={52} color="#fff" strokeWidth={1.5} />
          ) : (
            <Sparkles size={52} color="#fff" strokeWidth={1.5} />
          )}
        </div>

        {/* Title */}
        <h2
          className="text-3xl font-extrabold mb-2 drop-shadow-sm"
          style={{ color: "#fff" }}
        >
          {isModule ? "Modul tugadi!" : "Muvaffaqiyatli!"}
        </h2>

        <p
          className="text-sm mb-4 opacity-95"
          style={{ color: "#fff" }}
        >
          {isModule
            ? "Siz butun modulni muvaffaqiyatli yakunladingiz!"
            : title
            ? `"${title}" darsini muvaffaqiyatli yakunladingiz!`
            : "Darsni muvaffaqiyatli yakunladingiz!"}
        </p>

        {/* Score badge */}
        {score != null && (
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl mb-5 font-bold text-lg"
            style={{
              backgroundColor: "rgba(255,255,255,0.25)",
              backdropFilter: "blur(8px)",
              border: "2px solid rgba(255,255,255,0.4)",
              color: "#fff",
            }}
          >
            <Star size={18} fill="#fde68a" color="#fde68a" />
            {Math.round(score)}%
          </div>
        )}

        {/* Action button */}
        {onNext ? (
          <button
            onClick={onNext}
            className="w-full py-3 rounded-2xl font-bold text-base transition-all hover:scale-[1.02]"
            style={{
              backgroundColor: "#fff",
              color: isModule ? "#10b981" : "#667eea",
              boxShadow: "0 8px 20px rgba(0,0,0,0.2)",
            }}
          >
            <span className="inline-flex items-center gap-2">
              {nextAction || "Davom etish"}
              <ArrowRight size={16} />
            </span>
          </button>
        ) : (
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl font-semibold text-sm transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)",
            }}
          >
            Yopish
          </button>
        )}
      </div>

      {/* CSS keyframes (inline — paket qo'shmaslik uchun) */}
      <style>{`
        @keyframes celebFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.8; }
        }
        @keyframes celebPop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes celebBounce {
          from { transform: scale(1) rotate(-5deg); }
          to { transform: scale(1.08) rotate(5deg); }
        }
        @keyframes celebStarSpin {
          from { transform: scale(0) rotate(-180deg); opacity: 0; }
          to { transform: scale(1) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default CelebrationModal;
