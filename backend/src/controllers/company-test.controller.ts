/**
 * Kompaniya testi — imtihonning ikkinchi qismi.
 *
 * Endpoints:
 *   POST /api/voice-exam/company-test/start          → 15 random savol, attemptId qaytaradi
 *   POST /api/voice-exam/company-test/:id/submit     → javoblar, ball, perQuestion (xato + tushuntirish)
 *   POST /api/voice-exam/company-test/:id/retry-wrong→ faqat xato qilingan savollarni qayta beradi
 *   GET  /api/voice-exam/company-test/history        → manager urinishlari
 *   POST /api/voice-exam/company-test/admin/regenerate → admin pool'ni qayta generatsiya qiladi
 *   GET  /api/voice-exam/company-test/admin/pool     → admin uchun pool ko'rinishi
 */
import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import {
  ensureCompanyTestPool,
  generateCompanyTestPool,
  CompanyTestQuestion,
} from "../services/voice-exam/company-test-pool";

const PASS_SCORE = 85;
const PER_ATTEMPT = 15;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Manager uchun savolni xavfsiz formatga keltiradi (correctIdx, explanation olib tashlanadi). */
function sanitizeForClient(q: CompanyTestQuestion, optionsOrder: number[]) {
  return {
    q: q.q,
    options: optionsOrder.map((i) => q.options[i]),
    topic: q.topic,
  };
}

/**
 * POST /api/voice-exam/company-test/start
 * Auth: manager (sotuvchi). examEnabled bo'lishi shart.
 */
export async function startCompanyTest(req: Request, res: Response): Promise<void> {
  const managerId = req.managerId;
  if (!managerId) { error(res, "Faqat sotuvchilar", 403); return; }

  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { examEnabled: true, companyId: true },
  });
  if (!manager?.examEnabled) {
    error(res, "Imtihon sizga ochilmagan. Admin bilan bog'laning.", 403);
    return;
  }
  if (manager.companyId !== req.companyId) { error(res, "Ruxsat yo'q", 403); return; }

  // Pool tayyor bo'lishini tekshirish (yo'q bo'lsa generatsiya qilinadi — sekin bo'lishi mumkin ~10s)
  let pool: CompanyTestQuestion[];
  try {
    pool = await ensureCompanyTestPool(req.companyId!);
  } catch (e: any) {
    error(res, e?.message || "Test savollari hali tayyor emas. Birozdan keyin urinib ko'ring.", 503);
    return;
  }

  if (pool.length < PER_ATTEMPT) {
    error(res, `Test savollari yetarli emas (${pool.length}/${PER_ATTEMPT})`, 503);
    return;
  }

  // 15 ta random savol pool'dan tanlanadi, har birining options'i ham shuffle qilinadi
  const allIdxs = pool.map((_, i) => i);
  const orderIdxs = shuffle(allIdxs).slice(0, PER_ATTEMPT);
  const optionsOrder = orderIdxs.map(() => shuffle([0, 1, 2, 3]));

  // Snapshot — ushbu urinishda haqiqiy savollar qatnashuvi (pool keyin yangilansa ham
  // shu attempt o'z savollarini saqlaydi)
  const snapshot = orderIdxs.map((idx) => pool[idx]);

  const attempt = await prisma.companyTestAttempt.create({
    data: {
      managerId,
      companyId: req.companyId!,
      questions: snapshot as any,
      orderIdxs: orderIdxs as any,
      optionsOrder: optionsOrder as any,
    },
  });

  const questionsForClient = orderIdxs.map((qIdx, i) =>
    sanitizeForClient(pool[qIdx], optionsOrder[i]),
  );

  success(res, {
    attemptId: attempt.id,
    passScore: PASS_SCORE,
    questions: questionsForClient,
    total: questionsForClient.length,
  });
}

/**
 * POST /api/voice-exam/company-test/:id/submit
 * Body: { answers: number[] } — har savol uchun shuffled option idx (0-3)
 */
export async function submitCompanyTest(req: Request, res: Response): Promise<void> {
  const managerId = req.managerId;
  if (!managerId) { error(res, "Faqat sotuvchilar", 403); return; }

  const { id } = req.params;
  const { answers } = req.body as { answers: number[] };

  const attempt = await prisma.companyTestAttempt.findFirst({
    where: { id, managerId, companyId: req.companyId! },
  });
  if (!attempt) { error(res, "Urinish topilmadi", 404); return; }
  if (attempt.completedAt) { error(res, "Bu urinish allaqachon yakunlangan", 400); return; }

  const questions = attempt.questions as unknown as CompanyTestQuestion[];
  const optionsOrder = attempt.optionsOrder as unknown as number[][];
  const total = questions.length;

  if (!Array.isArray(answers) || answers.length !== total) {
    error(res, `Javoblar soni noto'g'ri (kerak: ${total})`, 400);
    return;
  }

  let correctCount = 0;
  const perQuestion: any[] = [];
  for (let i = 0; i < total; i++) {
    const q = questions[i];
    const order = optionsOrder[i];
    const userAnswerShuffled = answers[i];
    const userAnswerReal = order?.[userAnswerShuffled];
    const correct = userAnswerReal === q.correctIdx;
    if (correct) correctCount++;
    // To'g'ri javob shu attempt uchun shuffled indekslar bo'yicha qaysi ekanini topamiz
    const correctShuffledIdx = order ? order.indexOf(q.correctIdx) : -1;
    perQuestion.push({
      correct,
      correctShuffledIdx,
      explanation: q.explanation,
    });
  }

  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const passed = score >= PASS_SCORE;

  await prisma.companyTestAttempt.update({
    where: { id: attempt.id },
    data: {
      answers: answers as any,
      score,
      passed,
      perQuestion: perQuestion as any,
      completedAt: new Date(),
    },
  });

  // Wrong indices — retry-wrong uchun
  const wrongQuestionIndices: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!perQuestion[i].correct) wrongQuestionIndices.push(i);
  }

  success(res, {
    score,
    passed,
    correctCount,
    total,
    passScore: PASS_SCORE,
    perQuestion,
    wrongQuestionIndices,
  });
}

/**
 * POST /api/voice-exam/company-test/:id/retry-wrong
 * Avvalgi attempt'dagi xato savollarni faqat olib yangi attempt ochadi.
 */
export async function retryWrongCompanyTest(req: Request, res: Response): Promise<void> {
  const managerId = req.managerId;
  if (!managerId) { error(res, "Faqat sotuvchilar", 403); return; }

  const { id } = req.params;
  const prev = await prisma.companyTestAttempt.findFirst({
    where: { id, managerId, companyId: req.companyId! },
  });
  if (!prev) { error(res, "Urinish topilmadi", 404); return; }
  if (!prev.completedAt) { error(res, "Avvalgi urinish hali yakunlanmagan", 400); return; }

  const prevQuestions = prev.questions as unknown as CompanyTestQuestion[];
  const prevPerQ = (prev.perQuestion as any[]) || [];
  const wrongOriginalIdxs: number[] = [];
  for (let i = 0; i < prevQuestions.length; i++) {
    if (!prevPerQ[i]?.correct) wrongOriginalIdxs.push(i);
  }
  if (wrongOriginalIdxs.length === 0) {
    error(res, "Xato javob yo'q — qayta ishlashga hojat yo'q", 400);
    return;
  }

  const wrongQuestions = wrongOriginalIdxs.map((i) => prevQuestions[i]);
  const orderIdxs = shuffle(wrongQuestions.map((_, i) => i));
  const optionsOrder = orderIdxs.map(() => shuffle([0, 1, 2, 3]));
  const snapshot = orderIdxs.map((idx) => wrongQuestions[idx]);

  const newAttempt = await prisma.companyTestAttempt.create({
    data: {
      managerId,
      companyId: req.companyId!,
      questions: snapshot as any,
      orderIdxs: orderIdxs as any,
      optionsOrder: optionsOrder as any,
    },
  });

  const questionsForClient = orderIdxs.map((qIdx, i) =>
    sanitizeForClient(wrongQuestions[qIdx], optionsOrder[i]),
  );

  success(res, {
    attemptId: newAttempt.id,
    passScore: PASS_SCORE,
    questions: questionsForClient,
    total: questionsForClient.length,
    isRetry: true,
  });
}

/**
 * GET /api/voice-exam/company-test/history
 * Manager — faqat o'zi; admin/ROP — kompaniya bo'yicha hammasi.
 */
export async function companyTestHistory(req: Request, res: Response): Promise<void> {
  const where: any = { companyId: req.companyId! };
  let canSeeAll = req.userRole === "company";
  if (!canSeeAll && req.managerId) {
    const me = await prisma.manager.findUnique({
      where: { id: req.managerId },
      select: { role: true },
    });
    if (me?.role === "rop") canSeeAll = true;
  }
  if (!canSeeAll) where.managerId = req.managerId!;

  const queryManagerId = (req.query.managerId as string) || undefined;
  if (queryManagerId) where.managerId = queryManagerId;

  const attempts = await prisma.companyTestAttempt.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: canSeeAll ? 200 : 50,
    select: {
      id: true,
      score: true,
      passed: true,
      startedAt: true,
      completedAt: true,
      manager: { select: { id: true, name: true, role: true } },
    },
  });
  success(res, attempts);
}

/**
 * GET /api/voice-exam/company-test/:id
 * Bitta urinish natijasini olish (xulosa ko'rish uchun).
 */
export async function getCompanyTestResult(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const attempt = await prisma.companyTestAttempt.findFirst({
    where: { id, companyId: req.companyId! },
    select: {
      id: true,
      score: true,
      passed: true,
      startedAt: true,
      completedAt: true,
      questions: true,
      perQuestion: true,
      answers: true,
      optionsOrder: true,
      managerId: true,
    },
  });
  if (!attempt) { error(res, "Urinish topilmadi", 404); return; }

  // Manager faqat o'z natijasini ko'ra oladi
  let canSee = req.userRole === "company";
  if (!canSee && req.managerId) {
    if (req.managerId === attempt.managerId) canSee = true;
    else {
      const me = await prisma.manager.findUnique({
        where: { id: req.managerId },
        select: { role: true },
      });
      if (me?.role === "rop") canSee = true;
    }
  }
  if (!canSee) { error(res, "Ruxsat yo'q", 403); return; }

  success(res, attempt);
}

/**
 * POST /api/voice-exam/company-test/admin/regenerate
 * Admin pool'ni qayta generatsiya qiladi (courseInfo o'zgartirilgandan keyin).
 */
export async function regenerateCompanyTestPool(req: Request, res: Response): Promise<void> {
  if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
  try {
    const result = await generateCompanyTestPool(req.companyId!);
    success(res, result);
  } catch (e: any) {
    error(res, e?.message || "Generatsiya xatosi");
  }
}

/**
 * GET /api/voice-exam/company-test/admin/pool
 * Admin pool'ni va meta'ni ko'radi.
 */
export async function getCompanyTestPool(req: Request, res: Response): Promise<void> {
  if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
  const company = await prisma.company.findUnique({
    where: { id: req.companyId! },
    select: { companyTestPool: true, companyTestPoolUpdatedAt: true },
  });
  const pool = (company?.companyTestPool as any[]) || [];
  success(res, {
    count: pool.length,
    updatedAt: company?.companyTestPoolUpdatedAt || null,
    questions: pool,
  });
}
