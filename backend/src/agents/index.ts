/**
 * Agent registry — markazlashtirilgan eksport nuqtasi.
 *
 * Yangi agent yaratilganda shu yerga qo'shiladi. Qolganlari
 * `import { CoachAgent } from "../agents"` kabi ishlatishi mumkin.
 */

export { BaseAgent } from "./base.agent";
export type {
  AgentContext,
  AgentLayer,
  AgentLogger,
  AgentMetadata,
  AgentResult,
  AgentStatus,
  ConfidenceScored,
} from "./types";

// Layer 2: Quality
export { ValidatorAgent, validatorAgent } from "./layer2-quality/validator.agent";
export { PatternMinerAgent, patternMinerAgent } from "./layer2-quality/pattern-miner.agent";

// Layer 3: Intelligence
export { BenchmarkAgent, benchmarkAgent } from "./layer3-intelligence/benchmark.agent";
export { StrategistAgent, strategistAgent } from "./layer3-intelligence/strategist.agent";

// Layer 4: Delivery
export { ProgressAgent, progressAgent } from "./layer4-delivery/progress.agent";
export { FeedbackAgent, feedbackAgent } from "./layer4-delivery/feedback.agent";
export { TrainerAgent, trainerAgent } from "./layer4-delivery/trainer.agent";

// Layer 5: Advanced Intelligence
export { RivalAgent, rivalAgent } from "./layer5-advanced/rival.agent";
export { RedAlertAgent, redAlertAgent } from "./layer5-advanced/red-alert.agent";
export {
  KnowledgeDistillerAgent,
  knowledgeDistillerAgent,
} from "./layer5-advanced/knowledge-distiller.agent";

// Layer 6: Meta / Supervisor
export { GuardianAgent, guardianAgent } from "./layer6-meta/guardian.agent";
export {
  BatchSchedulerAgent,
  batchSchedulerAgent,
} from "./layer6-meta/batch-scheduler.agent";
