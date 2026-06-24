/**
 * Agent tizimi — umumiy interfeyslar va turlar.
 *
 * Har agent `BaseAgent`dan meros oladi va `execute()` metodini implementatsiya qiladi.
 * Agentlar orasida ma'lumot almashinuvi `AgentContext` va `AgentResult` orqali bo'ladi.
 */

export type AgentLayer =
  | "layer1-collection"
  | "layer2-quality"
  | "layer3-intelligence"
  | "layer4-delivery"
  | "layer5-advanced";

export type AgentStatus = "enabled" | "disabled" | "degraded";

export interface AgentMetadata {
  id: string;
  name: string;
  layer: AgentLayer;
  version: string;
  description: string;
  model?: string;
  dependencies?: string[];
}

export interface AgentContext {
  companyId: string;
  managerId?: string;
  audioFileId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs?: number;
  tokensUsed?: { input: number; output: number };
  cacheHit?: boolean;
}

export interface AgentLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface ConfidenceScored<T> {
  value: T;
  confidenceScore: number;
  evidenceQuote?: string;
}
