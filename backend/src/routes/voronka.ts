import { Router } from "express";
import {
  getAll,
  getDetail,
  getCriteria,
  getErrors,
  getAudio,
  toggleArchive,
} from "../controllers/voronka.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.get("/", asyncHandler(getAll));
router.put("/:name/archive", asyncHandler(toggleArchive));
router.get("/:name", asyncHandler(getDetail));
router.get("/:name/criteria", asyncHandler(getCriteria));
router.get("/:name/errors", asyncHandler(getErrors));
router.get("/:name/audio", asyncHandler(getAudio));

export default router;
