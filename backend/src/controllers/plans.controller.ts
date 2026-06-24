import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

/* ==================== SOTUV PLAN-FAKT ==================== */

// Plan olish
export const getSalesPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const plans = await prisma.salesPlan.findMany({
      where: { companyId: req.companyId },
    });

    const result: Record<string, number> = { daily: 0, weekly: 0, monthly: 0 };
    for (const p of plans) {
      result[p.type] = p.target;
    }

    success(res, result);
  } catch (err) {
    error(res, "Plan olishda xatolik");
  }
};

// Plan saqlash (upsert)
export const saveSalesPlans = async (req: Request, res: Response): Promise<void> => {
  try {
    const { daily, weekly, monthly } = req.body;

    const types = [
      { type: "daily", target: daily },
      { type: "weekly", target: weekly },
      { type: "monthly", target: monthly },
    ];

    for (const { type, target } of types) {
      if (target !== undefined && target !== null) {
        await prisma.salesPlan.upsert({
          where: { companyId_type: { companyId: req.companyId!, type } },
          create: { companyId: req.companyId!, type, target: Number(target) },
          update: { target: Number(target) },
        });
      }
    }

    success(res, { message: "Planlar saqlandi" });
  } catch (err) {
    error(res, "Plan saqlashda xatolik");
  }
};

// Plan-fakt dashboard uchun
export const getPlanFact = async (req: Request, res: Response): Promise<void> => {
  try {
    const plans = await prisma.salesPlan.findMany({
      where: { companyId: req.companyId },
    });

    const planMap: Record<string, number> = {};
    for (const p of plans) planMap[p.type] = p.target;

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Bu haftaning boshlanishi (Dushanba)
    const weekStart = new Date(now);
    const day = weekStart.getDay();
    const diff = day === 0 ? 6 : day - 1;
    weekStart.setDate(weekStart.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);

    // Bu oyning boshlanishi
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Aktiv menejerlar — voronka/dashboard bilan bir xil filter
    const activeIds = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: { id: true },
    }).then(ms => ms.map(m => m.id));

    // Faktik sotuvlar — AmoCRM bilan bir xil: saleClosedAt + saleResponsibleManagerId + distinct leadId
    const countUniqueLeads = async (dateFilter: { gte: Date }) => {
      const leads = await prisma.audioFile.findMany({
        where: {
          companyId: req.companyId,
          saleResponsibleManagerId: { in: activeIds },
          isSale: true,
          leadId: { not: null },
          saleClosedAt: dateFilter,
        },
        select: { leadId: true },
        distinct: ["leadId"],
      });
      return leads.length;
    };

    const [dailySales, weeklySales, monthlySales] = await Promise.all([
      countUniqueLeads({ gte: todayStart }),
      countUniqueLeads({ gte: weekStart }),
      countUniqueLeads({ gte: monthStart }),
    ]);

    success(res, {
      daily: { plan: planMap.daily || 0, fact: dailySales, percent: planMap.daily ? Math.round((dailySales / planMap.daily) * 100) : 0 },
      weekly: { plan: planMap.weekly || 0, fact: weeklySales, percent: planMap.weekly ? Math.round((weeklySales / planMap.weekly) * 100) : 0 },
      monthly: { plan: planMap.monthly || 0, fact: monthlySales, percent: planMap.monthly ? Math.round((monthlySales / planMap.monthly) * 100) : 0 },
    });
  } catch (err) {
    error(res, "Plan-fakt olishda xatolik");
  }
};

/* ==================== MANAGER TALK TARGET ==================== */

export const getTalkTarget = async (req: Request, res: Response): Promise<void> => {
  try {
    const target = await prisma.managerTalkTarget.findUnique({
      where: { companyId: req.companyId! },
    });
    success(res, {
      dailyMinutes: target?.dailyMinutes ?? 180,
      workStartHour: target?.workStartHour ?? 9,
      workEndHour: target?.workEndHour ?? 18,
    });
  } catch (err) {
    error(res, "Talk target olishda xatolik");
  }
};

export const saveTalkTarget = async (req: Request, res: Response): Promise<void> => {
  try {
    const { dailyMinutes, workStartHour, workEndHour } = req.body;
    const data: any = {};
    if (dailyMinutes !== undefined) data.dailyMinutes = Number(dailyMinutes);
    if (workStartHour !== undefined) data.workStartHour = Number(workStartHour);
    if (workEndHour !== undefined) data.workEndHour = Number(workEndHour);

    await prisma.managerTalkTarget.upsert({
      where: { companyId: req.companyId! },
      create: { companyId: req.companyId!, ...data },
      update: data,
    });
    success(res, { message: "Saqlandi" });
  } catch (err) {
    error(res, "Talk target saqlashda xatolik");
  }
};

// Dashboard uchun — har bir menejerning bugungi gaplashgan vaqti vs target
export const getManagerTalkStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const target = await prisma.managerTalkTarget.findUnique({
      where: { companyId: req.companyId! },
    });
    const dailyTarget = target?.dailyMinutes ?? 180;

    const workStart = target?.workStartHour ?? 9;
    const workEnd = target?.workEndHour ?? 18;

    // Tanlangan sana yoki bugun
    const dateStr = req.query.date as string | undefined;
    const baseDate = dateStr ? new Date(dateStr) : new Date();

    const todayStart = new Date(baseDate);
    todayStart.setHours(workStart, 0, 0, 0);

    const todayEnd = new Date(baseDate);
    todayEnd.setHours(workEnd, 0, 0, 0);

    const managers = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: {
        id: true,
        name: true,
        audioFiles: {
          where: {
            callDate: { gte: todayStart, lte: todayEnd },
          },
          select: { duration: true },
        },
      },
    });

    const result = managers.map((m) => {
      const totalSeconds = m.audioFiles.reduce((sum, f) => sum + (f.duration || 0), 0);
      const totalMinutes = Math.round(totalSeconds / 60);
      return {
        id: m.id,
        name: m.name,
        actualMinutes: totalMinutes,
        targetMinutes: dailyTarget,
        percent: dailyTarget > 0 ? Math.round((totalMinutes / dailyTarget) * 100) : 0,
      };
    });

    success(res, {
      target: dailyTarget,
      workStartHour: workStart,
      workEndHour: workEnd,
      managers: result,
    });
  } catch (err) {
    error(res, "Manager talk stats olishda xatolik");
  }
};

/* ==================== MANAGER SCHEDULE (DAM KUNLARI) ==================== */

export const getSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const { month } = req.query; // "2026-04" format

    const where: any = { managerId };
    if (month) {
      where.date = { startsWith: month as string };
    }

    const schedule = await prisma.managerSchedule.findMany({ where });
    success(res, schedule);
  } catch (err) {
    error(res, "Jadval olishda xatolik");
  }
};

export const getAllSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.query;

    const managers = await prisma.manager.findMany({
      where: { companyId: req.companyId, isActive: true },
      select: { id: true, name: true },
    });

    const where: any = {
      managerId: { in: managers.map((m) => m.id) },
    };
    if (month) {
      where.date = { startsWith: month as string };
    }

    const schedules = await prisma.managerSchedule.findMany({ where });

    const result = managers.map((m) => ({
      id: m.id,
      name: m.name,
      days: schedules.filter((s) => s.managerId === m.id),
    }));

    success(res, result);
  } catch (err) {
    error(res, "Jadvallar olishda xatolik");
  }
};

export const updateScheduleDay = async (req: Request, res: Response): Promise<void> => {
  try {
    const { managerId } = req.params;
    const { date, status, note } = req.body;

    // status: 0=ish kuni (o'chirish), 1=dam kuni (sariq), 2=ishlamagan (qizil)
    if (status === 0) {
      await prisma.managerSchedule.deleteMany({
        where: { managerId, date },
      });
      success(res, { message: "Ish kuni belgilandi" });
      return;
    }

    await prisma.managerSchedule.upsert({
      where: { managerId_date: { managerId, date } },
      create: { managerId, date, status, note },
      update: { status, note },
    });

    success(res, { message: "Jadval yangilandi" });
  } catch (err) {
    error(res, "Jadval yangilashda xatolik");
  }
};
