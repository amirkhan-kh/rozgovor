// Customer Development (Custdev) — controller
// MVP Group D (task 3): Custdev loyihalar, savollar, intervyular uchun REST endpointlar.
// Audio fayllar Yandex Storage'ga yuklanadi, AI pipeline background'da ishga tushiriladi.
import { Request, Response } from "express";
import * as path from "path";
import { custdevPrisma as prisma } from "../utils/custdev-prisma";
import { success, error } from "../utils/response";
import { uploadFile } from "../services/storage";
import { triggerProcessInterview } from "../services/custdev-processor";
import {
  runCustdevBatchAnalysis,
  isCustdevBatchRunning,
} from "../services/custdev-batch";

/**
 * Kompaniya ichidagi Custdev'ni topadi (companyId bo'yicha filter).
 */
async function findCustdevInCompany(
  companyId: string,
  id: string
): Promise<{ id: string; companyId: string } | null> {
  return prisma.custdev.findFirst({
    where: { id, companyId },
    select: { id: true, companyId: true },
  });
}

// ─── Custdev CRUD ────────────────────────────────────────────────────

/**
 * GET /api/custdev
 * Kompaniya ichidagi barcha Custdev'lar ro'yxati (kartalar uchun).
 */
export async function listCustdevs(req: Request, res: Response): Promise<void> {
  const companyId = req.companyId!;
  const items = await prisma.custdev.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      aiSummary: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { questions: true, interviews: true } },
    },
  });

  const list = items.map((c) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    aiSummary: c.aiSummary,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    questionCount: c._count.questions,
    interviewCount: c._count.interviews,
  }));

  success(res, list);
}

/**
 * POST /api/custdev
 * body: { title, description?, questions?: Array<string | {text: string, section?: string}> }
 */
export async function createCustdev(req: Request, res: Response): Promise<void> {
  const companyId = req.companyId!;
  const { title, description, questions } = req.body as {
    title?: string;
    description?: string;
    questions?: Array<string | { text: string; section?: string }>;
  };

  if (!title || !title.trim()) {
    error(res, "Sarlavha majburiy", 400);
    return;
  }

  const created = await prisma.custdev.create({
    data: {
      companyId,
      title: title.trim(),
      description: description?.trim() || null,
      questions:
        Array.isArray(questions) && questions.length > 0
          ? {
              create: questions
                .map((q, idx) => {
                  const text = typeof q === "string" ? q.trim() : (q.text || "").trim();
                  const section = typeof q === "object" ? (q.section?.trim() || null) : null;
                  return { text, section, sortOrder: idx };
                })
                .filter((q) => q.text.length > 0),
            }
          : undefined,
    },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
    },
  });

  success(res, created);
}

/**
 * GET /api/custdev/:id
 * Bitta Custdev detail — savollar va intervyular ro'yxati bilan.
 */
export async function getCustdev(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const companyId = req.companyId!;

  const custdev = await prisma.custdev.findFirst({
    where: { id, companyId },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      interviews: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          audioUrl: true,
          durationSec: true,
          status: true,
          aiSummary: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!custdev) {
    error(res, "Custdev topilmadi", 404);
    return;
  }

  success(res, custdev);
}

/**
 * PUT /api/custdev/:id
 * body: { title?, description? }
 */
export async function updateCustdev(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const companyId = req.companyId!;

  const existing = await findCustdevInCompany(companyId, id);
  if (!existing) {
    error(res, "Custdev topilmadi", 404);
    return;
  }

  const { title, description } = req.body as {
    title?: string;
    description?: string | null;
  };

  const data: { title?: string; description?: string | null } = {};
  if (typeof title === "string") {
    if (!title.trim()) {
      error(res, "Sarlavha bo'sh bo'lmasligi kerak", 400);
      return;
    }
    data.title = title.trim();
  }
  if (description !== undefined) {
    data.description =
      typeof description === "string" && description.trim()
        ? description.trim()
        : null;
  }

  const updated = await prisma.custdev.update({
    where: { id },
    data,
  });

  success(res, { id: updated.id });
}

/**
 * DELETE /api/custdev/:id
 * Custdev va ichidagi savollar/intervyular/javoblar kaskad bilan o'chadi.
 */
export async function deleteCustdev(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const companyId = req.companyId!;

  const existing = await findCustdevInCompany(companyId, id);
  if (!existing) {
    error(res, "Custdev topilmadi", 404);
    return;
  }

  await prisma.custdev.delete({ where: { id } });
  success(res, { deleted: true });
}

// ─── Savollar CRUD ───────────────────────────────────────────────────

/**
 * POST /api/custdev/:id/questions
 * body: { text, section? }
 */
export async function addQuestion(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const companyId = req.companyId!;

  const custdev = await findCustdevInCompany(companyId, id);
  if (!custdev) {
    error(res, "Custdev topilmadi", 404);
    return;
  }

  const { text, section } = req.body as { text?: string; section?: string };
  if (!text || !text.trim()) {
    error(res, "Savol matni majburiy", 400);
    return;
  }

  const last = await prisma.custdevQuestion.findFirst({
    where: { custdevId: id },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const created = await prisma.custdevQuestion.create({
    data: {
      custdevId: id,
      text: text.trim(),
      section: section?.trim() || null,
      sortOrder,
    },
  });

  success(res, created);
}

/**
 * PUT /api/custdev/:id/questions/reorder
 * body: { orderedIds: string[] }
 * Yangi tartib bo'yicha sortOrder larni yangilaydi.
 */
export async function reorderQuestions(
  req: Request,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const companyId = req.companyId!;

  const custdev = await findCustdevInCompany(companyId, id);
  if (!custdev) {
    error(res, "Custdev topilmadi", 404);
    return;
  }

  const { orderedIds } = req.body as { orderedIds?: string[] };
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    error(res, "orderedIds massivi bo'sh", 400);
    return;
  }

  // Savollar shu custdev'ga tegishli ekanligini tekshirish
  const existing = await prisma.custdevQuestion.findMany({
    where: { custdevId: id },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((q) => q.id));
  const providedSet = new Set(orderedIds);
  for (const qid of orderedIds) {
    if (!existingIds.has(qid)) {
      error(res, `Savol id noto'g'ri: ${qid}`, 400);
      return;
    }
  }
  if (providedSet.size !== existingIds.size) {
    error(res, "Barcha savollar ro'yxatda bo'lishi kerak", 400);
    return;
  }

  // Transactionda tartibni yangilaymiz
  await prisma.$transaction(
    orderedIds.map((qid, idx) =>
      prisma.custdevQuestion.update({
        where: { id: qid },
        data: { sortOrder: idx },
      })
    )
  );

  success(res, { reordered: orderedIds.length });
}

/**
 * PUT /api/custdev/questions/:qid
 * body: { text }
 */
export async function updateQuestion(
  req: Request,
  res: Response
): Promise<void> {
  const { qid } = req.params;
  const companyId = req.companyId!;

  const q = await prisma.custdevQuestion.findUnique({
    where: { id: qid },
    include: { custdev: { select: { companyId: true } } },
  });
  if (!q || q.custdev.companyId !== companyId) {
    error(res, "Savol topilmadi", 404);
    return;
  }

  const { text } = req.body as { text?: string };
  if (!text || !text.trim()) {
    error(res, "Savol matni majburiy", 400);
    return;
  }

  const updated = await prisma.custdevQuestion.update({
    where: { id: qid },
    data: { text: text.trim() },
  });

  success(res, updated);
}

/**
 * DELETE /api/custdev/questions/:qid
 */
export async function deleteQuestion(
  req: Request,
  res: Response
): Promise<void> {
  const { qid } = req.params;
  const companyId = req.companyId!;

  const q = await prisma.custdevQuestion.findUnique({
    where: { id: qid },
    include: { custdev: { select: { companyId: true } } },
  });
  if (!q || q.custdev.companyId !== companyId) {
    error(res, "Savol topilmadi", 404);
    return;
  }

  await prisma.custdevQuestion.delete({ where: { id: qid } });
  success(res, { deleted: true });
}

// ─── Intervyular ─────────────────────────────────────────────────────

/**
 * POST /api/custdev/:id/interviews
 * multipart/form-data: audio
 * Audio faylini Yandex Storage'ga yuklab, AI pipeline ni background'da ishga tushiradi.
 */
export async function uploadInterview(
  req: Request,
  res: Response
): Promise<void> {
  const { id } = req.params;
  const companyId = req.companyId!;

  const custdev = await findCustdevInCompany(companyId, id);
  if (!custdev) {
    error(res, "Custdev topilmadi", 404);
    return;
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !file.buffer || file.buffer.length === 0) {
    error(res, "Audio fayl yuborilmagan", 400);
    return;
  }

  // Kengaytma audio upload middleware'dan keladi (memory storage + audio/* MIME)
  const ext =
    path.extname(file.originalname || "").replace(/^\./, "").toLowerCase() || "mp3";

  const { url, key } = await uploadFile(
    file.buffer,
    companyId,
    file.mimetype || "audio/mpeg",
    ext
  );

  const interview = await prisma.custdevInterview.create({
    data: {
      custdevId: id,
      audioUrl: url,
      audioKey: key,
      status: "pending",
    },
  });

  // AI pipeline — background
  triggerProcessInterview(interview.id);

  success(res, {
    id: interview.id,
    audioUrl: interview.audioUrl,
    status: interview.status,
  });
}

/**
 * GET /api/custdev/interviews/:iid
 * Bitta intervyu detail — transkript, AI summary, savol-javoblar bilan.
 */
export async function getInterview(
  req: Request,
  res: Response
): Promise<void> {
  const { iid } = req.params;
  const companyId = req.companyId!;

  const iv = await prisma.custdevInterview.findUnique({
    where: { id: iid },
    include: {
      custdev: {
        select: {
          id: true,
          companyId: true,
          title: true,
          description: true,
          questions: { orderBy: { sortOrder: "asc" } },
        },
      },
      answers: true,
    },
  });

  if (!iv || iv.custdev.companyId !== companyId) {
    error(res, "Intervyu topilmadi", 404);
    return;
  }

  // Har savol uchun javobni mos keltirib qaytaramiz
  const answersByQ = new Map(iv.answers.map((a) => [a.questionId, a]));
  const questionWithAnswers = iv.custdev.questions.map((q) => ({
    id: q.id,
    text: q.text,
    sortOrder: q.sortOrder,
    answer: answersByQ.get(q.id) || null,
  }));

  success(res, {
    id: iv.id,
    custdevId: iv.custdevId,
    custdevTitle: iv.custdev.title,
    audioUrl: iv.audioUrl,
    durationSec: iv.durationSec,
    status: iv.status,
    transcription: iv.transcription,
    aiSummary: iv.aiSummary,
    errorMessage: iv.errorMessage,
    createdAt: iv.createdAt,
    updatedAt: iv.updatedAt,
    questions: questionWithAnswers,
  });
}

/**
 * POST /api/custdev/run-batch
 * Admin-only (userRole === "company"). Barcha PHASE 2'ga tayyor intervyularni
 * (status="processing" + transcription != null) Vertex AI batch prediction
 * orqali tahlil qiladi.
 *
 * Response tez qaytadi — batch fon rejimda ishlaydi (15-30 daqiqa).
 * Qayta chaqirilsa, agar batch allaqachon ishlayotgan bo'lsa — 409 qaytaradi.
 */
export async function runBatchAnalysis(
  req: Request,
  res: Response
): Promise<void> {
  if (req.userRole !== "company") {
    error(res, "Faqat admin uchun", 403);
    return;
  }
  if (isCustdevBatchRunning()) {
    error(res, "Batch allaqachon ishlamoqda", 409);
    return;
  }

  const companyId = req.companyId!;

  // Fon rejimda ishga tushirish
  setImmediate(() => {
    runCustdevBatchAnalysis({ companyId })
      .then((n) =>
        console.log(`[custdev-batch manual] ${companyId}: ${n} intervyu tahlil qilindi`)
      )
      .catch((err) =>
        console.error(`[custdev-batch manual] ${companyId} error:`, err)
      );
  });

  success(res, { triggered: true });
}

/**
 * DELETE /api/custdev/interviews/:iid
 */
export async function deleteInterview(
  req: Request,
  res: Response
): Promise<void> {
  const { iid } = req.params;
  const companyId = req.companyId!;

  const iv = await prisma.custdevInterview.findUnique({
    where: { id: iid },
    include: { custdev: { select: { companyId: true } } },
  });

  if (!iv || iv.custdev.companyId !== companyId) {
    error(res, "Intervyu topilmadi", 404);
    return;
  }

  await prisma.custdevInterview.delete({ where: { id: iid } });
  success(res, { deleted: true });
}
