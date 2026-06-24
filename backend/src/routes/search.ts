import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { searchHandler } from "../controllers/search.controller";

const router = Router();

router.use(authMiddleware);

router.get("/", asyncHandler(searchHandler));
router.post("/", asyncHandler(searchHandler));

export default router;
