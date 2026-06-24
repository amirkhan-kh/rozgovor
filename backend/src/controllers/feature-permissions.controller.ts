/**
 * Feature Permissions — kompaniya admini rollarni boshqaradi.
 * Shuningdek har qanday foydalanuvchi o'zining "feature map"ini olishi mumkin
 * (frontend navbarda lock ikonkasini ko'rsatish uchun).
 */
import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { getUserFeatureMap } from "../middlewares/featurePermission";

const FEATURES = ["exam_chat", "leaderboard", "progress", "manager_dashboard"];
const ROLES = ["sotuvchi", "manager", "admin"];

/**
 * GET /api/feature-permissions/me
 * Joriy foydalanuvchi uchun {feature: enabled} xaritasi.
 */
export async function myFeatureMap(req: Request, res: Response): Promise<void> {
  try {
    if (!req.companyId) { error(res, "Avtorizatsiya kerak", 401); return; }

    let role: string = "admin";
    if (req.userRole === "manager" && req.managerId) {
      const m = await prisma.manager.findUnique({
        where: { id: req.managerId },
        select: { role: true },
      });
      role = m?.role || "sotuvchi";
    }

    const map = await getUserFeatureMap(req.companyId, role);
    success(res, { role, features: map });
  } catch (err: any) {
    console.error("[feature-permissions] myFeatureMap:", err?.message);
    error(res, "Olishda xatolik");
  }
}

/**
 * GET /api/feature-permissions
 * Kompaniya uchun barcha permissionlar matritsasi (admin only).
 */
export async function listPermissions(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") {
      error(res, "Faqat kompaniya admini kirishi mumkin", 403);
      return;
    }

    const rows = await prisma.featurePermission.findMany({
      where: { companyId: req.companyId! },
    });

    // Matritsa yasash: {feature: {role: enabled}}
    const matrix: Record<string, Record<string, boolean>> = {};
    for (const f of FEATURES) {
      matrix[f] = {};
      for (const r of ROLES) {
        matrix[f][r] = true; // default
      }
    }
    for (const row of rows) {
      if (matrix[row.feature] && row.role in matrix[row.feature]) {
        matrix[row.feature][row.role] = row.enabled;
      }
    }

    success(res, { features: FEATURES, roles: ROLES, matrix });
  } catch (err: any) {
    console.error("[feature-permissions] listPermissions:", err?.message);
    error(res, "Olishda xatolik");
  }
}

/**
 * PUT /api/feature-permissions
 * Body: { feature, role, enabled }
 */
export async function setPermission(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") {
      error(res, "Faqat kompaniya admini o'zgartira oladi", 403);
      return;
    }

    const { feature, role, enabled } = req.body as {
      feature: string;
      role: string;
      enabled: boolean;
    };

    if (!FEATURES.includes(feature)) { error(res, "Noma'lum feature", 400); return; }
    if (!ROLES.includes(role)) { error(res, "Noma'lum role", 400); return; }
    if (role === "admin") { error(res, "Admin rolini yopib bo'lmaydi", 400); return; }

    await prisma.featurePermission.upsert({
      where: {
        companyId_feature_role: {
          companyId: req.companyId!,
          feature,
          role,
        },
      },
      create: {
        companyId: req.companyId!,
        feature,
        role,
        enabled,
      },
      update: { enabled },
    });

    success(res, { ok: true });
  } catch (err: any) {
    console.error("[feature-permissions] setPermission:", err?.message);
    error(res, "O'zgartirishda xatolik");
  }
}
