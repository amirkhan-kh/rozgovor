import { Request, Response } from "express";
import multer from "multer";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { extractTextFromBuffer } from "../services/extract-text";

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: {
        id: true,
        name: true,
        username: true,
        plan: true,
        totalLimitHours: true,
        telegramId: true,
        telegramEnabled: true,
        sendEachAnalysis: true,
        dailySummaryEnabled: true,
        excludedPipelines: true,
        courseInfo: true,
        createdAt: true,
      },
    });

    if (!company) {
      error(res, "Kompaniya topilmadi", 404);
      return;
    }

    // Bugungi foydalanish daqiqasi
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayAudioFiles = await prisma.audioFile.findMany({
      where: {
        companyId: req.companyId,
        createdAt: { gte: today },
      },
      select: { duration: true },
    });

    const usedSeconds = todayAudioFiles.reduce(
      (sum, f) => sum + (f.duration || 0),
      0
    );
    const usedMinutes = Math.round(usedSeconds / 60);

    // Menejerlar soni
    const managersCount = await prisma.manager.count({
      where: { companyId: req.companyId },
    });

    const activeManagers = await prisma.manager.count({
      where: { companyId: req.companyId, isActive: true },
    });

    // Voronkalar soni
    const voronkaResult = await prisma.audioFile.findMany({
      where: { companyId: req.companyId, pipelineName: { not: null } },
      select: { pipelineName: true },
      distinct: ["pipelineName"],
    });
    const voronkaCount = voronkaResult.length;

    // Umumiy audiolar va davomiyligi
    const allAudio = await prisma.audioFile.findMany({
      where: { companyId: req.companyId },
      select: { duration: true, status: true },
    });
    const totalAudioFiles = allAudio.length;
    const totalAudioDuration = allAudio.reduce((s, f) => s + (f.duration || 0), 0);

    // Tahlil qilingan audiolar
    const analyzedAudio = allAudio.filter((f) => f.status === "done");
    const analyzedAudioFiles = analyzedAudio.length;
    const analyzedAudioDuration = analyzedAudio.reduce((s, f) => s + (f.duration || 0), 0);

    // Manager bo'lsa o'z ma'lumotlarini ham qo'sh
    let managerProfile: any = null;
    if (req.managerId) {
      const mgr = await prisma.manager.findUnique({
        where: { id: req.managerId },
        select: { id: true, name: true, email: true, role: true, telegramId: true, photoUrl: true, customPhotoUrl: true },
      });
      const myAudios = await prisma.audioFile.count({ where: { managerId: req.managerId, status: "done" } });
      const myAnalysis = await prisma.audioFile.findMany({
        where: { managerId: req.managerId, status: "done" },
        include: { analysis: { select: { overallScore: true } } },
      });
      const scores = myAnalysis.map(a => a.analysis?.overallScore).filter((s): s is number => !!s);
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      managerProfile = { ...mgr, totalAudios: myAudios, avgScore };
    }

    success(res, {
      ...company,
      usedMinutesToday: usedMinutes,
      managersCount,
      activeManagers,
      inactiveManagers: managersCount - activeManagers,
      voronkaCount,
      totalAudioFiles,
      totalAudioDuration,
      analyzedAudioFiles,
      analyzedAudioDuration,
      managerProfile,
    });
  } catch (err) {
    console.error("Get profile error:", err);
    error(res, "Profil ma'lumotlarini olishda xatolik");
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, firstName, lastName, email, courseInfo } = req.body as {
      name?: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      courseInfo?: string;
    };

    // Manager — faqat o'z to'liq nomini yangilay oladi (Ism + Familya)
    if (req.userRole === "manager" && req.managerId) {
      const fullName = (() => {
        if (typeof name === "string" && name.trim()) return name.trim();
        const fn = (firstName || "").trim();
        const ln = (lastName || "").trim();
        const combined = `${fn} ${ln}`.trim().replace(/\s+/g, " ");
        return combined || null;
      })();

      if (!fullName) {
        error(res, "Ism va familya bo'sh bo'lmasligi kerak", 400);
        return;
      }

      const updated = await prisma.manager.update({
        where: { id: req.managerId },
        data: { name: fullName },
        select: { id: true, name: true, email: true, role: true },
      });
      success(res, updated);
      return;
    }

    // Company (admin) — kompaniya profilini yangilaydi
    const data: Record<string, unknown> = {};
    if (name) data.name = name;
    if (email) data.username = email;
    if (typeof courseInfo === "string") data.courseInfo = courseInfo;

    const updated = await prisma.company.update({
      where: { id: req.companyId },
      data,
      select: {
        id: true,
        name: true,
        username: true,
        plan: true,
        totalLimitHours: true,
        courseInfo: true,
        createdAt: true,
      },
    });

    success(res, updated);
  } catch (err) {
    console.error("Update profile error:", err);
    error(res, "Profilni yangilashda xatolik");
  }
};

export const updateNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const { telegramEnabled, sendEachAnalysis, dailySummaryEnabled } = req.body;

    const updated = await prisma.company.update({
      where: { id: req.companyId },
      data: {
        telegramEnabled,
        sendEachAnalysis,
        dailySummaryEnabled,
      },
      select: {
        telegramEnabled: true,
        sendEachAnalysis: true,
        dailySummaryEnabled: true,
      },
    });

    success(res, updated);
  } catch (err) {
    console.error("Update notifications error:", err);
    error(res, "Bildirishnomalarni yangilashda xatolik");
  }
};

/**
 * PUT /api/profile/bot-schedule
 * Admin: adminReportTime, work hours, includeSales/Leads/Audit, reportStyle (company default)
 * Manager: dailyReportTime, workStart/End, reportStyle (override), reportEnabled
 */
export const updateBotSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const isManager = req.userRole === "manager";
    if (isManager) {
      const {
        dailyReportTime,
        workStart,
        workEnd,
        reportEnabled,
        reportStyle,
      } = req.body || {};
      const updated = await prisma.manager.update({
        where: { id: req.managerId },
        data: {
          dailyReportTime: dailyReportTime ?? undefined,
          workStart: workStart ?? undefined,
          workEnd: workEnd ?? undefined,
          reportEnabled: typeof reportEnabled === "boolean" ? reportEnabled : undefined,
          reportStyle: reportStyle ?? undefined,
        },
        select: {
          dailyReportTime: true,
          workStart: true,
          workEnd: true,
          reportEnabled: true,
          reportStyle: true,
        },
      });
      success(res, updated);
      return;
    }

    const {
      adminReportTime,
      adminWorkStart,
      adminWorkEnd,
      reportIncludeSales,
      reportIncludeLeads,
      reportIncludeAudit,
      reportStyle,
      // Manager schedule defaults per-manager (admin set on behalf)
      managerSchedule, // { [managerId]: { dailyReportTime?, workStart?, workEnd?, reportStyle? } }
    } = req.body || {};

    const updated = await prisma.company.update({
      where: { id: req.companyId },
      data: {
        adminReportTime: adminReportTime ?? undefined,
        adminWorkStart: adminWorkStart ?? undefined,
        adminWorkEnd: adminWorkEnd ?? undefined,
        reportIncludeSales: typeof reportIncludeSales === "boolean" ? reportIncludeSales : undefined,
        reportIncludeLeads: typeof reportIncludeLeads === "boolean" ? reportIncludeLeads : undefined,
        reportIncludeAudit: typeof reportIncludeAudit === "boolean" ? reportIncludeAudit : undefined,
        reportStyle: reportStyle ?? undefined,
      },
      select: {
        adminReportTime: true,
        adminWorkStart: true,
        adminWorkEnd: true,
        reportIncludeSales: true,
        reportIncludeLeads: true,
        reportIncludeAudit: true,
        reportStyle: true,
      },
    });

    // Per-manager overrides
    if (managerSchedule && typeof managerSchedule === "object") {
      for (const [managerId, cfg] of Object.entries<any>(managerSchedule)) {
        try {
          await prisma.manager.update({
            where: { id: managerId },
            data: {
              dailyReportTime: cfg.dailyReportTime ?? undefined,
              workStart: cfg.workStart ?? undefined,
              workEnd: cfg.workEnd ?? undefined,
              reportStyle: cfg.reportStyle ?? undefined,
              reportEnabled:
                typeof cfg.reportEnabled === "boolean" ? cfg.reportEnabled : undefined,
            },
          });
        } catch {}
      }
    }

    success(res, updated);
  } catch (err) {
    console.error("Update bot schedule error:", err);
    error(res, "Bot jadvalini yangilashda xatolik");
  }
};

/**
 * GET /api/profile/bot-schedule
 * Manager bo'lsa o'z sozlamalari; admin bo'lsa company + barcha menejer ro'yxati.
 */
export const getBotSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const isManager = req.userRole === "manager";
    if (isManager) {
      const m = await prisma.manager.findUnique({
        where: { id: req.managerId },
        select: {
          dailyReportTime: true,
          workStart: true,
          workEnd: true,
          reportEnabled: true,
          reportStyle: true,
          company: {
            select: {
              adminReportTime: true,
              reportStyle: true,
            },
          },
        },
      });
      success(res, m);
      return;
    }

    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: {
        adminReportTime: true,
        adminWorkStart: true,
        adminWorkEnd: true,
        reportIncludeSales: true,
        reportIncludeLeads: true,
        reportIncludeAudit: true,
        reportStyle: true,
      },
    });
    const managers = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: {
        id: true,
        name: true,
        dailyReportTime: true,
        workStart: true,
        workEnd: true,
        reportEnabled: true,
        reportStyle: true,
        departmentId: true,
      },
      orderBy: { name: "asc" },
    });
    success(res, { company, managers });
  } catch (err) {
    error(res, (err as Error).message);
  }
};

export const connectTelegram = async (req: Request, res: Response): Promise<void> => {
  try {
    const botName = process.env.TELEGRAM_BOT_NAME || "salesai_bot";
    const deepLink = `https://t.me/${botName}?start=${req.companyId}`;

    success(res, { link: deepLink });
  } catch (err) {
    console.error("Connect telegram error:", err);
    error(res, "Telegram ulashda xatolik");
  }
};

export const updateExcludedPipelines = async (req: Request, res: Response): Promise<void> => {
  try {
    const { excludedPipelines } = req.body;

    if (!Array.isArray(excludedPipelines)) {
      error(res, "excludedPipelines array bo'lishi kerak", 400);
      return;
    }

    const updated = await prisma.company.update({
      where: { id: req.companyId },
      data: { excludedPipelines },
      select: { excludedPipelines: true },
    });

    // Excluded pipeline dagi isSale larni false qilish
    if (excludedPipelines.length > 0) {
      await prisma.audioFile.updateMany({
        where: { companyId: req.companyId!, isSale: true, pipelineName: { in: excludedPipelines } },
        data: { isSale: false },
      });
    }

    success(res, updated);
  } catch (err) {
    console.error("Update excluded pipelines error:", err);
    error(res, "Voronka sozlamalarini yangilashda xatolik");
  }
};

export const disconnectTelegram = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.company.update({
      where: { id: req.companyId },
      data: {
        telegramId: null,
        telegramEnabled: false,
      },
    });

    success(res, { message: "Telegram uzildi" });
  } catch (err) {
    console.error("Disconnect telegram error:", err);
    error(res, "Telegram uzishda xatolik");
  }
};

export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      error(res, "Parol kamida 4 ta belgidan iborat bo'lishi kerak", 400);
      return;
    }
    const bcrypt = require("bcryptjs");
    const hash = await bcrypt.hash(password, 10);

    if (req.userRole === "company") {
      await prisma.company.update({
        where: { id: req.companyId },
        data: { password: hash },
      });
    } else if (req.managerId) {
      await prisma.manager.update({
        where: { id: req.managerId },
        data: { password: hash },
      });
    }
    success(res, { ok: true });
  } catch (err) {
    console.error("Change password error:", err);
    error(res, "Parolni o'zgartirishda xatolik");
  }
};

// ===== Hujjatlar (RAG) =====

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "text/markdown": "md",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

export const uploadStorage = multer.memoryStorage();
export const uploadMiddleware = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
}).single("file");

export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    error(res, "Fayl topilmadi", 400);
    return;
  }

  const mimeType = req.file.mimetype;
  const filename = req.file.originalname || "";
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  let fileType = ALLOWED_MIME_TYPES[mimeType];
  if (!fileType && ext === "md") fileType = "md";
  if (!fileType && ext === "txt") fileType = "txt";
  if (!fileType && ext === "pptx") fileType = "pptx";

  if (!fileType) {
    error(res, "Qabul qilinmaydigan format (pdf, md, txt, pptx)", 400);
    return;
  }

  try {
    const content = await extractTextFromBuffer(req.file.buffer, fileType, filename);
    const doc = await prisma.companyDocument.create({
      data: {
        companyId: req.companyId!,
        filename: req.file.originalname,
        fileType,
        content,
        size: req.file.size,
      },
    });
    success(res, doc, 201);
  } catch (err) {
    console.error("Upload document error:", err);
    error(res, "Hujjat yuklashda xatolik");
  }
};

export const listDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const docs = await prisma.companyDocument.findMany({
      where: { companyId: req.companyId },
      select: { id: true, filename: true, fileType: true, size: true, createdAt: true, content: true },
      orderBy: { createdAt: "desc" },
    });
    success(res, docs);
  } catch (err) {
    console.error("List documents error:", err);
    error(res, "Hujjatlar ro'yxatini olishda xatolik");
  }
};

export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    await prisma.companyDocument.deleteMany({
      where: { id, companyId: req.companyId },
    });
    success(res, { deleted: true });
  } catch (err) {
    console.error("Delete document error:", err);
    error(res, "Hujjatni o'chirishda xatolik");
  }
};
