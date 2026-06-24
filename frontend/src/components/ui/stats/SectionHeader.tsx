import React, { ReactNode } from "react";

interface Props {
  /** Kichik label (11px uppercase) — kategoriya */
  eyebrow?: string;
  /** Asosiy sarlavha (18-22px) */
  title: string;
  /** Tavsif (secondary text) */
  subtitle?: string;
  /** O'ng tarafdagi harakatlar (tugmalar, filterlar) */
  actions?: ReactNode;
  /** Icon sarlavha yonida */
  icon?: ReactNode;
  className?: string;
}

/**
 * SectionHeader — dashboard bo'limi sarlavhasi.
 *
 * Tuzilma:
 *   [kichik label (optional)]
 *   [icon] Sarlavha                              [actions]
 *   tavsif
 *
 * Bu komponent konsistent visual hierarchy beradi — hamma joyda bir xil.
 */
const SectionHeader: React.FC<Props> = ({
  eyebrow,
  title,
  subtitle,
  actions,
  icon,
  className = "",
}) => {
  return (
    <div className={`flex items-start justify-between gap-3 mb-4 ${className}`}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{
              background: "var(--ds-bg-overlay)",
              color: "var(--ds-text-secondary)",
            }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p
              className="text-2xs font-bold uppercase tracking-wider mb-1"
              style={{ color: "var(--ds-text-muted)" }}
            >
              {eyebrow}
            </p>
          )}
          <h2 className="ds-section-title" style={{ color: "var(--ds-text-primary)" }}>
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm mt-0.5" style={{ color: "var(--ds-text-secondary)" }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
};

export default SectionHeader;
