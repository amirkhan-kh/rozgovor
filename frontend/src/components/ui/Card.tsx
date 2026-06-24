import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({ children, className = "", title, subtitle, style }) => {
  return (
    <div
      className={`bg-card border border-border rounded-xl p-6 ${className}`}
      style={style}
    >
      {title && (
        <div className="mb-4">
          <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary, #ffffff)" }}>{title}</h3>
          {subtitle && (
            <p className="text-sm text-secondary mt-1">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
