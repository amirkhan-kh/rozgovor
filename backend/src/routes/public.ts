// Public routelar — auth middlewareSIZ.
// Bu yerga faqat xavfsiz ulashilgan ma'lumotlarga access yoziladi.

import { Router } from "express";
import {
  getSharedAudio,
  streamSharedAudio,
} from "../controllers/audio.controller";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.get("/audio/:token", asyncHandler(getSharedAudio));
router.get("/audio/:token/stream", asyncHandler(streamSharedAudio));

export default router;
