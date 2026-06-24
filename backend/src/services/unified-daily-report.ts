/**
 * Unified Daily Report — bot orqali yuboriladigan kunlik hisobot.
 * Sotuv + Lid + Audit metrikalarini bitta xabarda jamlaydi.
 *
 * Admin va menejerga moslangan view (manager — faqat o'zining ma'lumotlari).
 * Vaqt har bir kompaniya/menejer profilidan olinadi (Profile sahifasi).
 */
import { prisma } from "../utils/prisma";

// Tashkent UTC+5 start of day helper
function tashkentStartOfDay(d: Date = new Date()): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  // Tashkent 00:00 = UTC 19:00 prev day; use prior approach
  return new Date(Date.UTC(y, m, day, -5, 0, 0));
}

function endOfTashkentDay(start: Date): Date {
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

export interface UnifiedReport {
  companyId: string;
  companyName: string;
  date: string; // YYYY-MM-DD (Tashkent)
  // Sales
  totalLeads: number;
  qualifiedLeads: number;
  salesCount: number;
  salesAmount: number;
  avgCheck: number;
  conversionRate: number;
  // Audit
  callsAnalyzed: number;
  avgScore: number;
  topManager: { name: string; score: number } | null;
  // Per manager breakdown
  managers: Array<{
    id: string;
    name: string;
    sales: number;
    salesAmount: number;
    leads: number;
    qualifiedLeads: number;
    calls: number;
    avgScore: number;
  }>;
}

export async function buildUnifiedReport(
  companyId: string,
  forDate?: Date,
): Promise<UnifiedReport | null> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });
  if (!company) return null;

  const dayStart = tashkentStartOfDay(forDate || new Date());
  const dayEnd = endOfTashkentDay(dayStart);
  const dateStr = new Date(dayStart.getTime() + 5 * 3600 * 1000)
    .toISOString()
    .split("T")[0];

  const [leads, salesLeads, audios, managers] = await Promise.all([
    prisma.lead.findMany({
      where: { companyId, dateCreate: { gte: dayStart, lt: dayEnd } },
      select: { id: true, isConverted: true, bitrixUserId: true },
    }),
    prisma.salesLead.findMany({
      where: {
        companyId,
        OR: [
          { closedAt: { gte: dayStart, lt: dayEnd }, isSale: true },
          { leadCreatedAt: { gte: dayStart, lt: dayEnd } },
        ],
      },
      select: {
        id: true,
        isSale: true,
        price: true,
        closedAt: true,
        leadCreatedAt: true,
        responsibleManagerId: true,
      },
    }),
    prisma.audioFile.findMany({
      where: {
        companyId,
        status: "done",
        createdAt: { gte: dayStart, lt: dayEnd },
      },
      include: {
        analysis: { select: { overallScore: true } },
        manager: { select: { id: true, name: true } },
      },
    }),
    prisma.manager.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true },
    }),
  ]);

  const totalLeads = leads.length;
  const qualifiedLeads = leads.filter((l) => l.isConverted).length;
  const todaySales = salesLeads.filter(
    (s) => s.isSale && s.closedAt && s.closedAt >= dayStart && s.closedAt < dayEnd,
  );
  const salesCount = todaySales.length;
  const salesAmount = todaySales.reduce((sum, s) => sum + (s.price || 0), 0);
  const avgCheck = salesCount > 0 ? Math.round(salesAmount / salesCount) : 0;
  const conversionRate =
    qualifiedLeads > 0 ? Math.round((salesCount / qualifiedLeads) * 100) : 0;

  const callsAnalyzed = audios.length;
  const scores = audios
    .map((a) => a.analysis?.overallScore || 0)
    .filter((s) => s > 0);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  let topManager: { name: string; score: number } | null = null;
  let topScore = 0;
  for (const a of audios) {
    const s = a.analysis?.overallScore || 0;
    if (s > topScore) {
      topScore = s;
      topManager = { name: a.manager?.name || "—", score: s };
    }
  }

  const managerMap = new Map<
    string,
    {
      id: string;
      name: string;
      sales: number;
      salesAmount: number;
      leads: number;
      qualifiedLeads: number;
      calls: number;
      scoreSum: number;
      scoreCount: number;
    }
  >();
  for (const m of managers) {
    managerMap.set(m.id, {
      id: m.id,
      name: m.name,
      sales: 0,
      salesAmount: 0,
      leads: 0,
      qualifiedLeads: 0,
      calls: 0,
      scoreSum: 0,
      scoreCount: 0,
    });
  }
  for (const s of salesLeads) {
    if (!s.responsibleManagerId) continue;
    const m = managerMap.get(s.responsibleManagerId);
    if (!m) continue;
    if (s.leadCreatedAt && s.leadCreatedAt >= dayStart && s.leadCreatedAt < dayEnd) {
      m.leads += 1;
    }
    if (s.isSale && s.closedAt && s.closedAt >= dayStart && s.closedAt < dayEnd) {
      m.sales += 1;
      m.salesAmount += s.price || 0;
    }
  }
  for (const l of leads) {
    // Lead.bitrixUserId → Manager.bitrixUserId mapping not direct; skip
  }
  for (const a of audios) {
    const m = a.manager?.id ? managerMap.get(a.manager.id) : null;
    if (!m) continue;
    m.calls += 1;
    const sc = a.analysis?.overallScore || 0;
    if (sc > 0) {
      m.scoreSum += sc;
      m.scoreCount += 1;
    }
  }

  const managersBreakdown = Array.from(managerMap.values())
    .filter((m) => m.sales > 0 || m.leads > 0 || m.calls > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      sales: m.sales,
      salesAmount: m.salesAmount,
      leads: m.leads,
      qualifiedLeads: m.qualifiedLeads,
      calls: m.calls,
      avgScore: m.scoreCount > 0 ? Math.round(m.scoreSum / m.scoreCount) : 0,
    }))
    .sort((a, b) => b.sales - a.sales);

  return {
    companyId,
    companyName: company.name,
    date: dateStr,
    totalLeads,
    qualifiedLeads,
    salesCount,
    salesAmount,
    avgCheck,
    conversionRate,
    callsAnalyzed,
    avgScore,
    topManager,
    managers: managersBreakdown,
  };
}

function fmtUZS(n: number): string {
  return n.toLocaleString("ru-RU") + " so'm";
}

/**
 * Formatlash — kompaniya yoki menejer uchun (manager view filtrlanadi).
 * style: compact (qisqa), detailed (default), emoji (ko'p emoji).
 */
export function formatReport(
  r: UnifiedReport,
  opts: {
    style?: "compact" | "detailed" | "emoji";
    forManagerId?: string;
    includeSales?: boolean;
    includeLeads?: boolean;
    includeAudit?: boolean;
  } = {},
): string {
  const style = opts.style || "detailed";
  const includeSales = opts.includeSales !== false;
  const includeLeads = opts.includeLeads !== false;
  const includeAudit = opts.includeAudit !== false;

  // Manager view — filter to that manager only
  if (opts.forManagerId) {
    const m = r.managers.find((x) => x.id === opts.forManagerId);
    if (!m) {
      return `🌇 ${r.date} — ${r.companyName}\n\nBugun ma'lumot yo'q.`;
    }
    const lines: string[] = [];
    lines.push(`🌇 Sizning kuningiz — ${r.date}`);
    lines.push("");
    if (includeSales) {
      lines.push(`💰 Sotuvlar: ${m.sales} (${fmtUZS(m.salesAmount)})`);
    }
    if (includeLeads) {
      lines.push(`📋 Lidlar: ${m.leads}`);
    }
    if (includeAudit) {
      lines.push(`📞 Qo'ng'iroqlar tahlili: ${m.calls}`);
      if (m.avgScore > 0) lines.push(`⭐ O'rtacha ball: ${m.avgScore}/100`);
    }
    if (m.sales === 0) {
      lines.push("");
      lines.push("💪 Ertaga yangi imkoniyat — siz qila olasiz!");
    } else if (m.sales >= 3) {
      lines.push("");
      lines.push("🔥 Ajoyib natija! Davom eting!");
    }
    return lines.join("\n");
  }

  // Admin / company view
  const lines: string[] = [];
  if (style === "emoji") {
    lines.push(`🌇✨ KUN YAKUNI ✨🌇`);
    lines.push(`📅 ${r.date}  🏢 ${r.companyName}`);
  } else {
    lines.push(`🌇 KUN YAKUNI — ${r.date}`);
    lines.push(`🏢 ${r.companyName}`);
  }
  lines.push("");

  if (includeSales) {
    lines.push("💰 SOTUV");
    lines.push(`  Sotuv soni: ${r.salesCount}`);
    lines.push(`  Umumiy tushum: ${fmtUZS(r.salesAmount)}`);
    if (r.salesCount > 0) lines.push(`  O'rtacha chek: ${fmtUZS(r.avgCheck)}`);
    if (r.qualifiedLeads > 0)
      lines.push(`  Konversiya: ${r.conversionRate}% (kval liddan)`);
    lines.push("");
  }

  if (includeLeads) {
    lines.push("📋 LID");
    lines.push(`  Yangi lid: ${r.totalLeads}`);
    lines.push(`  Kval lid: ${r.qualifiedLeads}`);
    lines.push("");
  }

  if (includeAudit) {
    lines.push("📞 AUDIT");
    lines.push(`  Tahlil qilingan: ${r.callsAnalyzed}`);
    if (r.callsAnalyzed > 0) {
      lines.push(`  O'rtacha ball: ${r.avgScore}/100`);
      if (r.topManager) {
        lines.push(`  🏆 Top: ${r.topManager.name} (${r.topManager.score} ball)`);
      }
    }
    lines.push("");
  }

  if (style !== "compact" && r.managers.length > 0) {
    lines.push("👥 MENEJERLAR");
    for (const m of r.managers.slice(0, 10)) {
      const parts: string[] = [];
      if (includeSales && (m.sales > 0 || m.salesAmount > 0))
        parts.push(`${m.sales} sotuv`);
      if (includeAudit && m.calls > 0) parts.push(`${m.calls} q.`);
      if (includeAudit && m.avgScore > 0) parts.push(`${m.avgScore} ball`);
      lines.push(`  • ${m.name}: ${parts.join(" · ") || "—"}`);
    }
  }

  return lines.join("\n").trim();
}
