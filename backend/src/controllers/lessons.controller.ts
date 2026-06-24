// Admin/Boss/ROP lesson endpoints
// Yaratish, ro'yxat, tahrirlash, tayinlash, o'chirish
// 3-qatlamli hierarchy — Kurs → Modul → Darslar
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { triggerProcessLesson } from "../services/lesson-processor";
import { runLessonBatchPipeline, isLessonBatchRunning } from "../services/lesson-batch";

// ─────────────────────────────────────────────────────────────────
// Kurslar — eng yuqori qatlam. Admin kurs yaratadi → ichida modullar
// → modulda darslar. Manager moduldan boshlab biriktiriladi.
// ─────────────────────────────────────────────────────────────────

/**
 * GET /api/lessons/courses
 * Kompaniya kurslari + har birida modul/dars soni
 */
export async function listCourses(req: Request, res: Response): Promise<void> {
  const courses = await prisma.course.findMany({
    where: { companyId: req.companyId! },
    orderBy: { sortOrder: "asc" },
    include: {
      assignments: { select: { managerId: true } },
      modules: {
        select: {
          id: true,
          lessons: { select: { id: true, status: true, videoDurationSec: true } },
          assignments: { select: { managerId: true } },
        },
      },
    },
  });

  const list = courses.map((c) => {
    const moduleCount = c.modules.length;
    const lessonCount = c.modules.reduce((s, m) => s + m.lessons.length, 0);
    const readyCount = c.modules.reduce(
      (s, m) => s + m.lessons.filter((l) => l.status === "ready").length,
      0
    );
    const processingCount = c.modules.reduce(
      (s, m) => s + m.lessons.filter((l) => l.status === "processing").length,
      0
    );
    const totalDurationSec = c.modules.reduce(
      (s, m) => s + m.lessons.reduce((ss, l) => ss + (l.videoDurationSec || 0), 0),
      0
    );
    // Kurs + (back-compat) modul biriktirilgan unikal managerlar
    const uniqMgrs = new Set<string>();
    c.assignments.forEach((a) => uniqMgrs.add(a.managerId));
    c.modules.forEach((m) => m.assignments.forEach((a) => uniqMgrs.add(a.managerId)));

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      sortOrder: c.sortOrder,
      createdAt: c.createdAt,
      moduleCount,
      lessonCount,
      readyCount,
      processingCount,
      assignedCount: uniqMgrs.size,
      totalDurationSec,
    };
  });

  success(res, list);
}

/**
 * POST /api/lessons/courses
 * body: { title, description? }
 */
export async function createCourse(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { title, description } = req.body as { title?: string; description?: string };
  if (!title || !title.trim()) {
    error(res, "Kurs nomi majburiy", 400);
    return;
  }
  const last = await prisma.course.findFirst({
    where: { companyId: req.companyId! },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const c = await prisma.course.create({
    data: {
      companyId: req.companyId!,
      title: title.trim(),
      description: description?.trim() || null,
      sortOrder,
    },
  });
  success(res, { id: c.id, title: c.title, sortOrder: c.sortOrder });
}

/**
 * GET /api/lessons/courses/:id
 * Kurs + ichidagi modullar ro'yxati
 */
export async function getCourse(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const course = await prisma.course.findFirst({
    where: { id, companyId: req.companyId! },
    include: {
      assignments: {
        include: {
          manager: { select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true } },
        },
        orderBy: { assignedAt: "desc" },
      },
      modules: {
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { lessons: true, assignments: true } },
          lessons: { select: { id: true, status: true, videoDurationSec: true } },
        },
      },
    },
  });
  if (!course) {
    error(res, "Kurs topilmadi", 404);
    return;
  }

  const modules = course.modules.map((m) => {
    const totalDuration = m.lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0);
    const readyCount = m.lessons.filter((l) => l.status === "ready").length;
    const processingCount = m.lessons.filter((l) => l.status === "processing").length;
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
      lessonCount: m._count.lessons,
      assignedCount: m._count.assignments,
      readyCount,
      processingCount,
      totalDurationSec: totalDuration,
    };
  });

  success(res, {
    id: course.id,
    title: course.title,
    description: course.description,
    sortOrder: course.sortOrder,
    createdAt: course.createdAt,
    modules,
    assignments: course.assignments,
  });
}

/**
 * GET /api/lessons/courses/:id/assignments
 * Kurs uchun tayinlangan managerlar ro'yxati
 */
export async function listCourseAssignments(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const course = await prisma.course.findFirst({
    where: { id, companyId: req.companyId! },
    select: { id: true },
  });
  if (!course) {
    error(res, "Kurs topilmadi", 404);
    return;
  }
  const assignments = await prisma.courseAssignment.findMany({
    where: { courseId: id },
    include: {
      manager: { select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true } },
    },
    orderBy: { assignedAt: "desc" },
  });
  success(res, assignments);
}

/**
 * POST /api/lessons/courses/:id/assign
 * body: { managerIds: string[], dueDate?: ISO }
 * Kursni butunligicha managerlarga biriktiradi. Ichidagi BARCHA modullardagi
 * darslar uchun LessonAssignment qatori ham upsert qilinadi (per-lesson
 * progress/unlock logikasi ishlashi uchun).
 */
export async function assignCourse(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id } = req.params;
  const { managerIds, dueDate } = req.body as { managerIds: string[]; dueDate?: string };
  if (!Array.isArray(managerIds) || managerIds.length === 0) {
    error(res, "managerIds bo'sh", 400);
    return;
  }

  const course = await prisma.course.findFirst({
    where: { id, companyId: req.companyId! },
    include: {
      modules: {
        select: {
          id: true,
          lessons: { select: { id: true } },
        },
      },
    },
  });
  if (!course) {
    error(res, "Kurs topilmadi", 404);
    return;
  }

  const managers = await prisma.manager.findMany({
    where: { id: { in: managerIds }, companyId: req.companyId! },
    select: { id: true },
  });
  const validIds = managers.map((m) => m.id);
  if (validIds.length === 0) {
    error(res, "Tegishli managerlar topilmadi", 400);
    return;
  }

  const due = dueDate ? new Date(dueDate) : null;
  const assigner = req.managerId || null;

  // Kurs ichidagi barcha darslar (hamma modullardan)
  const allLessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));

  await Promise.all(
    validIds.map(async (mgrId) => {
      await prisma.courseAssignment.upsert({
        where: { courseId_managerId: { courseId: id, managerId: mgrId } },
        update: { dueDate: due, assignedById: assigner },
        create: {
          courseId: id,
          managerId: mgrId,
          assignedById: assigner,
          dueDate: due,
        },
      });

      // Kurs ichidagi har bir darsni ham biriktirish (unlock/progress uchun)
      await Promise.all(
        allLessonIds.map((lessonId) =>
          prisma.lessonAssignment.upsert({
            where: { lessonId_managerId: { lessonId, managerId: mgrId } },
            update: { dueDate: due },
            create: {
              lessonId,
              managerId: mgrId,
              assignedById: assigner || mgrId,
              dueDate: due,
            },
          })
        )
      );
    })
  );

  success(res, { assigned: validIds.length });
}

/**
 * DELETE /api/lessons/courses/:id/assign/:managerId
 * CourseAssignment o'chiradi + kurs ichidagi darslar uchun LessonAssignment ham tozalaydi.
 * Progress saqlanib qoladi (manager qayta biriktirilsa davom etadi).
 */
export async function unassignCourse(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id, managerId } = req.params;
  const course = await prisma.course.findFirst({
    where: { id, companyId: req.companyId! },
    include: {
      modules: {
        select: { lessons: { select: { id: true } } },
      },
    },
  });
  if (!course) {
    error(res, "Kurs topilmadi", 404);
    return;
  }
  try {
    await prisma.courseAssignment.delete({
      where: { courseId_managerId: { courseId: id, managerId } },
    });
  } catch {
    // yo'q bo'lsa ignore
  }
  const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id));
  if (lessonIds.length > 0) {
    await prisma.lessonAssignment.deleteMany({
      where: { managerId, lessonId: { in: lessonIds } },
    });
  }
  success(res, { unassigned: true });
}

/**
 * PATCH /api/lessons/courses/:id
 */
export async function updateCourse(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id } = req.params;
  const existing = await prisma.course.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!existing) {
    error(res, "Kurs topilmadi", 404);
    return;
  }
  const { title, description, sortOrder } = req.body as any;
  const data: any = {};
  if (typeof title === "string") data.title = title.trim();
  if (typeof description === "string") data.description = description.trim() || null;
  if (typeof sortOrder === "number") data.sortOrder = sortOrder;
  const updated = await prisma.course.update({ where: { id }, data });
  success(res, { id: updated.id });
}

/**
 * DELETE /api/lessons/courses/:id
 * Faqat bo'sh kursni o'chirish mumkin (ichida modullar bo'lmasa)
 */
export async function deleteCourse(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id } = req.params;
  const c = await prisma.course.findFirst({
    where: { id, companyId: req.companyId! },
    include: { _count: { select: { modules: true } } },
  });
  if (!c) {
    error(res, "Kurs topilmadi", 404);
    return;
  }
  if (c._count.modules > 0) {
    error(res, "Avval kurs ichidagi modullarni o'chirib oling", 400);
    return;
  }
  await prisma.course.delete({ where: { id } });
  success(res, { deleted: true });
}

// ─────────────────────────────────────────────────────────────────
// Modullar — o'rta qatlam. Kurs ichida yashaydi. Eski "moduleId=null"
// darslar va courseId=null modullar back-compat uchun qoladi.
// Manager'ga butun modul biriktiriladi.
// ─────────────────────────────────────────────────────────────────

/**
 * GET /api/lessons/modules?courseId=...
 * Kompaniya modullari + har birida dars soni, tayinlar soni, hammasi tayyor bo'lgan
 * courseId berilsa — faqat shu kursga tegishli modullar.
 */
export async function listModules(req: Request, res: Response): Promise<void> {
  const courseId = (req.query.courseId as string) || undefined;
  const where: any = { companyId: req.companyId! };
  if (courseId) where.courseId = courseId;

  const modules = await prisma.lessonModule.findMany({
    where,
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { lessons: true, assignments: true } },
      lessons: {
        select: { id: true, status: true, videoDurationSec: true },
      },
    },
  });

  const list = modules.map((m) => {
    const totalDuration = m.lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0);
    const readyCount = m.lessons.filter((l) => l.status === "ready").length;
    const processingCount = m.lessons.filter((l) => l.status === "processing").length;
    return {
      id: m.id,
      title: m.title,
      description: m.description,
      courseId: m.courseId,
      sortOrder: m.sortOrder,
      createdAt: m.createdAt,
      lessonCount: m._count.lessons,
      assignedCount: m._count.assignments,
      readyCount,
      processingCount,
      totalDurationSec: totalDuration,
    };
  });

  success(res, list);
}

/**
 * POST /api/lessons/modules
 * body: { title, description?, courseId? }
 */
export async function createModule(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { title, description, courseId } = req.body as {
    title?: string;
    description?: string;
    courseId?: string;
  };
  if (!title || !title.trim()) {
    error(res, "Modul nomi majburiy", 400);
    return;
  }

  // courseId berilgan bo'lsa — shu kurs kompaniyaga tegishli ekanini tekshirish
  let validCourseId: string | null = null;
  if (courseId) {
    const c = await prisma.course.findFirst({
      where: { id: courseId, companyId: req.companyId! },
      select: { id: true },
    });
    if (!c) {
      error(res, "Kurs topilmadi", 404);
      return;
    }
    validCourseId = c.id;
  }

  // sortOrder — shu kurs ichida (yoki orphan ichida) keyingi raqam
  const last = await prisma.lessonModule.findFirst({
    where: validCourseId
      ? { companyId: req.companyId!, courseId: validCourseId }
      : { companyId: req.companyId! },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const mod = await prisma.lessonModule.create({
    data: {
      companyId: req.companyId!,
      courseId: validCourseId,
      title: title.trim(),
      description: description?.trim() || null,
      sortOrder,
    },
  });
  success(res, { id: mod.id, title: mod.title, sortOrder: mod.sortOrder, courseId: mod.courseId });
}

/**
 * GET /api/lessons/modules/:id
 * Modul + ichidagi darslar ro'yxati
 */
export async function getModule(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const mod = await prisma.lessonModule.findFirst({
    where: { id, companyId: req.companyId! },
    include: {
      lessons: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          videoDurationSec: true,
          status: true,
          processingError: true,
          sortOrder: true,
          createdAt: true,
          testQuestions: true,
          _count: { select: { assignments: true, progress: true } },
        },
      },
      assignments: {
        include: {
          manager: { select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true } },
        },
      },
    },
  });
  if (!mod) {
    error(res, "Modul topilmadi", 404);
    return;
  }

  const lessons = mod.lessons.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    videoDurationSec: l.videoDurationSec,
    status: l.status,
    processingError: l.processingError,
    sortOrder: l.sortOrder,
    createdAt: l.createdAt,
    testCount: Array.isArray(l.testQuestions) ? (l.testQuestions as any[]).length : 0,
    assignedCount: l._count.assignments,
    startedCount: l._count.progress,
  }));

  success(res, {
    id: mod.id,
    title: mod.title,
    description: mod.description,
    courseId: mod.courseId,
    sortOrder: mod.sortOrder,
    createdAt: mod.createdAt,
    lessons,
    assignments: mod.assignments,
  });
}

/**
 * PATCH /api/lessons/modules/:id
 * body: { title?, description?, sortOrder?, courseId? (null bilan o'chirish mumkin) }
 */
export async function updateModule(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id } = req.params;
  const existing = await prisma.lessonModule.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!existing) {
    error(res, "Modul topilmadi", 404);
    return;
  }
  const { title, description, sortOrder, courseId } = req.body as any;
  const data: any = {};
  if (typeof title === "string") data.title = title.trim();
  if (typeof description === "string") data.description = description.trim() || null;
  if (typeof sortOrder === "number") data.sortOrder = sortOrder;
  if (courseId === null) {
    data.courseId = null;
  } else if (typeof courseId === "string") {
    const c = await prisma.course.findFirst({
      where: { id: courseId, companyId: req.companyId! },
      select: { id: true },
    });
    if (!c) {
      error(res, "Kurs topilmadi", 404);
      return;
    }
    data.courseId = c.id;
  }
  const updated = await prisma.lessonModule.update({ where: { id }, data });
  success(res, { id: updated.id });
}

/**
 * DELETE /api/lessons/modules/:id
 * Faqat bo'sh modulni o'chirish mumkin (ichida darslar bo'lmasa)
 */
export async function deleteModule(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id } = req.params;
  const mod = await prisma.lessonModule.findFirst({
    where: { id, companyId: req.companyId! },
    include: { _count: { select: { lessons: true } } },
  });
  if (!mod) {
    error(res, "Modul topilmadi", 404);
    return;
  }
  if (mod._count.lessons > 0) {
    error(res, "Avval modul ichidagi darslarni o'chirib oling", 400);
    return;
  }
  await prisma.lessonModule.delete({ where: { id } });
  success(res, { deleted: true });
}

/**
 * POST /api/lessons/modules/:id/assign
 * body: { managerIds: string[], dueDate?: ISO }
 * Modulni butunligicha managerlarga biriktiradi
 */
export async function assignModule(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id } = req.params;
  const { managerIds, dueDate } = req.body as { managerIds: string[]; dueDate?: string };
  if (!Array.isArray(managerIds) || managerIds.length === 0) {
    error(res, "managerIds bo'sh", 400);
    return;
  }
  const mod = await prisma.lessonModule.findFirst({
    where: { id, companyId: req.companyId! },
    select: { id: true, courseId: true },
  });
  if (!mod) {
    error(res, "Modul topilmadi", 404);
    return;
  }
  const managers = await prisma.manager.findMany({
    where: { id: { in: managerIds }, companyId: req.companyId! },
    select: { id: true },
  });
  const validIds = managers.map((m) => m.id);
  if (validIds.length === 0) {
    error(res, "Tegishli managerlar topilmadi", 400);
    return;
  }
  const due = dueDate ? new Date(dueDate) : null;
  const assigner = req.managerId || req.companyId!;

  // Modul darslarini ham avtomatik biriktiramiz — oldingi unlock logikasi ishlashi uchun
  const lessons = await prisma.lesson.findMany({
    where: { moduleId: id },
    select: { id: true },
  });

  await Promise.all(
    validIds.map(async (mgrId) => {
      await prisma.moduleAssignment.upsert({
        where: { moduleId_managerId: { moduleId: id, managerId: mgrId } },
        update: { dueDate: due },
        create: {
          moduleId: id,
          managerId: mgrId,
          assignedById: assigner,
          dueDate: due,
        },
      });
      // Parent kursga ham auto-access
      if (mod.courseId) {
        await prisma.courseAssignment.upsert({
          where: { courseId_managerId: { courseId: mod.courseId, managerId: mgrId } },
          update: {},
          create: { courseId: mod.courseId, managerId: mgrId, assignedById: assigner },
        });
      }
      // Har bir darsni ham biriktirish (per-lesson progress/unlock uchun)
      await Promise.all(
        lessons.map((l) =>
          prisma.lessonAssignment.upsert({
            where: { lessonId_managerId: { lessonId: l.id, managerId: mgrId } },
            update: { dueDate: due },
            create: {
              lessonId: l.id,
              managerId: mgrId,
              assignedById: assigner,
              dueDate: due,
            },
          })
        )
      );
    })
  );

  success(res, { assigned: validIds.length });
}

/**
 * DELETE /api/lessons/modules/:id/assign/:managerId
 */
export async function unassignModule(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }
  const { id, managerId } = req.params;
  const mod = await prisma.lessonModule.findFirst({
    where: { id, companyId: req.companyId! },
    include: { lessons: { select: { id: true } } },
  });
  if (!mod) {
    error(res, "Modul topilmadi", 404);
    return;
  }
  try {
    await prisma.moduleAssignment.delete({
      where: { moduleId_managerId: { moduleId: id, managerId } },
    });
  } catch {
    // ignore
  }
  // Per-lesson assignmentlarni ham o'chirish (progress ham tozalanmaydi — saqlanadi)
  await prisma.lessonAssignment.deleteMany({
    where: {
      managerId,
      lessonId: { in: mod.lessons.map((l) => l.id) },
    },
  });
  success(res, { unassigned: true });
}

/**
 * Lesson boshqarish huquqi bormi (yaratish/tayinlash):
 * - company login (boss/admin)
 * - yoki manager.role === "rop"
 */
async function canManage(req: Request): Promise<boolean> {
  if (req.userRole === "company") return true;
  if (!req.managerId) return false;
  const m = await prisma.manager.findUnique({
    where: { id: req.managerId },
    select: { role: true },
  });
  return m?.role === "rop" || m?.role === "admin" || m?.role === "boss";
}

/**
 * POST /api/lessons
 * multipart/form-data: video, title, description
 * Darhol qaytadi, processing background'da
 */
export async function createLesson(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  const { title, description, moduleId } = req.body as {
    title?: string;
    description?: string;
    moduleId?: string;
  };

  if (!file) {
    error(res, "Video fayl yuborilmagan", 400);
    return;
  }
  if (!title || !title.trim()) {
    try { fs.unlinkSync(file.path); } catch {}
    error(res, "Darslik nomi majburiy", 400);
    return;
  }

  const companyId = req.companyId!;

  // Agar moduleId berilgan bo'lsa — shu modulga tegishli va kompaniyaga tegishli ekanini tekshirish
  let validModuleId: string | null = null;
  if (moduleId) {
    const mod = await prisma.lessonModule.findFirst({
      where: { id: moduleId, companyId },
      select: { id: true },
    });
    if (!mod) {
      try { fs.unlinkSync(file.path); } catch {}
      error(res, "Modul topilmadi", 404);
      return;
    }
    validModuleId = mod.id;
  }

  // sortOrder — shu modul ichida keyingi raqam (yoki umumiy, moduleId null bo'lsa)
  const last = await prisma.lesson.findFirst({
    where: validModuleId ? { companyId, moduleId: validModuleId } : { companyId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const lesson = await prisma.lesson.create({
    data: {
      companyId,
      moduleId: validModuleId,
      title: title.trim(),
      description: description?.trim() || null,
      videoUrl: file.path,
      videoSizeBytes: BigInt(file.size),
      status: "processing",
      sortOrder,
      createdById: req.managerId || null,
    },
  });

  // Agar modul allaqachon managerlarga biriktirilgan bo'lsa (eski ModuleAssignment
  // yoki yangi CourseAssignment orqali) — yangi darsni ham avtomatik biriktiramiz
  if (validModuleId) {
    const mgrIds = new Set<string>();
    const dueMap = new Map<string, Date | null>();
    const assignedByMap = new Map<string, string | null>();

    // Eski ModuleAssignment (backward compat)
    const modAssignments = await prisma.moduleAssignment.findMany({
      where: { moduleId: validModuleId },
      select: { managerId: true, assignedById: true, dueDate: true },
    });
    for (const ma of modAssignments) {
      mgrIds.add(ma.managerId);
      dueMap.set(ma.managerId, ma.dueDate);
      assignedByMap.set(ma.managerId, ma.assignedById);
    }

    // Yangi CourseAssignment — kurs biriktirilgan managerlar
    const mod = await prisma.lessonModule.findUnique({
      where: { id: validModuleId },
      select: { courseId: true },
    });
    if (mod?.courseId) {
      const courseAssignments = await prisma.courseAssignment.findMany({
        where: { courseId: mod.courseId },
        select: { managerId: true, assignedById: true, dueDate: true },
      });
      for (const ca of courseAssignments) {
        if (!mgrIds.has(ca.managerId)) {
          mgrIds.add(ca.managerId);
          dueMap.set(ca.managerId, ca.dueDate);
          assignedByMap.set(ca.managerId, ca.assignedById);
        }
      }
    }

    if (mgrIds.size > 0) {
      await Promise.all(
        [...mgrIds].map((mgrId) =>
          prisma.lessonAssignment.upsert({
            where: { lessonId_managerId: { lessonId: lesson.id, managerId: mgrId } },
            update: {},
            create: {
              lessonId: lesson.id,
              managerId: mgrId,
              assignedById: assignedByMap.get(mgrId) || mgrId,
              dueDate: dueMap.get(mgrId) ?? null,
            },
          })
        )
      );
    }
  }

  triggerProcessLesson(lesson.id);

  success(res, {
    id: lesson.id,
    title: lesson.title,
    status: lesson.status,
    sortOrder: lesson.sortOrder,
  });
}

/**
 * GET /api/lessons?moduleId=...
 * Agar moduleId berilsa — shu modul darslari. Aks holda — hamma darslar (back-compat).
 */
export async function listLessons(req: Request, res: Response): Promise<void> {
  const moduleId = (req.query.moduleId as string) || undefined;
  const where: any = { companyId: req.companyId! };
  if (moduleId) where.moduleId = moduleId;

  const lessons = await prisma.lesson.findMany({
    where,
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      title: true,
      description: true,
      moduleId: true,
      videoDurationSec: true,
      status: true,
      processingError: true,
      sortOrder: true,
      createdAt: true,
      testQuestions: true,
      _count: { select: { assignments: true, progress: true } },
    },
  });

  // Test sonini count qilib qaytaramiz (JSON ichidan)
  const list = lessons.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    moduleId: l.moduleId,
    videoDurationSec: l.videoDurationSec,
    status: l.status,
    processingError: l.processingError,
    sortOrder: l.sortOrder,
    createdAt: l.createdAt,
    testCount: Array.isArray(l.testQuestions) ? (l.testQuestions as any[]).length : 0,
    assignedCount: l._count.assignments,
    startedCount: l._count.progress,
  }));

  success(res, list);
}

/**
 * GET /api/lessons/:id
 */
export async function getLesson(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
    include: {
      assignments: {
        include: {
          manager: {
            select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true },
          },
        },
      },
    },
  });
  if (!lesson) {
    error(res, "Darslik topilmadi", 404);
    return;
  }

  // videoSizeBytes BigInt — JSONda raqamga aylantiramiz
  const { videoSizeBytes, ...rest } = lesson;
  success(res, {
    ...rest,
    videoSizeBytes: Number(videoSizeBytes),
  });
}

/**
 * PATCH /api/lessons/:id
 * body: { title?, description?, testQuestions?, aiSystemPrompt?, aiKeyTopics?, sortOrder? }
 */
export async function updateLesson(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const { id } = req.params;
  const existing = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!existing) {
    error(res, "Darslik topilmadi", 404);
    return;
  }

  const { title, description, testQuestions, aiSystemPrompt, aiKeyTopics, sortOrder } =
    req.body as any;

  const data: any = {};
  if (typeof title === "string") data.title = title.trim();
  if (typeof description === "string") data.description = description.trim() || null;
  if (Array.isArray(testQuestions)) data.testQuestions = testQuestions;
  if (typeof aiSystemPrompt === "string") data.aiSystemPrompt = aiSystemPrompt;
  if (Array.isArray(aiKeyTopics)) data.aiKeyTopics = aiKeyTopics;
  if (typeof sortOrder === "number") data.sortOrder = sortOrder;

  const updated = await prisma.lesson.update({ where: { id }, data });
  success(res, { id: updated.id });
}

/**
 * DELETE /api/lessons/:id
 */
export async function deleteLesson(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const { id } = req.params;
  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!lesson) {
    error(res, "Darslik topilmadi", 404);
    return;
  }

  // Video faylni ham o'chirish (lokal yoki Yandex)
  if (lesson.videoUrl) {
    if (lesson.videoUrl.startsWith("http")) {
      // Yandex URL — key ajratib o'chiramiz
      const YANDEX_PREFIX = (process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net") + "/" + (process.env.YANDEX_BUCKET || "sales-ai-storage") + "/";
      if (lesson.videoUrl.startsWith(YANDEX_PREFIX)) {
        const key = lesson.videoUrl.slice(YANDEX_PREFIX.length);
        try {
          const AWS = require("aws-sdk");
          const s3 = new AWS.S3({ endpoint: process.env.YANDEX_STORAGE_ENDPOINT, accessKeyId: process.env.YANDEX_STORAGE_KEY_ID, secretAccessKey: process.env.YANDEX_STORAGE_SECRET, region: "ru-central1", s3ForcePathStyle: true, signatureVersion: "v4" });
          await s3.deleteObject({ Bucket: process.env.YANDEX_BUCKET || "sales-ai-storage", Key: key }).promise();
        } catch {}
      }
    } else if (fs.existsSync(lesson.videoUrl)) {
      try { fs.unlinkSync(lesson.videoUrl); } catch {}
    }
  }

  await prisma.lesson.delete({ where: { id } });
  success(res, { deleted: true });
}

/**
 * POST /api/lessons/:id/replace-video
 * Video'ni almashtirish + avtomatik qayta STT + test gen
 * multipart/form-data: video
 */
export async function replaceVideo(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    error(res, "Video fayl yuborilmagan", 400);
    return;
  }

  const { id } = req.params;
  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!lesson) {
    try { fs.unlinkSync(file.path); } catch {}
    error(res, "Darslik topilmadi", 404);
    return;
  }

  // Eski video'ni o'chirish (lokal yoki Yandex)
  if (lesson.videoUrl) {
    if (lesson.videoUrl.startsWith("http")) {
      const YANDEX_PREFIX = (process.env.YANDEX_STORAGE_ENDPOINT || "https://storage.yandexcloud.net") + "/" + (process.env.YANDEX_BUCKET || "sales-ai-storage") + "/";
      if (lesson.videoUrl.startsWith(YANDEX_PREFIX)) {
        const key = lesson.videoUrl.slice(YANDEX_PREFIX.length);
        try {
          const AWS = require("aws-sdk");
          const s3 = new AWS.S3({ endpoint: process.env.YANDEX_STORAGE_ENDPOINT, accessKeyId: process.env.YANDEX_STORAGE_KEY_ID, secretAccessKey: process.env.YANDEX_STORAGE_SECRET, region: "ru-central1", s3ForcePathStyle: true, signatureVersion: "v4" });
          await s3.deleteObject({ Bucket: process.env.YANDEX_BUCKET || "sales-ai-storage", Key: key }).promise();
        } catch {}
      }
    } else if (fs.existsSync(lesson.videoUrl)) {
      try { fs.unlinkSync(lesson.videoUrl); } catch {}
    }
  }

  // Yangi video + transkript, testlarni tozalash
  await prisma.lesson.update({
    where: { id },
    data: {
      videoUrl: file.path,
      videoSizeBytes: BigInt(file.size),
      videoDurationSec: 0,
      transcription: null,
      transcriptionJson: undefined,
      testQuestions: undefined,
      aiSystemPrompt: null,
      aiKeyTopics: undefined,
      status: "processing",
      processingError: null,
    },
  });

  // Progress'larni ham reset qilish — yangi video boshqa bo'lishi mumkin
  await prisma.lessonProgress.updateMany({
    where: { lessonId: id },
    data: {
      videoWatchedSec: 0,
      videoMaxSec: 0,
      videoCompleted: false,
      videoCompletedAt: null,
      testAttempts: [],
      testBestScore: null,
      testPassed: false,
      testPassedAt: null,
      aiMessages: [],
      aiStatus: "not_started",
      aiScore: null,
      aiFeedback: null,
      aiStrengths: undefined,
      aiWeaknesses: undefined,
      aiCompletedAt: null,
      finalScore: null,
      completedAt: null,
    },
  });

  triggerProcessLesson(id);

  success(res, { status: "processing" });
}

/**
 * POST /api/lessons/:id/reprocess
 * Agar status = failed bo'lsa — qayta ishga tushirish
 */
export async function reprocessLesson(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const { id } = req.params;
  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!lesson) {
    error(res, "Darslik topilmadi", 404);
    return;
  }

  await prisma.lesson.update({
    where: { id },
    data: { status: "processing", processingError: null },
  });
  triggerProcessLesson(id);
  success(res, { status: "processing" });
}

/**
 * POST /api/lessons/:id/assign
 * body: { managerIds: string[], dueDate?: ISO }
 */
export async function assignLesson(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const { id } = req.params;
  const { managerIds, dueDate } = req.body as {
    managerIds: string[];
    dueDate?: string;
  };
  if (!Array.isArray(managerIds) || managerIds.length === 0) {
    error(res, "managerIds bo'sh", 400);
    return;
  }

  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
    select: {
      id: true,
      moduleId: true,
      module: { select: { id: true, courseId: true } },
    },
  });
  if (!lesson) {
    error(res, "Darslik topilmadi", 404);
    return;
  }

  // Menejerlar shu kompaniyaga tegishli ekanligini tekshirish
  const managers = await prisma.manager.findMany({
    where: { id: { in: managerIds }, companyId: req.companyId! },
    select: { id: true },
  });
  const validIds = managers.map((m) => m.id);
  if (validIds.length === 0) {
    error(res, "Tegishli managerlar topilmadi", 400);
    return;
  }

  const due = dueDate ? new Date(dueDate) : null;
  const assigner = req.managerId || req.companyId!;
  const moduleId = lesson.module?.id ?? null;
  const courseId = lesson.module?.courseId ?? null;

  // Darslikka access bersak — parent modul va kursga ham auto-access (upsert).
  // Yo'q bo'lsa qo'shamiz, bor bo'lsa hech narsa qilmaymiz (dueDate'ga tegmaymiz).
  const assignments = await Promise.all(
    validIds.map(async (mgrId) => {
      await prisma.lessonAssignment.upsert({
        where: { lessonId_managerId: { lessonId: id, managerId: mgrId } },
        update: { dueDate: due },
        create: {
          lessonId: id,
          managerId: mgrId,
          assignedById: assigner,
          dueDate: due,
        },
      });

      if (moduleId) {
        await prisma.moduleAssignment.upsert({
          where: { moduleId_managerId: { moduleId, managerId: mgrId } },
          update: {},
          create: { moduleId, managerId: mgrId, assignedById: assigner },
        });
      }

      if (courseId) {
        await prisma.courseAssignment.upsert({
          where: { courseId_managerId: { courseId, managerId: mgrId } },
          update: {},
          create: { courseId, managerId: mgrId, assignedById: assigner },
        });
      }
    })
  );

  success(res, { assigned: assignments.length });
}

/**
 * DELETE /api/lessons/:id/assign/:managerId
 */
export async function unassignLesson(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const { id, managerId } = req.params;
  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!lesson) {
    error(res, "Darslik topilmadi", 404);
    return;
  }

  try {
    await prisma.lessonAssignment.delete({
      where: { lessonId_managerId: { lessonId: id, managerId } },
    });
  } catch {
    // ehtimol yo'q
  }
  success(res, { unassigned: true });
}

/**
 * GET /api/lessons/:id/progress
 * Hamma manager'lar progressi
 */
export async function getLessonProgress(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  const { id } = req.params;
  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
    select: { id: true, title: true, videoDurationSec: true },
  });
  if (!lesson) {
    error(res, "Darslik topilmadi", 404);
    return;
  }

  const assignments = await prisma.lessonAssignment.findMany({
    where: { lessonId: id },
    include: {
      manager: {
        select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true },
      },
    },
  });

  const progresses = await prisma.lessonProgress.findMany({
    where: { lessonId: id },
  });
  const progByManager = new Map(progresses.map((p) => [p.managerId, p]));

  const rows = assignments.map((a) => {
    const p = progByManager.get(a.managerId);
    return {
      managerId: a.manager.id,
      managerName: a.manager.name,
      managerRole: a.manager.role,
      photoUrl: a.manager.photoUrl,
      assignedAt: a.assignedAt,
      dueDate: a.dueDate,
      videoCompleted: p?.videoCompleted ?? false,
      testPassed: p?.testPassed ?? false,
      testBestScore: p?.testBestScore,
      aiStatus: p?.aiStatus ?? "not_started",
      aiScore: p?.aiScore,
      finalScore: p?.finalScore,
      completedAt: p?.completedAt,
    };
  });

  success(res, { lesson, rows });
}

/**
 * GET /api/lessons/:id/video-stream
 * Admin/boss/ROP video preview uchun (Range qo'llab-quvvatlashi bilan)
 */
export async function streamAdminVideo(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    res.status(403).send("Forbidden");
    return;
  }
  const { id } = req.params;
  const lesson = await prisma.lesson.findFirst({
    where: { id, companyId: req.companyId! },
  });
  if (!lesson) {
    res.status(404).send("Not found");
    return;
  }
  // Yandex URL bo'lsa — redirect qilamiz
  if (lesson.videoUrl.startsWith("http://") || lesson.videoUrl.startsWith("https://")) {
    res.redirect(302, lesson.videoUrl);
    return;
  }

  if (!fs.existsSync(lesson.videoUrl)) {
    res.status(404).send("Video file missing");
    return;
  }

  const stat = fs.statSync(lesson.videoUrl);
  const fileSize = stat.size;
  const range = req.headers.range;
  const ext = path.extname(lesson.videoUrl).toLowerCase();
  const mimeType =
    ext === ".mp4" ? "video/mp4" :
    ext === ".webm" ? "video/webm" :
    ext === ".mov" ? "video/quicktime" :
    "application/octet-stream";

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    if (start >= fileSize || end >= fileSize) {
      res.status(416).header("Content-Range", `bytes */${fileSize}`).end();
      return;
    }
    const chunk = end - start + 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunk,
      "Content-Type": mimeType,
    });
    fs.createReadStream(lesson.videoUrl, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(lesson.videoUrl).pipe(res);
  }
}

/**
 * POST /api/lessons/run-batch
 * Lesson batch pipeline'ni qo'lda ishga tushiradi (STT poll + Flash batch).
 * Admin/boss/ROP tugmasi — kutmasdan tahlil qilish uchun.
 * Darhol qaytadi, ishlash fon rejimida.
 */
export async function runBatchAnalysis(req: Request, res: Response): Promise<void> {
  if (!(await canManage(req))) {
    error(res, "Bu amal uchun ruxsat yo'q", 403);
    return;
  }

  if (isLessonBatchRunning()) {
    success(res, { started: false, reason: "Batch allaqachon ishlamoqda" });
    return;
  }

  // Faqat shu kompaniyaning darsliklarini tahlil qilamiz
  const companyId = req.companyId!;
  setImmediate(() => {
    runLessonBatchPipeline({ companyId })
      .then((r) =>
        console.log(
          `[lesson-batch manual] ${companyId}: STT ${r.sttReady}, Flash ${r.flashReady}`
        )
      )
      .catch((err) =>
        console.error(
          `[lesson-batch manual] ${companyId} failed:`,
          (err as Error).message
        )
      );
  });

  success(res, { started: true });
}

/**
 * GET /api/managers/:id/lesson-stats
 * Bitta manager uchun darsliklar stats (ROP/Boss ishlatadi)
 */
export async function managerLessonStats(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const companyId = req.companyId!;

  // Huquq: company login OR rop OR o'zi (managerId === id)
  const isSelf = req.managerId === id;
  if (!isSelf && !(await canManage(req))) {
    error(res, "Ruxsat yo'q", 403);
    return;
  }

  const manager = await prisma.manager.findFirst({
    where: { id, companyId },
    select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true },
  });
  if (!manager) {
    error(res, "Manager topilmadi", 404);
    return;
  }

  const assignments = await prisma.lessonAssignment.findMany({
    where: { managerId: id },
    include: {
      lesson: {
        select: { id: true, title: true, videoDurationSec: true, sortOrder: true, status: true },
      },
    },
    orderBy: { lesson: { sortOrder: "asc" } },
  });
  const lessonIds = assignments.map((a) => a.lesson.id);
  const progresses = await prisma.lessonProgress.findMany({
    where: { managerId: id, lessonId: { in: lessonIds } },
  });
  const progByLesson = new Map(progresses.map((p) => [p.lessonId, p]));

  const rows = assignments.map((a) => {
    const p = progByLesson.get(a.lesson.id);
    return {
      lessonId: a.lesson.id,
      title: a.lesson.title,
      videoDurationSec: a.lesson.videoDurationSec,
      sortOrder: a.lesson.sortOrder,
      status: a.lesson.status,
      videoCompleted: p?.videoCompleted ?? false,
      testPassed: p?.testPassed ?? false,
      testBestScore: p?.testBestScore,
      aiStatus: p?.aiStatus ?? "not_started",
      aiScore: p?.aiScore,
      finalScore: p?.finalScore,
      completedAt: p?.completedAt,
    };
  });

  const completed = rows.filter((r) => r.completedAt);
  const avgScore = completed.length
    ? completed.reduce((s, r) => s + (r.finalScore || 0), 0) / completed.length
    : 0;

  success(res, {
    manager,
    summary: {
      total: rows.length,
      completed: completed.length,
      avgFinalScore: avgScore,
    },
    lessons: rows,
  });
}

// Admin/ROP/Boss — barcha menejerlarning darslik bo'yicha umumiy statistikasi
// (Darslik sahifasida "Managerlar" tabi uchun)
export async function allManagersLessonStats(
  req: Request,
  res: Response,
): Promise<void> {
  const companyId = req.companyId!;
  if (!(await canManage(req))) {
    error(res, "Ruxsat yo'q", 403);
    return;
  }

  const managers = await prisma.manager.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, role: true, photoUrl: true, customPhotoUrl: true },
    orderBy: { name: "asc" },
  });

  // Bitta queryda barcha LessonAssignment + LessonProgress'larni olamiz
  const assignments = await prisma.lessonAssignment.findMany({
    where: { lesson: { companyId } },
    select: {
      managerId: true,
      lessonId: true,
      assignedAt: true,
      dueDate: true,
    },
  });
  const lessonIds = [...new Set(assignments.map((a) => a.lessonId))];
  const progresses = await prisma.lessonProgress.findMany({
    where: { lessonId: { in: lessonIds } },
    select: {
      managerId: true,
      lessonId: true,
      videoCompleted: true,
      testPassed: true,
      testBestScore: true,
      aiStatus: true,
      aiScore: true,
      finalScore: true,
      completedAt: true,
      videoMaxSec: true,
    },
  });

  // Group by managerId
  type Row = (typeof assignments)[number];
  type PRow = (typeof progresses)[number];
  const asgByMgr = new Map<string, Row[]>();
  for (const a of assignments) {
    if (!asgByMgr.has(a.managerId)) asgByMgr.set(a.managerId, []);
    asgByMgr.get(a.managerId)!.push(a);
  }
  const progByMgrLesson = new Map<string, PRow>();
  for (const p of progresses) {
    progByMgrLesson.set(`${p.managerId}::${p.lessonId}`, p);
  }

  const rows = managers.map((m) => {
    const asg = asgByMgr.get(m.id) || [];
    let completed = 0;
    let videoDone = 0;
    let testDone = 0;
    let aiDone = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let testScoreSum = 0;
    let testScoreCount = 0;
    let aiScoreSum = 0;
    let aiScoreCount = 0;
    let watchedSec = 0;
    let lastActivity: Date | null = null;
    for (const a of asg) {
      const p = progByMgrLesson.get(`${m.id}::${a.lessonId}`);
      if (!p) continue;
      if (p.videoCompleted) videoDone++;
      if (p.testPassed) testDone++;
      if (p.aiStatus === "completed") aiDone++;
      if (p.completedAt) {
        completed++;
        if (!lastActivity || p.completedAt > lastActivity) lastActivity = p.completedAt;
      }
      if (p.finalScore != null) {
        scoreSum += p.finalScore;
        scoreCount++;
      }
      if (p.testBestScore != null) {
        testScoreSum += p.testBestScore;
        testScoreCount++;
      }
      if (p.aiScore != null) {
        aiScoreSum += p.aiScore;
        aiScoreCount++;
      }
      watchedSec += p.videoMaxSec || 0;
    }
    return {
      managerId: m.id,
      name: m.name,
      role: m.role,
      photoUrl: m.photoUrl,
      assignedCount: asg.length,
      completedCount: completed,
      videoCompletedCount: videoDone,
      testPassedCount: testDone,
      aiCompletedCount: aiDone,
      avgFinalScore: scoreCount ? Math.round(scoreSum / scoreCount) : 0,
      avgTestScore: testScoreCount ? Math.round(testScoreSum / testScoreCount) : 0,
      avgAiScore: aiScoreCount ? Math.round(aiScoreSum / aiScoreCount) : 0,
      watchedSec,
      lastActivityAt: lastActivity,
    };
  });

  // Sort: ko'pgina tugatganlar tepada
  rows.sort((a, b) => {
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount;
    return b.avgFinalScore - a.avgFinalScore;
  });

  success(res, {
    managers: rows,
    overall: {
      totalManagers: rows.length,
      activeManagers: rows.filter((r) => r.assignedCount > 0).length,
      avgCompletionRate:
        rows.length === 0
          ? 0
          : Math.round(
              (rows.reduce(
                (s, r) =>
                  s +
                  (r.assignedCount > 0 ? r.completedCount / r.assignedCount : 0),
                0,
              ) /
                rows.length) *
                100,
            ),
    },
  });
}
