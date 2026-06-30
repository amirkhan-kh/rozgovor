import { Router } from "express";
import {
  getLeadFunnel,
  getNewNoAnswer,
  getResponseTime,
  getLeadTransfers,
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

export default router;
