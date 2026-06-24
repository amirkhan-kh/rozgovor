import { Router } from "express";
import {
  listScenarios,
  generateAllScenarios,
  updateScenario,
} from "../controllers/scenarios.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

router.get("/", asyncHandler(listScenarios));
router.post("/generate", asyncHandler(generateAllScenarios));
router.put("/:id", asyncHandler(updateScenario));

export default router;
