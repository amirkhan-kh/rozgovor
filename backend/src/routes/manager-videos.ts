// Wave 4 — Manager Celebration Videos routes.
//
// Mounted in app.ts as:
//   app.use("/api", managerVideosRoutes);
//
// Ikki namespace:
//   /api/managers/:id/photo | generate-videos | videos
//   /api/manager-videos/:videoId/{music,render,poll-now}
import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
  postManagerPhoto,
  postGenerateVideos,
  listManagerVideos,
  getVideoDetail,
  postVideoMusic,
  putVideoMusic,
  postVideoRender,
  deleteVideo,
  postPollNow,
} from "../controllers/manager-videos.controller";

const router = Router();

// Memory storage — fayl buffer sifatida kelishi shart (Yandex'ga yuborish uchun)
// Limitlar:
//   - photo: 15 MB
//   - music: 60 MB (mp3/wav/ogg uchun yetarli)
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const musicUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

router.use(authMiddleware);

// ─── /api/managers/:id/... ───────────────────────────────────────────────
router.post(
  "/managers/:id/photo",
  photoUpload.single("photo"),
  asyncHandler(postManagerPhoto),
);
router.post("/managers/:id/generate-videos", asyncHandler(postGenerateVideos));
router.get("/managers/:id/videos", asyncHandler(listManagerVideos));

// ─── /api/manager-videos/:videoId/... ────────────────────────────────────
router.get("/manager-videos/:videoId", asyncHandler(getVideoDetail));
router.post(
  "/manager-videos/:videoId/music",
  musicUpload.single("music"),
  asyncHandler(postVideoMusic),
);
router.put("/manager-videos/:videoId/music", asyncHandler(putVideoMusic));
router.post("/manager-videos/:videoId/render", asyncHandler(postVideoRender));
router.delete("/manager-videos/:videoId", asyncHandler(deleteVideo));

// Manual poll trigger — faqat admin (company login)
router.post("/manager-videos/poll-now", asyncHandler(postPollNow));

export default router;
