// Manager side lesson endpoints (faqat tayinlanganlarini ko'radi)
// Video progress, test, AI suhbat
import { Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

const FLASH_MODEL = "gemini-3-flash-preview";
const PRO_MODEL = "gemini-3-flash-preview";

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "global",
  });
}

/**
 * Fisher-Yates shuffle (random tartib)
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Test suallarini manager uchun xavfsiz formatga o'giradi (correctIdx/explanation olib tashlaydi)
 */
function sanitizeQuestion(q: any, optionsOrder: number[]) {
  return {
    q: q.q,
    options: optionsOrder.map((i) => q.options[i]),
    topicTimestamp: q.topicTimestamp,
  };
}

async function getProgress(lessonId: string, managerId: string) {
  let progress = await prisma.lessonProgress.findUnique({
    where: { lessonId_managerId: { lessonId, managerId } },
  });
  if (!progress) {
    progress = await prisma.lessonProgress.create({
      data: { lessonId, managerId },
    });
  }
  return progress;
}

/**
 * Lesson manager ga tayinlangan bo'lishi va ready statusda bo'lishi majburiy.
 * Ketma-ket qulf: oldingi darsni bitirmasdan — keyingisi ochilmaydi.
 */
type AccessResult =
  | { ok: true; lesson: Awaited<ReturnType<typeof prisma.lesson.findFirst>> & {} }
  | { ok: false; err: string; status: number };

async function getAccessibleLesson(
  lessonId: string,
  managerId: string,
  companyId: string,
  enforceUnlock: boolean = true
): Promise<AccessResult> {
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, companyId },
    include: { module: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, err: "Darslik topilmadi", status: 404 };

  // Kirish: CourseAssignment (yangi) YOKI LessonAssignment (back-compat / module sync)
  let hasAccess = false;
  const assignment = await prisma.lessonAssignment.findUnique({
    where: { lessonId_managerId: { lessonId, managerId } },
  });
  if (assignment) hasAccess = true;
  if (!hasAccess && lesson.module?.courseId) {
    const ca = await prisma.courseAssignment.findUnique({
      where: {
        courseId_managerId: { courseId: lesson.module.courseId, managerId },
      },
    });
    if (ca) hasAccess = true;
  }
  if (!hasAccess) return { ok: false, err: "Bu darslik sizga tayinlanmagan", status: 403 };

  if (lesson.status !== "ready") {
    return { ok: false, err: `Darslik hali tayyor emas (${lesson.status})`, status: 409 };
  }

  if (enforceUnlock) {
    // Oldingi sortOrder dagi tayinlangan darslarni tekshirish
    const prevLessons = await prisma.lesson.findMany({
      where: {
        companyId,
        sortOrder: { lt: lesson.sortOrder },
        assignments: { some: { managerId } },
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true, title: true },
    });
    if (prevLessons.length > 0) {
      const prevIds = prevLessons.map((p) => p.id);
      const completed = await prisma.lessonProgress.findMany({
        where: {
          managerId,
          lessonId: { in: prevIds },
          completedAt: { not: null },
        },
        select: { lessonId: true },
      });
      const completedIds = new Set(completed.map((c) => c.lessonId));
      const notDone = prevLessons.find((p) => !completedIds.has(p.id));
      if (notDone) {
        return {
          ok: false,
          err: `Avval oldingi darsni tugatish kerak: "${notDone.title}"`,
          status: 423,
        };
      }
    }
  }

  return { ok: true, lesson };
}

/**
 * GET /api/my/lessons/modules?courseId=...
 * Manager'ga tayinlangan modullar ro'yxati.
 * courseId berilsa — faqat shu kursdagi tayinlangan modullar.
 */
export async function listMyModules(req: Request, res: Response): Promise<void> {
  if (!req.managerId) {
    error(res, "Faqat manager kiradi", 403);
    return;
  }
  const managerId = req.managerId;
  const companyId = req.companyId!;
  const courseId = (req.query.courseId as string) || undefined;

  // Kurs biriktirilgan (yangi) modullar
  const modulesByCourse = courseId
    ? await prisma.courseAssignment.findMany({
        where: { managerId, courseId },
        include: {
          course: {
            include: {
              modules: {
                orderBy: { sortOrder: "asc" },
                include: {
                  lessons: {
                    where: { companyId },
                    orderBy: { sortOrder: "asc" },
                    select: { id: true, status: true, videoDurationSec: true },
                  },
                },
              },
            },
          },
        },
      })
    : await prisma.courseAssignment.findMany({
        where: { managerId },
        include: {
          course: {
            include: {
              modules: {
                orderBy: { sortOrder: "asc" },
                include: {
                  lessons: {
                    where: { companyId },
                    orderBy: { sortOrder: "asc" },
                    select: { id: true, status: true, videoDurationSec: true },
                  },
                },
              },
            },
          },
        },
      });

  type ModItem = {
    id: string;
    title: string;
    description: string | null;
    courseId: string | null;
    sortOrder: number;
    totalDurationSec: number;
    lessonCount: number;
    readyCount: number;
    completedCount: number;
    assignedAt: Date;
    dueDate: Date | null;
    lessonIds: string[];
  };

  const byId = new Map<string, ModItem>();

  for (const a of modulesByCourse) {
    if (a.course.companyId !== companyId) continue;
    for (const mod of a.course.modules) {
      if (byId.has(mod.id)) continue;
      byId.set(mod.id, {
        id: mod.id,
        title: mod.title,
        description: mod.description,
        courseId: mod.courseId,
        sortOrder: mod.sortOrder,
        totalDurationSec: mod.lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0),
        lessonCount: mod.lessons.length,
        readyCount: mod.lessons.filter((l) => l.status === "ready").length,
        completedCount: 0,
        assignedAt: a.assignedAt,
        dueDate: a.dueDate,
        lessonIds: mod.lessons.map((l) => l.id),
      });
    }
  }

  // Back-compat: eski ModuleAssignment
  const modAssignments = await prisma.moduleAssignment.findMany({
    where: {
      managerId,
      ...(courseId ? { module: { courseId } } : {}),
    },
    include: {
      module: {
        include: {
          lessons: {
            where: { companyId },
            orderBy: { sortOrder: "asc" },
            select: { id: true, status: true, videoDurationSec: true },
          },
        },
      },
    },
    orderBy: { module: { sortOrder: "asc" } },
  });
  for (const a of modAssignments) {
    const mod = a.module;
    if (mod.companyId !== companyId) continue;
    if (byId.has(mod.id)) continue;
    byId.set(mod.id, {
      id: mod.id,
      title: mod.title,
      description: mod.description,
      courseId: mod.courseId,
      sortOrder: mod.sortOrder,
      totalDurationSec: mod.lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0),
      lessonCount: mod.lessons.length,
      readyCount: mod.lessons.filter((l) => l.status === "ready").length,
      completedCount: 0,
      assignedAt: a.assignedAt,
      dueDate: a.dueDate,
      lessonIds: mod.lessons.map((l) => l.id),
    });
  }

  const allLessonIds = [...byId.values()].flatMap((m) => m.lessonIds);
  const progresses = await prisma.lessonProgress.findMany({
    where: { managerId, lessonId: { in: allLessonIds } },
  });
  const progByLesson = new Map(progresses.map((p) => [p.lessonId, p]));

  const items = [...byId.values()]
    .map((m) => ({
      ...m,
      completedCount: m.lessonIds.filter((id) => progByLesson.get(id)?.completedAt).length,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ lessonIds: _ids, ...rest }) => rest);

  success(res, items);
}

/**
 * GET /api/my/lessons/courses
 * Manager ko'radigan kurslar. Ikki manba:
 *  1) CourseAssignment — yangi birlamchi yo'l (kurs butunligicha biriktirilgan).
 *  2) ModuleAssignment — eski/backward-compat (kursi null bo'lgan modullar uchun ham).
 */
export async function listMyCourses(req: Request, res: Response): Promise<void> {
  if (!req.managerId) {
    error(res, "Faqat manager kiradi", 403);
    return;
  }
  const managerId = req.managerId;
  const companyId = req.companyId!;

  type Bucket = {
    id: string | null;
    title: string;
    description: string | null;
    sortOrder: number;
    moduleCount: number;
    lessonCount: number;
    completedCount: number;
    totalDurationSec: number;
  };
  const bucketMap = new Map<string, Bucket>();
  const countedModuleIds = new Set<string>();
  const lessonIdsForProgress: string[] = [];

  // ── Manba 1: CourseAssignment — kurs butunligicha biriktirilgan ──
  const courseAssignments = await prisma.courseAssignment.findMany({
    where: { managerId },
    include: {
      course: {
        include: {
          modules: {
            include: {
              lessons: {
                where: { companyId },
                select: { id: true, status: true, videoDurationSec: true },
              },
            },
          },
        },
      },
    },
  });
  for (const a of courseAssignments) {
    const course = a.course;
    if (course.companyId !== companyId) continue;
    const key = course.id;
    let b = bucketMap.get(key);
    if (!b) {
      b = {
        id: course.id,
        title: course.title,
        description: course.description,
        sortOrder: course.sortOrder ?? 9999,
        moduleCount: 0,
        lessonCount: 0,
        completedCount: 0,
        totalDurationSec: 0,
      };
      bucketMap.set(key, b);
    }
    for (const mod of course.modules) {
      if (countedModuleIds.has(mod.id)) continue;
      countedModuleIds.add(mod.id);
      b.moduleCount += 1;
      b.lessonCount += mod.lessons.length;
      b.totalDurationSec += mod.lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0);
      for (const l of mod.lessons) lessonIdsForProgress.push(l.id);
    }
  }

  // ── Manba 2: ModuleAssignment — eski ma'lumot yoki orphan modullar ──
  const modAssignments = await prisma.moduleAssignment.findMany({
    where: { managerId },
    include: {
      module: {
        include: {
          course: true,
          lessons: {
            where: { companyId },
            select: { id: true, status: true, videoDurationSec: true },
          },
        },
      },
    },
  });
  for (const a of modAssignments) {
    const mod = a.module;
    if (mod.companyId !== companyId) continue;
    if (countedModuleIds.has(mod.id)) continue; // allaqachon Course orqali hisoblangan
    countedModuleIds.add(mod.id);
    const course = mod.course;
    const key = course?.id || "__orphan__";
    let b = bucketMap.get(key);
    if (!b) {
      b = {
        id: course?.id || null,
        title: course?.title || "Kursga tegishli bo'lmagan modullar",
        description: course?.description || null,
        sortOrder: course?.sortOrder ?? 9999,
        moduleCount: 0,
        lessonCount: 0,
        completedCount: 0,
        totalDurationSec: 0,
      };
      bucketMap.set(key, b);
    }
    b.moduleCount += 1;
    b.lessonCount += mod.lessons.length;
    b.totalDurationSec += mod.lessons.reduce((s, l) => s + (l.videoDurationSec || 0), 0);
    for (const l of mod.lessons) lessonIdsForProgress.push(l.id);
  }

  // Progressni hisoblash
  const progresses = await prisma.lessonProgress.findMany({
    where: { managerId, lessonId: { in: lessonIdsForProgress } },
  });
  const progByLesson = new Map(progresses.map((p) => [p.lessonId, p]));

  // completedCount ni qayta aniq hisoblash uchun — bucketlarga modullarni qayta aylantirib
  // yurmaymiz; o'rniga CourseAssignment manbasidagi kurslarni qayta kezamiz va bucketga
  // completedCount qo'shamiz. ModuleAssignment manbasidagi modullarni ham shu tarzda.
  // (bucketlar avvalgi aylanishda lesson.id saqlashimiz uchun parallel map tuzamiz)
  const completedByBucket = new Map<string, number>();
  const markCompleted = (bucketKey: string, lessonIds: string[]) => {
    const cur = completedByBucket.get(bucketKey) || 0;
    const done = lessonIds.filter((id) => progByLesson.get(id)?.completedAt).length;
    completedByBucket.set(bucketKey, cur + done);
  };

  const seenModsForCount = new Set<string>();
  for (const a of courseAssignments) {
    if (a.course.companyId !== companyId) continue;
    for (const mod of a.course.modules) {
      if (seenModsForCount.has(mod.id)) continue;
      seenModsForCount.add(mod.id);
      markCompleted(a.course.id, mod.lessons.map((l) => l.id));
    }
  }
  for (const a of modAssignments) {
    const mod = a.module;
    if (mod.companyId !== companyId) continue;
    if (seenModsForCount.has(mod.id)) continue;
    seenModsForCount.add(mod.id);
    const key = mod.course?.id || "__orphan__";
    markCompleted(key, mod.lessons.map((l) => l.id));
  }
  for (const [key, count] of completedByBucket) {
    const b = bucketMap.get(key);
    if (b) b.completedCount = count;
  }

  const items = [...bucketMap.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  success(res, items);
}

/**
 * GET /api/my/lessons?moduleId=... (modul ichidagi darslar) yoki umumiy (back-compat).
 * Faqat tayinlangan darslar, ketma-ketlik va status bilan.
 * Unlock: modul ichida tartib bo'yicha — oldingisi tugamasa keyingisi qulflangan.
 */
export async function listMyLessons(req: Request, res: Response): Promise<void> {
  if (!req.managerId) {
    error(res, "Faqat manager kiradi", 403);
    return;
  }
  const managerId = req.managerId;
  const companyId = req.companyId!;
  const moduleId = (req.query.moduleId as string) || undefined;

  // Agar moduleId berilgan bo'lsa — shu modul Manager'ga tayinlanganligini tekshirish
  // (CourseAssignment yoki eski ModuleAssignment orqali)
  if (moduleId) {
    const modAssigned = await prisma.moduleAssignment.findUnique({
      where: { moduleId_managerId: { moduleId, managerId } },
    });
    let hasAccess = !!modAssigned;
    if (!hasAccess) {
      const mod = await prisma.lessonModule.findUnique({
        where: { id: moduleId },
        select: { courseId: true, companyId: true },
      });
      if (mod?.companyId === companyId && mod?.courseId) {
        const courseAssigned = await prisma.courseAssignment.findUnique({
          where: { courseId_managerId: { courseId: mod.courseId, managerId } },
        });
        if (courseAssigned) hasAccess = true;
      }
    }
    if (!hasAccess) {
      error(res, "Bu modul sizga tayinlanmagan", 403);
      return;
    }
  }

  const assignments = await prisma.lessonAssignment.findMany({
    where: {
      managerId,
      ...(moduleId ? { lesson: { moduleId } } : {}),
    },
    include: {
      lesson: {
        select: {
          id: true,
          title: true,
          description: true,
          moduleId: true,
          videoDurationSec: true,
          status: true,
          sortOrder: true,
          testQuestions: true,
          companyId: true,
        },
      },
    },
    orderBy: { lesson: { sortOrder: "asc" } },
  });

  const lessonIds = assignments
    .filter((a) => a.lesson.companyId === companyId)
    .map((a) => a.lesson.id);

  const progresses = await prisma.lessonProgress.findMany({
    where: { managerId, lessonId: { in: lessonIds } },
  });
  const progByLesson = new Map(progresses.map((p) => [p.lessonId, p]));

  let prevCompleted = true; // 1-dars har doim ochiq
  const items = assignments
    .filter((a) => a.lesson.companyId === companyId)
    .map((a) => {
      const p = progByLesson.get(a.lesson.id);
      const locked = !prevCompleted && !p?.completedAt;
      const done = !!p?.completedAt;
      const item = {
        id: a.lesson.id,
        title: a.lesson.title,
        description: a.lesson.description,
        moduleId: a.lesson.moduleId,
        videoDurationSec: a.lesson.videoDurationSec,
        status: a.lesson.status,
        sortOrder: a.lesson.sortOrder,
        testCount: Array.isArray(a.lesson.testQuestions)
          ? (a.lesson.testQuestions as any[]).length
          : 0,
        assignedAt: a.assignedAt,
        dueDate: a.dueDate,
        videoCompleted: p?.videoCompleted ?? false,
        testPassed: p?.testPassed ?? false,
        testBestScore: p?.testBestScore,
        aiStatus: p?.aiStatus ?? "not_started",
        aiScore: p?.aiScore,
        finalScore: p?.finalScore,
        completedAt: p?.completedAt,
        locked,
      };
      prevCompleted = done;
      return item;
    });

  success(res, items);
}

/**
 * GET /api/my/lessons/:id
 */
export async function getMyLesson(req: Request, res: Response): Promise<void> {
  if (!req.managerId) {
    error(res, "Faqat manager kiradi", 403);
    return;
  }
  const { id } = req.params;
  const check = await getAccessibleLesson(id, req.managerId, req.companyId!, false);
  if (!check.ok) {
    error(res, check.err, check.status);
    return;
  }
  const lesson = check.lesson;

  const progress = await getProgress(id, req.managerId);

  // Unlock holatini hisoblash (enforceUnlock=false ga qaramay, UI uchun kerak)
  const unlockCheck = await getAccessibleLesson(id, req.managerId, req.companyId!, true);
  const locked = !unlockCheck.ok && unlockCheck.status === 423;

  // Modul ichida keyingi dars (auto-advance uchun)
  let nextLessonId: string | null = null;
  let isLastInModule = false;
  if (lesson.moduleId) {
    const siblings = await prisma.lesson.findMany({
      where: {
        moduleId: lesson.moduleId,
        assignments: { some: { managerId: req.managerId } },
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, sortOrder: true },
    });
    const currentIdx = siblings.findIndex((s) => s.id === lesson.id);
    if (currentIdx >= 0 && currentIdx < siblings.length - 1) {
      nextLessonId = siblings[currentIdx + 1].id;
    } else if (currentIdx === siblings.length - 1) {
      isLastInModule = true;
    }
  }

  success(res, {
    id: lesson.id,
    title: lesson.title,
    description: lesson.description,
    moduleId: lesson.moduleId,
    nextLessonId,
    isLastInModule,
    videoDurationSec: lesson.videoDurationSec,
    status: lesson.status,
    sortOrder: lesson.sortOrder,
    testPassScore: lesson.testPassScore,
    testCount: Array.isArray(lesson.testQuestions)
      ? (lesson.testQuestions as any[]).length
      : 0,
    aiKeyTopics: lesson.aiKeyTopics,
    locked,
    progress: {
      videoWatchedSec: progress.videoWatchedSec,
      videoMaxSec: progress.videoMaxSec,
      videoCompleted: progress.videoCompleted,
      testAttempts: Array.isArray(progress.testAttempts)
        ? (progress.testAttempts as any[]).length
        : 0,
      testBestScore: progress.testBestScore,
      testPassed: progress.testPassed,
      aiStatus: progress.aiStatus,
      aiScore: progress.aiScore,
      aiFeedback: progress.aiFeedback,
      aiStrengths: progress.aiStrengths,
      aiWeaknesses: progress.aiWeaknesses,
      finalScore: progress.finalScore,
      completedAt: progress.completedAt,
    },
  });
}

/**
 * POST /api/my/lessons/:id/video-progress
 * body: { watchedSec, maxSec }
 * maxSec monotonic — orqaga ketmasligi kerak
 */
export async function updateVideoProgress(req: Request, res: Response): Promise<void> {
  if (!req.managerId) { error(res, "Faqat manager", 403); return; }
  const { id } = req.params;
  const { watchedSec, maxSec } = req.body as { watchedSec: number; maxSec: number };

  const check = await getAccessibleLesson(id, req.managerId, req.companyId!);
  if (!check.ok) { error(res, check.err, check.status); return; }
  const lesson = check.lesson;

  const current = await getProgress(id, req.managerId);
  const newMax = Math.max(current.videoMaxSec, Math.floor(maxSec || 0));
  const newWatched = Math.max(current.videoWatchedSec, Math.floor(watchedSec || 0));

  // 95% ko'rilsa completed — 100% kutish real emas (oxirgi soniyalar kasr)
  const completed =
    lesson.videoDurationSec > 0 &&
    newMax >= Math.floor(lesson.videoDurationSec * 0.95);

  const updated = await prisma.lessonProgress.update({
    where: { id: current.id },
    data: {
      videoMaxSec: newMax,
      videoWatchedSec: newWatched,
      videoCompleted: current.videoCompleted || completed,
      videoCompletedAt:
        current.videoCompleted || !completed ? current.videoCompletedAt : new Date(),
    },
  });

  success(res, {
    videoMaxSec: updated.videoMaxSec,
    videoWatchedSec: updated.videoWatchedSec,
    videoCompleted: updated.videoCompleted,
  });
}

/**
 * POST /api/my/lessons/:id/test-start
 * Response: { attemptId, questions: [{q, options (shuffled), topicTimestamp}], orderIdxs, optionsOrder }
 * orderIdxs va optionsOrder'ni client saqlab, submit paytida qaytaradi
 */
export async function startTest(req: Request, res: Response): Promise<void> {
  if (!req.managerId) { error(res, "Faqat manager", 403); return; }
  const { id } = req.params;
  const check = await getAccessibleLesson(id, req.managerId, req.companyId!);
  if (!check.ok) { error(res, check.err, check.status); return; }
  const lesson = check.lesson;

  const progress = await getProgress(id, req.managerId);
  if (!progress.videoCompleted) {
    error(res, "Avval videoni to'liq ko'ring", 400);
    return;
  }

  const allQ = Array.isArray(lesson.testQuestions) ? (lesson.testQuestions as any[]) : [];
  if (allQ.length === 0) {
    error(res, "Bu darslikda savol yo'q", 400);
    return;
  }

  const orderIdxs = shuffle(allQ.map((_, i) => i));
  const optionsOrder = orderIdxs.map(() => shuffle([0, 1, 2, 3]));

  const questionsForClient = orderIdxs.map((qIdx, i) =>
    sanitizeQuestion(allQ[qIdx], optionsOrder[i])
  );

  success(res, {
    attemptStartedAt: new Date().toISOString(),
    orderIdxs,
    optionsOrder,
    questions: questionsForClient,
    passScore: lesson.testPassScore,
  });
}

/**
 * POST /api/my/lessons/:id/test-retry-wrong
 * body: { orderIdxs, answers, optionsOrder } — oldingi urinish ma'lumotlari
 * Faqat xato qilingan savollarni qayta beradi (random tartibda, options'lar random)
 */
export async function retryWrongTest(req: Request, res: Response): Promise<void> {
  if (!req.managerId) { error(res, "Faqat manager", 403); return; }
  const { id } = req.params;
  const { wrongQuestionIndices } = req.body as { wrongQuestionIndices: number[] };

  const check = await getAccessibleLesson(id, req.managerId, req.companyId!);
  if (!check.ok) { error(res, check.err, check.status); return; }
  const lesson = check.lesson;

  const progress = await getProgress(id, req.managerId);
  if (!progress.videoCompleted) {
    error(res, "Avval videoni to'liq ko'ring", 400);
    return;
  }

  const allQ = Array.isArray(lesson.testQuestions) ? (lesson.testQuestions as any[]) : [];
  if (allQ.length === 0) {
    error(res, "Bu darslikda savol yo'q", 400);
    return;
  }
  if (!Array.isArray(wrongQuestionIndices) || wrongQuestionIndices.length === 0) {
    error(res, "Xato savollar ro'yxati bo'sh", 400);
    return;
  }

  // Valid indekslar — allQ ichida mavjud bo'lganlarini olish
  const validIdxs = wrongQuestionIndices.filter((i) => i >= 0 && i < allQ.length);
  if (validIdxs.length === 0) {
    error(res, "Yaroqli savol yo'q", 400);
    return;
  }

  const orderIdxs = shuffle(validIdxs);
  const optionsOrder = orderIdxs.map(() => shuffle([0, 1, 2, 3]));
  const questionsForClient = orderIdxs.map((qIdx, i) =>
    sanitizeQuestion(allQ[qIdx], optionsOrder[i])
  );

  success(res, {
    attemptStartedAt: new Date().toISOString(),
    orderIdxs,
    optionsOrder,
    questions: questionsForClient,
    passScore: lesson.testPassScore,
    isRetry: true,
  });
}

/**
 * POST /api/my/lessons/:id/test-submit
 * body: { orderIdxs, optionsOrder, answers } — answers[i] = shuffled option index (0-3)
 * Response: { score, passed, correctCount, total, perQuestion: [{correct, explanation, correctIdx}] }
 */
export async function submitTest(req: Request, res: Response): Promise<void> {
  if (!req.managerId) { error(res, "Faqat manager", 403); return; }
  const { id } = req.params;
  const { orderIdxs, optionsOrder, answers } = req.body as {
    orderIdxs: number[];
    optionsOrder: number[][];
    answers: number[];
  };

  const check = await getAccessibleLesson(id, req.managerId, req.companyId!);
  if (!check.ok) { error(res, check.err, check.status); return; }
  const lesson = check.lesson;

  if (
    !Array.isArray(orderIdxs) ||
    !Array.isArray(optionsOrder) ||
    !Array.isArray(answers) ||
    orderIdxs.length !== answers.length ||
    orderIdxs.length !== optionsOrder.length
  ) {
    error(res, "Test ma'lumoti noto'g'ri", 400);
    return;
  }

  const allQ = Array.isArray(lesson.testQuestions) ? (lesson.testQuestions as any[]) : [];
  const total = orderIdxs.length;
  let correctCount = 0;
  const perQuestion: any[] = [];

  // No-spoil: to'g'ri javob/izoh chiqarmaymiz — faqat correct/incorrect va qaysi savol (index)
  // Manager qayta urinib xatosini o'zi topadi. Xato indexlar retry-wrong uchun ishlatiladi.
  const wrongQuestionIndices: number[] = [];
  for (let i = 0; i < total; i++) {
    const qIdx = orderIdxs[i];
    const q = allQ[qIdx];
    if (!q) {
      perQuestion.push({ correct: false, originalIdx: qIdx });
      wrongQuestionIndices.push(qIdx);
      continue;
    }
    const order = optionsOrder[i];
    const userAnswerShuffled = answers[i];
    const userAnswerReal = order[userAnswerShuffled];
    const correct = userAnswerReal === q.correctIdx;
    if (correct) correctCount++;
    else wrongQuestionIndices.push(qIdx);
    perQuestion.push({
      correct,
      originalIdx: qIdx, // test-retry-wrong uchun
    });
  }

  const score = total > 0 ? (correctCount / total) * 100 : 0;
  const passed = score >= lesson.testPassScore;

  const progress = await getProgress(id, req.managerId);
  const attempts = Array.isArray(progress.testAttempts) ? [...(progress.testAttempts as any[])] : [];
  attempts.push({
    startedAt: new Date().toISOString(),
    orderIdxs,
    optionsOrder,
    answers,
    score,
    correctCount,
    total,
    finishedAt: new Date().toISOString(),
  });

  const newBest = Math.max(progress.testBestScore ?? 0, score);
  const wasPassedBefore = progress.testPassed;

  await prisma.lessonProgress.update({
    where: { id: progress.id },
    data: {
      testAttempts: attempts as any,
      testBestScore: newBest,
      testPassed: progress.testPassed || passed,
      testPassedAt:
        progress.testPassed || !passed ? progress.testPassedAt : new Date(),
    },
  });

  // Agar yangi pass bo'lsa — yakuniy bal hisoblashga harakat qilamiz
  if (!wasPassedBefore && passed) {
    await tryFinalize(id, req.managerId);
  }

  success(res, {
    score,
    passed,
    correctCount,
    total,
    perQuestion,
    bestScore: newBest,
    wrongQuestionIndices,
  });
}

/**
 * POST /api/my/lessons/:id/ai-chat
 * body: { message? }  — birinchi chaqiruv: message yo'q, AI birinchi savolni beradi
 * Response: { reply, done }
 */
export async function aiChat(req: Request, res: Response): Promise<void> {
  if (!req.managerId) { error(res, "Faqat manager", 403); return; }
  const { id } = req.params;
  const { message } = req.body as { message?: string };

  const check = await getAccessibleLesson(id, req.managerId, req.companyId!);
  if (!check.ok) { error(res, check.err, check.status); return; }
  const lesson = check.lesson;

  const progress = await getProgress(id, req.managerId);
  if (!progress.testPassed) {
    error(res, `Avval testdan ${lesson.testPassScore}% dan yuqori ball oling`, 400);
    return;
  }
  if (progress.aiStatus === "completed") {
    error(res, "AI suhbat allaqachon tugagan", 400);
    return;
  }

  const history = Array.isArray(progress.aiMessages) ? [...(progress.aiMessages as any[])] : [];

  // User xabarni qo'shish (birinchi chaqiruvda bo'sh)
  if (message && message.trim()) {
    history.push({ role: "user", text: message.trim(), ts: new Date().toISOString() });
  }

  // Max 10 ta user xabar — undan keyin majburiy finish
  const userCount = history.filter((m) => m.role === "user").length;
  if (userCount >= 10) {
    await prisma.lessonProgress.update({
      where: { id: progress.id },
      data: { aiMessages: history as any },
    });
    success(res, {
      reply: "Yetarlicha ma'lumot oldim. Yakuniy bahoni olishingiz mumkin.\n[END_CONVERSATION]",
      done: true,
    });
    return;
  }

  const systemPrompt =
    lesson.aiSystemPrompt ||
    `Sen ushbu darslik bo'yicha instruktorsan. Mavzular: ${JSON.stringify(
      lesson.aiKeyTopics || []
    )}. Managerdan 3-8 ta chuqurlashuvchi savol so'ra, keyin [END_CONVERSATION] bilan yakunla.`;

  // Gemini ga kontekst
  const contents = [
    {
      role: "user" as const,
      parts: [
        {
          text:
            systemPrompt +
            "\n\nMuhim: managerga har doim o'zbek tilida murojaat qil. " +
            "Yetarlicha ma'lumot olsang (min 3, max 8 savol), " +
            "javobing oxiriga [END_CONVERSATION] belgisini qo'y.",
        },
      ],
    },
    { role: "model" as const, parts: [{ text: "Tushundim. Boshlayman." }] },
    ...history.map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "model" | "user",
      parts: [{ text: m.text }],
    })),
  ];

  if (history.length === 0 || history[history.length - 1].role !== "user") {
    // Birinchi chaqiruv — AI savol beradi
    contents.push({
      role: "user" as const,
      parts: [{ text: "Marhamat, birinchi savolingizni bering." }],
    });
  }

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: FLASH_MODEL,
    contents,
    config: { temperature: 0.7, maxOutputTokens: 2048 },
  });

  const raw = response.text || "";
  const done = raw.includes("[END_CONVERSATION]");
  const cleanReply = raw.replace("[END_CONVERSATION]", "").trim();

  history.push({ role: "assistant", text: cleanReply, ts: new Date().toISOString() });

  await prisma.lessonProgress.update({
    where: { id: progress.id },
    data: {
      aiMessages: history as any,
      aiStatus: progress.aiStatus === "not_started" ? "in_progress" : progress.aiStatus,
    },
  });

  success(res, { reply: cleanReply, done });
}

/**
 * POST /api/my/lessons/:id/ai-finish
 * Gemini Pro bilan yakuniy baho
 */
export async function finishAi(req: Request, res: Response): Promise<void> {
  if (!req.managerId) { error(res, "Faqat manager", 403); return; }
  const { id } = req.params;

  const check = await getAccessibleLesson(id, req.managerId, req.companyId!);
  if (!check.ok) { error(res, check.err, check.status); return; }
  const lesson = check.lesson;

  const progress = await getProgress(id, req.managerId);
  if (progress.aiStatus === "completed") {
    error(res, "AI suhbat allaqachon baholangan", 400);
    return;
  }
  const messages = Array.isArray(progress.aiMessages) ? (progress.aiMessages as any[]) : [];
  if (messages.filter((m) => m.role === "user").length < 2) {
    error(res, "Kamida 2 ta javob kerak", 400);
    return;
  }

  const dialogText = messages
    .map((m) => `${m.role === "user" ? "MANAGER" : "AI"}: ${m.text}`)
    .join("\n");

  const prompt = `Sen o'quv suhbatini baholovchi ekspertsan. Manager ushbu darslik bo'yicha
AI instruktor bilan suhbat o'tkazdi. Baholash vazifasi.

DARSLIK: ${lesson.title}
ASOSIY MAVZULAR: ${JSON.stringify(lesson.aiKeyTopics || [])}

SUHBAT:
${dialogText}

Quyidagi formatda JAVOB bering (JSON):
{
  "score": <0-100>,
  "strengths": ["...", "..."],
  "weaknesses": ["...", "..."],
  "feedback": "Markdown formatda qisqa xulosa (2-4 gap)"
}

Kriterialar:
- Javoblar to'g'riligi (darslik mazmuniga mos)
- Amaliy misollar keltirganmi
- Javoblar batafsilmi yoki yuzakimi
- O'zbek tilida to'g'ri ishlatishmi

Faqat JSON qaytaring.`;

  const ai = getAI();
  const response = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
    },
  });

  let parsed: any = {};
  try {
    let text = (response.text || "").trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    }
    parsed = JSON.parse(text);
  } catch {
    parsed = {
      score: 0,
      strengths: [],
      weaknesses: ["Baholashda xatolik"],
      feedback: "Baholash muvaffaqiyatsiz, qayta urinib ko'ring",
    };
  }

  const aiScore = Math.max(0, Math.min(100, Number(parsed.score || 0)));
  const updated = await prisma.lessonProgress.update({
    where: { id: progress.id },
    data: {
      aiStatus: "completed",
      aiScore,
      aiFeedback: parsed.feedback || "",
      aiStrengths: parsed.strengths || [],
      aiWeaknesses: parsed.weaknesses || [],
      aiCompletedAt: new Date(),
    },
  });

  await tryFinalize(id, req.managerId);

  success(res, {
    aiScore,
    feedback: updated.aiFeedback,
    strengths: updated.aiStrengths,
    weaknesses: updated.aiWeaknesses,
  });
}

/**
 * Agar test va AI ikkalasi tugagan bo'lsa — yakuniy ball yozamiz
 */
async function tryFinalize(lessonId: string, managerId: string): Promise<void> {
  const p = await prisma.lessonProgress.findUnique({
    where: { lessonId_managerId: { lessonId, managerId } },
  });
  if (!p) return;
  if (p.completedAt) return;
  if (!p.testPassed || p.aiStatus !== "completed") return;

  const finalScore = ((p.testBestScore ?? 0) + (p.aiScore ?? 0)) / 2;

  await prisma.lessonProgress.update({
    where: { id: p.id },
    data: {
      finalScore,
      completedAt: new Date(),
    },
  });
}

/**
 * GET /api/my/lessons/:id/video-stream
 * Range qo'llab-quvvatlashi bilan
 */
export async function streamVideo(req: Request, res: Response): Promise<void> {
  if (!req.managerId) { res.status(403).send("Forbidden"); return; }
  const { id } = req.params;
  const check = await getAccessibleLesson(id, req.managerId, req.companyId!);
  if (!check.ok) { res.status(check.status).send(check.err); return; }
  const lesson = check.lesson;

  // Yandex URL bo'lsa — redirect
  if (lesson.videoUrl.startsWith("http://") || lesson.videoUrl.startsWith("https://")) {
    res.redirect(302, lesson.videoUrl);
    return;
  }

  const filePath = lesson.videoUrl;
  if (!fs.existsSync(filePath)) {
    res.status(404).send("Video not found");
    return;
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(filePath).toLowerCase();
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
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
