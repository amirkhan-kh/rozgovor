/**
 * BaseAgent — barcha ixtisoslashgan agentlar uchun asosiy sinf.
 *
 * Har agent shu sinfdan meros oladi va `run()` metodini implementatsiya qiladi.
 * Xatoliklar, logging, feature flag va trace ID shu yerda markazlashtirilgan.
 */

import type {
  AgentContext,
  AgentLogger,
  AgentMetadata,
  AgentResult,
} from "./types";

export abstract class BaseAgent<TInput = unknown, TOutput = unknown> {
  abstract readonly metadata: AgentMetadata;

  protected readonly logger: AgentLogger;

  constructor(logger?: AgentLogger) {
    this.logger = logger ?? this.defaultLogger();
  }

  /**
   * Har agent shu metodni implementatsiya qiladi — asosiy logika shu yerda.
   */
  protected abstract run(input: TInput, ctx: AgentContext): Promise<TOutput>;

  /**
   * Public entry point — xatoliklar, metrikalar va feature flag bu yerda.
   */
  async execute(input: TInput, ctx: AgentContext): Promise<AgentResult<TOutput>> {
    if (!this.isEnabled()) {
      return {
        success: false,
        error: `Agent ${this.metadata.id} disabled via feature flag`,
      };
    }

    const start = Date.now();
    const traceId = ctx.traceId ?? `${this.metadata.id}-${start}`;

    this.logger.info(`[${this.metadata.id}] start`, {
      traceId,
      companyId: ctx.companyId,
      managerId: ctx.managerId,
    });

    try {
      const data = await this.run(input, { ...ctx, traceId });
      const durationMs = Date.now() - start;
      this.logger.info(`[${this.metadata.id}] done ${durationMs}ms`, { traceId });
      return { success: true, data, durationMs };
    } catch (err) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[${this.metadata.id}] failed: ${message}`, {
        traceId,
        durationMs,
      });
      return { success: false, error: message, durationMs };
    }
  }

  /**
   * Feature flag tekshiruvi. `.env` da `AGENT_<ID>_ENABLED=false` ga o'rnatilsa
   * agent ishga tushmaydi. Default: yoqilgan.
   */
  protected isEnabled(): boolean {
    const envKey = `AGENT_${this.metadata.id.toUpperCase().replace(/-/g, "_")}_ENABLED`;
    const raw = process.env[envKey];
    if (raw === undefined) return true;
    return raw === "true" || raw === "1";
  }

  private defaultLogger(): AgentLogger {
    return {
      info: (msg, meta) => console.log(msg, meta ?? ""),
      warn: (msg, meta) => console.warn(msg, meta ?? ""),
      error: (msg, meta) => console.error(msg, meta ?? ""),
    };
  }
}
