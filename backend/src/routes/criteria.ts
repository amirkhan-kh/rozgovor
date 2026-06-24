import { Router } from "express";
import {
  getAll,
  createCategory,
  updateCategory,
  deleteCategory,
  createCriteria,
  updateCriteria,
  deleteCriteria,
  reorder,
} from "../controllers/criteria.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

router.get("/", asyncHandler(getAll));
router.post("/categories", asyncHandler(createCategory));
router.put("/categories/:id", asyncHandler(updateCategory));
router.delete("/categories/:id", asyncHandler(deleteCategory));
router.post("/reorder", asyncHandler(reorder));
router.post("/", asyncHandler(createCriteria));
router.put("/:id", asyncHandler(updateCriteria));
router.delete("/:id", asyncHandler(deleteCriteria));

export default router;
