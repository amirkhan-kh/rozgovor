/**
 * Permissions controller — super admin (kompaniya login) uchun.
 * Menejerlar uchun ruxsatlarni ko'rish va override saqlash.
 *
 * Endpointlar:
 *   GET  /api/permissions/roles          — rol default matritsasi + sahifa/action ro'yxati
 *   GET  /api/permissions/me             — joriy foydalanuvchi uchun effektiv matritsa
 *   GET  /api/permissions/:managerId     — ma'lum menejer uchun effektiv + override
 *   PUT  /api/permissions/:managerId     — override'larni batch saqlash
 */

import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import {
  getEffectivePermissions,
  getOverridesList,
  setOverrides,
  getRoleDefaults,
  PAGE_KEYS,
  PAGE_ACTIONS,
  normalizeRole,
} from "../services/permissions";

/**
 * GET /api/permissions/roles
 * Rol default matritsasi — frontend UI uchun.
 */
export async function rolesDefaults(_req: Request, res: Response): Promise<void> {
  success(res, {
    pages: PAGE_KEYS,
    actions: PAGE_ACTIONS,
    defaults: getRoleDefaults(),
  });
}

/**
 * GET /api/permissions/me
 * Joriy foydalanuvchi (manager yoki company) uchun effektiv ruxsatlar.
 * Frontend `usePermissions` hook shundan foydalanadi.
 */
export async function myPermissions(req: Request, res: Response): Promise<void> {
  try {
    // Company login — hamma ruxsat ochiq
    if (req.userRole === "company") {
      const matrix: Record<string, Record<string, boolean>> = {};
      for (const p of PAGE_KEYS) {
        matrix[p] = { view: true };
        for (const a of PAGE_ACTIONS[p]) matrix[p][a] = true;
      }
      success(res, { role: "company", matrix, isSuperAdmin: true });
      return;
    }

    if (!req.managerId) {
      error(res, "Avtorizatsiya kerak", 401);
      return;
    }

    const { role, matrix } = await getEffectivePermissions(req.managerId);
    success(res, { role, matrix, isSuperAdmin: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[permissions] myPermissions:", msg);
    error(res, "Olishda xatolik");
  }
}

/**
 * GET /api/permissions/:managerId
 * Ma'lum menejer uchun effektiv matritsa + qaysi yozuvlar override qilingan.
 * Faqat company admin yoki boss kirishi mumkin.
 */
export async function getManagerPermissions(req: Request, res: Response): Promise<void> {
  try {
    if (!(await canEditPermissions(req))) {
      error(res, "Ruxsat yo'q", 403);
      return;
    }

    const { managerId } = req.params;
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, name: true, email: true, role: true, companyId: true },
    });
    if (!manager) {
      error(res, "Menejer topilmadi", 404);
      return;
    }
    if (manager.companyId !== req.companyId) {
      error(res, "Boshqa kompaniya menejeri", 403);
      return;
    }

    const { role, matrix } = await getEffectivePermissions(managerId);
    const overrides = await getOverridesList(managerId);

    success(res, {
      manager: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        role,
      },
      matrix,
      overrides, // [{pageKey, actionKey, allowed}]
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[permissions] getManagerPermissions:", msg);
    error(res, "Olishda xatolik");
  }
}

/**
 * PUT /api/permissions/:managerId
 * Body: { entries: [{pageKey, actionKey?, allowed: boolean|null}] }
 * allowed=null → override o'chiriladi (default'ga qaytadi).
 */
export async function updateManagerPermissions(req: Request, res: Response): Promise<void> {
  try {
    if (!(await canEditPermissions(req))) {
      error(res, "Ruxsat yo'q", 403);
      return;
    }

    const { managerId } = req.params;
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { companyId: true },
    });
    if (!manager) {
      error(res, "Menejer topilmadi", 404);
      return;
    }
    if (manager.companyId !== req.companyId) {
      error(res, "Boshqa kompaniya menejeri", 403);
      return;
    }

    const { entries } = req.body as {
      entries?: Array<{ pageKey: string; actionKey?: string | null; allowed: boolean | null }>;
    };
    if (!Array.isArray(entries)) {
      error(res, "entries array kerak", 400);
      return;
    }

    await setOverrides(managerId, entries);

    const { role, matrix } = await getEffectivePermissions(managerId);
    const overrides = await getOverridesList(managerId);
    success(res, { role, matrix, overrides });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[permissions] updateManagerPermissions:", msg);
    error(res, "Saqlashda xatolik");
  }
}

/**
 * PUT /api/permissions/bulk
 * Body: { managerIds: string[], entries: [{pageKey, actionKey?, allowed: boolean|null}] }
 * Bir vaqtda ko'p menejerga bir xil override'larni qo'llaydi.
 * allowed=null → override o'chiriladi (default'ga qaytadi).
 */
export async function bulkUpdateManagerPermissions(req: Request, res: Response): Promise<void> {
  try {
    if (!(await canEditPermissions(req))) {
      error(res, "Ruxsat yo'q", 403);
      return;
    }

    const { managerIds, entries } = req.body as {
      managerIds?: string[];
      entries?: Array<{ pageKey: string; actionKey?: string | null; allowed: boolean | null }>;
    };
    if (!Array.isArray(managerIds) || managerIds.length === 0) {
      error(res, "managerIds bo'sh", 400);
      return;
    }
    if (!Array.isArray(entries)) {
      error(res, "entries array kerak", 400);
      return;
    }

    // Faqat shu kompaniyaga tegishli menejerlarga ruxsat o'zgartiramiz
    const managers = await prisma.manager.findMany({
      where: { id: { in: managerIds }, companyId: req.companyId! },
      select: { id: true },
    });
    const validIds = managers.map((m) => m.id);
    if (validIds.length === 0) {
      error(res, "Tegishli menejerlar topilmadi", 404);
      return;
    }

    for (const id of validIds) {
      await setOverrides(id, entries);
    }

    success(res, { updated: validIds.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[permissions] bulkUpdateManagerPermissions:", msg);
    error(res, "Saqlashda xatolik");
  }
}

/**
 * GET /api/permissions/managers?role=manager|rop
 * Menejerlar ro'yxati rol bo'yicha — UI tablari uchun.
 */
export async function listManagersByRole(req: Request, res: Response): Promise<void> {
  try {
    if (!(await canEditPermissions(req))) {
      error(res, "Ruxsat yo'q", 403);
      return;
    }

    const roleFilter = (req.query.role as string) || "manager";
    const normalized = normalizeRole(roleFilter);

    const managers = await prisma.manager.findMany({
      where: {
        companyId: req.companyId!,
        isActive: true,
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    // Rolga qarab filter (eski "sotuvchi" → "manager")
    const filtered = managers.filter((m) => normalizeRole(m.role) === normalized);

    success(res, {
      role: normalized,
      managers: filtered.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: normalizeRole(m.role),
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[permissions] listManagersByRole:", msg);
    error(res, "Olishda xatolik");
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

/**
 * Ruxsatlarni tahrir qila oladimi.
 * Faqat company login yoki BOSS rolidagi menejer.
 */
async function canEditPermissions(req: Request): Promise<boolean> {
  if (req.userRole === "company") return true;
  if (!req.managerId) return false;
  const m = await prisma.manager.findUnique({
    where: { id: req.managerId },
    select: { role: true },
  });
  return normalizeRole(m?.role) === "boss";
}
