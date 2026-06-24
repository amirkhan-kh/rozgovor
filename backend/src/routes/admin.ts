import { Router } from "express";
import { adminAuthMiddleware } from "../middlewares/adminAuth";
import { asyncHandler } from "../middlewares/asyncHandler";
import {
  adminLogin, adminMe, getCompanies, createCompany, updateCompany,
  toggleCompany, deleteCompany, getCompanyDetail, setAmoCrmCredentials,
} from "../controllers/admin.controller";

const router = Router();

router.post("/login", asyncHandler(adminLogin));
router.use(adminAuthMiddleware); // All below require admin auth
router.get("/me", asyncHandler(adminMe));
router.get("/companies", asyncHandler(getCompanies));
router.post("/companies", asyncHandler(createCompany));
router.get("/companies/:id", asyncHandler(getCompanyDetail));
router.put("/companies/:id", asyncHandler(updateCompany));
router.put("/companies/:id/toggle", asyncHandler(toggleCompany));
router.delete("/companies/:id", asyncHandler(deleteCompany));
router.post("/companies/:id/amocrm", asyncHandler(setAmoCrmCredentials));

export default router;
