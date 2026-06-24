import { Router } from "express";
import {
  getActivities,
  syncActivities,
} from "../controllers/activities.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

router.get("/", asyncHandler(getActivities));
router.post("/sync", asyncHandler(syncActivities));

export default router;
