import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { getJourney, searchLeads } from "../controllers/leads.controller";

const router = Router();

router.use(authMiddleware);

// GET /api/leads/search?phone=...  — find leads
router.get("/search", asyncHandler(searchLeads));

// GET /api/leads/:leadId/journey — full timeline + AI summary
router.get("/:leadId/journey", asyncHandler(getJourney));

export default router;
