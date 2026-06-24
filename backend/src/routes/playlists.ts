import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { getDefinitions, getPlaylistItems } from "../controllers/playlists.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", asyncHandler(getDefinitions));
router.get("/:key", asyncHandler(getPlaylistItems));

export default router;
