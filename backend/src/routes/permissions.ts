import { Router } from "express";
import {
  rolesDefaults,
  myPermissions,
  getManagerPermissions,
  updateManagerPermissions,
  bulkUpdateManagerPermissions,
  listManagersByRole,
} from "../controllers/permissions.controller";
import { authMiddleware } from "../middlewares/auth";
import { asyncHandler } from "../middlewares/asyncHandler";

const router = Router();

router.use(authMiddleware);

// Rol default'lari — UI uchun statik ma'lumot
router.get("/roles", asyncHandler(rolesDefaults));

// Joriy foydalanuvchi uchun effektiv ruxsatlar
router.get("/me", asyncHandler(myPermissions));

// Rolga ko'ra menejerlar ro'yxati (Profil > Manager/ROP tab uchun)
router.get("/managers", asyncHandler(listManagersByRole));

// Bulk — bir vaqtda ko'p menejerga bir xil override qo'llash
// MUHIM: /:managerId dan oldin turishi shart, aks holda "bulk" managerId deb olinadi
router.put("/bulk", asyncHandler(bulkUpdateManagerPermissions));

// Ma'lum menejer uchun ruxsatlarni olish va saqlash
router.get("/:managerId", asyncHandler(getManagerPermissions));
router.put("/:managerId", asyncHandler(updateManagerPermissions));

export default router;
