import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
  getObjectionLibrary,
  refreshObjectionLibraryHandler,
  getTrackers,
  createTracker,
  deleteTracker,
} from "../controllers/knowledge.controller";

const router = Router();

router.use(authMiddleware);

// Objection library
router.get("/objections", asyncHandler(getObjectionLibrary));
router.post("/objections/refresh", asyncHandler(refreshObjectionLibraryHandler));

// Smart trackers
router.get("/trackers", asyncHandler(getTrackers));
router.post("/trackers", asyncHandler(createTracker));
router.delete("/trackers/:id", asyncHandler(deleteTracker));

export default router;
