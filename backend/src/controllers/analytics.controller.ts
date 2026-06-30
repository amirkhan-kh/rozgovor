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

// GET /api/analytics/lead-transfers — lead transfer (kim→kim) tarixi
// Manba: bir mijoz raqamiga (phoneNumber) tegishli qo'ng'iroqlar vaqt ketma-ketligi.
// Qo'ng'iroq qiluvchi menejer o'zgarsa → lead o'sha menejerdan boshqasiga "o'tgan".
// ⚠️ CRM "responsible" o'zgarish tarixi Bitrix REST'da yo'q → bu qo'ng'iroq asosidagi taxmin.
export const getLeadTransfers = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 0;
    const sinceMs = days > 0 ? Date.now() - days * 86400_000 : 0;

    const managers = await prisma.manager.findMany({
      where: { companyId },
      select: { id: true, name: true },
    });
    const nameOf = new Map(managers.map((m) => [m.id, m.name]));

    const calls = await prisma.audioFile.findMany({
      where: { companyId, phoneNumber: { not: null }, managerId: { not: null } },
      select: { phoneNumber: true, managerId: true, callDate: true, createdAt: true },
    });

    // phoneNumber bo'yicha guruh
    const byPhone = new Map<string, Array<{ managerId: string; at: number }>>();
    for (const c of calls) {
      const at = (c.callDate || c.createdAt).getTime();
      const arr = byPhone.get(c.phoneNumber!) || [];
      arr.push({ managerId: c.managerId!, at });
      byPhone.set(c.phoneNumber!, arr);
    }

    // Transfer eventlarini aniqlash (menejer o'zgargan nuqtalar)
    const transfers: Array<{ phone: string; from: string; to: string; at: number }> = [];
    for (const [phone, arr] of byPhone) {
      arr.sort((a, b) => a.at - b.at);
      let prev: string | null = null;
      for (const c of arr) {
        if (prev && prev !== c.managerId) transfers.push({ phone, from: prev, to: c.managerId, at: c.at });
        prev = c.managerId;
      }
    }

    const filtered = sinceMs > 0 ? transfers.filter((t) => t.at >= sinceMs) : transfers;

    // Menejer kesimida berilgan/qabul qilingan
    const per = new Map<string, { given: number; received: number }>();
    const flowMap = new Map<string, number>();
    for (const t of filtered) {
      const g = per.get(t.from) || { given: 0, received: 0 };
      g.given += 1;
      per.set(t.from, g);
      const r = per.get(t.to) || { given: 0, received: 0 };
      r.received += 1;
      per.set(t.to, r);
      const fk = `${t.from}|${t.to}`;
      flowMap.set(fk, (flowMap.get(fk) || 0) + 1);
    }

    const perManager = Array.from(per.entries())
      .map(([id, v]) => ({
        managerId: id,
        name: nameOf.get(id) || "Noma'lum",
        given: v.given,
        received: v.received,
        net: v.received - v.given,
      }))
      .sort((a, b) => b.given + b.received - (a.given + a.received));

    const flows = Array.from(flowMap.entries())
      .map(([k, count]) => {
        const [from, to] = k.split("|");
        return { from, to, fromName: nameOf.get(from) || "Noma'lum", toName: nameOf.get(to) || "Noma'lum", count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const recent = [...filtered]
      .sort((a, b) => b.at - a.at)
      .slice(0, 30)
      .map((t) => ({
        phone: t.phone,
        fromName: nameOf.get(t.from) || "Noma'lum",
        toName: nameOf.get(t.to) || "Noma'lum",
        at: new Date(t.at).toISOString(),
      }));

    let topGiver: { name: string; count: number } | null = null;
    let topReceiver: { name: string; count: number } | null = null;
    for (const m of perManager) {
      if (m.given > 0 && (!topGiver || m.given > topGiver.count)) topGiver = { name: m.name, count: m.given };
      if (m.received > 0 && (!topReceiver || m.received > topReceiver.count)) topReceiver = { name: m.name, count: m.received };
    }

    success(res, {
      total: filtered.length,
      managersInvolved: perManager.length,
      uniqueLeads: new Set(filtered.map((t) => t.phone)).size,
      topGiver,
      topReceiver,
      perManager,
      flows,
      recent,
      note: "Qo'ng'iroqlar asosida hisoblangan: bir mijoz raqami bo'yicha qo'ng'iroq qilgan menejer vaqt o'tib o'zgarsa, lead o'tgan deb sanaladi. CRM 'responsible' o'zgarish tarixi Bitrix REST'da mavjud emas.",
    });
  } catch (err) {
    console.error("Lead transfers error:", err);
    error(res, "Transfer tarixini olishda xatolik");
  }
};
