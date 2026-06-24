// Manager side lesson routes — /api/my/lessons
import { Router } from "express";
import {
  listMyLessons,
  listMyModules,
  listMyCourses,
  getMyLesson,
  updateVideoProgress,
  startTest,
  retryWrongTest,
  submitTest,
  aiChat,
  finishAi,
  streamVideo,
} from "../controllers/my-lessons.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

// Kurslar (birinchi qatlam — manager ko'radigan kurslar)
router.get("/courses", asyncHandler(listMyCourses));

// Modullar (ikkinchi qatlam — kurs ichidagi modullar)
router.get("/modules", asyncHandler(listMyModules));

// Darslar (moduleId query bilan filtrlash mumkin)
router.get("/", asyncHandler(listMyLessons));
router.get("/:id", asyncHandler(getMyLesson));

router.post("/:id/video-progress", asyncHandler(updateVideoProgress));
router.get("/:id/video-stream", asyncHandler(streamVideo));

router.post("/:id/test-start", asyncHandler(startTest));
router.post("/:id/test-retry-wrong", asyncHandler(retryWrongTest));
router.post("/:id/test-submit", asyncHandler(submitTest));

router.post("/:id/ai-chat", asyncHandler(aiChat));
router.post("/:id/ai-finish", asyncHandler(finishAi));

export default router;
