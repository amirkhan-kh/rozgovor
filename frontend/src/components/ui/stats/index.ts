/**
 * Design System v2 — Stats komponent kutubxonasi.
 *
 * Barcha dashboard KPI, insight, va section header'lar shu komponentlardan foydalanadi.
 * Eski komponentlar (Card, Badge) backward compat saqlanadi.
 */

export { default as StatCard, scoreToVariant } from "./StatCard";
export type { StatVariant } from "./StatCard";

export { default as TrendIndicator } from "./TrendIndicator";
export { default as Sparkline } from "./Sparkline";
export { default as ScoreBadge } from "./ScoreBadge";
export { default as InsightBanner } from "./InsightBanner";
export type { InsightKind } from "./InsightBanner";
export { default as EmptyState } from "./EmptyState";
export { default as SectionHeader } from "./SectionHeader";
export { default as ProgressRing } from "./ProgressRing";
