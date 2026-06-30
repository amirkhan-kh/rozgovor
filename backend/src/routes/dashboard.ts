import { Router } from "express";
import {
  getStats,
  getCriteria,
  getErrors,
  getErrorItems,
  getObjections,
  getWinLoss,
  getCallsTrend,
  getSpeechRatio,
  getSummary,
  getCategoryStats,
  getSalesStats,
  getSalesTrend,
  getManagerDurations,
} from "../controllers/dashboard.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.get("/stats", asyncHandler(getStats));
router.get("/criteria", asyncHandler(getCriteria));
router.get("/errors", asyncHandler(getErrors));
router.get("/errors/items", asyncHandler(getErrorItems));
router.get("/objections", asyncHandler(getObjections));
router.get("/win-loss", asyncHandler(getWinLoss));
router.get("/calls-trend", asyncHandler(getCallsTrend));
router.get("/speech-ratio", asyncHandler(getSpeechRatio));
router.get("/manager-durations", asyncHandler(getManagerDurations));
router.get("/summary", asyncHandler(getSummary));
router.get("/category-stats", asyncHandler(getCategoryStats));
router.get("/sales-stats", asyncHandler(getSalesStats));
router.get("/sales-trend", asyncHandler(getSalesTrend));

export default router;
