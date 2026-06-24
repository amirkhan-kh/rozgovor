import { Router } from "express";
import { login, me } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.post("/login", asyncHandler(login));
router.get("/me", authMiddleware, asyncHandler(me));

export default router;
