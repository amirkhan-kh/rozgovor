import { Request, Response } from "express";
import axios from "axios";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { BITRIX_WEBHOOK_URL } from "../utils/bitrix-config";

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
    const range = parseRange(req);
    const gte = range?.gte ? range.gte.getTime() : null;
    const lte = range?.lte ? range.lte.getTime() : null;
    const mgrRaw = (req.query.managerIds as string) || (req.query.managerId as string) || "";
    const mgrFilter = new Set(mgrRaw.split(",").map((s) => s.trim()).filter(Boolean));

    const managers = await prisma.manager.findMany({
      where: { companyId },
      select: { id: true, name: true, photoUrl: true, customPhotoUrl: true },
    });
    const nameOf = new Map(managers.map((m) => [m.id, m.name]));
    const photoOf = new Map(managers.map((m) => [m.id, m.customPhotoUrl || m.photoUrl || null]));

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

    const filtered = transfers.filter((t) => {
      if (gte !== null && t.at < gte) return false;
      if (lte !== null && t.at > lte) return false;
      if (mgrFilter.size && !mgrFilter.has(t.from) && !mgrFilter.has(t.to)) return false;
      return true;
    });

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
        photo: photoOf.get(id) || null,
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

// GET /api/analytics/quality-trend — sifatsiz/qayta obrabotka oyma-oy
//  mode=cohort (A, default): lead YARATILGAN oy bo'yicha guruh + joriy status (foiz). Lokal DB.
//  mode=transition (B): Bitrix status tarixidan shu oy ichida sifatsiz/qaytaga O'TKAZILGAN leadlar soni.
const UZ_MONTH = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
const qTransitionCache = new Map<string, { ts: number; data: any }>();

// Tanlangan oraliq yoki oxirgi N oy uchun {y,m} ro'yxati (m: 0-11)
function buildMonthsList(range: { gte?: Date; lte?: Date } | null, monthsBack: number): { y: number; m: number }[] {
  const list: { y: number; m: number }[] = [];
  if (range && (range.gte || range.lte)) {
    const start = range.gte ? new Date(range.gte) : new Date(range.lte!);
    const end = range.lte ? new Date(range.lte) : new Date();
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    const ey = end.getUTCFullYear();
    const em = end.getUTCMonth();
    while ((y < ey || (y === ey && m <= em)) && list.length < 36) {
      list.push({ y, m });
      m++;
      if (m > 11) { m = 0; y++; }
    }
  } else {
    const now = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({ y: d.getFullYear(), m: d.getMonth() });
    }
  }
  return list;
}

export const getQualityTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const monthsBack = req.query.months ? parseInt(req.query.months as string, 10) : 12;
    const mode = (req.query.mode as string) === "transition" ? "transition" : "cohort";
    const range = parseRange(req);
    const hasRange = !!(range && (range.gte || range.lte));
    const mgrRaw = (req.query.managerIds as string) || (req.query.managerId as string) || "";
    const mgrIds = mgrRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const monthsList = buildMonthsList(range, monthsBack);
    const pad = (n: number) => String(n).padStart(2, "0");

    // ── A: cohort (lokal DB) ──────────────────────────────────────────
    if (mode === "cohort") {
      const where: Record<string, unknown> = { companyId };
      if (mgrIds.length) where.responsibleManagerId = mgrIds.length === 1 ? mgrIds[0] : { in: mgrIds };
      const leads = await prisma.lead.findMany({
        where,
        select: { dateCreate: true, statusId: true, statusName: true, isConverted: true },
      });
      const byMonth = new Map<string, { total: number; sifatsiz: number; qayta: number }>();
      for (const l of leads) {
        if (!l.dateCreate) continue;
        const t = new Date(l.dateCreate.getTime() + 5 * 3600 * 1000); // Tashkent
        const key = `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
        const mm = byMonth.get(key) || { total: 0, sifatsiz: 0, qayta: 0 };
        mm.total += 1;
        const b = classifyLead(l.statusId, l.statusName, l.isConverted);
        if (b === "sifatsiz") mm.sifatsiz += 1;
        else if (b === "qayta_obrabotka") mm.qayta += 1;
        byMonth.set(key, mm);
      }
      let months = monthsList.map(({ y, m }) => {
        const key = `${y}-${pad(m + 1)}`;
        const v = byMonth.get(key) || { total: 0, sifatsiz: 0, qayta: 0 };
        const pct = (n: number) => (v.total > 0 ? Math.round((n / v.total) * 1000) / 10 : 0);
        return {
          month: key, label: UZ_MONTH[m], year: y, total: v.total,
          sifatsizCount: v.sifatsiz, sifatsizPct: pct(v.sifatsiz),
          qaytaCount: v.qayta, qaytaPct: pct(v.qayta),
        };
      });
      if (!hasRange) months = months.filter((mo) => mo.total > 0); // default: bo'sh oylarni yashir
      const last = months[months.length - 1] || null;
      const prev = months[months.length - 2] || null;
      const delta = last && prev
        ? { sifatsiz: Math.round((last.sifatsizPct - prev.sifatsizPct) * 10) / 10, qayta: Math.round((last.qaytaPct - prev.qaytaPct) * 10) / 10 }
        : null;
      success(res, {
        mode: "cohort", months, latest: last, delta,
        note: "Yaratilgan oy bo'yicha (intake cohort): har oy kelgan leadlarning joriy statusi. Lokal DB.",
      });
      return;
    }

    // ── B: transition (Bitrix status tarixi) ──────────────────────────
    const cacheKey = `${companyId}:transition:${monthsList[0]?.y}-${monthsList[0]?.m}:${monthsList.length}`;
    const cached = qTransitionCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) { success(res, cached.data); return; }

    // sifatsiz/qayta statusId'lari (dinamik — hardcode emas)
    const rows = await prisma.lead.groupBy({ by: ["statusId", "statusName", "isConverted"], where: { companyId }, _count: { bitrixLeadId: true } });
    const sifIds: string[] = [];
    const qayIds: string[] = [];
    rows.forEach((r) => {
      if (!r.statusId) return;
      const b = classifyLead(r.statusId, r.statusName, r.isConverted);
      if (b === "sifatsiz") sifIds.push(r.statusId);
      else if (b === "qayta_obrabotka") qayIds.push(r.statusId);
    });

    const base = BITRIX_WEBHOOK_URL.replace(/\/+$/, "");
    const bcount = async (ids: string[], start: string, end: string): Promise<number> => {
      if (!ids.length) return 0;
      try {
        const r = await axios.post(
          `${base}/crm.stagehistory.list.json`,
          { entityTypeId: 1, filter: { STATUS_ID: ids, ">=CREATED_TIME": start, "<CREATED_TIME": end }, start: 0 },
          { timeout: 20000 },
        );
        return r.data.total || 0;
      } catch {
        return 0;
      }
    };

    const monthsR: any[] = [];
    for (const { y, m } of monthsList) {
      const start = `${y}-${pad(m + 1)}-01T00:00:00`;
      const ny = m === 11 ? y + 1 : y;
      const nm = m === 11 ? 0 : m + 1;
      const end = `${ny}-${pad(nm + 1)}-01T00:00:00`;
      const [sif, qay] = await Promise.all([bcount(sifIds, start, end), bcount(qayIds, start, end)]);
      monthsR.push({ month: `${y}-${pad(m + 1)}`, label: UZ_MONTH[m], year: y, sifatsizCount: sif, qaytaCount: qay });
    }
    const last = monthsR[monthsR.length - 1] || null;
    const prev = monthsR[monthsR.length - 2] || null;
    const delta = last && prev ? { sifatsiz: last.sifatsizCount - prev.sifatsizCount, qayta: last.qaytaCount - prev.qaytaCount } : null;
    const data = {
      mode: "transition", months: monthsR, latest: last, delta,
      note: "Bitrix status tarixi: shu oy ichida sifatsiz/qaytaga O'TKAZILGAN leadlar soni. Menejer filtri bu rejimda qo'llanmaydi.",
    };
    qTransitionCache.set(cacheKey, { ts: Date.now(), data });
    success(res, data);
  } catch (err) {
    console.error("Quality trend error:", err);
    error(res, "Sifat trendini olishda xatolik");
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Umumiy yordamchilar (yangi analitika endpointlari uchun)
// ─────────────────────────────────────────────────────────────────────────
async function loadManagers(companyId: string) {
  const managers = await prisma.manager.findMany({
    where: { companyId },
    select: { id: true, name: true, photoUrl: true, customPhotoUrl: true, departmentId: true, role: true, isActive: true },
  });
  const nameOf = new Map(managers.map((m) => [m.id, m.name]));
  const photoOf = new Map(managers.map((m) => [m.id, m.customPhotoUrl || m.photoUrl || null]));
  return { managers, nameOf, photoOf };
}
const hasAny = (n: string, keys: string[]) => keys.some((k) => n.includes(k));
const avgOf = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
const medianOf = (arr: number[]) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
};
const pct1 = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

// ── CRM yakuniy holatini nomdan aniqlash (won / lost / open) ──────────────
function crmOutcome(statusName: string | null, isSale?: boolean | null): "won" | "lost" | "open" {
  if (isSale) return "won";
  const n = (statusName || "").toLowerCase();
  if (!n) return "open";
  if (hasAny(n, ["sotil", "sotuv", "konvert", "оплач", "успеш", "won", "yopildi"])) return "won";
  if (hasAny(n, ["sifatsiz", "rad", "otkaz", "отказ", "провал", "dubl", "дубл", "xato", "spam", "brak", "tarmadi", "fail", "yo'q raqam", "bog'lanib bo'lmadi"]))
    return "lost";
  return "open";
}

// ═════════════════════════════════════════════════════════════════════════
// #14 — AI tahlil bilan noto'g'ri stage aniqlash
// AI bashorati (leadHeatScore/leadQuality) ni menejer qo'ygan CRM stage bilan
// solishtirib mos kelmaganlarni flag qiladi: "AI issiq dedi → CRM rad/yopildi"
// va "AI sovuq dedi → CRM sotildi".
// ═════════════════════════════════════════════════════════════════════════
const HOT_THRESHOLD = 70;
const COLD_THRESHOLD = 35;
export const getStageMismatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const { nameOf, photoOf } = await loadManagers(companyId);

    const where: Record<string, unknown> = { companyId, analysis: { isNot: null } };
    if (range) where.callDate = range;

    const audios = await prisma.audioFile.findMany({
      where,
      select: {
        id: true,
        phoneNumber: true,
        managerId: true,
        callDate: true,
        statusName: true,
        isSale: true,
        duration: true,
        crmLeadId: true,
        leadId: true,
        analysis: { select: { leadHeatScore: true, leadScore: true, overallScore: true, leadQuality: true } },
      },
      orderBy: { callDate: "desc" },
    });

    // CRM holatini deal/lead jadvalidan olish (audio.statusName ko'pincha bo'sh).
    // crmLeadId/leadId → SalesLead.leadId (deal) yoki Lead.bitrixLeadId.
    const deals = await prisma.salesLead.findMany({
      where: { companyId },
      select: { leadId: true, statusName: true, semanticId: true, isSale: true },
    });
    const dealById = new Map<number, { statusName: string | null; isSale: boolean }>();
    for (const d of deals) dealById.set(d.leadId, { statusName: d.statusName, isSale: d.semanticId === "S" || d.isSale });
    const leadRows = await prisma.lead.findMany({
      where: { companyId },
      select: { bitrixLeadId: true, statusName: true, isConverted: true },
    });
    const leadById = new Map<number, { statusName: string | null; isSale: boolean }>();
    for (const l of leadRows) leadById.set(l.bitrixLeadId, { statusName: l.statusName, isSale: l.isConverted });

    // audio → eng ishonchli CRM holati
    const resolveCrm = (a: { crmLeadId: string | null; leadId: number | null; statusName: string | null; isSale: boolean | null }) => {
      const idNum = a.leadId ?? (a.crmLeadId != null && /^\d+$/.test(a.crmLeadId) ? Number(a.crmLeadId) : null);
      if (idNum != null) {
        const d = dealById.get(idNum);
        if (d) return { statusName: d.statusName, isSale: d.isSale };
        const l = leadById.get(idNum);
        if (l) return { statusName: l.statusName, isSale: l.isSale };
      }
      return { statusName: a.statusName, isSale: a.isSale || false };
    };

    type Flag = {
      audioFileId: string;
      phone: string | null;
      managerName: string;
      managerPhoto: string | null;
      heatScore: number;
      statusName: string | null;
      outcome: string;
      type: "hot_but_lost" | "cold_but_won";
      callDate: string | null;
    };
    const flags: Flag[] = [];
    const perMgr = new Map<string, { hotLost: number; coldWon: number; analyzed: number }>();
    let analyzed = 0;
    let hotButLost = 0;
    let coldButWon = 0;

    for (const a of audios) {
      const an = a.analysis;
      if (!an) continue;
      const heat = an.leadHeatScore ?? an.leadScore ?? an.overallScore ?? null;
      if (heat == null) continue;
      analyzed += 1;
      const mid = a.managerId || "";
      const agg = perMgr.get(mid) || { hotLost: 0, coldWon: 0, analyzed: 0 };
      agg.analyzed += 1;
      const crm = resolveCrm(a);
      const outcome = crmOutcome(crm.statusName, crm.isSale);
      let type: Flag["type"] | null = null;
      if (heat >= HOT_THRESHOLD && outcome === "lost") { type = "hot_but_lost"; hotButLost += 1; agg.hotLost += 1; }
      else if (heat <= COLD_THRESHOLD && outcome === "won") { type = "cold_but_won"; coldButWon += 1; agg.coldWon += 1; }
      perMgr.set(mid, agg);
      if (type) {
        flags.push({
          audioFileId: a.id,
          phone: a.phoneNumber,
          managerName: nameOf.get(mid) || "Noma'lum",
          managerPhoto: photoOf.get(mid) || null,
          heatScore: heat,
          statusName: crm.statusName,
          outcome,
          type,
          callDate: a.callDate ? a.callDate.toISOString() : null,
        });
      }
    }

    const byManager = Array.from(perMgr.entries())
      .filter(([id]) => id)
      .map(([id, v]) => ({
        managerId: id,
        name: nameOf.get(id) || "Noma'lum",
        photo: photoOf.get(id) || null,
        analyzed: v.analyzed,
        hotButLost: v.hotLost,
        coldButWon: v.coldWon,
        mismatchPct: pct1(v.hotLost + v.coldWon, v.analyzed),
      }))
      .sort((a, b) => b.hotButLost + b.coldButWon - (a.hotButLost + a.coldButWon));

    const mismatchTotal = hotButLost + coldButWon;
    success(res, {
      analyzed,
      hotButLost,
      coldButWon,
      mismatchTotal,
      mismatchPct: pct1(mismatchTotal, analyzed),
      byManager: byManager.slice(0, 20),
      flags: flags
        .sort((a, b) => (b.type === "hot_but_lost" ? 1 : 0) - (a.type === "hot_but_lost" ? 1 : 0) || b.heatScore - a.heatScore)
        .slice(0, 40),
      thresholds: { hot: HOT_THRESHOLD, cold: COLD_THRESHOLD },
      note: "AI 'issiqlik balli' (leadHeatScore) menejer qo'ygan CRM stage bilan solishtiriladi. 'Issiq → rad/yopildi' yoki 'sovuq → sotildi' nomuvofiqliklar belgilanadi. Faqat tahlil qilingan qo'ng'iroqlar.",
    });
  } catch (err) {
    console.error("Stage mismatch error:", err);
    error(res, "Stage nomuvofiqligini olishda xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #16 — Menejer kesimida birinchi-aloqa (javob) vaqti
// Lead.dateCreate → o'sha lead bo'yicha eng birinchi yozuvli qo'ng'iroq vaqti.
// Lead egasi (responsibleManagerId) bo'yicha guruhlanadi.
// ═════════════════════════════════════════════════════════════════════════
export const getResponseTimeByManager = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const { nameOf, photoOf } = await loadManagers(companyId);

    const leadWhere: Record<string, unknown> = { companyId, responsibleManagerId: { not: null } };
    if (range) leadWhere.dateCreate = range;
    const leads = await prisma.lead.findMany({
      where: leadWhere,
      select: { bitrixLeadId: true, dateCreate: true, responsibleManagerId: true },
    });

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

    const per = new Map<string, { leads: number; times: number[] }>();
    for (const l of leads) {
      const mid = l.responsibleManagerId!;
      const agg = per.get(mid) || { leads: 0, times: [] };
      agg.leads += 1;
      const fc = firstCallByLead.get(String(l.bitrixLeadId));
      const created = l.dateCreate as Date;
      if (fc && fc > created) agg.times.push((fc.getTime() - created.getTime()) / 60000);
      per.set(mid, agg);
    }

    const byManager = Array.from(per.entries())
      .map(([id, v]) => ({
        managerId: id,
        name: nameOf.get(id) || "Noma'lum",
        photo: photoOf.get(id) || null,
        leads: v.leads,
        respondedLeads: v.times.length,
        avgMinutes: avgOf(v.times),
        medianMinutes: medianOf(v.times),
      }))
      .filter((m) => m.respondedLeads > 0)
      .sort((a, b) => (a.avgMinutes ?? 1e9) - (b.avgMinutes ?? 1e9));

    const allTimes: number[] = [];
    for (const v of per.values()) allTimes.push(...v.times);

    success(res, {
      managers: byManager.length,
      companyAvgMinutes: avgOf(allTimes),
      companyMedianMinutes: medianOf(allTimes),
      fastest: byManager[0] || null,
      slowest: byManager.length ? byManager[byManager.length - 1] : null,
      byManager,
      note: "Lead yaratilgan vaqtdan o'sha lead bo'yicha menejerning birinchi yozuvli qo'ng'irog'igacha. Menejer = lead egasi (responsibleManagerId). Javobsiz urinishlar hisobga olinmaydi.",
    });
  } catch (err) {
    console.error("Response time by manager error:", err);
    error(res, "Menejer javob vaqtini olishda xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #17 — Operator → sotuvchi transfer vaqti
// Bir mijoz raqami bo'yicha birinchi menejer (operator) birinchi qo'ng'irog'i
// va keyingi menejer (sotuvchi) birinchi qo'ng'irog'i orasidagi vaqt.
// ⚠️ CRM 'responsible' o'zgarish tarixi Bitrix REST'da yo'q → qo'ng'iroq proxy.
// ═════════════════════════════════════════════════════════════════════════
export const getTransferTime = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const gte = range?.gte ? range.gte.getTime() : null;
    const lte = range?.lte ? range.lte.getTime() : null;

    const calls = await prisma.audioFile.findMany({
      where: { companyId, phoneNumber: { not: null }, managerId: { not: null } },
      select: { phoneNumber: true, managerId: true, callDate: true, createdAt: true },
    });
    const byPhone = new Map<string, Array<{ managerId: string; at: number }>>();
    for (const c of calls) {
      const at = (c.callDate || c.createdAt).getTime();
      const arr = byPhone.get(c.phoneNumber!) || [];
      arr.push({ managerId: c.managerId!, at });
      byPhone.set(c.phoneNumber!, arr);
    }

    const gaps: number[] = []; // soatlarda — birinchi transfergacha
    for (const [, arr] of byPhone) {
      arr.sort((a, b) => a.at - b.at);
      const firstMgr = arr[0].managerId;
      const firstAt = arr[0].at;
      // keyingi boshqa menejerning birinchi qo'ng'irog'i
      const handoff = arr.find((c) => c.managerId !== firstMgr);
      if (!handoff) continue;
      if (gte !== null && handoff.at < gte) continue;
      if (lte !== null && handoff.at > lte) continue;
      gaps.push((handoff.at - firstAt) / 3600000);
    }

    const within1h = gaps.filter((g) => g <= 1).length;
    const within24h = gaps.filter((g) => g <= 24).length;
    const over24h = gaps.filter((g) => g > 24).length;
    const buckets = [
      { key: "lt1h", label: "< 1 soat", count: within1h },
      { key: "h1_24", label: "1–24 soat", count: gaps.filter((g) => g > 1 && g <= 24).length },
      { key: "d1_3", label: "1–3 kun", count: gaps.filter((g) => g > 24 && g <= 72).length },
      { key: "gt3d", label: "> 3 kun", count: gaps.filter((g) => g > 72).length },
    ];

    success(res, {
      transfers: gaps.length,
      avgHours: gaps.length ? Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10 : null,
      medianHours: gaps.length ? Math.round((([...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]) as number) * 10) / 10 : null,
      within1h,
      within1hPct: pct1(within1h, gaps.length),
      within24h,
      over24h,
      buckets,
      note: "Bir mijoz raqami bo'yicha birinchi menejerdan ikkinchi menejerga o'tish vaqti (qo'ng'iroqlar ketma-ketligiga asoslangan proxy). CRM egasini o'zgartirish tarixi Bitrix REST'da mavjud emas.",
    });
  } catch (err) {
    console.error("Transfer time error:", err);
    error(res, "Transfer vaqtini olishda xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #19 — PBX / extension mapping (menejer ↔ Bitrix user id)
// Bog'lanish statik: Manager.id = "bitrix_<USER_ID>". Tarixiy emas.
// ═════════════════════════════════════════════════════════════════════════
export const getPbxMapping = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const { managers } = await loadManagers(companyId);
    const depts = await prisma.department.findMany({ where: { companyId }, select: { id: true, name: true } });
    const deptName = new Map(depts.map((d) => [d.id, d.name]));

    // har menejer uchun qo'ng'iroq activity soni (TYPE_ID 2 = qo'ng'iroq; 1 ham)
    const acts = await prisma.activity.groupBy({
      by: ["managerId"],
      where: { companyId, typeId: { in: [1, 2] }, managerId: { not: null } },
      _count: { _all: true },
    });
    const callCount = new Map(acts.map((a) => [a.managerId as string, a._count._all]));

    const rows = managers
      .map((m) => ({
        managerId: m.id,
        bitrixUserId: m.id.startsWith("bitrix_") ? m.id.replace("bitrix_", "") : null,
        name: m.name,
        photo: m.customPhotoUrl || m.photoUrl || null,
        department: m.departmentId ? deptName.get(m.departmentId) || null : null,
        role: m.role,
        isActive: m.isActive,
        callActivities: callCount.get(m.id) || 0,
      }))
      .sort((a, b) => b.callActivities - a.callActivities);

    success(res, {
      total: rows.length,
      mapped: rows.filter((r) => r.bitrixUserId).length,
      rows,
      note: "PBX/extension bog'lanish statik: Manager.id = 'bitrix_<USER_ID>'. Bitrix qo'ng'iroqda user-ID bergani uchun tarixiy mapping amalda shart emas.",
    });
  } catch (err) {
    console.error("PBX mapping error:", err);
    error(res, "PBX mappingni olishda xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #21 + #22 — Prezentatsiya candidate (5+ daqiqa) va sun'iy cho'zilgan suhbat
// #21: duration >= 5 daqiqa → prezentatsiya nomzodi (avtomatik).
// #22: uzun (>=5 daq) lekin sifat past (overallScore past) → "sun'iy cho'zilgan".
// ═════════════════════════════════════════════════════════════════════════
const PRESENT_MIN_SEC = 5 * 60; // 5 daqiqa
const FAKE_SCORE_MAX = 45; // bundan past ball + uzun = shubhali
export const getPresentations = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const { nameOf, photoOf } = await loadManagers(companyId);

    const where: Record<string, unknown> = { companyId, duration: { not: null } };
    if (range) where.callDate = range;
    const audios = await prisma.audioFile.findMany({
      where,
      select: {
        id: true,
        phoneNumber: true,
        managerId: true,
        callDate: true,
        duration: true,
        analysis: { select: { overallScore: true } },
      },
      orderBy: { duration: "desc" },
    });

    let totalCalls = 0;
    let candidateCount = 0;
    const candidateDurations: number[] = [];
    let suspiciousCount = 0;
    const suspiciousList: any[] = [];
    const perMgr = new Map<string, { candidates: number; suspicious: number }>();

    for (const a of audios) {
      const dur = a.duration || 0;
      totalCalls += 1;
      const mid = a.managerId || "";
      const isCandidate = dur >= PRESENT_MIN_SEC;
      if (!isCandidate) continue;
      candidateCount += 1;
      candidateDurations.push(dur);
      const agg = perMgr.get(mid) || { candidates: 0, suspicious: 0 };
      agg.candidates += 1;
      const score = a.analysis?.overallScore ?? null;
      const suspicious = score != null && score < FAKE_SCORE_MAX;
      if (suspicious) {
        suspiciousCount += 1;
        agg.suspicious += 1;
        suspiciousList.push({
          audioFileId: a.id,
          phone: a.phoneNumber,
          managerName: nameOf.get(mid) || "Noma'lum",
          managerPhoto: photoOf.get(mid) || null,
          durationSec: dur,
          score,
          callDate: a.callDate ? a.callDate.toISOString() : null,
        });
      }
      perMgr.set(mid, agg);
    }

    const byManager = Array.from(perMgr.entries())
      .filter(([id]) => id)
      .map(([id, v]) => ({
        managerId: id,
        name: nameOf.get(id) || "Noma'lum",
        photo: photoOf.get(id) || null,
        candidates: v.candidates,
        suspicious: v.suspicious,
      }))
      .sort((a, b) => b.candidates - a.candidates);

    success(res, {
      totalCalls,
      candidateCount,
      candidatePct: pct1(candidateCount, totalCalls),
      avgCandidateMinutes: candidateDurations.length ? Math.round((candidateDurations.reduce((a, b) => a + b, 0) / candidateDurations.length / 60) * 10) / 10 : null,
      suspiciousCount,
      suspiciousPct: pct1(suspiciousCount, candidateCount),
      byManager: byManager.slice(0, 20),
      suspiciousList: suspiciousList.slice(0, 40),
      thresholds: { presentMinutes: PRESENT_MIN_SEC / 60, fakeScoreMax: FAKE_SCORE_MAX },
      note: "5+ daqiqalik qo'ng'iroqlar avtomatik prezentatsiya nomzodi. Uzun bo'lib, lekin AI bahosi past (<45) bo'lganlari 'sun'iy cho'zilgan' deb belgilanadi.",
    });
  } catch (err) {
    console.error("Presentations error:", err);
    error(res, "Prezentatsiya tahlilini olishda xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #23 + #24 + #25 + #27 — To'lov va konversiya tahlili (SalesLead)
// #23 "3 kun ichida to'lov" real foizi (closedAt − leadCreatedAt)
// #24 Qisman to'lov → to'liq sotuv konversiyasi (isPartialPayment)
// #25 Kelajak-sana (agreedPaymentDate) stagedan sotuvga konversiya
// #27 To'lov muddati o'tganlar (agreedPaymentDate < bugun, hali sotilmagan)
// ═════════════════════════════════════════════════════════════════════════
export const getPaymentAnalytics = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const { nameOf, photoOf } = await loadManagers(companyId);
    const now = Date.now();

    // ── #23 To'lov tezligi (won deallar) ──
    const wonWhere: Record<string, unknown> = { companyId, semanticId: "S", closedAt: { not: null } };
    if (range) wonWhere.closedAt = range;
    const wonDeals = await prisma.salesLead.findMany({
      where: wonWhere,
      select: { closedAt: true, leadCreatedAt: true },
    });
    const daysList: number[] = [];
    for (const d of wonDeals) {
      if (!d.closedAt || !d.leadCreatedAt) continue;
      const days = (d.closedAt.getTime() - d.leadCreatedAt.getTime()) / 86400000;
      if (days >= 0) daysList.push(days);
    }
    const within = (n: number) => daysList.filter((d) => d <= n).length;
    const paymentSpeed = {
      sales: daysList.length,
      within1: within(1),
      within3: within(3),
      within7: within(7),
      within3Pct: pct1(within(3), daysList.length),
      within7Pct: pct1(within(7), daysList.length),
      avgDays: daysList.length ? Math.round((daysList.reduce((a, b) => a + b, 0) / daysList.length) * 10) / 10 : null,
      medianDays: daysList.length ? Math.round(([...daysList].sort((a, b) => a - b)[Math.floor(daysList.length / 2)]) * 10) / 10 : null,
      buckets: [
        { key: "d0_1", label: "0–1 kun", count: within(1) },
        { key: "d1_3", label: "1–3 kun", count: within(3) - within(1) },
        { key: "d3_7", label: "3–7 kun", count: within(7) - within(3) },
        { key: "d7p", label: "7+ kun", count: daysList.length - within(7) },
      ],
    };

    // ── #24 Qisman to'lov → to'liq konversiya ──
    // isPartialPayment flag (ProSales) YOKI to'lov bosqichi nomi (Rozgovor:
    // "Kitob sotib olganlar"/"Nasiya limit" = qisman, "100% To'lov" = to'liq).
    const PARTIAL_KEYS = ["qisman", "kitob sotib", "nasiya", "частичн", "qisman to'lov"];
    const FULL_KEYS = ["100% to'lov", "100 % to'lov", "to'liq to'lov", "полная оплата", "to'liq sotuv"];
    const partialWhere: Record<string, unknown> = { companyId };
    if (range) partialWhere.leadCreatedAt = range;
    const partialCand = await prisma.salesLead.findMany({
      where: partialWhere,
      select: { semanticId: true, isSale: true, statusName: true, isPartialPayment: true },
    });
    let pWon = 0, pFailed = 0, pOpen = 0, pBase = 0;
    for (const p of partialCand) {
      const sn = (p.statusName || "").toLowerCase();
      const inFunnel = p.isPartialPayment || hasAny(sn, PARTIAL_KEYS) || hasAny(sn, FULL_KEYS);
      if (!inFunnel) continue;
      pBase += 1;
      const won = p.semanticId === "S" || p.isSale || hasAny(sn, FULL_KEYS);
      if (won) pWon += 1;
      else if (p.semanticId === "F") pFailed += 1;
      else pOpen += 1;
    }
    // Rozgovor: to'lov bosqichlari Lead.statusName'da ("Kitob sotib olganlar",
    // "Nasiya limit" = qisman; "100% To'lov" = to'liq).
    const payLeadWhere: Record<string, unknown> = { companyId };
    if (range) payLeadWhere.dateCreate = range;
    const payLeads = await prisma.lead.findMany({
      where: payLeadWhere,
      select: { statusName: true, isConverted: true },
    });
    for (const l of payLeads) {
      const sn = (l.statusName || "").toLowerCase();
      const isFull = hasAny(sn, FULL_KEYS);
      const isPartial = hasAny(sn, PARTIAL_KEYS);
      if (!isFull && !isPartial) continue;
      pBase += 1;
      if (isFull || l.isConverted) pWon += 1;
      else pOpen += 1;
    }
    const partialConversion = {
      total: pBase,
      won: pWon,
      open: pOpen,
      failed: pFailed,
      conversionPct: pct1(pWon, pBase),
    };

    // ── #25 Kelajak-sana (agreedPaymentDate) → sotuvga konversiya ──
    const agreedWhere: Record<string, unknown> = { companyId, agreedPaymentDate: { not: null } };
    if (range) agreedWhere.leadCreatedAt = range;
    const agreed = await prisma.salesLead.findMany({
      where: agreedWhere,
      select: { semanticId: true, isSale: true, agreedPaymentDate: true },
    });
    let aWon = 0, aOpen = 0, aFailed = 0, aDatePassed = 0;
    for (const a of agreed) {
      const won = a.semanticId === "S" || a.isSale;
      if (won) aWon += 1;
      else if (a.semanticId === "F") aFailed += 1;
      else aOpen += 1;
      if (!won && a.agreedPaymentDate && a.agreedPaymentDate.getTime() < now) aDatePassed += 1;
    }
    const futureDateConversion = {
      total: agreed.length,
      won: aWon,
      open: aOpen,
      failed: aFailed,
      conversionPct: pct1(aWon, agreed.length),
      datePassedUnpaid: aDatePassed,
    };

    // ── #27 To'lov muddati o'tganlar (alert ro'yxati) ──
    const overdueDeals = await prisma.salesLead.findMany({
      where: {
        companyId,
        agreedPaymentDate: { not: null, lt: new Date() },
        semanticId: { notIn: ["S", "F"] },
        isSale: false,
      },
      select: {
        leadId: true,
        contactName: true,
        contactPhone: true,
        price: true,
        agreedPaymentDate: true,
        statusName: true,
        responsibleManagerId: true,
      },
      orderBy: { agreedPaymentDate: "asc" },
    });
    const overdueList = overdueDeals.map((d) => ({
      leadId: d.leadId,
      contactName: d.contactName,
      contactPhone: d.contactPhone,
      price: d.price,
      statusName: d.statusName,
      managerName: d.responsibleManagerId ? nameOf.get(d.responsibleManagerId) || "Noma'lum" : "—",
      managerPhoto: d.responsibleManagerId ? photoOf.get(d.responsibleManagerId) || null : null,
      agreedPaymentDate: d.agreedPaymentDate ? d.agreedPaymentDate.toISOString() : null,
      daysOverdue: d.agreedPaymentDate ? Math.floor((now - d.agreedPaymentDate.getTime()) / 86400000) : 0,
    }));
    const overdue = {
      count: overdueList.length,
      totalAmount: overdueList.reduce((s, d) => s + (d.price || 0), 0),
      list: overdueList.slice(0, 50),
    };

    success(res, {
      paymentSpeed,
      partialConversion,
      futureDateConversion,
      overdue,
      note: "To'lov tezligi won deal closedAt − leadCreatedAt bo'yicha. Qisman/kelajak-sana konversiyasi joriy holat (snapshot). Muddati o'tganlar: kelishilgan to'lov sanasi o'tgan, hali sotilmagan ochiq deallar.",
    });
  } catch (err) {
    console.error("Payment analytics error:", err);
    error(res, "To'lov tahlilini olishda xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #29 + #30 — Qo'ng'iroq urinishlari, ko'tarish foizi va "bog'lanib bo'lmadi"
// #30: Birinchi urinishda ko'tarish foizi — Activity (urinishlar) vs AudioFile
//      (javob berilgan/yozuvli) bo'yicha pickup-rate.
// #29: "ko'tarmadi → bog'lanib bo'lmadi" zanjiri — Lead status + urinish soni.
// ═════════════════════════════════════════════════════════════════════════
export const getCallAttempts = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);

    // Qo'ng'iroq activity'lari (urinishlar — javobsizlar ham).
    // Bitrix TYPE_ID: 2 = qo'ng'iroq (ba'zi instanslarda 1). Ikkalasini ham olamiz.
    const actWhere: Record<string, unknown> = { companyId, typeId: { in: [1, 2] }, leadId: { not: null } };
    if (range) actWhere.createdBitrix = range;
    const acts = await prisma.activity.findMany({
      where: actWhere,
      select: { leadId: true, createdBitrix: true, startTime: true },
    });
    const attemptsByLead = new Map<number, number>();
    for (const a of acts) {
      const lid = a.leadId as number;
      attemptsByLead.set(lid, (attemptsByLead.get(lid) || 0) + 1);
    }

    // Javob berilgan (yozuvli) qo'ng'iroqlar — AudioFile bo'lsa = ko'tarilgan.
    // leadId kam to'ldirilgan → crmLeadId (string) ni ham int sifatida olamiz.
    const answered = await prisma.audioFile.findMany({
      where: { companyId, OR: [{ leadId: { not: null } }, { crmLeadId: { not: null } }] },
      select: { leadId: true, crmLeadId: true },
    });
    const answeredLeads = new Set<number>();
    for (const a of answered) {
      if (a.leadId != null) answeredLeads.add(a.leadId);
      if (a.crmLeadId && /^\d+$/.test(a.crmLeadId)) answeredLeads.add(Number(a.crmLeadId));
    }

    const attemptedLeads = Array.from(attemptsByLead.keys());
    const answeredAmongAttempted = attemptedLeads.filter((id) => answeredLeads.has(id)).length;
    // Urinish taqsimoti
    let one = 0, two = 0, threePlus = 0;
    const attemptCounts: number[] = [];
    for (const n of attemptsByLead.values()) {
      attemptCounts.push(n);
      if (n === 1) one += 1;
      else if (n === 2) two += 1;
      else threePlus += 1;
    }
    const pickupRate = {
      attemptedLeads: attemptedLeads.length,
      answeredLeads: answeredAmongAttempted,
      pickupPct: pct1(answeredAmongAttempted, attemptedLeads.length),
      avgAttempts: attemptCounts.length ? Math.round((attemptCounts.reduce((a, b) => a + b, 0) / attemptCounts.length) * 10) / 10 : null,
      buckets: [
        { key: "a1", label: "1 urinish", count: one },
        { key: "a2", label: "2 urinish", count: two },
        { key: "a3p", label: "3+ urinish", count: threePlus },
      ],
    };

    // ── #29 No-contact zanjiri (Lead status bo'yicha snapshot) ──
    const leadWhere: Record<string, unknown> = { companyId };
    if (range) leadWhere.dateCreate = range;
    const leads = await prisma.lead.findMany({
      where: leadWhere,
      select: { statusId: true, statusName: true, rejectReasonName: true, isConverted: true },
    });
    let cNew = 0, cNoAnswer = 0, cUnreachable = 0, cConverted = 0, cTotal = 0;
    for (const l of leads) {
      cTotal += 1;
      const name = `${l.statusName || ""} ${l.rejectReasonName || ""}`.toLowerCase();
      if (l.isConverted || (l.statusId || "").toUpperCase() === "CONVERTED") cConverted += 1;
      else if (hasAny(name, ["bog'lanib bo'lmadi", "bog'lanib bolmadi", "bog'lanmadi", "unreachable", "nedozvon", "aloqa yo'q", "qo'ng'iroqdan so'ng aloqa", "aloqa yoq"])) cUnreachable += 1;
      else if (hasAny(name, ["tarmadi", "ko'tarmadi", "kotarmadi", "javob yo'q", "no answer"])) cNoAnswer += 1;
      else if ((l.statusId || "").toUpperCase() === "NEW" || hasAny(name, ["yangi"])) cNew += 1;
    }
    const noContactChain = {
      total: cTotal,
      stages: [
        { key: "new", label: "Yangi", count: cNew },
        { key: "noanswer", label: "Ko'tarmadi", count: cNoAnswer },
        { key: "unreachable", label: "Bog'lanib bo'lmadi", count: cUnreachable },
        { key: "converted", label: "Bog'landi (konvert)", count: cConverted },
      ],
      noAnswerPct: pct1(cNoAnswer, cTotal),
      unreachablePct: pct1(cUnreachable, cTotal),
    };

    success(res, {
      pickupRate,
      noContactChain,
      note: "Ko'tarish = lead bo'yicha yozuvli (javob berilgan) qo'ng'iroq mavjudligi; urinishlar Bitrix Activity (crm.activity.list) qo'ng'iroqlaridan. 'Bog'lanib bo'lmadi' zanjiri lead status/rad sababidan (snapshot).",
    });
  } catch (err) {
    console.error("Call attempts error:", err);
    error(res, "Qo'ng'iroq urinishlarini olishda xatolik");
  }
};

// Tashkent oy kaliti (YYYY-MM)
const tashkentMonthKey = (d: Date): string => {
  const t = new Date(d.getTime() + 5 * 3600 * 1000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

// ═════════════════════════════════════════════════════════════════════════
// #12 — Noto'g'ri (xato) raqam foizi + oshganda alert + manba bo'yicha
// Manba: Lead.statusName / rejectReasonName xato-raqam kalit so'zlari.
// Oyma-oy trend → oshsa alert. Reklama formasi (sourceId) bo'yicha breakdown.
// ═════════════════════════════════════════════════════════════════════════
const WRONG_NUM_KEYS = [
  "xato raqam", "noto'g'ri raqam", "yo'q raqam", "xato ariza", "noto'g'ri shaxs",
  "noto'g'ri odam", "wrong number", "неправильный", "ошибочн", "adashgan", "adashib",
  "raqam ishlamaydi", "chet el raqam", "chet el", "boshqa kompaniya", "иностранн",
];
export const getWrongNumber = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const monthsList = buildMonthsList(range, 6);

    const leads = await prisma.lead.findMany({
      where: { companyId },
      select: { dateCreate: true, statusName: true, rejectReasonName: true, sourceId: true },
    });
    const isWrong = (l: { statusName: string | null; rejectReasonName: string | null }) =>
      hasAny(`${l.statusName || ""} ${l.rejectReasonName || ""}`.toLowerCase(), WRONG_NUM_KEYS);

    // sourceId → nom (AudioFile.sourceName'dan)
    const srcRows = await prisma.audioFile.findMany({
      where: { companyId, sourceId: { not: null } },
      select: { sourceId: true, sourceName: true },
      distinct: ["sourceId"],
    });
    const srcName = new Map(srcRows.map((s) => [s.sourceId, s.sourceName]));

    const byMonth = new Map<string, { total: number; wrong: number }>();
    const bySrc = new Map<string, { total: number; wrong: number }>();
    let total = 0, wrong = 0;
    for (const l of leads) {
      total += 1;
      const w = isWrong(l);
      if (w) wrong += 1;
      if (l.dateCreate) {
        const k = tashkentMonthKey(l.dateCreate);
        const mm = byMonth.get(k) || { total: 0, wrong: 0 };
        mm.total += 1; if (w) mm.wrong += 1; byMonth.set(k, mm);
      }
      const sk = l.sourceId || "—";
      const ss = bySrc.get(sk) || { total: 0, wrong: 0 };
      ss.total += 1; if (w) ss.wrong += 1; bySrc.set(sk, ss);
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    const months = monthsList.map(({ y, m }) => {
      const k = `${y}-${pad(m + 1)}`;
      const v = byMonth.get(k) || { total: 0, wrong: 0 };
      return { month: k, label: UZ_MONTH[m], year: y, total: v.total, wrong: v.wrong, pct: pct1(v.wrong, v.total) };
    });
    const last = months[months.length - 1] || null;
    const prev = months[months.length - 2] || null;
    const delta = last && prev ? Math.round((last.pct - prev.pct) * 10) / 10 : 0;

    const bySource = Array.from(bySrc.entries())
      .filter(([, v]) => v.wrong > 0)
      .map(([sid, v]) => ({ sourceId: sid, sourceName: (sid !== "—" && srcName.get(sid)) || sid, wrong: v.wrong, total: v.total, pct: pct1(v.wrong, v.total) }))
      .sort((a, b) => b.wrong - a.wrong)
      .slice(0, 10);

    success(res, {
      total,
      wrong,
      wrongPct: pct1(wrong, total),
      months,
      delta,
      alert: delta > 1, // oxirgi oy oldingidan >1pp oshsa
      bySource,
      note: "Xato raqam lead status/rad sababidan aniqlanadi. Oxirgi oy foizi oldingidan oshsa alert. Manba (reklama formasi) bo'yicha eng ko'p xato raqam beradiganlar ko'rsatiladi.",
    });
  } catch (err) {
    console.error("Wrong number error:", err);
    error(res, "Xato raqam hisobotida xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #9 + #10 — Sifatsiz va Qayta obrabotka sabablari (ichki kategoriya + foiz)
// Lead bucket'lari ichida statusName/rejectReasonName bo'yicha guruh.
// Failed deal close sabablari ham (semanticId=F).
// ═════════════════════════════════════════════════════════════════════════
export const getReasonBreakdown = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const leadWhere: Record<string, unknown> = { companyId };
    if (range) leadWhere.dateCreate = range;

    const leads = await prisma.lead.findMany({
      where: leadWhere,
      select: { statusId: true, statusName: true, rejectReasonName: true, isConverted: true },
    });

    const sifMap = new Map<string, number>();
    const qayMap = new Map<string, number>();
    let sifTotal = 0, qayTotal = 0;
    for (const l of leads) {
      const bucket = classifyLead(l.statusId, l.statusName, l.isConverted);
      const reason = l.rejectReasonName || l.statusName || "Noma'lum";
      if (bucket === "sifatsiz") { sifMap.set(reason, (sifMap.get(reason) || 0) + 1); sifTotal += 1; }
      else if (bucket === "qayta_obrabotka") { qayMap.set(reason, (qayMap.get(reason) || 0) + 1); qayTotal += 1; }
    }

    // Failed deal close sabablari
    const dealWhere: Record<string, unknown> = { companyId, semanticId: "F" };
    if (range) dealWhere.closedAt = range;
    const deals = await prisma.salesLead.findMany({
      where: dealWhere,
      select: { closeReasonName: true, statusName: true },
    });
    const dealMap = new Map<string, number>();
    let dealTotal = 0;
    for (const d of deals) {
      const reason = d.closeReasonName || d.statusName || "Noma'lum";
      dealMap.set(reason, (dealMap.get(reason) || 0) + 1);
      dealTotal += 1;
    }

    const toReasons = (map: Map<string, number>, total: number) =>
      Array.from(map.entries())
        .map(([name, count]) => ({ name, count, pct: pct1(count, total) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

    success(res, {
      sifatsiz: { total: sifTotal, reasons: toReasons(sifMap, sifTotal) },
      qayta: { total: qayTotal, reasons: toReasons(qayMap, qayTotal) },
      dealFailed: { total: dealTotal, reasons: toReasons(dealMap, dealTotal) },
      note: "Sifatsiz/qayta obrabotka bucket'lari ichida status/rad sababi bo'yicha guruhlangan, foiz bilan. Failed deallar 'Yopilish sababi' (closeReasonName) bo'yicha.",
    });
  } catch (err) {
    console.error("Reason breakdown error:", err);
    error(res, "Sabab breakdown'ida xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #13 — E'tiroz / narx trendi (oyma-oy) + narx e'tirozi oshganda alert
// Analysis.objections (AI) → kategoriyaga normalizatsiya → oyma-oy.
// ═════════════════════════════════════════════════════════════════════════
const OBJ_CATS: Array<{ canonical: string; keys: string[] }> = [
  { canonical: "Narx", keys: ["narx", "qimmat", "byudjet", "pul", "moliya", "arzon", "chegirma", "to'lov", "summa", "baho", "price", "mablag'", "to'lay", "bepul", "tekin"] },
  { canonical: "Vaqt", keys: ["vaqt", "band", "keyinroq", "hozir emas", "time", "later", "jadval", "timing", "shoshil"] },
  { canonical: "Ishonch", keys: ["ishon", "kafolat", "natija", "shubha", "trust", "isbot", "sifat", "sinov", "tajriba", "xavotir", "qo'rquv"] },
  { canonical: "Raqobat", keys: ["raqobat", "boshqa kurs", "boshqa joy", "tanla", "competitor", "alternativ", "oflayn", "offlayn", "format"] },
  { canonical: "Kerak emas", keys: ["kerak emas", "qiziqma", "ehtiyoj", "rad et", "qiziqish yo'q", "o'zim"] },
  { canonical: "Kechiktirish", keys: ["kechik", "keyinga", "o'ylab", "maslahatlash", "oila", "ota-ona", "rahbar", "so'ray", "gaplash"] },
];
const normObjection = (raw: string): string => {
  const l = (raw || "").toLowerCase().trim();
  for (const c of OBJ_CATS) { if (c.canonical.toLowerCase() === l) return c.canonical; for (const k of c.keys) if (l.includes(k)) return c.canonical; }
  return "Boshqa";
};
export const getObjectionTrend = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const monthsList = buildMonthsList(range, 6);

    const rows = await prisma.analysis.findMany({
      where: { audioFile: { companyId } },
      select: { objections: true, audioFile: { select: { callDate: true, createdAt: true } } },
    });

    const pad = (n: number) => String(n).padStart(2, "0");
    const byMonthCat = new Map<string, Map<string, number>>(); // monthKey → (cat → count)
    const overall = new Map<string, number>();
    let grand = 0;
    for (const r of rows) {
      const objs = (r.objections as Array<{ type: string; count: number }>) || [];
      const d = r.audioFile?.callDate || r.audioFile?.createdAt;
      if (!d) continue;
      const k = tashkentMonthKey(d);
      const cm = byMonthCat.get(k) || new Map<string, number>();
      for (const o of objs) {
        const cat = normObjection(o.type);
        const c = o.count || 1;
        cm.set(cat, (cm.get(cat) || 0) + c);
        overall.set(cat, (overall.get(cat) || 0) + c);
        grand += c;
      }
      byMonthCat.set(k, cm);
    }

    const catList = OBJ_CATS.map((c) => c.canonical).concat(["Boshqa"]);
    const months = monthsList.map(({ y, m }) => {
      const k = `${y}-${pad(m + 1)}`;
      const cm = byMonthCat.get(k) || new Map<string, number>();
      const total = Array.from(cm.values()).reduce((a, b) => a + b, 0);
      const cats: Record<string, number> = {};
      for (const c of catList) cats[c] = cm.get(c) || 0;
      return { month: k, label: UZ_MONTH[m], year: y, total, narx: cats["Narx"], ...cats };
    });
    const last = months[months.length - 1] || null;
    const prev = months[months.length - 2] || null;
    const narxLastPct = last && last.total ? pct1(last.narx, last.total) : 0;
    const narxPrevPct = prev && prev.total ? pct1(prev.narx, prev.total) : 0;
    const narxDelta = Math.round((narxLastPct - narxPrevPct) * 10) / 10;

    const categories = catList
      .map((type) => ({ type, count: overall.get(type) || 0, pct: pct1(overall.get(type) || 0, grand) }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);

    success(res, {
      months,
      categories,
      narxLastPct,
      narxDelta,
      priceAlert: narxDelta > 3 && narxLastPct >= 20, // narx e'tirozi oshdi + sezilarli ulush
      note: "AI aniqlagan e'tirozlar (Analysis.objections) kategoriyaga normalizatsiya qilinib oyma-oy. Narx e'tirozi foizi sezilarli oshsa alert — narx yoki skriptni qayta ko'rib chiqish.",
    });
  } catch (err) {
    console.error("Objection trend error:", err);
    error(res, "E'tiroz trendida xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #3 — AI agent xarajatlari va limitlar (akkaunt sarfi)
// AudioCost (STT/Flash/Pro USD) + kompaniya limit/plan + sarflangan soatlar.
// ═════════════════════════════════════════════════════════════════════════
export const getAiCosts = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const range = parseRange(req);
    const { nameOf, photoOf } = await loadManagers(companyId);

    const costWhere: Record<string, unknown> = { companyId };
    if (range) costWhere.createdAt = range;
    const costs = await prisma.audioCost.findMany({
      where: costWhere,
      select: {
        totalCostUsd: true, sttCostUsd: true, flashCostUsd: true, proCostUsd: true,
        audioFile: { select: { managerId: true } },
      },
    });

    let total = 0, stt = 0, flash = 0, pro = 0;
    const perMgr = new Map<string, number>();
    for (const c of costs) {
      total += c.totalCostUsd || 0;
      stt += c.sttCostUsd || 0;
      flash += c.flashCostUsd || 0;
      pro += c.proCostUsd || 0;
      const mid = c.audioFile?.managerId || "";
      if (mid) perMgr.set(mid, (perMgr.get(mid) || 0) + (c.totalCostUsd || 0));
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { plan: true, totalLimitHours: true, audioLimitPerManager: true, managerLimit: true },
    });
    const durAgg = await prisma.audioFile.aggregate({ where: { companyId }, _sum: { duration: true }, _count: { _all: true } });
    const usedHours = Math.round(((durAgg._sum.duration || 0) / 3600) * 10) / 10;
    const limitHours = company?.totalLimitHours || 0;

    const byManager = Array.from(perMgr.entries())
      .map(([id, usd]) => ({ managerId: id, name: nameOf.get(id) || "Noma'lum", photo: photoOf.get(id) || null, costUsd: Math.round(usd * 1000) / 1000 }))
      .sort((a, b) => b.costUsd - a.costUsd)
      .slice(0, 20);

    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    success(res, {
      totalCostUsd: r4(total),
      byComponent: { stt: r4(stt), flash: r4(flash), pro: r4(pro) },
      analyzedCalls: costs.length,
      avgPerCallUsd: costs.length ? r4(total / costs.length) : 0,
      byManager,
      limits: {
        plan: company?.plan || "—",
        totalLimitHours: limitHours,
        usedHours,
        usedPct: pct1(usedHours, limitHours),
        audioLimitPerManager: company?.audioLimitPerManager || null,
        totalAudio: durAgg._count._all,
      },
      note: "AI sarflari AudioCost'dan (STT Yandex + Gemini Flash/Pro, USD). Limit — kompaniya plani bo'yicha umumiy soat. To'lov shlyuzi emas, sarf/limit ko'rinishi.",
    });
  } catch (err) {
    console.error("AI costs error:", err);
    error(res, "AI xarajatlarini olishda xatolik");
  }
};

// ═════════════════════════════════════════════════════════════════════════
// #31 — Avtomatik maslahat bloki: ko'rsatkich yomonlashsa sabab + tavsiya
// Joriy oy vs oldingi oy metrikalari → yomonlashganlar uchun sabab/tavsiya.
// ═════════════════════════════════════════════════════════════════════════
function monthRangeUtc(y: number, m: number): { gte: Date; lt: Date } {
  // Tashkent oyining UTC chegaralari
  const gte = new Date(Date.UTC(y, m, 1, -5, 0, 0));
  const lt = new Date(Date.UTC(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, 1, -5, 0, 0));
  return { gte, lt };
}
export const getAdvice = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const now = new Date();
    const tNow = new Date(now.getTime() + 5 * 3600 * 1000);
    const cy = tNow.getUTCFullYear(), cm = tNow.getUTCMonth();
    const py = cm === 0 ? cy - 1 : cy, pm = cm === 0 ? 11 : cm - 1;
    const cur = monthRangeUtc(cy, cm);
    const prev = monthRangeUtc(py, pm);

    const periodMetrics = async (r: { gte: Date; lt: Date }) => {
      const leads = await prisma.lead.findMany({
        where: { companyId, dateCreate: { gte: r.gte, lt: r.lt } },
        select: { statusId: true, statusName: true, isConverted: true },
      });
      let sif = 0;
      for (const l of leads) if (classifyLead(l.statusId, l.statusName, l.isConverted) === "sifatsiz") sif += 1;
      const sales = await prisma.salesLead.count({ where: { companyId, isSale: true, closedAt: { gte: r.gte, lt: r.lt } } });
      return { leads: leads.length, sales, sifPct: pct1(sif, leads.length), conv: pct1(sales, leads.length) };
    };
    const c = await periodMetrics(cur);
    const p = await periodMetrics(prev);

    const items: any[] = [];
    const pchg = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);

    // Lidlar kamaydi
    if (p.leads > 0 && c.leads < p.leads * 0.9) {
      items.push({ metric: "Yangi lidlar", current: c.leads, previous: p.leads, deltaPct: pchg(c.leads, p.leads), direction: "down", severity: "high",
        cause: "Lid oqimi pasaygan — marketing kanali yoki manba faolligi tushgan.", recommendation: "Reklama kanallari va lid manbalarini tekshiring; eng kam ishlayotgan formani qayta yoqing." });
    }
    // Sotuv kamaydi
    if (p.sales > 0 && c.sales < p.sales * 0.9) {
      items.push({ metric: "Sotuvlar", current: c.sales, previous: p.sales, deltaPct: pchg(c.sales, p.sales), direction: "down", severity: "high",
        cause: "Sotuv soni kamaydi — konversiya yoki lid sifati tushgan, follow-up zaiflashgan.", recommendation: "Top menejer skriptini tarqating, vaqti o'tgan follow-up'larni yoping, qaynoq lidlarga ustuvorlik bering." });
    }
    // Konversiya pasaydi
    if (p.conv > 0 && c.conv < p.conv - 2) {
      items.push({ metric: "Konversiya %", current: c.conv, previous: p.conv, deltaPct: Math.round((c.conv - p.conv) * 10) / 10, direction: "down", severity: "medium",
        cause: "Lidlar sotuvga kam aylanmoqda — kvalifikatsiya yoki yakunlash bosqichi zaif.", recommendation: "Birinchi aloqa vaqtini qisqartiring va yakunlash (closing) skriptini kuchaytiring." });
    }
    // Sifatsiz oshdi
    if (c.sifPct > p.sifPct + 5) {
      items.push({ metric: "Sifatsiz lid %", current: c.sifPct, previous: p.sifPct, deltaPct: Math.round((c.sifPct - p.sifPct) * 10) / 10, direction: "up", severity: "medium",
        cause: "Sifatsiz lid ulushi oshdi — manba sifati yomonlashgan yoki noto'g'ri auditoriya.", recommendation: "Lid manbalarini va reklama targetingini ko'rib chiqing; birinchi savol-javob (kvalifikatsiya)ni kuchaytiring." });
    }

    success(res, {
      period: { current: `${cy}-${String(cm + 1).padStart(2, "0")}`, previous: `${py}-${String(pm + 1).padStart(2, "0")}` },
      metrics: { current: c, previous: p },
      items,
      healthy: items.length === 0,
      note: "Joriy oy oldingi oy bilan taqqoslanadi. Yomonlashgan ko'rsatkichlar uchun ehtimoliy sabab va amaliy tavsiya beriladi (rule-based).",
    });
  } catch (err) {
    console.error("Advice error:", err);
    error(res, "Maslahat blokida xatolik");
  }
};
