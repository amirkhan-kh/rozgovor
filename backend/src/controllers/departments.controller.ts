import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

// GET /api/departments — aktiv bo'limlarni nested tree bilan qaytaradi.
// Aktivlik tartibi:
//   1) Company.activeDepartmentIds tanlangan bo'lsa — faqat o'sha ID'lar
//   2) Bo'lmasa — kamida bitta `isActive=true` menejeri bor barcha bo'limlar
export const getDepartments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { activeDepartmentIds: true },
    });
    const activeIds: string[] = company?.activeDepartmentIds || [];

    const allDeps = await prisma.department.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });

    // Menejerlar — active + inactive; lekin selection logikasi uchun alohida set
    const managers = await prisma.manager.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        role: true,
        photoUrl: true, customPhotoUrl: true,
        departmentId: true,
        isActive: true,
      },
    });

    // Dept -> barcha managerlari (filter uchun to'liq ro'yxat chiqadi)
    const byId = new Map<string, Array<typeof managers[number]>>();
    const activeByDept = new Map<string, number>();
    for (const m of managers) {
      if (!m.departmentId) continue;
      if (!byId.has(m.departmentId)) byId.set(m.departmentId, []);
      byId.get(m.departmentId)!.push(m);
      if (m.isActive) {
        activeByDept.set(
          m.departmentId,
          (activeByDept.get(m.departmentId) || 0) + 1,
        );
      }
    }

    // Qaysi bo'limlar ko'rsatiladi
    const depsById = new Map(allDeps.map((d) => [d.id, d]));
    const includeIds = new Set<string>();

    const isDeptIncluded = (deptId: string): boolean => {
      if (activeIds.length > 0) return activeIds.includes(deptId);
      return (activeByDept.get(deptId) || 0) > 0;
    };

    for (const d of allDeps) {
      if (!isDeptIncluded(d.id)) continue;
      let cur: typeof d | undefined = d;
      while (cur) {
        if (includeIds.has(cur.id)) break;
        includeIds.add(cur.id);
        cur = cur.parentId ? depsById.get(cur.parentId) : undefined;
      }
    }

    const included = allDeps.filter((d) => includeIds.has(d.id));

    const list = included.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      managers: byId.get(d.id) || [],
    }));

    const topLevel = included
      .filter((d) => !d.parentId || !includeIds.has(d.parentId))
      .map((d) => ({ id: d.id, name: d.name, parentId: d.parentId }));

    success(res, { departments: list, topLevel });
  } catch (err) {
    console.error("Departments list error:", err);
    error(res, "Bo'limlarni olishda xatolik");
  }
};

// GET /api/departments/all — barcha bo'limlar (boshliq Profile sahifasida
// aktiv bo'limlarni tanlash uchun). Har bo'lim uchun menejer sonini qaytaradi.
export const getAllDepartments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { activeDepartmentIds: true },
    });

    const allDeps = await prisma.department.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });

    const managers = await prisma.manager.findMany({
      where: { companyId },
      select: { id: true, departmentId: true, isActive: true },
    });

    const stat = new Map<string, { total: number; active: number }>();
    for (const m of managers) {
      if (!m.departmentId) continue;
      const s = stat.get(m.departmentId) || { total: 0, active: 0 };
      s.total += 1;
      if (m.isActive) s.active += 1;
      stat.set(m.departmentId, s);
    }

    const list = allDeps.map((d) => ({
      id: d.id,
      name: d.name,
      parentId: d.parentId,
      managerCount: stat.get(d.id)?.total || 0,
      activeManagerCount: stat.get(d.id)?.active || 0,
    }));

    success(res, {
      departments: list,
      activeDepartmentIds: company?.activeDepartmentIds || [],
    });
  } catch (err) {
    console.error("All departments error:", err);
    error(res, "Bo'limlarni olishda xatolik");
  }
};

// PUT /api/departments/active — boshliq/ROP aktiv bo'limlarni yangilaydi.
// Body: { departmentIds: string[] }. Bo'sh [] — auto (active menejerli bo'limlar).
export const setActiveDepartments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const { departmentIds } = req.body as { departmentIds?: unknown };
    if (!Array.isArray(departmentIds)) {
      error(res, "departmentIds massiv bo'lishi kerak", 400);
      return;
    }
    const clean = departmentIds
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((x) => x.trim());

    // Faqat shu kompaniyaning dept'larini qabul qilamiz
    if (clean.length > 0) {
      const own = await prisma.department.findMany({
        where: { companyId, id: { in: clean } },
        select: { id: true },
      });
      const ownIds = new Set(own.map((d) => d.id));
      for (const id of clean) {
        if (!ownIds.has(id)) {
          error(res, `Bo'lim topilmadi: ${id}`, 400);
          return;
        }
      }
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: { activeDepartmentIds: clean },
      select: { activeDepartmentIds: true },
    });

    success(res, { activeDepartmentIds: updated.activeDepartmentIds });
  } catch (err) {
    console.error("Set active depts error:", err);
    error(res, "Aktiv bo'limlarni saqlashda xatolik");
  }
};
