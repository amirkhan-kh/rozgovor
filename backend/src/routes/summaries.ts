import { Router } from "express";
import { getAll, generate, getOne, deleteSummary } from "../controllers/summaries.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.get("/", asyncHandler(getAll));
router.post("/generate", asyncHandler(generate));
router.get("/:id", asyncHandler(getOne));
router.delete("/:id", asyncHandler(deleteSummary));

export default router;
