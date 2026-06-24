// Custdev (Customer Development) routes
import { Router } from "express";
import {
  listCustdevs,
  createCustdev,
  getCustdev,
  updateCustdev,
  deleteCustdev,
  addQuestion,
  reorderQuestions,
  updateQuestion,
  deleteQuestion,
  uploadInterview,
  getInterview,
  deleteInterview,
  runBatchAnalysis,
} from "../controllers/custdev.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";
import { upload } from "../middlewares/upload";
import { requirePermission } from "../middlewares/requirePermission";

const router = Router();
router.use(authMiddleware);

// ─── Admin: batch Gemini tahlil (Vertex AI batch prediction) ──────
// PHASE 2 — STT bajarilgan barcha intervyularni qo'lda batch orqali tahlil qilish.
// Cron allaqachon har 30 daqiqada ishlaydi — bu manual trigger ad-hoc uchun.
router.post("/run-batch", asyncHandler(runBatchAnalysis));

// ─── Custdev CRUD ─────────────────────────────────────────────────
router.get("/", requirePermission("custdev", "view"), asyncHandler(listCustdevs));
router.post("/", requirePermission("custdev", "create"), asyncHandler(createCustdev));

// Savollar — param id bo'yicha moslashmaydi deb `/questions/:qid` marshrutlari
// oldinroq joylashtiramiz (Express path specificity muhim emas, lekin niyatga
// ko'ra aniq yozilgan).
router.put("/questions/:qid", requirePermission("custdev", "edit"), asyncHandler(updateQuestion));
router.delete("/questions/:qid", requirePermission("custdev", "delete"), asyncHandler(deleteQuestion));

// Intervyu — `/interviews/:iid` marshrutlari
router.get("/interviews/:iid", requirePermission("custdev", "view"), asyncHandler(getInterview));
router.delete("/interviews/:iid", requirePermission("custdev", "delete"), asyncHandler(deleteInterview));

// Custdev id bo'yicha marshrutlar
router.get("/:id", requirePermission("custdev", "view"), asyncHandler(getCustdev));
router.put("/:id", requirePermission("custdev", "edit"), asyncHandler(updateCustdev));
router.delete("/:id", requirePermission("custdev", "delete"), asyncHandler(deleteCustdev));

router.post("/:id/questions", requirePermission("custdev", "edit"), asyncHandler(addQuestion));
router.put("/:id/questions/reorder", requirePermission("custdev", "edit"), asyncHandler(reorderQuestions));

router.post(
  "/:id/interviews",
  requirePermission("custdev", "create"),
  upload.single("audio"),
  asyncHandler(uploadInterview)
);

export default router;
