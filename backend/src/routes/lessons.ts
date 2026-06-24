// Admin/Boss/ROP lessons routes
import { Router } from "express";
import {
  createLesson,
  listLessons,
  getLesson,
  updateLesson,
  deleteLesson,
  reprocessLesson,
  replaceVideo,
  assignLesson,
  unassignLesson,
  getLessonProgress,
  streamAdminVideo,
  managerLessonStats,
  allManagersLessonStats,
  // Kurs boshqaruvi (yuqori qatlam)
  listCourses,
  createCourse,
  getCourse,
  updateCourse,
  deleteCourse,
  assignCourse,
  unassignCourse,
  listCourseAssignments,
  // Modul boshqaruvi (o'rta qatlam)
  listModules,
  createModule,
  getModule,
  updateModule,
  deleteModule,
  assignModule,
  unassignModule,
  runBatchAnalysis,
} from "../controllers/lessons.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { lessonVideoUpload } from "../middlewares/lessonUpload";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

// ─── Kurslar ────────────────────────────────────────
router.get("/courses", requirePermission("lessons", "view"), asyncHandler(listCourses));
router.post("/courses", requirePermission("lessons", "upload"), asyncHandler(createCourse));
router.get("/courses/:id", requirePermission("lessons", "view"), asyncHandler(getCourse));
router.patch("/courses/:id", requirePermission("lessons", "edit"), asyncHandler(updateCourse));
router.delete("/courses/:id", requirePermission("lessons", "delete"), asyncHandler(deleteCourse));
// Kursga managerlarni biriktirish (yangi birlamchi yo'l)
router.get("/courses/:id/assignments", requirePermission("lessons", "view"), asyncHandler(listCourseAssignments));
router.post("/courses/:id/assign", requirePermission("lessons", "assign"), asyncHandler(assignCourse));
router.delete("/courses/:id/assign/:managerId", requirePermission("lessons", "assign"), asyncHandler(unassignCourse));

// ─── Modullar ───────────────────────────────────────
router.get("/modules", requirePermission("lessons", "view"), asyncHandler(listModules));
router.post("/modules", requirePermission("lessons", "upload"), asyncHandler(createModule));
router.get("/modules/:id", requirePermission("lessons", "view"), asyncHandler(getModule));
router.patch("/modules/:id", requirePermission("lessons", "edit"), asyncHandler(updateModule));
router.delete("/modules/:id", requirePermission("lessons", "delete"), asyncHandler(deleteModule));
router.post("/modules/:id/assign", requirePermission("lessons", "assign"), asyncHandler(assignModule));
router.delete("/modules/:id/assign/:managerId", requirePermission("lessons", "assign"), asyncHandler(unassignModule));

// ─── Darslar (modul ichida) ───────────────────────────
router.get("/", requirePermission("lessons", "view"), asyncHandler(listLessons));
router.post("/", requirePermission("lessons", "upload"), lessonVideoUpload.single("video"), asyncHandler(createLesson));

// Batch tahlil qo'lda ishga tushirish (STT poll + Flash batch) — admin/boss/ROP
router.post("/run-batch", requirePermission("lessons", "edit"), asyncHandler(runBatchAnalysis));

router.get("/:id", requirePermission("lessons", "view"), asyncHandler(getLesson));
router.patch("/:id", requirePermission("lessons", "edit"), asyncHandler(updateLesson));
router.delete("/:id", requirePermission("lessons", "delete"), asyncHandler(deleteLesson));

router.post("/:id/reprocess", requirePermission("lessons", "edit"), asyncHandler(reprocessLesson));
router.post("/:id/replace-video", requirePermission("lessons", "upload"), lessonVideoUpload.single("video"), asyncHandler(replaceVideo));
router.get("/:id/progress", requirePermission("lessons", "view"), asyncHandler(getLessonProgress));
router.get("/:id/video-stream", requirePermission("lessons", "view"), asyncHandler(streamAdminVideo));

router.post("/:id/assign", requirePermission("lessons", "assign"), asyncHandler(assignLesson));
router.delete("/:id/assign/:managerId", requirePermission("lessons", "assign"), asyncHandler(unassignLesson));

// Manager stats (admin/rop ko'rishi uchun)
router.get("/manager/:id/stats", requirePermission("lessons", "view"), asyncHandler(managerLessonStats));
router.get("/managers/all-stats", requirePermission("lessons", "view"), asyncHandler(allManagersLessonStats));

export default router;
