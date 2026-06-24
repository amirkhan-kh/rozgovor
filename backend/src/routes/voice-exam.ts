import { Router } from "express";
import {
  listScenarios,
  startExam,
  examTurn,
  finishExam,
  getExamResult,
  examHistory,
  abandonExam,
  adminExamManagers,
  toggleExamAccess,
  assignExam,
  assignExamAuto,
  updateExamTarget,
  assignCompanyTestOnly,
  unassignExam,
  getPendingExam,
} from "../controllers/voice-exam.controller";
import {
  createExamLiveToken,
  saveLiveTurn,
} from "../controllers/voice-exam-live.controller";
import {
  startCompanyTest,
  submitCompanyTest,
  retryWrongCompanyTest,
  companyTestHistory,
  getCompanyTestResult,
  regenerateCompanyTestPool,
  getCompanyTestPool,
} from "../controllers/company-test.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { upload } from "../middlewares/upload";
import { requireFeature } from "../middlewares/featurePermission";

const router = Router();

router.use(authMiddleware);
router.use(requireFeature("exam_chat"));

router.get("/scenarios", asyncHandler(listScenarios));
router.get("/pending", asyncHandler(getPendingExam));
router.get("/admin/managers", asyncHandler(adminExamManagers));
router.post("/admin/toggle", asyncHandler(toggleExamAccess));
router.post("/admin/assign", asyncHandler(assignExam));
router.post("/admin/assign-auto", asyncHandler(assignExamAuto));
router.post("/admin/assign-target", asyncHandler(updateExamTarget));
router.post("/admin/assign-company-test", asyncHandler(assignCompanyTestOnly));
router.delete("/admin/assign/:managerId", asyncHandler(unassignExam));
router.post("/start", asyncHandler(startExam));

// Kompaniya testi (imtihonning ikkinchi qismi)
router.post("/company-test/start", asyncHandler(startCompanyTest));
router.post("/company-test/admin/regenerate", asyncHandler(regenerateCompanyTestPool));
router.get("/company-test/admin/pool", asyncHandler(getCompanyTestPool));
router.get("/company-test/history", asyncHandler(companyTestHistory));
router.post("/company-test/:id/submit", asyncHandler(submitCompanyTest));
router.post("/company-test/:id/retry-wrong", asyncHandler(retryWrongCompanyTest));
router.get("/company-test/:id", asyncHandler(getCompanyTestResult));

router.post("/:id/live-token", asyncHandler(createExamLiveToken));
router.post("/:id/save-turn", asyncHandler(saveLiveTurn));
router.post("/:id/turn", upload.single("audio"), asyncHandler(examTurn));
router.post("/:id/finish", asyncHandler(finishExam));
router.post("/:id/abandon", asyncHandler(abandonExam));
router.get("/history", asyncHandler(examHistory));
router.get("/:id", asyncHandler(getExamResult));

export default router;
