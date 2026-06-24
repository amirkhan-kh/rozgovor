import { Router } from "express";
import { getStatus, auth, callback, sync, getSyncStatus, disconnect, getPipelines } from "../controllers/amocrm.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

// Callback is public (redirect from AmoCRM)
router.get("/callback", asyncHandler(callback));

router.use(authMiddleware);

router.get("/status", asyncHandler(getStatus));
router.get("/auth", asyncHandler(auth));
router.post("/sync", asyncHandler(sync));
router.get("/sync-status", asyncHandler(getSyncStatus));
router.get("/pipelines", asyncHandler(getPipelines));
router.delete("/disconnect", asyncHandler(disconnect));

export default router;
