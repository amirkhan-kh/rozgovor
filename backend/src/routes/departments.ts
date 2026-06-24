import { Router } from "express";
import {
  getDepartments,
  getAllDepartments,
  setActiveDepartments,
} from "../controllers/departments.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();
router.use(authMiddleware);

router.get("/", asyncHandler(getDepartments));
router.get("/all", asyncHandler(getAllDepartments));
router.put("/active", asyncHandler(setActiveDepartments));

export default router;
