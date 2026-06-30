import { Router } from "express";
import { getAuditOverview, getLostVerdicts } from "../controllers/audit.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

router.get("/overview", requirePermission("audit", "view"), asyncHandler(getAuditOverview));
router.get("/lost-verdicts", requirePermission("audit", "view"), asyncHandler(getLostVerdicts));

export default router;
