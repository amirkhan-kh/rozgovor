import { Router } from "express";
import {
  myFeatureMap,
  listPermissions,
  setPermission,
} from "../controllers/feature-permissions.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.get("/me", asyncHandler(myFeatureMap));
router.get("/", asyncHandler(listPermissions));
router.put("/", asyncHandler(setPermission));

export default router;
