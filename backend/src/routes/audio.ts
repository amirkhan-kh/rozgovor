import { Router } from "express";
import {
  upload_audio,
  getAll,
  getOne,
  getTranscription,
  updateTranscription,
  remove,
  chat,
  stream,
  analyzeOne,
  analyzeBulk,
  backfill,
  batchStart,
  batchProgress,
  batchStop,
  stopAnalysis,
  getProgress,
  overrideJudge,
  createShareLink,
  revokeShareLink,
} from "../controllers/audio.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { upload } from "../middlewares/upload";
import { dailyLimitMiddleware } from "../middlewares/dailyLimit";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();

router.use(authMiddleware);

router.get("/", requirePermission("audio", "view"), asyncHandler(getAll));
router.get("/progress", requirePermission("audio", "view"), asyncHandler(getProgress));
router.post(
  "/upload",
  requirePermission("audio", "upload_audio"),
  dailyLimitMiddleware,
  upload.single("audio"),
  asyncHandler(upload_audio)
);
router.post("/analyze-bulk", requirePermission("audio", "upload_audio"), asyncHandler(analyzeBulk));
router.post("/backfill", requirePermission("audio", "upload_audio"), asyncHandler(backfill));
router.post("/batch-start", requirePermission("audio", "upload_audio"), asyncHandler(batchStart));
router.get("/batch-progress", requirePermission("audio", "view"), asyncHandler(batchProgress));
router.post("/batch-stop", requirePermission("audio", "upload_audio"), asyncHandler(batchStop));
router.post("/stop-analysis", requirePermission("audio", "upload_audio"), asyncHandler(stopAnalysis));
router.get("/:id", requirePermission("audio", "view"), asyncHandler(getOne));
router.get("/:id/transcription", requirePermission("audio", "view"), asyncHandler(getTranscription));
router.put("/:id/transcription", requirePermission("audio", "upload_audio"), asyncHandler(updateTranscription));
router.get("/:id/stream", requirePermission("audio", "view"), asyncHandler(stream));
router.post("/:id/analyze", requirePermission("audio", "upload_audio"), asyncHandler(analyzeOne));
router.patch("/:id/judge-override", requirePermission("audio", "upload_audio"), asyncHandler(overrideJudge));
router.post("/:id/share", requirePermission("audio", "upload_audio"), asyncHandler(createShareLink));
router.delete("/:id/share", requirePermission("audio", "delete"), asyncHandler(revokeShareLink));
router.delete("/:id", requirePermission("audio", "delete"), asyncHandler(remove));
router.post("/:id/chat", requirePermission("audio", "view"), asyncHandler(chat));

export default router;
