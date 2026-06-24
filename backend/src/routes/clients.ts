import { Router } from "express";
import {
  listClients,
  getClientDetail,
  getClientFilters,
  getClientInsights,
  getClientAiNarrative,
} from "../controllers/clients.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

router.get("/filters", requirePermission("clients", "view"), asyncHandler(getClientFilters));
router.get("/insights/ai", requirePermission("clients", "view"), asyncHandler(getClientAiNarrative));
router.get("/insights", requirePermission("clients", "view"), asyncHandler(getClientInsights));
router.get("/", requirePermission("clients", "view"), asyncHandler(listClients));
router.get("/:id", requirePermission("clients", "view"), asyncHandler(getClientDetail));

export default router;
