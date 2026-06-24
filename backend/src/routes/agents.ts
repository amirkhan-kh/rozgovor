import { Router } from "express";
import {
  getWeeklyStrategy,
  generateWeeklyStrategy,
  getManagerProgress,
  refreshManagerProgress,
  getBenchmark,
  getGoldenMoments,
  submitFeedback,
  getFeedbackStats,
  reviewFeedback,
  getTrainerScenarios,
  getStrategyBasedScenarios,
  submitPracticeAudio,
  getPracticeHistory,
  listCompetitors,
  analyzeCompetitor,
  deleteCompetitor,
  getRedAlerts,
  acknowledgeRedAlert,
  scanRedAlerts,
  getTodayLesson,
  generateTodayLesson,
} from "../controllers/agents.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

// Weekly strategy
router.get("/strategy/:managerId", asyncHandler(getWeeklyStrategy));
router.post("/strategy/:managerId", asyncHandler(generateWeeklyStrategy));

// Progress
router.get("/progress/:managerId", asyncHandler(getManagerProgress));
router.post("/progress/:managerId/refresh", asyncHandler(refreshManagerProgress));

// Benchmark (company-wide statistics)
router.get("/benchmark", asyncHandler(getBenchmark));

// Golden moments (Pattern Miner results)
router.get("/golden-moments/:managerId", asyncHandler(getGoldenMoments));

// Feedback (👍/👎 on coach output)
router.post("/feedback", asyncHandler(submitFeedback));
router.get("/feedback/stats", asyncHandler(getFeedbackStats));
router.put("/feedback/:id/review", asyncHandler(reviewFeedback));

// Trainer (Practice Mode)
router.get("/trainer/scenarios", asyncHandler(getTrainerScenarios));
router.get("/trainer/scenarios/:managerId", asyncHandler(getStrategyBasedScenarios));
router.post("/trainer/practice/:managerId", asyncHandler(submitPracticeAudio));
router.get("/trainer/history/:managerId", asyncHandler(getPracticeHistory));

// Layer 5 — Advanced Agents
// Rival
router.get("/rival/competitors", asyncHandler(listCompetitors));
router.post("/rival/analyze", asyncHandler(analyzeCompetitor));
router.delete("/rival/competitors/:id", asyncHandler(deleteCompetitor));
// Red-Alert
router.get("/red-alerts", asyncHandler(getRedAlerts));
router.put("/red-alerts/:id/ack", asyncHandler(acknowledgeRedAlert));
router.post("/red-alerts/scan", asyncHandler(scanRedAlerts));
// Knowledge Distiller
router.get("/daily-lesson", asyncHandler(getTodayLesson));
router.post("/daily-lesson", asyncHandler(generateTodayLesson));

export default router;
