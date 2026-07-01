import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import {
  rejectionAnalysisSelect,
  getRejectionInfo,
  attachLeadCloseReasons,
} from "../utils/rejection-info";

// Tashkent TZ (UTC+5) — dashboard/sales bilan bir xil
const TZ = 5;
const tashkentStartOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, -TZ, 0, 0));
const tashkentEndOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, 23 - TZ, 59, 59, 999));
const nowInTashkent = (): Date =>
  new Date(Date.now() + TZ * 3600 * 1000);

const getDateRange = (
  period: string,
  dateFrom?: string,
  dateTo?: string
): { gte?: Date; lte?: Date } | null => {
  const tNow = nowInTashkent();
  const y = tNow.getUTCFullYear();
  const m = tNow.getUTCMonth() + 1;
  const d = tNow.getUTCDate();

  switch (period) {
    case "today":
      return {
        gte: tashkentStartOfDay(y, m, d),
        lte: tashkentEndOfDay(y, m, d),
      };
    case "yesterday": {
      const yest = new Date(Date.UTC(y, m - 1, d - 1));
      return {
        gte: tashkentStartOfDay(
          yest.getUTCFullYear(),
          yest.getUTCMonth() + 1,
          yest.getUTCDate()
        ),
        lte: tashkentEndOfDay(
          yest.getUTCFullYear(),
          yest.getUTCMonth() + 1,
          yest.getUTCDate()
        ),
      };
    }
    case "week": {
      const day = tNow.getUTCDay();
      const diff = day === 0 ? 6 : day - 1;
      const mon = new Date(Date.UTC(y, m - 1, d - diff));
      return {
        gte: tashkentStartOfDay(
          mon.getUTCFullYear(),
          mon.getUTCMonth() + 1,
          mon.getUTCDate()
        ),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "month":
      return {
        gte: tashkentStartOfDay(y, m, 1),
        lte: tashkentEndOfDay(y, m, d),
      };
    case "last3months": {
      const start = new Date(Date.UTC(y, m - 1 - 3, d));
      return {
        gte: tashkentStartOfDay(
          start.getUTCFullYear(),
          start.getUTCMonth() + 1,
          start.getUTCDate()
        ),
        lte: tashkentEndOfDay(y, m, d),
      };
    }
    case "custom": {
      const r: { gte?: Date; lte?: Date } = {};
      if (dateFrom) {
        const [yy, mm, dd] = dateFrom.split("-").map(Number);
        if (yy && mm && dd) r.gte = tashkentStartOfDay(yy, mm, dd);
      }
      if (dateTo) {
        const [yy, mm, dd] = dateTo.split("-").map(Number);
        if (yy && mm && dd) r.lte = tashkentEndOfDay(yy, mm, dd);
      }
      return Object.keys(r).length > 0 ? r : null;
    }
    default:
      return null;
  }
};

const parseCsv = (v: unknown): string[] =>
  typeof v === "string" && v.trim().length > 0
    ? v.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

// Audit filtrlaridan AudioFile `where` quradi (overview + lost-verdicts uchun umumiy).
// Davr filtri HAQIQIY qo'ng'iroq vaqti (callDate) bo'yicha — sync vaqti (createdAt) emas;
// callDate yo'q yozuvlar uchun createdAt'ga qaytamiz.
const buildAudioFileWhere = (req: Request) => {
  const companyId = req.companyId!;
  const period = (req.query.period as string) || "month";
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const managerId = req.query.managerId as string | undefined;
  const managerIds = parseCsv(req.query.managerIds);
  const pipelines = parseCsv(req.query.pipelines);
  const sourceIds = parseCsv(req.query.sourceIds);
  const minDurationSecRaw = req.query.minDurationSec as string | undefined;
  const minDurationSec =
    minDurationSecRaw && !Number.isNaN(Number(minDurationSecRaw))
      ? Math.max(0, Math.floor(Number(minDurationSecRaw)))
      : 0;

  const dateRange = getDateRange(period, dateFrom, dateTo);

  const where: Record<string, unknown> = { companyId };
  if (dateRange) {
    where.OR = [
      { callDate: dateRange },
      { callDate: null, createdAt: dateRange },
    ];
  }
  if (managerId && managerId !== "all") where.managerId = managerId;
  else if (managerIds.length > 0) where.managerId = { in: managerIds };
  if (pipelines.length > 0) where.pipelineName = { in: pipelines };
  if (sourceIds.length > 0) where.sourceId = { in: sourceIds };
  if (minDurationSec > 0) where.duration = { gte: minDurationSec };

  return { companyId, period, dateRange, where, managerId, managerIds, sourceIds };
};

// Audit KPI:
//   totalCalls         — umumiy AudioFile
//   outgoing           — direction = "outgoing"
//   incoming           — direction = "incoming"
//   firstCallCount     — lid bo'yicha birinchi qo'ng'iroq (distinct leadId)
//   repeatCallCount    — qayta qo'ng'iroq (totalCalls - firstCallCount)
//   avgDurationSec     — o'rtacha davomiylik (sekund)
//   avgTimeToContactHours — lid yaratilgan vaqtdan birinchi aloqaga chiqish (soat)
export const getAuditOverview = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { companyId, period, dateRange, where, managerId, managerIds, sourceIds } =
      buildAudioFileWhere(req);

    // Hamma audio fayllar (no_audio placeholder'dan tashqari)
    const allAudios = await prisma.audioFile.findMany({
      where: { ...where, status: { not: "no_audio" } },
      select: {
        id: true,
        duration: true,
        direction: true,
        leadId: true,
        phoneNumber: true,
        leadCreatedAt: true,
        firstContactAt: true,
        callDate: true,
        createdAt: true,
        status: true,
      },
    });

    // Suhbat yo'q (voicemail / avtomat xabar) — KPI'dan chiqarib tashlanadi
    const noConversationCount = allAudios.filter((a) => a.status === "no_conversation").length;
    const audios = allAudios.filter((a) => a.status !== "no_conversation");

    const totalCalls = audios.length;
    const outgoing = audios.filter((a) => a.direction === "outgoing").length;
    const incoming = audios.filter((a) => a.direction === "incoming").length;

    // Davomiylik
    const durations = audios.map((a) => a.duration || 0).filter((d) => d > 0);
    const avgDurationSec =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
    const totalDurationSec = durations.reduce((a, b) => a + b, 0);

    // Birinchi / qayta qo'ng'iroq — leadId yoki telefon raqam bo'yicha
    // leadId bo'lsa → leadId, aks holda telefon raqam — mijozni aniqlash uchun
    const keyFor = (a: { leadId: number | null; phoneNumber: string | null }): string | null => {
      if (a.leadId != null) return `L:${a.leadId}`;
      if (a.phoneNumber) return `P:${a.phoneNumber}`;
      return null;
    };
    const firstPerKey = new Map<string, Date>();
    let callsWithKey = 0;
    for (const a of audios) {
      const k = keyFor(a);
      if (!k) continue;
      callsWithKey += 1;
      const prev = firstPerKey.get(k);
      if (!prev || a.createdAt < prev) firstPerKey.set(k, a.createdAt);
    }
    const firstCallCount = firstPerKey.size;
    const repeatCallCount = Math.max(0, callsWithKey - firstCallCount);

    // O'rtacha lidga aloqaga chiqish vaqti (soat):
    // (firstContactAt yoki eng erta callDate per lead) - leadCreatedAt
    // Bitrix sync AudioFile.firstContactAt va leadCreatedAt'ni o'rnatmaydi —
    // callDate ni contact vaqti, SalesLead.leadCreatedAt ni lid yaratilgan vaqt sifatida ishlatamiz.
    const earliestPerLead = new Map<number, Date>();
    for (const a of audios) {
      if (a.leadId == null) continue;
      const contactAt = a.firstContactAt || a.callDate;
      if (!contactAt) continue;
      const prev = earliestPerLead.get(a.leadId);
      if (!prev || contactAt.getTime() < prev.getTime()) {
        earliestPerLead.set(a.leadId, contactAt);
      }
    }
    // SalesLead.leadCreatedAt ni JOIN orqali olamiz (bitrix dealId orqali)
    const leadIds = Array.from(earliestPerLead.keys());
    const salesLeads = leadIds.length > 0
      ? await prisma.salesLead.findMany({
          where: { companyId, leadId: { in: leadIds } },
          select: { leadId: true, leadCreatedAt: true },
        })
      : [];
    const leadCreatedMap = new Map<number, Date>();
    for (const sl of salesLeads) {
      if (sl.leadCreatedAt) leadCreatedMap.set(sl.leadId, sl.leadCreatedAt);
    }
    const contactGapsHrs: number[] = [];
    for (const [leadId, contactAt] of earliestPerLead) {
      const created = leadCreatedMap.get(leadId);
      if (!created) continue;
      const diffMs = contactAt.getTime() - created.getTime();
      if (diffMs >= 0) contactGapsHrs.push(diffMs / 3_600_000);
    }
    const avgTimeToContactHours =
      contactGapsHrs.length > 0
        ? Math.round(
            (contactGapsHrs.reduce((a, b) => a + b, 0) / contactGapsHrs.length) *
              10
          ) / 10
        : 0;

    // Umumiy lid soni:
    //   = firstCallCount (qo'ng'iroq qilingan distinct leadId yoki telefon)
    //   + Bitrix Lead jadvalidan qo'ng'iroq qilinmagan lidlar
    const contactedLeadIds = Array.from(
      new Set(audios.filter((a) => a.leadId != null).map((a) => a.leadId as number))
    );
    const leadWhere: Record<string, unknown> = { companyId };
    if (dateRange) leadWhere.dateCreate = dateRange;
    if (managerId && managerId !== "all") leadWhere.responsibleManagerId = managerId;
    else if (managerIds.length > 0) leadWhere.responsibleManagerId = { in: managerIds };
    if (sourceIds.length > 0) leadWhere.sourceId = { in: sourceIds };
    if (contactedLeadIds.length > 0) leadWhere.bitrixLeadId = { notIn: contactedLeadIds };
    const uncontactedLeadsCount = await prisma.lead.count({ where: leadWhere });
    const totalLeadsCount = firstCallCount + uncontactedLeadsCount;

    success(res, {
      period: {
        key: period,
        from: dateRange?.gte?.toISOString() || null,
        to: dateRange?.lte?.toISOString() || null,
      },
      kpis: {
        totalCalls,
        outgoing,
        incoming,
        firstCallCount,
        repeatCallCount,
        avgDurationSec,
        totalDurationSec,
        avgTimeToContactHours,
        contactSampleCount: contactGapsHrs.length,
        totalLeadsCount,
        noConversationCount,
      },
    });
  } catch (err) {
    console.error("Audit overview error:", err);
    error(res, "Audit statistikasini olishda xatolik");
  }
};

// Yo'qotilgan lidlar — manager haq/nohaq verdict taqsimoti (pie chart uchun aggregate).
// "Lost" = SalesLead.closeReasonName belgilangan (getRejectionInfo non-null qaytaradi).
// Verdict per-audio audio.controller bilan bir xil logikadan (utils/rejection-info) keladi.
export const getLostVerdicts = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { companyId, where } = buildAudioFileWhere(req);

    // Faqat tahlil qilingan, suhbati bor audiolar
    const candidates = await prisma.audioFile.findMany({
      where: {
        ...where,
        status: { notIn: ["no_audio", "no_conversation"] },
        analysis: { isNot: null },
      },
      select: {
        id: true,
        leadId: true,
        crmLeadId: true,
        phoneNumber: true,
        isSale: true,
        pipelineName: true,
        analysis: { select: rejectionAnalysisSelect },
      },
    });

    const withReasons = await attachLeadCloseReasons(companyId, candidates);

    let right = 0;
    let wrong = 0;
    let unclear = 0;
    let total = 0;
    for (const a of withReasons) {
      const info = getRejectionInfo(a.analysis, a); // null = yo'qotilgan lid emas
      if (!info) continue;
      total += 1;
      const status = info.managerVerdict?.status;
      if (status === "right") right += 1;
      else if (status === "wrong") wrong += 1;
      else unclear += 1; // unclear + unknown (closeReasonName bor → unknown amalda chiqmaydi)
    }

    success(res, {
      total,
      breakdown: [
        { key: "right", label: "Haq", count: right },
        { key: "wrong", label: "Nohaq", count: wrong },
        { key: "unclear", label: "Aniq emas", count: unclear },
      ],
    });
  } catch (err) {
    console.error("Audit lost-verdicts error:", err);
    error(res, "Yo'qotilgan lid statistikasini olishda xatolik");
  }
};
