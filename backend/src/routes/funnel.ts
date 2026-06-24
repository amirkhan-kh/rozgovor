import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { getFunnelLeakage } from "../controllers/funnel.controller";

const router = Router();

router.use(authMiddleware);

// GET /api/funnel/leakage?days=30
router.get("/leakage", asyncHandler(getFunnelLeakage));

export default router;
