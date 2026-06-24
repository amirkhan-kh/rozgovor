import React from "react";

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder: _placeholder = "Tanlang",
  className = "",
}) => {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`px-3 pr-8 py-2.5 bg-primary border border-border rounded-lg text-sm appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent transition-colors hover:border-accent/50 ${className}`}
      style={{ color: "var(--text-primary, #ffffff)" }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
};

export default CustomSelect;
