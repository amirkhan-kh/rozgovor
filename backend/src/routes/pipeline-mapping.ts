import { Router } from "express";
import { syncPipelineStages, getMappings, saveMapping } from "../controllers/pipeline-mapping.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

router.get("/sync-stages", asyncHandler(syncPipelineStages));
router.get("/mappings", asyncHandler(getMappings));
router.put("/mappings", asyncHandler(saveMapping));

export default router;
