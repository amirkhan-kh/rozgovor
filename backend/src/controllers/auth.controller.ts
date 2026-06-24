import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/prisma";
import { signToken } from "../utils/jwt";
import { success, error } from "../utils/response";

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      error(res, "Username va parol kiritilishi shart", 400);
      return;
    }

    // 1. Company dan qidirish (username bo'yicha)
    const company = await prisma.company.findUnique({ where: { username } });
    if (company) {
      if (!company.isActive) {
        error(res, "Kompaniya faol emas", 403);
        return;
      }

      const isMatch = await bcrypt.compare(password, company.password);
      if (!isMatch) {
        error(res, "Username yoki parol noto'g'ri", 401);
        return;
      }

      const token = signToken(company.id, "company");

      success(res, {
        token,
        role: "company",
        company: {
          id: company.id,
          name: company.name,
          username: company.username,
          plan: company.plan,
          totalLimitHours: company.totalLimitHours,
          telegramId: company.telegramId,
          telegramEnabled: company.telegramEnabled,
          sendEachAnalysis: company.sendEachAnalysis,
          dailySummaryEnabled: company.dailySummaryEnabled,
          createdAt: company.createdAt,
        },
      });
      return;
    }

    // 2. Manager dan qidirish (email bo'yicha)
    const manager = await prisma.manager.findFirst({
      where: { email: username },
      include: { company: { select: { id: true, name: true } } },
    });

    if (!manager || !manager.password) {
      error(res, "Username yoki parol noto'g'ri", 401);
      return;
    }

    if (!manager.isActive) {
      error(res, "Sizning akkauntingiz faol emas", 403);
      return;
    }

    const isManagerMatch = await bcrypt.compare(password, manager.password);
    if (!isManagerMatch) {
      error(res, "Username yoki parol noto'g'ri", 401);
      return;
    }

    const token = signToken(manager.id, "manager");

    success(res, {
      token,
      role: "manager",
      user: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        role: manager.role,
        companyId: manager.companyId,
        companyName: manager.company.name,
        canViewDashboard: manager.canViewDashboard,
        canViewAll: manager.canViewAll,
        canViewRating: manager.canViewRating,
        isActive: manager.isActive,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    error(res, "Kirishda xatolik yuz berdi");
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.userRole === "manager" && req.managerId) {
      const manager = await prisma.manager.findUnique({
        where: { id: req.managerId },
        include: { company: { select: { id: true, name: true } } },
      });
      if (!manager) { error(res, "Menejer topilmadi", 404); return; }

      success(res, {
        role: manager.role, // sotuvchi / rop
        id: manager.id,
        name: manager.name,
        email: manager.email,
        companyId: manager.companyId,
        companyName: manager.company.name,
        canViewDashboard: manager.canViewDashboard,
        canViewAll: manager.canViewAll,
        canViewRating: manager.canViewRating,
        isActive: manager.isActive,
        photoUrl: manager.photoUrl,
        customPhotoUrl: manager.customPhotoUrl,
      });
      return;
    }

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
        createdAt: true,
      },
    });

    if (!company) { error(res, "Kompaniya topilmadi", 404); return; }

    success(res, { role: "company", ...company });
  } catch (err) {
    console.error("Me error:", err);
    error(res, "Ma'lumotlarni olishda xatolik yuz berdi");
  }
};
