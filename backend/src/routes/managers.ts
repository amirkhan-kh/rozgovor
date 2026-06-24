import { Router } from "express";
import { getAll, create, update, remove, archive, getManagerDetail, getGrowthCard, getManagersAudit, syncFromBitrix } from "../controllers/managers.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();

router.use(authMiddleware);

router.get("/", requirePermission("managers", "view"), asyncHandler(getAll));
router.get("/audit", requirePermission("managers", "view"), asyncHandler(getManagersAudit));
router.post("/", requirePermission("managers", "edit"), asyncHandler(create));
router.post("/sync-bitrix", requirePermission("managers", "edit"), asyncHandler(syncFromBitrix));
router.get("/:id/detail", requirePermission("managers", "view"), asyncHandler(getManagerDetail));
router.put("/:id", requirePermission("managers", "edit"), asyncHandler(update));
router.delete("/:id", requirePermission("managers", "delete"), asyncHandler(remove));
router.put("/:id/archive", requirePermission("managers", "edit"), asyncHandler(archive));
router.get("/:id/growth-card", requirePermission("managers", "view"), asyncHandler(getGrowthCard));

export default router;
