import { Router } from "express";
import {
  createOpenAIRealtimeSession,
  createGeminiLiveToken,
} from "../controllers/voice-test.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.post("/openai-session", asyncHandler(createOpenAIRealtimeSession));
router.post("/gemini-token", asyncHandler(createGeminiLiveToken));

export default router;
