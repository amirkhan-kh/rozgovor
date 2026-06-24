import { Request, Response } from "express";
import axios from "axios";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { emitActivityUpdate } from "../services/websocket";

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(
  method: string,
  payload: Record<string, unknown> = {}
): Promise<{ result?: unknown; total?: number; next?: number }> {
  const resp = await axios.post(
    `${BITRIX_WEBHOOK}/${method}.json`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
      validateStatus: (s) => s < 500,
      timeout: 30000,
    }
  );
  return resp.data;
}

// Reuse query parsers (mirror sales filter params)
const parsePipelineIds = (raw: unknown): number[] | null => {
  if (!raw || typeof raw !== "string") return null;
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
  return ids.length > 0 ? ids : null;
};

const parseManagerIds = (raw: unknown): string[] | null => {
  if (!raw || typeof raw !== "string") return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
};

const parseSourceIds = (raw: unknown): string[] | null => {
  if (!raw) return null;
  const arr = Array.isArray(raw) ? raw : String(raw).split(",");
  const clean = arr.map((s) => String(s).trim()).filter(Boolean);
  return clean.length > 0 ? clean : null;
};

const TASHKENT_OFFSET_HOURS = 5;
const tashkentStartOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, -TASHKENT_OFFSET_HOURS, 0, 0));
const tashkentEndOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, 23 - TASHKENT_OFFSET_HOURS, 59, 59, 999));

const parseDateRange = (
  dateFrom?: string,
  dateTo?: string
): { gte?: Date; lte?: Date } | null => {
  const range: { gte?: Date; lte?: Date } = {};
  if (dateFrom) {
    const [yy, mm, dd] = dateFrom.split("-").map(Number);
    if (yy && mm && dd) range.gte = tashkentStartOfDay(yy, mm, dd);
  }
  if (dateTo) {
    const [yy, mm, dd] = dateTo.split("-").map(Number);
    if (yy && mm && dd) range.lte = tashkentEndOfDay(yy, mm, dd);
  }
  return Object.keys(range).length > 0 ? range : null;
};

// GET /api/activities?pipelineIds&managerIds&sourceIds&dateFrom&dateTo&completed
export const getActivities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const pipelineIds = parsePipelineIds(req.query.pipelineIds);
    const managerIds = parseManagerIds(req.query.managerIds);
    const sourceIds = parseSourceIds(req.query.sourceIds);
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const completedQ = req.query.completed as string | undefined;
    const dateRange = parseDateRange(dateFrom, dateTo);

    // Pipeline va Source filtrlari Lead/Deal jadvalidan activity uchun
    // tegishli ownerId to'plamini aniqlash orqali qo'llanadi.
    let dealIdFilter: number[] | null = null;
    let leadIdFilter: number[] | null = null;

    if (pipelineIds) {
      const deals = await prisma.salesLead.findMany({
        where: { companyId, pipelineId: { in: pipelineIds } },
        select: { leadId: true, originalLeadId: true },
      });
      dealIdFilter = deals.map((d) => d.leadId);
      leadIdFilter = deals
        .map((d) => d.originalLeadId)
        .filter((v): v is number => v !== null);
    }

    if (sourceIds) {
      const leads = await prisma.lead.findMany({
        where: { companyId, sourceId: { in: sourceIds } },
        select: { bitrixLeadId: true },
      });
      const ids = leads.map((l) => l.bitrixLeadId);
      leadIdFilter = leadIdFilter
        ? leadIdFilter.filter((id) => ids.includes(id))
        : ids;
    }

    const where: Record<string, unknown> = { companyId };
    if (managerIds) where.managerId = { in: managerIds };
    if (dateRange) where.deadline = dateRange;
    if (completedQ === "true") where.completed = true;
    if (completedQ === "false") where.completed = false;
    if (dealIdFilter || leadIdFilter) {
      const orArr: Array<Record<string, unknown>> = [];
      if (dealIdFilter && dealIdFilter.length > 0) {
        orArr.push({ dealId: { in: dealIdFilter } });
      }
      if (leadIdFilter && leadIdFilter.length > 0) {
        orArr.push({ leadId: { in: leadIdFilter } });
      }
      if (orArr.length > 0) {
        where.OR = orArr;
      } else {
        // Filter aktiv lekin mos keluvchi yo'q
        where.id = "__NO_MATCH__";
      }
    }

    const activities = await prisma.activity.findMany({
      where,
      orderBy: { deadline: "asc" },
      take: 500,
      include: {
        manager: { select: { id: true, name: true, photoUrl: true, customPhotoUrl: true } },
      },
    });

    success(res, {
      count: activities.length,
      activities: activities.map((a) => ({
        id: a.id,
        bitrixId: a.bitrixId,
        subject: a.subject,
        typeId: a.typeId,
        ownerType: a.ownerType,
        dealId: a.dealId,
        leadId: a.leadId,
        direction: a.direction,
        priority: a.priority,
        responsibleId: a.responsibleId,
        manager: a.manager,
        deadline: a.deadline,
        startTime: a.startTime,
        endTime: a.endTime,
        completed: a.completed,
        status: a.status,
        createdBitrix: a.createdBitrix,
        updatedBitrix: a.updatedBitrix,
      })),
    });
  } catch (err) {
    console.error("Activities list error:", err);
    error(res, "Activity'larni olishda xatolik");
  }
};

/**
 * Core sync helper — companyId va oxirgi N kun uchun crm.activity.list'ni
 * to'liq aylantirib, Activity jadvalga upsert qiladi. Cron ham, HTTP handler
 * ham shu funksiyani ishlatadi.
 */
export async function runActivitiesSync(
  companyId: string,
  days: number
): Promise<{ upserted: number; windowDays: number }> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const dateFromISO = since.toISOString();

  let start = 0;
  let upserted = 0;
  const managers = await prisma.manager.findMany({
    where: { companyId },
    select: { id: true },
  });
  const managerIdSet = new Set(managers.map((m) => m.id));

  while (true) {
    const resp = await bitrixCall("crm.activity.list", {
      filter: { ">=CREATED": dateFromISO },
      select: [
        "ID",
        "OWNER_ID",
        "OWNER_TYPE_ID",
        "TYPE_ID",
        "SUBJECT",
        "DIRECTION",
        "PRIORITY",
        "RESPONSIBLE_ID",
        "DEADLINE",
        "START_TIME",
        "END_TIME",
        "COMPLETED",
        "STATUS",
        "CREATED",
        "LAST_UPDATED",
      ],
      order: { CREATED: "DESC" },
      start,
    });
    const batch = (resp.result as Array<Record<string, unknown>>) || [];
    for (const a of batch) {
      const bitrixId = String(a.ID);
      const ownerType =
        a.OWNER_TYPE_ID != null ? Number(a.OWNER_TYPE_ID) : null;
      const ownerId = a.OWNER_ID ? String(a.OWNER_ID) : null;
      const leadId =
        ownerType === 1 && a.OWNER_ID ? Number(a.OWNER_ID) : null;
      const dealId =
        ownerType === 2 && a.OWNER_ID ? Number(a.OWNER_ID) : null;
      const respBitrix = a.RESPONSIBLE_ID ? String(a.RESPONSIBLE_ID) : null;
      const mappedManager =
        respBitrix && managerIdSet.has(`bitrix_${respBitrix}`)
          ? `bitrix_${respBitrix}`
          : null;

      const data = {
        companyId,
        bitrixId,
        ownerType,
        ownerId,
        leadId,
        dealId,
        typeId: a.TYPE_ID != null ? Number(a.TYPE_ID) : null,
        subject: (a.SUBJECT as string) || null,
        direction: a.DIRECTION != null ? Number(a.DIRECTION) : null,
        priority: a.PRIORITY != null ? Number(a.PRIORITY) : null,
        responsibleId: respBitrix,
        managerId: mappedManager,
        deadline: a.DEADLINE ? new Date(a.DEADLINE as string) : null,
        startTime: a.START_TIME ? new Date(a.START_TIME as string) : null,
        endTime: a.END_TIME ? new Date(a.END_TIME as string) : null,
        completed: a.COMPLETED === "Y" || a.COMPLETED === true,
        status: a.STATUS != null ? Number(a.STATUS) : null,
        createdBitrix: a.CREATED ? new Date(a.CREATED as string) : null,
        updatedBitrix: a.LAST_UPDATED
          ? new Date(a.LAST_UPDATED as string)
          : null,
      };
      await prisma.activity.upsert({
        where: { bitrixId },
        create: data,
        update: data,
      });
      upserted += 1;
    }
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
  }

  // WebSocket push
  emitActivityUpdate(companyId, {
    event: "sync-completed",
    upserted,
    windowDays: days,
    at: new Date().toISOString(),
  });

  return { upserted, windowDays: days };
}

// POST /api/activities/sync — manual incremental sync (so'nggi N kun)
export const syncActivities = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const days = Math.max(
      1,
      Math.min(180, parseInt((req.query.days as string) || "7", 10) || 7)
    );
    const result = await runActivitiesSync(companyId, days);
    success(res, result);
  } catch (err) {
    console.error("Activities sync error:", err);
    error(res, "Activity sinxronida xatolik");
  }
};
