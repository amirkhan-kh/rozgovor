import { Router } from "express";
import {
  getSalesOverview,
  getSalesTaskStats,
  getSalesTaskList,
  getManagersSales,
  getPipelines,
  getSalesSources,
  getKelishilganTolov,
  getKpiLeadsList,
} from "../controllers/sales.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

router.get("/overview", requirePermission("sales", "view"), asyncHandler(getSalesOverview));
router.get("/task-stats", requirePermission("sales", "view"), asyncHandler(getSalesTaskStats));
router.get("/task-list", requirePermission("sales", "view"), asyncHandler(getSalesTaskList));
router.get("/managers", requirePermission("sales", "view"), asyncHandler(getManagersSales));
router.get("/pipelines", requirePermission("sales", "view"), asyncHandler(getPipelines));
router.get("/sources", requirePermission("sales", "view"), asyncHandler(getSalesSources));
router.get("/kelishilgan-tolov", requirePermission("sales", "view"), asyncHandler(getKelishilganTolov));
router.get("/leads-list", requirePermission("sales", "view"), asyncHandler(getKpiLeadsList));

export default router;
