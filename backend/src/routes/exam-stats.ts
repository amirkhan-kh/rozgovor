import { Router } from "express";
import { leaderboard, progress, managerDashboard } from "../controllers/exam-stats.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requireFeature } from "../middlewares/featurePermission";

const router = Router();

router.use(authMiddleware);

router.get("/leaderboard", requireFeature("leaderboard"), asyncHandler(leaderboard));
router.get("/progress", requireFeature("progress"), asyncHandler(progress));
router.get(
  "/manager-dashboard",
  requireFeature("manager_dashboard"),
  asyncHandler(managerDashboard)
);

export default router;
