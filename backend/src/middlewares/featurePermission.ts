/**
 * Feature permission middleware — kompaniya administratori ma'lum bir rolga
 * qaysi funksiyalarni ochgan/yopganligini tekshiradi.
 *
 * Default holat: funksiya barcha rollarga OCHIQ (hech bir yozuv bo'lmasa).
 * Agar admin yozuv qo'shib enabled=false qilib qo'ygan bo'lsa — yopiq.
 */
import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prisma";

/**
 * Foydalanuvchining joriy rolini qaytaradi.
 * - Company login (userRole === "company") → "admin" (kompaniya egasi)
 * - Manager login → o'zining role (sotuvchi / manager / admin)
 */
async function getUserRole(req: Request): Promise<string | null> {
  if (req.userRole === "company") return "admin";
  if (req.managerId) {
    const m = await prisma.manager.findUnique({
      where: { id: req.managerId },
      select: { role: true },
    });
    return m?.role || "sotuvchi";
  }
  return null;
}

/**
 * Kompaniya adminiga hamma funksiya doim ochiq.
 * Boshqa rollar uchun FeaturePermission jadvalida yozuv tekshiriladi.
 */
export async function isFeatureEnabled(
  companyId: string,
  feature: string,
  role: string
): Promise<boolean> {
  if (role === "admin") return true; // kompaniya egasi
  const row = await prisma.featurePermission.findUnique({
    where: { companyId_feature_role: { companyId, feature, role } },
  });
  // Yozuv yo'q → ochiq (default)
  if (!row) return true;
  return row.enabled;
}

export function requireFeature(feature: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.companyId) {
        res.status(401).json({ success: false, error: "Avtorizatsiya kerak" });
        return;
      }
      const role = await getUserRole(req);
      if (!role) {
        res.status(401).json({ success: false, error: "Rol topilmadi" });
        return;
      }
      const ok = await isFeatureEnabled(req.companyId, feature, role);
      if (!ok) {
        res.status(403).json({
          success: false,
          error: "Bu funksiya siz uchun yopilgan",
          code: "FEATURE_DISABLED",
          feature,
        });
        return;
      }
      next();
    } catch (e: any) {
      console.error("[featurePermission]", e?.message || e);
      res.status(500).json({ success: false, error: "Permission check xatosi" });
    }
  };
}

/**
 * Foydalanuvchi uchun barcha funksiyalar ro'yxati + holati.
 * Frontend navbarda lock ikonkasini ko'rsatish uchun ishlatiladi.
 */
export async function getUserFeatureMap(
  companyId: string,
  role: string
): Promise<Record<string, boolean>> {
  if (role === "admin") {
    // Admin uchun hamma funksiya ochiq
    const all = ["exam_chat", "leaderboard", "progress", "manager_dashboard"];
    return Object.fromEntries(all.map((f) => [f, true]));
  }
  const rows = await prisma.featurePermission.findMany({
    where: { companyId, role },
  });
  const map: Record<string, boolean> = {
    exam_chat: true,
    leaderboard: true,
    progress: true,
    manager_dashboard: true,
  };
  for (const r of rows) {
    map[r.feature] = r.enabled;
  }
  return map;
}
