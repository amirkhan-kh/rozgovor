/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Legacy (backward compat — eski kod ishlashi uchun) ────
        primary: "#0b0b0f",
        card: "#131319",
        border: "#1f1f2a",
        secondary: "#94a3b8",
        foreground: "#f5f5f7",

        // ── Brand/Accent — Indigo (yangi) ──────────────────────
        accent: {
          DEFAULT: "#4f46e5",
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },

        // ── Semantic — Emerald/Amber/Rose ──────────────────────
        success: {
          DEFAULT: "#10b981",
          50:  "#ecfdf5",
          100: "#d1fae5",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
        },

        warning: {
          DEFAULT: "#f59e0b",
          50:  "#fffbeb",
          100: "#fef3c7",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
        },

        danger: {
          DEFAULT: "#f43f5e",
          50:  "#fff1f2",
          100: "#ffe4e6",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
        },

        info: {
          DEFAULT: "#0ea5e9",
          50:  "#f0f9ff",
          100: "#e0f2fe",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
        },

        // Golden moments (Pattern Miner natijasi)
        gold: {
          DEFAULT: "#facc15",
          50:  "#fefce8",
          500: "#facc15",
          600: "#ca8a04",
        },

        // Orange — legacy
        orange: "#f97316",
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },

      // ── Typography scale (DS v2) ─────────────────────────────
      fontSize: {
        "2xs":  ["0.6875rem", { lineHeight: "1rem",     letterSpacing: "0.01em" }],  // 11
        "xs":   ["0.75rem",   { lineHeight: "1rem",     letterSpacing: "0.01em" }],  // 12
        "sm":   ["0.8125rem", { lineHeight: "1.25rem",  letterSpacing: "0" }],       // 13
        "base": ["0.875rem",  { lineHeight: "1.375rem", letterSpacing: "0" }],       // 14
        "md":   ["1rem",      { lineHeight: "1.5rem",   letterSpacing: "0" }],       // 16
        "lg":   ["1.125rem",  { lineHeight: "1.625rem", letterSpacing: "-0.005em" }], // 18
        "xl":   ["1.375rem",  { lineHeight: "1.75rem",  letterSpacing: "-0.01em" }], // 22
        "2xl":  ["1.75rem",   { lineHeight: "2rem",     letterSpacing: "-0.01em" }], // 28
        "3xl":  ["2.25rem",   { lineHeight: "2.5rem",   letterSpacing: "-0.015em" }], // 36
        "4xl":  ["3rem",      { lineHeight: "3rem",     letterSpacing: "-0.02em" }], // 48
      },

      // ── 4px spacing grid ─────────────────────────────────────
      spacing: {
        "4.5": "1.125rem", // 18
        "13":  "3.25rem",  // 52
        "15":  "3.75rem",  // 60
        "18":  "4.5rem",   // 72
      },

      borderRadius: {
        "4xl": "2rem",
      },

      boxShadow: {
        "ds-sm": "var(--ds-shadow-sm)",
        "ds-md": "var(--ds-shadow-md)",
        "ds-lg": "var(--ds-shadow-lg)",
      },
    },
  },
  plugins: [],
};
