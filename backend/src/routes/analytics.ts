import { Router } from "express";
import {
  getLeadFunnel,
  getNewNoAnswer,
  getResponseTime,
  getLeadTransfers,
  getQualityTrend,
  getStageMismatch,
  getResponseTimeByManager,
  getTransferTime,
  getPbxMapping,
  getPresentations,
  getPaymentAnalytics,
  getCallAttempts,
  getWrongNumber,
  getReasonBreakdown,
  getObjectionTrend,
  getAiCosts,
  getAdvice,
} from "../controllers/analytics.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

router.get("/funnel", requirePermission("sales", "view"), asyncHandler(getLeadFunnel));
router.get("/new-noanswer", requirePermission("sales", "view"), asyncHandler(getNewNoAnswer));
router.get("/response-time", requirePermission("sales", "view"), asyncHandler(getResponseTime));
router.get("/lead-transfers", requirePermission("sales", "view"), asyncHandler(getLeadTransfers));
router.get("/quality-trend", requirePermission("sales", "view"), asyncHandler(getQualityTrend));
router.get("/stage-mismatch", requirePermission("sales", "view"), asyncHandler(getStageMismatch));
router.get("/response-time-by-manager", requirePermission("sales", "view"), asyncHandler(getResponseTimeByManager));
router.get("/transfer-time", requirePermission("sales", "view"), asyncHandler(getTransferTime));
router.get("/pbx-mapping", requirePermission("sales", "view"), asyncHandler(getPbxMapping));
router.get("/presentations", requirePermission("sales", "view"), asyncHandler(getPresentations));
router.get("/payments", requirePermission("sales", "view"), asyncHandler(getPaymentAnalytics));
router.get("/call-attempts", requirePermission("sales", "view"), asyncHandler(getCallAttempts));
router.get("/wrong-number", requirePermission("sales", "view"), asyncHandler(getWrongNumber));
router.get("/reason-breakdown", requirePermission("sales", "view"), asyncHandler(getReasonBreakdown));
router.get("/objection-trend", requirePermission("sales", "view"), asyncHandler(getObjectionTrend));
router.get("/ai-costs", requirePermission("sales", "view"), asyncHandler(getAiCosts));
router.get("/advice", requirePermission("sales", "view"), asyncHandler(getAdvice));

export default router;
