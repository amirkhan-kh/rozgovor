import { Router } from "express";
import {
  getCoachOverview, chat,
  getChatSessions, getChatSession, createChatSession, updateChatSession, deleteChatSession,
  getAdvice, generateTraining,
} from "../controllers/coach.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

router.get("/overview", asyncHandler(getCoachOverview));
router.post("/chat", asyncHandler(chat));

// Chat history
router.get("/sessions", asyncHandler(getChatSessions));
router.post("/sessions", asyncHandler(createChatSession));
router.get("/sessions/:id", asyncHandler(getChatSession));
router.put("/sessions/:id", asyncHandler(updateChatSession));
router.delete("/sessions/:id", asyncHandler(deleteChatSession));

router.get("/advice/:managerId", asyncHandler(getAdvice));
router.post("/training/:managerId", asyncHandler(generateTraining));

export default router;
