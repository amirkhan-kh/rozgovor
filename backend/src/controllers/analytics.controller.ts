import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

// ─── Lead funnel bucket'lari ──────────────────────────────────────────────
// Bitrix lead STATUS_ID asosida (system'lar barqaror) + custom UC_* nomlari.
// Tartib = voronka oqimi (yuqoridan pastga).
type FunnelKey =
  | "yangi"
  | "ishlanmoqda"
  | "qayta_obrabotka"
  | "sifatsiz"
  | "sotildi";

const FUNNEL_LABELS: Record<FunnelKey, string> = {
  yangi: "Yangi",
  ishlanmoqda: "Ishlanmoqda",
  qayta_obrabotka: "Qayta obrabotka",
  sifatsiz: "Sifatsiz",
  sotildi: "Sotildi (konvertatsiya)",
};
const FUNNEL_ORDER: FunnelKey[] = [
  "yangi",
  "ishlanmoqda",
  "qayta_obrabotka",
  "sifatsiz",
  "sotildi",
];

// statusId/nomdan bucket aniqlash. System ID'lar (NEW/CONVERTED/JUNK...) barqaror;
// custom UC_* uchun nom kalit so'zlari. Mos kelmasa → "ishlanmoqda".
function classifyLead(
  statusId: string | null,
  statusName: string | null,
  isConverted: boolean
): FunnelKey {
  const id = (statusId || "").toUpperCase();
  const n = (statusName || "").toLowerCase();
  if (isConverted || id === "CONVERTED") return "sotildi";
  if (id === "JUNK" || n.includes("sifatsiz") || n.includes("chet el") || n.includes("dubl") || n.includes("spam"))
    return "sifatsiz";
  // "Qayta Abrabotka" / "Reanimatsya" — qayta ishlash (lekin "Qayta aloqa" = callback emas)
  if (n.includes("abrabotka") || n.includes("obrabotka") || n.includes("reanim"))
    return "qayta_obrabotka";
  if (id === "NEW" || n.includes("yangi")) return "yangi";
  return "ishlanmoqda"; // IN_PROCESS, PROCESSED va boshqa custom
}

function parseRange(req: Request): { gte?: Date; lte?: Date } | null {
  const from = req.query.dateFrom as string | undefined;
  const to = req.query.dateTo as string | undefined;
  if (!from && !to) return null;
  const r: { gte?: Date; lte?: Date } = {};
  if (from) r.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) r.lte = new Date(`${to}T23:59:59.999Z`);
  return r;
}

// GET /api/analytics/funnel — lead voronka hisoboti
export const getLeadFunnel = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const where: Record<string, unknown> = { companyId };
    if (range) where.dateCreate = range;

    const rows = await prisma.lead.groupBy({
      by: ["statusId", "statusName", "isConverted"],
      where,
      _count: { bitrixLeadId: true },
      orderBy: { _count: { bitrixLeadId: "desc" } },
    });

    const buckets: Record<FunnelKey, number> = {
      yangi: 0,
      ishlanmoqda: 0,
      qayta_obrabotka: 0,
      sifatsiz: 0,
      sotildi: 0,
    };
    const byStatus = rows.map((r) => {
      const bucket = classifyLead(r.statusId, r.statusName, r.isConverted);
      const count = r._count.bitrixLeadId;
      buckets[bucket] += count;
      return {
        statusId: r.statusId,
        name: r.statusName || "Noma'lum",
        count,
        bucket,
      };
    });

    const total = Object.values(buckets).reduce((a, b) => a + b, 0);
    const stages = FUNNEL_ORDER.map((key) => ({
      key,
      label: FUNNEL_LABELS[key],
      count: buckets[key],
      percent: total > 0 ? Math.round((buckets[key] / total) * 1000) / 10 : 0,
    }));

    success(res, { total, stages, byStatus });
  } catch (err) {
    console.error("Lead funnel error:", err);
    error(res, "Voronka hisobotini olishda xatolik");
  }
};

// Tashkent (UTC+5) bo'yicha soat va ish vaqti tekshiruvi
const WORK_START = 9; // 09:00
const WORK_END = 18; // 18:00
function tashkentHour(d: Date): number {
  return (d.getUTCHours() + 5) % 24;
}
function tashkentDay(d: Date): number {
  // 0=yakshanba ... 6=shanba (Tashkent)
  const shifted = new Date(d.getTime() + 5 * 3600 * 1000);
  return shifted.getUTCDay();
}
function isOffHours(d: Date): boolean {
  const h = tashkentHour(d);
  const day = tashkentDay(d);
  if (day === 0) return true; // yakshanba — dam
  return h < WORK_START || h >= WORK_END;
}

// GET /api/analytics/new-noanswer — Yangi → "Yangi ko'tarmadi" (#8)
// Snapshot (joriy holat). To'liq "o'tish" soni uchun lead history sync kerak.
export const getNewNoAnswer = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const base: Record<string, unknown> = { companyId };
    if (range) base.dateCreate = range;

    const newCount = await prisma.lead.count({
      where: { ...base, statusId: "NEW" },
    });
    // "Yangi Ko'tarmadi" — apostrof xavfsiz substring "tarmadi"
    const noAnswerCount = await prisma.lead.count({
      where: { ...base, statusName: { contains: "tarmadi" } },
    });
    const newStageTotal = newCount + noAnswerCount;
    const noAnswerPercent =
      newStageTotal > 0 ? Math.round((noAnswerCount / newStageTotal) * 1000) / 10 : 0;

    success(res, {
      newCount,
      noAnswerCount,
      newStageTotal,
      noAnswerPercent,
      note: "Snapshot (joriy holat). To'liq o'tish soni uchun Bitrix lead history sync kerak.",
    });
  } catch (err) {
    console.error("New/noanswer error:", err);
    error(res, "Hisobotda xatolik");
  }
};

// GET /api/analytics/response-time — javob vaqti KPI + ish vaqtidan tashqari ajratish (#6)
export const getResponseTime = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const leadWhere: Record<string, unknown> = { companyId };
    if (range) leadWhere.dateCreate = range;

    const leads = await prisma.lead.findMany({
      where: leadWhere,
      select: { bitrixLeadId: true, dateCreate: true },
    });

    // Yozuvli qo'ng'iroqlar (AudioFile) — lead bo'yicha eng birinchi qo'ng'iroq vaqti
    const calls = await prisma.audioFile.findMany({
      where: { companyId, crmLeadId: { not: null }, callDate: { not: null } },
      select: { crmLeadId: true, callDate: true },
    });
    const firstCallByLead = new Map<string, Date>();
    for (const c of calls) {
      const key = String(c.crmLeadId);
      const t = c.callDate as Date;
      const prev = firstCallByLead.get(key);
      if (!prev || t < prev) firstCallByLead.set(key, t);
    }

    let offHoursLeads = 0;
    const inHoursTimes: number[] = []; // daqiqalarda (ish vaqtida tushgan leadlar)
    const offHoursTimes: number[] = [];
    let respondedInHours = 0;
    let inHoursLeads = 0;

    for (const l of leads) {
      const created = l.dateCreate as Date;
      const off = isOffHours(created);
      if (off) offHoursLeads += 1;
      else inHoursLeads += 1;

      const fc = firstCallByLead.get(String(l.bitrixLeadId));
      if (fc && fc > created) {
        const mins = (fc.getTime() - created.getTime()) / 60000;
        if (off) offHoursTimes.push(mins);
        else {
          inHoursTimes.push(mins);
          respondedInHours += 1;
        }
      }
    }

    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const median = (arr: number[]) => {
      if (!arr.length) return null;
      const s = [...arr].sort((a, b) => a - b);
      return Math.round(s[Math.floor(s.length / 2)]);
    };

    success(res, {
      totalLeads: leads.length,
      inHoursLeads,
      offHoursLeads,
      offHoursPercent:
        leads.length > 0 ? Math.round((offHoursLeads / leads.length) * 1000) / 10 : 0,
      // Response-time KPI — FAQAT ish vaqtida tushgan leadlar bo'yicha (off-hours ajratilgan)
      responseTime: {
        respondedLeads: respondedInHours,
        avgMinutes: avg(inHoursTimes),
        medianMinutes: median(inHoursTimes),
      },
      offHoursResponseTime: {
        respondedLeads: offHoursTimes.length,
        avgMinutes: avg(offHoursTimes),
      },
      workHours: `${WORK_START}:00–${WORK_END}:00 (Tashkent), yakshanba dam`,
      note: "Javob vaqti yozuvli qo'ng'iroqlar (AudioFile) bo'yicha — javobsiz urinishlar Activity sync'dan keyin qo'shiladi.",
    });
  } catch (err) {
    console.error("Response time error:", err);
    error(res, "Javob vaqti hisobotida xatolik");
  }
};
