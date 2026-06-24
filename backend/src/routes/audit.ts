import { Router } from "express";
import { getAuditOverview } from "../controllers/audit.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

router.get("/overview", requirePermission("audit", "view"), asyncHandler(getAuditOverview));

export default router;
