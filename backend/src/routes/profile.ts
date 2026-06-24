import { Router } from "express";
import {
  getProfile,
  updateProfile,
  updateNotifications,
  connectTelegram,
  disconnectTelegram,
  updateExcludedPipelines,
  changePassword,
  uploadMiddleware,
  uploadDocument,
  listDocuments,
  deleteDocument,
  updateBotSchedule,
  getBotSchedule,
} from "../controllers/profile.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.get("/", asyncHandler(getProfile));
router.put("/", asyncHandler(updateProfile));
router.put("/notifications", asyncHandler(updateNotifications));
router.get("/bot-schedule", asyncHandler(getBotSchedule));
router.put("/bot-schedule", asyncHandler(updateBotSchedule));
router.post("/telegram/connect", asyncHandler(connectTelegram));
router.delete("/telegram/disconnect", asyncHandler(disconnectTelegram));
router.put("/excluded-pipelines", asyncHandler(updateExcludedPipelines));
router.put("/password", asyncHandler(changePassword));

router.post(
  "/documents",
  (req, res, next) =>
    uploadMiddleware(req, res, (err) => {
      if (err) return res.status(400).json({ ok: false, message: (err as Error).message });
      next();
    }),
  asyncHandler(uploadDocument)
);
router.get("/documents", asyncHandler(listDocuments));
router.delete("/documents/:id", asyncHandler(deleteDocument));

export default router;
