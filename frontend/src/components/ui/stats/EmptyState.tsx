import React, { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface Props {
  icon?: ReactNode;
  title: string;
  /** "Ma'lumot yo'q" emas — nima qilish kerakligini aytuvchi qator */
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

/**
 * EmptyState — "Ma'lumot yo'q" tugun holati uchun.
 *
 * QOIDA: Bu komponent hech qachon quruq "Ma'lumot yo'q" degan gapni
 * chiqarmaydi. U MAJBURAN harakat tavsiya qiladi.
 *
 * Misol:
 *   ❌ "Ma'lumot yo'q"
 *   ✅ "Hali qo'ng'iroq yuklanmagan — birinchi audio yuklang"
 */
const EmptyState: React.FC<Props> = ({
  icon = <Inbox size={28} strokeWidth={1.5} />,
  title,
  message,
  action,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center py-10 px-4 ${className}`}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
        style={{
          background: "var(--ds-bg-overlay)",
          color: "var(--ds-text-muted)",
        }}
      >
        {icon}
      </div>
      <p className="text-base font-semibold mb-1" style={{ color: "var(--ds-text-primary)" }}>
        {title}
      </p>
      <p className="text-sm max-w-sm mb-4" style={{ color: "var(--ds-text-secondary)" }}>
        {message}
      </p>
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            background: "var(--ds-primary)",
            color: "var(--ds-text-inverted)",
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
