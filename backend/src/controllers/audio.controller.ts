import { Request, Response } from "express";
import axios from "axios";
import { randomBytes } from "crypto";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { uploadFile, deleteFile, getKeyFromUrl, getFileBuffer } from "../services/storage";
import { processAudioFile } from "../services/processor";
import { chatAboutCall } from "../services/call-analyzer";
import { runBackfill, stopBackfill } from "../services/scheduler";
import {
  rejectionAnalysisSelect,
  getRejectionInfo,
  attachLeadCloseReasons,
} from "../utils/rejection-info";

export const getProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    // Faqat aktiv menejerlar + CRM synced fayllar (backfill bilan bir xil filtr)
    const activeManagers = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: { id: true },
    });
    const activeIds = activeManagers.map((m) => m.id);

    const counts = await prisma.audioFile.groupBy({
      by: ["status"],
      where: {
        companyId: req.companyId,
        managerId: { in: activeIds },
        crmLeadId: { not: null },
      },
      _count: true,
    });

    const result: Record<string, number> = { total: 0, done: 0, pending: 0, processing: 0, error: 0, no_conversation: 0 };
    for (const c of counts) {
      result[c.status] = c._count;
      result.total += c._count;
    }

    const analyzable = result.done + result.pending + result.processing + result.error;
    const analyzed = result.done;
    const percent = analyzable > 0 ? Math.round((analyzed / analyzable) * 100) : 100;

    success(res, { ...result, analyzed, percent });
  } catch (err) {
    console.error("Progress error:", err);
    error(res, "Progress olishda xatolik");
  }
};

export const upload_audio = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      error(res, "Audio fayl yuklanmadi", 400);
      return;
    }

    const { managerId, phoneNumber, category } = req.body;

    // S3 ga yuklash
    const { url, key } = await uploadFile(
      req.file.buffer,
      req.companyId!,
      req.file.mimetype,
      req.file.originalname.split(".").pop() || "mp3"
    );

    // AudioFile yaratish
    const audioFile = await prisma.audioFile.create({
      data: {
        fileName: req.file.originalname,
        fileUrl: url,
        managerId: managerId || null,
        companyId: req.companyId!,
        phoneNumber: phoneNumber || null,
        category: category || "sotuv",
        status: "pending",
      },
    });

    // Auto-process qilinmaydi — foydalanuvchi tanlaydi yoki scheduler ishlatadi
    success(res, audioFile, 201);
  } catch (err) {
    console.error("Upload audio error:", err);
    error(res, "Audio yuklashda xatolik");
  }
};

export const getAll = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const { managerId, managerIds, category, status, period, search, showNoConversation } = req.query;
    const rejectionReason = req.query.rejectionReason as string | undefined;

    // Faqat faol menejerlar
    const activeManagers = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: { id: true },
    });

    const where: Record<string, unknown> = {
      companyId: req.companyId,
      managerId: { in: activeManagers.map((m) => m.id) },
    };

    // Manager faqat o'z audiosini ko'radi
    if (req.userRole === "manager" && req.managerId) {
      const mgr = await prisma.manager.findUnique({ where: { id: req.managerId }, select: { canViewAll: true } });
      if (!mgr?.canViewAll) {
        where.managerId = req.managerId;
      }
    }

    if (managerId) {
      where.managerId = managerId;
    } else if (typeof managerIds === "string" && managerIds.trim()) {
      const ids = managerIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length > 0) where.managerId = { in: ids };
    }
    // category filter: "sotuv" = 1-qo'ng'iroq (leadId/telefon bo'yicha birinchi), "qayta" = takroriy
    // leadId yoki telefon raqam bo'yicha — AI tahlilidan ishonchliroq
    let leadIdFilter: { first?: boolean; repeat?: boolean } = {};
    if (category === "sotuv" || category === "1-qo'ng'iroq") {
      leadIdFilter = { first: true };
    } else if (category === "qayta") {
      leadIdFilter = { repeat: true };
    } else if (category) {
      where.category = category;
    }
    if (status === "done") {
      // Tugagan: status=done VA tahlil bor VA score>0
      where.status = "done";
      where.analysis = { overallScore: { gt: 0 } };
    } else if (status === "incomplete") {
      // Tugamagan: status biron joyda VA (tahlil yo'q YOKI score=0)
      where.status = { in: ["done", "pending", "processing", "error"] };
      where.OR = [
        { analysis: null },
        { analysis: { overallScore: { lte: 0 } } },
      ];
    } else if (status) {
      where.status = status;
    } else if (showNoConversation !== "true") {
      where.status = { notIn: ["no_conversation", "disconnected", "transferred", "too_short", "no_audio"] };
    }

    if (period && period !== "all") {
      const now = new Date();
      const dateFromParam = req.query.dateFrom as string | undefined;
      const dateToParam = req.query.dateTo as string | undefined;
      let range: Record<string, Date> | undefined;

      if (period === "custom") {
        const r: Record<string, Date> = {};
        if (dateFromParam) r.gte = new Date(dateFromParam);
        if (dateToParam) {
          const end = new Date(dateToParam);
          end.setHours(23, 59, 59, 999);
          r.lte = end;
        }
        if (Object.keys(r).length > 0) range = r;
      } else {
        const start = new Date();
        switch (period) {
          case "today":
            start.setHours(0, 0, 0, 0);
            range = { gte: start };
            break;
          case "yesterday": {
            start.setDate(now.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            const end = new Date();
            end.setHours(0, 0, 0, 0);
            range = { gte: start, lt: end };
            break;
          }
          case "week": {
            // "Bu hafta" = Bitrix "Последние 7 дней": today-7 dan bugungacha.
            start.setDate(start.getDate() - 7);
            start.setHours(0, 0, 0, 0);
            range = { gte: start };
            break;
          }
          case "month":
            start.setMonth(now.getMonth() - 1);
            range = { gte: start };
            break;
          case "quarter":
            start.setMonth(now.getMonth() - 3);
            range = { gte: start };
            break;
          case "year":
            range = { gte: new Date(now.getFullYear(), 0, 1) };
            break;
        }
      }

      // Davr filtri HAQIQIY qo'ng'iroq vaqti (callDate) bo'yicha — sync vaqti
      // (createdAt) emas. search uchun where.OR band bo'lishi mumkin → where.AND
      // ichida OR ishlatamiz (clobber bo'lmasligi uchun). Manual upload (callDate
      // yo'q) uchun createdAt'ga qaytamiz.
      if (range) {
        const dateOr = [
          { callDate: range },
          { callDate: null, createdAt: range },
        ];
        where.AND = Array.isArray(where.AND)
          ? [...(where.AND as unknown[]), { OR: dateOr }]
          : [{ OR: dateOr }];
      }
    }

    const pipeline = req.query.pipeline as string;
    if (pipeline) where.pipelineName = pipeline;

    const isSale = req.query.isSale as string;
    if (isSale === "true") where.isSale = true;
    if (isSale === "false") where.isSale = false;

    const minDurationSec = req.query.minDurationSec as string;
    if (minDurationSec) {
      const sec = parseInt(minDurationSec, 10);
      if (!isNaN(sec) && sec > 0) where.duration = { gte: sec };
    }

    if (search) {
      where.OR = [
        { fileName: { contains: search as string, mode: "insensitive" } },
        { phoneNumber: { contains: search as string } },
        { manager: { name: { contains: search as string, mode: "insensitive" } } },
      ];
    }

    // leadId yoki telefon bo'yicha 1-qo'ng'iroq / qayta filter
    if (leadIdFilter.first || leadIdFilter.repeat) {
      const candidates = await prisma.audioFile.findMany({
        where,
        select: { id: true, leadId: true, phoneNumber: true, createdAt: true },
      });
      const keyFor = (a: { leadId: number | null; phoneNumber: string | null }): string | null => {
        if (a.leadId != null) return `L:${a.leadId}`;
        if (a.phoneNumber) return `P:${a.phoneNumber}`;
        return null;
      };
      const firstPerKey = new Map<string, { id: string; at: Date }>();
      const keyedAudios: { id: string; key: string }[] = [];
      for (const a of candidates) {
        const k = keyFor(a);
        if (!k) continue;
        keyedAudios.push({ id: a.id, key: k });
        const prev = firstPerKey.get(k);
        if (!prev || a.createdAt < prev.at) firstPerKey.set(k, { id: a.id, at: a.createdAt });
      }
      const firstIds = new Set<string>();
      for (const v of firstPerKey.values()) firstIds.add(v.id);
      if (leadIdFilter.first) {
        where.id = { in: Array.from(firstIds) };
      } else {
        const repeatIds = keyedAudios.filter((a) => !firstIds.has(a.id)).map((a) => a.id);
        where.id = { in: repeatIds };
      }
    }

    // ── 🚩 "Yo'qotilgan lidlar" filtri branchi ──────────────────────────────
    // closeReasonName belgilangan lidlarni JS'da filtrlab, sahifani majburan kesamiz
    // (Prisma where bilan query-time SalesLead join'ni ifodalab bo'lmaydi).
    // ⚠️ category leadIdFilter (where.id) allaqachon qo'yilgan bo'lsa, candidate'lar
    // shu `where`'dan olinadi — tartib saqlanadi.
    let forcedPageIds: string[] | null = null;
    let forcedTotal: number | null = null;
    if (rejectionReason) {
      const candidates = await prisma.audioFile.findMany({
        where,
        select: {
          id: true, leadId: true, crmLeadId: true, phoneNumber: true, isSale: true,
          statusName: true, pipelineName: true, createdAt: true,
          analysis: { select: rejectionAnalysisSelect },
        },
      });
      const withReasons = await attachLeadCloseReasons(req.companyId!, candidates);
      const rejectionPipeline = req.query.pipeline ? String(req.query.pipeline).trim() : "";
      const rejectedIds = withReasons
        .filter((a: any) => !rejectionPipeline || a.pipelineName === rejectionPipeline)
        .filter((a: any) => {
          const info = getRejectionInfo(a.analysis, a);
          if (!info) return false;
          return rejectionReason === "all" || info.type === rejectionReason;
        })
        .sort((a: any, b: any) => {
          const cd = new Date(b.leadClosedAt || 0).getTime() - new Date(a.leadClosedAt || 0).getTime();
          if (cd !== 0) return cd;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        })
        .map((a: any) => a.id);
      forcedTotal = rejectedIds.length;
      forcedPageIds = rejectedIds.slice(skip, skip + limit);
      where.id = { in: forcedPageIds };
    }

    const [audioFiles, total] = await Promise.all([
      prisma.audioFile.findMany({
        where,
        include: {
          manager: { select: { id: true, name: true } },
          analysis: {
            select: {
              overallScore: true, leadQuality: true, leadScore: true, errors: true, criteria: true,
              summary: true, objections: true, lossPoints: true,
              followupReason: true, followupPhrase: true, voiceOfCustomer: true, judgeReason: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: forcedPageIds ? undefined : skip,
        take: forcedPageIds ? undefined : limit,
      }),
      forcedTotal != null ? Promise.resolve(forcedTotal) : prisma.audioFile.count({ where }),
    ]);

    // Har bir qatorga lead close reason + rejectionInfo biriktirish
    const audioFilesWithReasons = await attachLeadCloseReasons(req.companyId!, audioFiles);
    const orderedIds = forcedPageIds ? new Map(forcedPageIds.map((id, i) => [id, i])) : null;
    const enriched = audioFilesWithReasons
      .map((audio: any) => ({
        ...audio,
        analysis: audio.analysis
          ? { ...audio.analysis, rejectionInfo: getRejectionInfo(audio.analysis, audio) }
          : audio.analysis,
      }))
      .sort((a: any, b: any) =>
        orderedIds ? (orderedIds.get(a.id) ?? 0) - (orderedIds.get(b.id) ?? 0) : 0
      );

    success(res, {
      data: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("Get audio files error:", err);
    error(res, "Audio fayllarni olishda xatolik");
  }
};

export const getOne = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const audioFile = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
      include: {
        manager: true,
        analysis: true,
      },
    });

    if (!audioFile) {
      error(res, "Audio fayl topilmadi", 404);
      return;
    }

    const [audioWithReason] = await attachLeadCloseReasons(req.companyId!, [audioFile]);
    const enriched = {
      ...audioWithReason,
      analysis: (audioWithReason as any).analysis
        ? {
            ...(audioWithReason as any).analysis,
            rejectionInfo: getRejectionInfo((audioWithReason as any).analysis, audioWithReason),
          }
        : (audioWithReason as any).analysis,
    };
    success(res, enriched);
  } catch (err) {
    console.error("Get audio file error:", err);
    error(res, "Audio faylni olishda xatolik");
  }
};

export const getTranscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const audioFile = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
      select: { transcription: true, fileName: true },
    });

    if (!audioFile) {
      error(res, "Audio fayl topilmadi", 404);
      return;
    }

    success(res, {
      transcription: audioFile.transcription,
      fileName: audioFile.fileName,
    });
  } catch (err) {
    console.error("Get transcription error:", err);
    error(res, "Transkripsiyani olishda xatolik");
  }
};

export const updateTranscription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { transcription } = req.body;

    if (!transcription) {
      error(res, "Transkripsiya matni kerak", 400);
      return;
    }

    const audioFile = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!audioFile) {
      error(res, "Audio fayl topilmadi", 404);
      return;
    }

    await prisma.audioFile.update({
      where: { id },
      data: { transcription },
    });

    success(res, { message: "Transkripsiya yangilandi" });
  } catch (err) {
    console.error("Update transcription error:", err);
    error(res, "Transkripsiyani yangilashda xatolik");
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const audioFile = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!audioFile) {
      error(res, "Audio fayl topilmadi", 404);
      return;
    }

    // S3 dan o'chirish
    try {
      const key = getKeyFromUrl(audioFile.fileUrl);
      await deleteFile(key);
    } catch (s3Err) {
      console.error("S3 delete error:", s3Err);
    }

    // Analysis o'chirish
    await prisma.analysis.deleteMany({ where: { audioFileId: id } });
    // AudioFile o'chirish
    await prisma.audioFile.delete({ where: { id } });

    success(res, { message: "Audio fayl o'chirildi" });
  } catch (err) {
    console.error("Delete audio file error:", err);
    error(res, "Audio faylni o'chirishda xatolik");
  }
};

export const chat = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { message, chatHistory } = req.body;

    if (!message) {
      error(res, "Xabar kiritilishi shart", 400);
      return;
    }

    const audioFile = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
      include: {
        analysis: true,
        manager: { select: { name: true } },
        company: { select: { courseInfo: true, topPerformerPlaybook: true } },
      },
    });

    if (!audioFile) {
      error(res, "Audio fayl topilmadi", 404);
      return;
    }

    const response = await chatAboutCall(
      {
        transcription: audioFile.transcription || "",
        analysis: audioFile.analysis as any,
        managerName: audioFile.manager?.name,
        clientPhone: audioFile.phoneNumber || undefined,
        callDate: audioFile.callDate?.toISOString() || audioFile.createdAt.toISOString(),
        isSale: audioFile.isSale || false,
        category: audioFile.category || "sotuv",
        courseInfo: audioFile.company.courseInfo || undefined,
        topPerformerPlaybook: audioFile.company.topPerformerPlaybook as any,
      },
      chatHistory || [],
      message
    );

    success(res, { response });
  } catch (err) {
    console.error("Chat error:", err);
    error(res, "AI chat xatolik yuz berdi");
  }
};

// Global tahlil lock — bir vaqtda faqat bitta tahlil
const analysisLock = new Set<string>();

export const analyzeOne = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const audioFile = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
    });

    if (!audioFile) {
      error(res, "Audio fayl topilmadi", 404);
      return;
    }

    // Manager faqat o'z audiosini tahlil qila oladi
    if (req.userRole === "manager" && req.managerId && audioFile.managerId !== req.managerId) {
      error(res, "Siz faqat o'z audiolaringizni tahlil qila olasiz", 403);
      return;
    }

    if (audioFile.status === "processing") {
      error(res, "Audio allaqachon tahlil qilinmoqda", 400);
      return;
    }

    if (audioFile.status === "done") {
      error(res, "Audio allaqachon tahlil qilingan", 400);
      return;
    }

    // Bir vaqtda tahlil oldini olish
    if (analysisLock.has(audioFile.id)) {
      error(res, "Bu audio hozir tahlil qilinmoqda, kuting", 409);
      return;
    }

    analysisLock.add(audioFile.id);
    processAudioFile(audioFile.id)
      .catch((err) => console.error("Analyze error:", err))
      .finally(() => analysisLock.delete(audioFile.id));

    success(res, { message: "Tahlil boshlandi", id: audioFile.id });
  } catch (err) {
    console.error("Analyze one error:", err);
    error(res, "Tahlil qilishda xatolik");
  }
};

export const analyzeBulk = async (req: Request, res: Response): Promise<void> => {
  try {
    // Faqat admin (company login) bulk tahlil qila oladi
    if (req.userRole !== "company") {
      error(res, "Faqat admin bulk tahlil qila oladi", 403);
      return;
    }

    const { ids } = req.body as { ids: string[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      error(res, "Audio fayl ID lari kerak", 400);
      return;
    }

    const audioFiles = await prisma.audioFile.findMany({
      where: {
        id: { in: ids },
        companyId: req.companyId,
        status: { in: ["pending", "error"] },
      },
    });

    if (audioFiles.length === 0) {
      error(res, "Tahlil qilinadigan audio fayllar topilmadi", 400);
      return;
    }

    // Allaqachon tahlilda bo'lganlarni filter
    const toProcess = audioFiles.filter((f) => !analysisLock.has(f.id));
    if (toProcess.length === 0) {
      error(res, "Barcha audiolar hozir tahlil qilinmoqda", 409);
      return;
    }

    // Lock qo'yish
    for (const f of toProcess) analysisLock.add(f.id);

    const BATCH_SIZE = 10;
    const processBatches = async () => {
      for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const batch = toProcess.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((file) => processAudioFile(file.id))
        );
        for (const r of results) {
          if (r.status === "rejected") {
            console.error("Bulk analyze batch error:", r.reason);
          }
        }
      }
      // Lock tozalash
      for (const f of toProcess) analysisLock.delete(f.id);
    };
    processBatches().catch((err) => {
      console.error("Bulk analyze error:", err);
      for (const f of toProcess) analysisLock.delete(f.id);
    });

    success(res, {
      message: `${audioFiles.length} ta audio tahlil boshlandi (${BATCH_SIZE} tadan parallel)`,
      count: audioFiles.length,
      ids: audioFiles.map((f) => f.id),
    });
  } catch (err) {
    console.error("Bulk analyze error:", err);
    error(res, "Bulk tahlil qilishda xatolik");
  }
};

export const backfill = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.userRole !== "company") {
      error(res, "Faqat admin backfill qila oladi", 403);
      return;
    }
    runBackfill(req.companyId!).catch((err) => console.error("Backfill error:", err));
    success(res, { message: "Tahlil boshlandi" });
  } catch (err) {
    console.error("Backfill error:", err);
    error(res, "Backfill xatolik yuz berdi");
  }
};

// Batch pipeline: Yandex STT + Gemini Flash diarization batch + Gemini Pro analysis batch
export const batchStart = async (req: Request, res: Response): Promise<void> => {
  try {
    // ?limit=10 — faqat eng davomli N ta auditorni tahlil qiladi
    const limitRaw = req.query.limit as string | undefined;
    const limit = limitRaw ? Math.max(1, parseInt(limitRaw, 10)) : undefined;
    const { runBatchBackfill } = await import("../services/batch-backfill");
    runBatchBackfill(req.companyId!, limit ? { limit } : {}).catch((err) =>
      console.error("Batch error:", err)
    );
    success(res, {
      message: limit
        ? `Batch tahlil boshlandi (${limit} ta audio)`
        : "Batch tahlil boshlandi",
    });
  } catch (err) {
    console.error("Batch error:", err);
    error(res, "Batch xatolik");
  }
};

export const batchProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { getBatchProgress } = await import("../services/batch-backfill");
    const p = getBatchProgress(req.companyId!);
    success(res, p);
  } catch (err) {
    error(res, "Progress olishda xatolik");
  }
};

export const batchStop = async (req: Request, res: Response): Promise<void> => {
  try {
    const { stopBatchBackfill } = await import("../services/batch-backfill");
    stopBatchBackfill(req.companyId!);
    success(res, { message: "Batch to'xtatildi" });
  } catch (err) {
    console.error("Batch stop error:", err);
    error(res, "To'xtatishda xatolik");
  }
};

export const stopAnalysis = async (req: Request, res: Response): Promise<void> => {
  try {
    stopBackfill(req.companyId!);
    // Processing dagi fayllarni pending ga qaytarish
    await prisma.audioFile.updateMany({
      where: { companyId: req.companyId, status: "processing" },
      data: { status: "pending" },
    });
    success(res, { message: "Tahlil to'xtatildi" });
  } catch (err) {
    console.error("Stop analysis error:", err);
    error(res, "To'xtatishda xatolik");
  }
};

// HTTP Range request'larini to'g'ri qayta ishlash — seek (audio skip) uchun zarur
const sendBufferWithRange = (
  req: Request,
  res: Response,
  buffer: Buffer,
  contentType: string
): void => {
  const range = req.headers.range;
  const total = buffer.length;

  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=86400");

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? parseInt(match[2], 10) : total - 1;
      if (start >= 0 && end < total && start <= end) {
        const chunk = buffer.subarray(start, end + 1);
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
        res.setHeader("Content-Length", chunk.length);
        res.end(chunk);
        return;
      }
      res.status(416);
      res.setHeader("Content-Range", `bytes */${total}`);
      res.end();
      return;
    }
  }

  res.setHeader("Content-Length", total);
  res.end(buffer);
};

export const stream = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const audioFile = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
      select: { fileUrl: true },
    });

    if (!audioFile) {
      error(res, "Audio fayl topilmadi", 404);
      return;
    }

    // Bitrix/tashqi audio URL'lar uchun (api2.onlinepbx.ru, va h.k.) —
    // proxy orqali yuklab klientga stream qilamiz. S3 key emas.
    const isExternalUrl =
      /^https?:\/\//.test(audioFile.fileUrl) &&
      !audioFile.fileUrl.includes("yandexcloud.net");

    if (isExternalUrl) {
      const upstream = await axios.get(audioFile.fileUrl, {
        responseType: "arraybuffer",
        timeout: 60000,
        validateStatus: () => true,
      });
      if (upstream.status >= 400) {
        error(res, `Audio yuklanmadi (${upstream.status})`, 502);
        return;
      }
      const buffer = Buffer.from(upstream.data);
      const contentType = upstream.headers["content-type"] || "audio/mpeg";
      sendBufferWithRange(req, res, buffer, contentType);
      return;
    }

    // S3 (Yandex / Wasabi) dagi audiolar
    const key = getKeyFromUrl(audioFile.fileUrl);
    const buffer = await getFileBuffer(key);
    sendBufferWithRange(req, res, buffer, "audio/mpeg");
  } catch (err) {
    console.error("Stream audio error:", err);
    error(res, "Audio stream xatolik");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sud Agent override — admin/ROP Sud qarorini qo'lda bekor qilishi
// ─────────────────────────────────────────────────────────────────────────────
export const overrideJudge = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { skipped } = req.body as { skipped?: boolean };

    // Faqat admin (company) yoki role="rop" ruxsat etiladi
    if (req.userRole !== "company") {
      if (!req.managerId) {
        error(res, "Ruxsat yo'q", 403);
        return;
      }
      const me = await prisma.manager.findUnique({
        where: { id: req.managerId },
        select: { role: true, companyId: true },
      });
      if (!me || me.role !== "rop") {
        error(res, "Faqat admin yoki ROP Sud qarorini o'zgartira oladi", 403);
        return;
      }
    }

    const audio = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
      include: { analysis: true },
    });
    if (!audio || !audio.analysis) {
      error(res, "Audio yoki tahlil topilmadi", 404);
      return;
    }
    const existingAnalysis = audio.analysis as any;

    const newSkipped =
      typeof skipped === "boolean" ? skipped : !existingAnalysis.judgeSkipped;
    const updated = await prisma.analysis.update({
      where: { id: audio.analysis.id },
      data: {
        judgeSkipped: newSkipped,
        judgeOverridden: true,
        judgeReason: newSkipped
          ? `${existingAnalysis.judgeReason || "Sud Agent"} (admin qo'lda qo'yilgan)`
          : "Admin qo'lda bekor qildi — tahlil menejer reytingiga kiritildi",
      } as any,
      select: { judgeSkipped: true, judgeReason: true, judgeOverridden: true } as any,
    });

    success(res, updated);
  } catch (err) {
    console.error("Override judge error:", err);
    error(res, "Sud qarorini yangilashda xatolik");
  }
};

// ─── Public share ───────────────────────────────────────────────────
// POST /api/audio/:id/share — token yaratadi yoki mavjudini qaytaradi
export const createShareLink = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const audio = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
      select: { id: true, shareToken: true },
    });
    if (!audio) {
      error(res, "Audio topilmadi", 404);
      return;
    }
    let token = audio.shareToken;
    if (!token) {
      token = randomBytes(16).toString("hex");
      await prisma.audioFile.update({
        where: { id },
        data: { shareToken: token, sharedAt: new Date() },
      });
    }
    success(res, { token });
  } catch (err) {
    console.error("Share audio error:", err);
    error(res, "Ulashish linkini yaratishda xatolik");
  }
};

// DELETE /api/audio/:id/share — tokenni olib tashlaydi (ulashishni bekor qiladi)
export const revokeShareLink = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const audio = await prisma.audioFile.findFirst({
      where: { id, companyId: req.companyId },
      select: { id: true },
    });
    if (!audio) {
      error(res, "Audio topilmadi", 404);
      return;
    }
    await prisma.audioFile.update({
      where: { id },
      data: { shareToken: null, sharedAt: null },
    });
    success(res, { revoked: true });
  } catch (err) {
    console.error("Revoke share error:", err);
    error(res, "Ulashishni bekor qilishda xatolik");
  }
};

// GET /api/public/audio/:token — PUBLIC (auth middlewareSIZ)
export const getSharedAudio = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token } = req.params;
    if (!token || token.length < 16) {
      error(res, "Noto'g'ri link", 400);
      return;
    }
    const audio = await prisma.audioFile.findFirst({
      where: { shareToken: token },
      include: {
        manager: { select: { id: true, name: true, photoUrl: true, customPhotoUrl: true, role: true } },
        analysis: true,
        company: { select: { name: true } },
      },
    });
    if (!audio) {
      error(res, "Ulashilgan audio topilmadi yoki bekor qilingan", 404);
      return;
    }
    // Sensitive fieldlarni olib tashlash
    const { companyId: _cid, ...publicAudio } = audio;
    success(res, publicAudio);
  } catch (err) {
    console.error("Get shared audio error:", err);
    error(res, "Ulashilgan audio olinmadi");
  }
};

// GET /api/public/audio/:token/stream — PUBLIC audio streaming
export const streamSharedAudio = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token } = req.params;
    const audio = await prisma.audioFile.findFirst({
      where: { shareToken: token },
      select: { fileUrl: true },
    });
    if (!audio) {
      error(res, "Audio topilmadi", 404);
      return;
    }
    // Tashqi URL (Bitrix/onlinepbx) bo'lsa proxy orqali oqitamiz
    const isExternalUrl =
      /^https?:\/\//.test(audio.fileUrl) &&
      !audio.fileUrl.includes("yandexcloud.net");
    if (isExternalUrl) {
      const upstream = await axios.get(audio.fileUrl, {
        responseType: "stream",
        timeout: 180000,
        validateStatus: () => true,
      });
      if (upstream.status >= 400) {
        error(res, `Audio yuklanmadi (${upstream.status})`, 502);
        return;
      }
      res.setHeader("Content-Type", "audio/mpeg");
      upstream.data.pipe(res);
      return;
    }
    // S3'dan
    const key = getKeyFromUrl(audio.fileUrl);
    const buffer = await getFileBuffer(key);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", String(buffer.length));
    res.send(buffer);
  } catch (err) {
    console.error("Stream shared audio error:", err);
    error(res, "Audio oqishida xatolik");
  }
};
