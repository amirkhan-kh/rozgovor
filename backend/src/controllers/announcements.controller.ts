import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { sendAnnouncement } from "../services/telegram";
import { VertexAI } from "@google-cloud/vertexai";

const VERTEX_PROJECT = process.env.VERTEX_PROJECT || "big-quanta-469517-h6";
const VERTEX_LOCATION = process.env.VERTEX_LOCATION || "us-central1";

/**
 * POST /api/announcements
 * Body: { kind, targetType: "manager"|"department"|"all", targetId?, title?, body, isAI? }
 * Admin yoki ROP yuboradi. Telegram + saytda ko'rinadi.
 */
export const createAnnouncement = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const {
      kind = "announcement",
      targetType,
      targetId,
      title,
      body,
      isAI = false,
    } = req.body || {};

    if (!body || typeof body !== "string") {
      error(res, "Habar matni bo'sh", 400);
      return;
    }
    if (!["manager", "department", "all"].includes(targetType)) {
      error(res, "targetType noto'g'ri", 400);
      return;
    }
    if ((targetType === "manager" || targetType === "department") && !targetId) {
      error(res, "targetId kerak", 400);
      return;
    }

    // Resolve recipients
    let recipientIds: string[] = [];
    if (targetType === "all") {
      const all = await prisma.manager.findMany({
        where: { companyId, isActive: true },
        select: { id: true },
      });
      recipientIds = all.map((m) => m.id);
    } else if (targetType === "department") {
      const inDept = await prisma.manager.findMany({
        where: { companyId, isActive: true, departmentId: targetId },
        select: { id: true },
      });
      recipientIds = inDept.map((m) => m.id);
    } else {
      recipientIds = [targetId];
    }

    const ann = await prisma.announcement.create({
      data: {
        companyId,
        kind,
        targetType,
        targetId: targetType === "all" ? null : targetId,
        title: title || null,
        body,
        recipientIds,
        isAI,
        createdById: req.companyId || req.managerId || null,
        createdByRole: req.userRole || "company",
      },
    });

    // Pre-create read receipts
    if (recipientIds.length > 0) {
      await prisma.announcementRead.createMany({
        data: recipientIds.map((mid) => ({ announcementId: ann.id, managerId: mid })),
        skipDuplicates: true,
      });
    }

    // Telegram parallel send (best-effort)
    (async () => {
      try {
        const targets = await prisma.manager.findMany({
          where: { id: { in: recipientIds }, telegramId: { not: null } },
          select: { telegramId: true },
        });
        for (const t of targets) {
          if (!t.telegramId) continue;
          await sendAnnouncement(t.telegramId, body, { title, kind });
        }
        await prisma.announcement.update({
          where: { id: ann.id },
          data: { sentToTelegram: true },
        });
      } catch (err) {
        console.error("[announcements] telegram send error:", (err as Error).message);
      }
    })();

    success(res, { id: ann.id, recipients: recipientIds.length });
  } catch (err) {
    console.error("[announcements] create error:", err);
    error(res, (err as Error).message);
  }
};

/**
 * GET /api/announcements
 * Admin: o'z kompaniyasidagi barcha announcements
 * Manager: o'ziga yuborilganlar (recipientIds da bor)
 */
export const listAnnouncements = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const isManager = req.userRole === "manager";

    if (isManager) {
      const items = await prisma.announcement.findMany({
        where: {
          companyId,
          recipientIds: { has: req.managerId! },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      // Attach my read state
      const reads = await prisma.announcementRead.findMany({
        where: {
          managerId: req.managerId!,
          announcementId: { in: items.map((i) => i.id) },
        },
      });
      const readMap = new Map(reads.map((r) => [r.announcementId, r]));
      success(
        res,
        items.map((it) => ({
          ...it,
          read: !!readMap.get(it.id)?.readAt,
          shown: !!readMap.get(it.id)?.shownAt,
        })),
      );
      return;
    }

    const items = await prisma.announcement.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    success(res, items);
  } catch (err) {
    error(res, (err as Error).message);
  }
};

/**
 * GET /api/announcements/unread
 * Manager uchun — saytda katta ekran modal sifatida ko'rsatish kerak bo'lganlar.
 * Hali shownAt = null bo'lgan birinchi habarni qaytaradi.
 */
export const getUnshown = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.userRole !== "manager" || !req.managerId) {
      success(res, null);
      return;
    }
    const read = await prisma.announcementRead.findFirst({
      where: { managerId: req.managerId, shownAt: null },
      orderBy: { createdAt: "asc" },
      include: { announcement: true },
    });
    success(res, read?.announcement || null);
  } catch (err) {
    error(res, (err as Error).message);
  }
};

/**
 * POST /api/announcements/:id/shown
 * Saytda katta ekran modal ko'rinib bo'ldi.
 */
export const markShown = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.managerId) {
      success(res, null);
      return;
    }
    await prisma.announcementRead.updateMany({
      where: { managerId: req.managerId, announcementId: req.params.id },
      data: { shownAt: new Date() },
    });
    success(res, { ok: true });
  } catch (err) {
    error(res, (err as Error).message);
  }
};

/**
 * POST /api/announcements/:id/read
 */
export const markRead = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.managerId) {
      success(res, null);
      return;
    }
    await prisma.announcementRead.updateMany({
      where: { managerId: req.managerId, announcementId: req.params.id },
      data: { readAt: new Date(), shownAt: new Date() },
    });
    success(res, { ok: true });
  } catch (err) {
    error(res, (err as Error).message);
  }
};

/**
 * POST /api/announcements/ai-generate
 * Body: { kind: "motivation"|"encouragement"|"celebration", targetType, targetId? }
 * AI manager statistikasini olib motivatsiya/ragbat habar generatsiya qiladi.
 */
export const aiGenerate = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const { kind = "motivation", targetType, targetId } = req.body || {};

    // Stats yig'amiz
    let context = "";
    if (targetType === "manager" && targetId) {
      const m = await prisma.manager.findUnique({
        where: { id: targetId },
        select: { id: true, name: true },
      });
      if (!m) {
        error(res, "Menejer topilmadi", 404);
        return;
      }
      const last7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);
      const [sales, calls] = await Promise.all([
        prisma.salesLead.findMany({
          where: { responsibleManagerId: m.id, isSale: true, closedAt: { gte: last7 } },
          select: { price: true },
        }),
        prisma.audioFile.findMany({
          where: { managerId: m.id, status: "done", createdAt: { gte: last7 } },
          include: { analysis: { select: { overallScore: true } } },
        }),
      ]);
      const salesCount = sales.length;
      const salesAmount = sales.reduce((s, x) => s + (x.price || 0), 0);
      const scores = calls
        .map((c) => c.analysis?.overallScore || 0)
        .filter((s) => s > 0);
      const avg =
        scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : 0;
      context = `Menejer: ${m.name}
So'nggi 7 kun:
- Sotuv: ${salesCount} (${salesAmount.toLocaleString("ru-RU")} so'm)
- Tahlil qilingan qo'ng'iroq: ${calls.length}
- O'rtacha ball: ${avg}/100`;
    } else if (targetType === "department" && targetId) {
      const dept = await prisma.department.findUnique({
        where: { id: targetId },
        select: { name: true },
      });
      context = `Bo'lim: ${dept?.name || "—"}\n(jamoa motivatsiyasi)`;
    } else {
      context = "Butun jamoa uchun motivatsion habar.";
    }

    const intent =
      kind === "celebration"
        ? "muvaffaqiyatni nishonlash"
        : kind === "encouragement"
        ? "qiyin kun uchun ruhlantirish"
        : "motivatsiya berish";

    const prompt = `Sen sotuv bo'limi yetakchisisan. O'zbek tilida (lotin), iliq va halol stilda ${intent} habar yoz.

KONTEKST:
${context}

QOIDALAR:
- 3-5 ta jumla
- Aniq, samimiy, hurmatli ohang
- Hech qanday hashtag, emoji ko'p ishlatmaslik (1-2 ta yetadi)
- Manager ismi bor bo'lsa, ismidan foydalan
- Markdown belgilarini ishlatmang (matn formati toza bo'lsin)

FAQAT habar matnini qaytar (boshqa hech narsa kerak emas).`;

    let body = "";
    try {
      const vertexAi = new VertexAI({ project: VERTEX_PROJECT, location: VERTEX_LOCATION });
      const model = vertexAi.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { temperature: 0.8, maxOutputTokens: 400 },
      });
      const resp = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      body = (resp.response.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    } catch (aiErr) {
      console.error("[ai-generate] vertex error:", (aiErr as Error).message);
    }

    if (!body) {
      body =
        kind === "celebration"
          ? "Bugun ajoyib ish qildingiz! Bu natija sizning mehnatingiz va e'tiboringizning samarasi. Davom eting — siz haqiqiy professionalsiz."
          : kind === "encouragement"
          ? "Har kun — yangi imkoniyat. Bugun har bir qo'ng'iroq sizni keyingi sotuvga yaqinlashtiradi. Biz sizga ishonamiz."
          : "Bugun jamoamiz uchun yana bir muhim kun. Har bir mijoz — bizning hikoyamizning bir qismi. Davom etamiz!";
    }

    success(res, { body });
  } catch (err) {
    console.error("[ai-generate] error:", err);
    error(res, (err as Error).message);
  }
};
