import { Router } from "express";
import {
  getSalesPlans,
  saveSalesPlans,
  getPlanFact,
  getTalkTarget,
  saveTalkTarget,
  getManagerTalkStats,
  getSchedule,
  getAllSchedules,
  updateScheduleDay,
} from "../controllers/plans.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

// Sotuv planlari
router.get("/sales-plans", requirePermission("sales", "view"), asyncHandler(getSalesPlans));
router.put("/sales-plans", requirePermission("sales", "edit_plan"), asyncHandler(saveSalesPlans));
router.get("/plan-fact", requirePermission("sales", "view"), asyncHandler(getPlanFact));

// Manager talk target
router.get("/talk-target", requirePermission("sales", "view"), asyncHandler(getTalkTarget));
router.put("/talk-target", requirePermission("sales", "edit_plan"), asyncHandler(saveTalkTarget));
router.get("/talk-stats", requirePermission("sales", "view"), asyncHandler(getManagerTalkStats));

// Manager schedule
router.get("/schedule", requirePermission("managers", "view"), asyncHandler(getAllSchedules));
router.get("/schedule/:managerId", requirePermission("managers", "view"), asyncHandler(getSchedule));
router.put("/schedule/:managerId", requirePermission("managers", "edit"), asyncHandler(updateScheduleDay));

export default router;
