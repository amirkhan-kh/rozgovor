import { Router } from "express";
import multer from "multer";
import {
  listCases,
  createCase,
  getCase,
  deleteCase,
  postMessage,
  postGenerateLetter,
  postAnalyzeAndRender,
  postEditLetter,
  postAttachment,
  streamAttachment,
  postVoiceTranscribe,
  listKnowledge,
  createKnowledge,
  deleteKnowledge,
} from "../controllers/legal.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

// LegalAttachment uchun alohida multer (audio'dan farqli — barcha fayl turlari).
const legalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB — video/audio dalillar uchun
});

router.use(authMiddleware);

// Cases
router.get("/cases", asyncHandler(listCases));
router.post("/cases", asyncHandler(createCase));
router.get("/cases/:id", asyncHandler(getCase));
router.delete("/cases/:id", asyncHandler(deleteCase));

// Messages
router.post("/cases/:id/messages", asyncHandler(postMessage));
router.post("/cases/:id/generate-letter", asyncHandler(postGenerateLetter));
router.post("/cases/:id/analyze-and-render", asyncHandler(postAnalyzeAndRender));
router.post("/cases/:id/edit-letter", asyncHandler(postEditLetter));

// Attachments
router.post(
  "/cases/:id/attachments",
  legalUpload.single("file"),
  asyncHandler(postAttachment),
);
router.get("/attachments/:id/file", asyncHandler(streamAttachment));

// Voice → text (Yandex STT)
router.post(
  "/voice-transcribe",
  legalUpload.single("file"),
  asyncHandler(postVoiceTranscribe),
);

// Knowledge base — file upload optional (txt/md/pdf/docx/pptx + content text)
router.get("/knowledge", asyncHandler(listKnowledge));
router.post(
  "/knowledge",
  legalUpload.single("file"),
  asyncHandler(createKnowledge),
);
router.delete("/knowledge/:id", asyncHandler(deleteKnowledge));

export default router;
