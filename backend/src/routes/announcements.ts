import { Router } from "express";
import {
  createAnnouncement,
  listAnnouncements,
  getUnshown,
  markShown,
  markRead,
  aiGenerate,
} from "../controllers/announcements.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.get("/", asyncHandler(listAnnouncements));
router.get("/unshown", asyncHandler(getUnshown));
router.post("/", asyncHandler(createAnnouncement));
router.post("/ai-generate", asyncHandler(aiGenerate));
router.post("/:id/shown", asyncHandler(markShown));
router.post("/:id/read", asyncHandler(markRead));

export default router;
