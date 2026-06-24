import { Router } from "express";
import {
  getRating,
  getSalesLeaderboard,
  getSalesPlanMode,
  setSalesPlanMode,
  setManagerSalesPlan,
  setManagerKpi,
} from "../controllers/rating.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();

router.use(authMiddleware);

router.get("/", requirePermission("rating", "view"), asyncHandler(getRating));

// Sotuv leaderboard (Reyting → Sotuv tab)
router.get("/sales", requirePermission("rating", "view"), asyncHandler(getSalesLeaderboard));
router.get("/sales-mode", requirePermission("rating", "view"), asyncHandler(getSalesPlanMode));
router.put("/sales-mode", requirePermission("sales", "edit_plan"), asyncHandler(setSalesPlanMode));
router.put("/sales-plan/:managerId", requirePermission("sales", "edit_plan"), asyncHandler(setManagerSalesPlan));
router.put("/manager-kpi/:managerId", requirePermission("sales", "edit_plan"), asyncHandler(setManagerKpi));

export default router;
