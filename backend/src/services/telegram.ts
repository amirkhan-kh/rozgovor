import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../utils/prisma";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

let bot: TelegramBot | null = null;

/**
 * Guardian/Alert uchun — oddiy matn yuborish. Bot ishga tushmagan bo'lsa sukut bilan o'tadi.
 */
export const sendRawMessage = async (chatId: string, text: string): Promise<void> => {
  if (!bot) {
    console.warn("[telegram] sendRawMessage: bot not initialized");
    return;
  }
  try {
    await bot.sendMessage(chatId, text, { parse_mode: undefined });
  } catch (err: any) {
    console.error("[telegram] sendRawMessage error:", err?.message || err);
  }
};

export const initTelegramBot = (): void => {
  if (!BOT_TOKEN || BOT_TOKEN === "...") {
    console.log("Telegram bot token not configured, skipping bot init");
    return;
  }

  try {
    bot = new TelegramBot(BOT_TOKEN, { polling: true });

    // Admin: /start {companyId}
    // Manager: /start mgr_{managerId}
    bot.onText(/\/start (.+)/, async (msg, match) => {
      try {
        const chatId = msg.chat.id;
        const param = match?.[1]?.trim();
        if (!param) {
          await bot!.sendMessage(chatId, "Xatolik: ID topilmadi.");
          return;
        }

        // Manager ulanishi
        if (param.startsWith("mgr_")) {
          const managerId = param.replace("mgr_", "");
          const manager = await prisma.manager.findUnique({
            where: { id: managerId },
            include: { company: { select: { name: true } } },
          });
          if (!manager) {
            await bot!.sendMessage(chatId, "Menejer topilmadi. ID ni tekshiring.");
            return;
          }
          await prisma.manager.update({
            where: { id: managerId },
            data: { telegramId: String(chatId) },
          });
          await bot!.sendMessage(
            chatId,
            `✅ Ulandi!\n\n👤 ${manager.name}\n🏢 ${manager.company.name}\n\nEndi sizning audio tahlil natijalaringiz shu yerga yuboriladi.`
          );
          return;
        }

        // Admin (company) ulanishi
        const company = await prisma.company.findUnique({ where: { id: param } });
        if (!company) {
          await bot!.sendMessage(chatId, "Kompaniya topilmadi.");
          return;
        }
        await prisma.company.update({
          where: { id: param },
          data: { telegramId: String(chatId), telegramEnabled: true },
        });
        await bot!.sendMessage(
          chatId,
          `✅ Ulandi!\n\n🏢 ${company.name}\n\nBarcha menejerlarning tahlil natijalari shu yerga yuboriladi.`
        );
      } catch (err) {
        console.error("Telegram /start error:", err);
        await bot!.sendMessage(msg.chat.id, "Xatolik yuz berdi. Qayta urinib ko'ring.");
      }
    });

    bot.on("message", (msg) => {
      if (!msg.text?.startsWith("/start")) {
        bot!.sendMessage(
          msg.chat.id,
          "SalesAI Bot 🤖\n\nBotga ulanish uchun saytdagi Bildirishnoma sahifasidan linkni bosing."
        );
      }
    });

    console.log("Telegram bot initialized");
  } catch (err) {
    console.error("Telegram bot init error:", err);
  }
};

interface CriticalMoment {
  timestamp: string;
  whatHappened: string;
  whatManagerDid: string;
  whatToDoInstead: string;
  technique: string;
}

interface CoachingInsights {
  speechRatioAlert?: boolean;
  surrenderedObjections?: number;
  openEnding?: boolean;
  criticalMoments?: CriticalMoment[];
  topWin?: string;
  quickFix?: string;
  dealRiskScore?: number;
}

interface AnalysisData {
  manager: string;
  phone: string;
  fileName: string;
  score: number;
  quality: string;
  leadScore: number;
  category: string;
  criteria: Record<string, { score: number }>;
  wins: number;
  losses: number;
  errors: number;
  objections: number;
  managerSpeech: number;
  clientSpeech: number;
  summary: string;
  audioId?: string;
  coachingInsights?: CoachingInsights;
}

/**
 * Admin'ga yuborish (company telegramId)
 */
const CATEGORY_MAP: Record<string, string> = {
  sotuv: "Sotuv",
  "1-qo'ng'iroq": "Sotuv",
  qayta: "Qayta qo'ng'iroq",
  boshqa: "Boshqa",
};

const formatCriteria = (criteria: Record<string, { score: number }>): string => {
  return Object.entries(criteria)
    .map(([name, val]) => `  • ${name}: ${val.score}`)
    .join("\n");
};

export const sendAnalysisResult = async (
  telegramId: string,
  data: AnalysisData
): Promise<void> => {
  if (!bot) return;
  try {
    const link = data.audioId
      ? `\n🔗 https://salesaiasosit.vercel.app/audio/${data.audioId}`
      : "";
    const categoryLabel = CATEGORY_MAP[data.category] || data.category;
    const criteriaText = data.criteria ? formatCriteria(data.criteria) : "";

    // Coaching insights bloki
    const ci = data.coachingInsights;
    let coachingBlock = "";
    if (ci) {
      const alerts: string[] = [];
      if (ci.speechRatioAlert) {
        alerts.push(`⚠️ Menejer ${data.managerSpeech}% gapirdi — mijoz eshitilmayapti (maqsad: 50/50)`);
      }
      if (ci.openEnding) {
        alerts.push("⚠️ Keyingi qadam belgilanmadi — lead sovib qolishi mumkin");
      }
      if (ci.surrenderedObjections && ci.surrenderedObjections > 0) {
        alerts.push(`⚠️ ${ci.surrenderedObjections} ta e'tirozda taslim bo'lindi`);
      }

      const momentLines = (ci.criticalMoments || []).slice(0, 2).map((m) =>
        `[${m.timestamp}] ${m.whatHappened}\n   ❌ Qilindi: "${m.whatManagerDid}"\n   ✅ Kerak edi: "${m.whatToDoInstead}"\n   📚 ${m.technique}`
      );

      const riskEmoji = (ci.dealRiskScore || 50) >= 70 ? "🟢" : (ci.dealRiskScore || 50) >= 40 ? "🟡" : "🔴";

      if (alerts.length > 0 || momentLines.length > 0 || ci.quickFix || ci.topWin) {
        coachingBlock = `
━━━━━━━━━━━━━━━━━━━━━
🎯 COACHING
${alerts.join("\n")}
${momentLines.length > 0 ? "\n📍 MUHIM MOMENTLAR:\n" + momentLines.join("\n\n") : ""}
${ci.topWin ? "\n💪 ENG YAXSHI NARSA:\n" + ci.topWin : ""}
${ci.quickFix ? "\n⚡ KEYINGI QONGIROQ UCHUN:\n" + ci.quickFix : ""}
${riskEmoji} Lead qaytish ehtimoli: ${ci.dealRiskScore || 50}%`;
      }
    }

    const message = `📊 Tahlil tugallandi
📁 ${data.fileName}
📞 Telefon raqami: ${data.phone}
👤 Menejer: ${data.manager}

⭐ Umumiy ball: ${data.score}
📂 Kategoriya: ${categoryLabel}
🔥 Lid sifati: ${data.leadScore}% (${data.quality})

📋 Mezonlarga rioya qilishi:
${criteriaText}

❌ Xatoliklar: ${data.errors} | 💬 E'tirozlar: ${data.objections}
✅ G'alaba: ${data.wins} | ❌ Yo'qotish: ${data.losses}
🗣 Nutq nisbati: ${data.managerSpeech}% / ${data.clientSpeech}%

📝 Xulosa: ${data.summary}${coachingBlock}${link}`;
    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram send analysis error:", err);
  }
};

/**
 * Manager'ga yuborish (manager telegramId) — qisqa format
 */
export const sendAnalysisToManager = async (
  managerId: string,
  data: AnalysisData
): Promise<void> => {
  if (!bot) return;
  try {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { telegramId: true },
    });
    if (!manager?.telegramId) return;

    const link = data.audioId
      ? `\n🔗 https://salesaiasosit.vercel.app/audio/${data.audioId}`
      : "";
    const criteriaText = data.criteria ? formatCriteria(data.criteria) : "";

    const ci = data.coachingInsights;
    let personalCoaching = "";
    if (ci?.quickFix || (ci?.criticalMoments?.length ?? 0) > 0) {
      const topMoment = ci?.criticalMoments?.[0];
      personalCoaching = `
━━━━━━━━━━━━━━━━━━━━━
💡 SIZGA MASLAHAT:
${topMoment ? `[${topMoment.timestamp}] ${topMoment.whatToDoInstead}\n📚 ${topMoment.technique}\n` : ""}
${ci?.quickFix ? "⚡ " + ci.quickFix : ""}
${ci?.speechRatioAlert ? `\n⚠️ Siz ${data.managerSpeech}% gapirdingiz. Mijozni ko'proq gapirtiring.` : ""}`;
    }

    const riskEmoji = (ci?.dealRiskScore || 50) >= 70 ? "🟢" : (ci?.dealRiskScore || 50) >= 40 ? "🟡" : "🔴";

    const message = `📊 Sizning qo'ng'iroq natijangiz
📞 ${data.phone}

⭐ Ball: ${data.score}/100
🔥 Lead: ${data.quality} (${data.leadScore}%)
${riskEmoji} Qaytish ehtimoli: ${ci?.dealRiskScore || 50}%

📋 Mezonlar:
${criteriaText}

✅ G'alaba: ${data.wins} | ❌ Xatolik: ${data.errors}
🗣 Nutq: Siz ${data.managerSpeech}% / Mijoz ${data.clientSpeech}%

📝 ${data.summary}${personalCoaching}${link}`;
    await bot.sendMessage(manager.telegramId, message);
  } catch (err) {
    console.error("Telegram send to manager error:", err);
  }
};

interface DailySummaryData {
  date: string;
  total: number;
  avg: number;
  topManager: string;
  topScore: number;
  growth: number;
}

/**
 * Unified report (sotuv + lid + audit) — admin yoki menejer uchun.
 * Plain text + emoji (Markdown emas — formatlash safety uchun).
 */
export const sendUnifiedReport = async (
  telegramId: string,
  text: string,
): Promise<void> => {
  if (!bot) return;
  try {
    await bot.sendMessage(telegramId, text, { disable_web_page_preview: true });
  } catch (err) {
    console.error("[telegram] sendUnifiedReport error:", (err as Error).message);
  }
};

/**
 * Broadcast / announcement — saytdan yuborilgan habarni telegramga.
 * MarkdownV2 (bold/italic/strike/spoiler) qo'llab-quvvatlanadi.
 */
export const sendAnnouncement = async (
  telegramId: string,
  text: string,
  opts: { title?: string; kind?: string } = {},
): Promise<void> => {
  if (!bot) return;
  try {
    const header =
      opts.kind === "motivation"
        ? "💪 *MOTIVATSIYA*\n"
        : opts.kind === "celebration"
        ? "🎉 *TABRIK*\n"
        : opts.kind === "encouragement"
        ? "🌟 *RAG'BAT*\n"
        : "📣 *ELON*\n";
    const titleLine = opts.title ? `\n*${escapeMarkdownV2(opts.title)}*\n\n` : "\n";
    const body = text; // text already in MarkdownV2 from frontend
    await bot.sendMessage(telegramId, header + titleLine + body, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
  } catch (err) {
    // MarkdownV2 parse fail — fallback to plain
    try {
      await bot!.sendMessage(telegramId, stripMarkdown(text));
    } catch (err2) {
      console.error("[telegram] sendAnnouncement fallback failed:", (err2 as Error).message);
    }
  }
};

function escapeMarkdownV2(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
function stripMarkdown(s: string): string {
  return s.replace(/[*_~`>|]/g, "");
}

export const sendDailySummary = async (
  telegramId: string,
  stats: DailySummaryData
): Promise<void> => {
  if (!bot) return;
  try {
    const message = `📅 Kunlik xulosa — ${stats.date}
📞 Qo'ng'iroqlar: ${stats.total}
⭐ O'rtacha ball: ${stats.avg}
🏆 Eng yaxshi: ${stats.topManager} (${stats.topScore} ball)
📈 O'sish: ${stats.growth}%`;
    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram send daily summary error:", err);
  }
};

// ───────────────────────── Admin daily report ─────────────────────────

import type { TeamStats, RopReport } from "./daily-report";

export const sendAdminDailyReport = async (
  telegramId: string,
  team: TeamStats,
): Promise<void> => {
  if (!bot) return;
  try {
    const growthIcon = team.growthPercent > 0 ? "📈" : team.growthPercent < 0 ? "📉" : "➡️";
    const growthText = team.growthPercent > 0
      ? `+${team.growthPercent}%`
      : `${team.growthPercent}%`;

    const topLines = team.topPerformers.length > 0
      ? team.topPerformers
          .map((m, i) => `${i + 1}. ${m.name} — ${m.avgScore} ball, ${m.totalCalls} q'ng., ${m.sales} sotuv`)
          .join("\n")
      : "—";

    const bottomLines = team.bottomPerformers.length > 0
      ? team.bottomPerformers
          .map((m) => `• ${m.name}: ${m.avgScore} ball`)
          .join("\n")
      : "—";

    const weakLines = team.weakestSkills.length > 0
      ? team.weakestSkills
          .map((s) => `• ${s.name}: ${s.avgScore}/100`)
          .join("\n")
      : "—";

    const message = `🌇 KUN YAKUNI — ${team.date}
🏢 ${team.companyName}

📊 UMUMIY
📞 Qo'ng'iroqlar: ${team.totalCalls}
💰 Sotuvlar: ${team.totalSales}
⭐ O'rtacha ball: ${team.avgScore}/100
${growthIcon} O'sish (kechagidan): ${growthText}

🏆 TOP MENEJERLAR
${topLines}

⚠️ DIQQAT KERAK
${bottomLines}

📉 JAMOA ZAIF KO'NIKMALARI
${weakLines}

ℹ️ ROP'ingizga batafsil hisobot va trening tavsiyasi yuborildi.`;

    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram send admin report error:", err);
  }
};

// ───────────────────────── ROP daily report ─────────────────────────

export const sendRopDailyReport = async (
  telegramId: string,
  report: RopReport,
): Promise<void> => {
  if (!bot) return;
  try {
    const t = report.team;
    const growthIcon = t.growthPercent > 0 ? "📈" : t.growthPercent < 0 ? "📉" : "➡️";
    const growthText = t.growthPercent > 0 ? `+${t.growthPercent}%` : `${t.growthPercent}%`;

    const topLines = t.topPerformers.length > 0
      ? t.topPerformers
          .slice(0, 3)
          .map((m, i) => `${i + 1}. ${m.name} — ${m.avgScore} ball`)
          .join("\n")
      : "—";

    const strugglingLine = report.strugglingManagers.length > 0
      ? `👥 Qiynalayotganlar: ${report.strugglingManagers.join(", ")}`
      : "";

    const quoteBlock = report.advice.bookQuote
      ? `\n\n📖 "${report.advice.bookQuote}"`
      : "";

    // Top performer bloki
    const playbook = (report as any).topPerformerPlaybook as Record<string, any> | null;
    let topPerformerBlock = "";
    if (playbook && playbook.managerName) {
      const techniques = (playbook.techniques || []).slice(0, 2)
        .map((t: any) => `  • ${t.name}: "${t.example}"`)
        .join("\n");
      const topObjHandling = (playbook.objectionHandling || []).slice(0, 1)
        .map((o: any) => `  "${o.response}"`)
        .join("\n");

      topPerformerBlock = `
━━━━━━━━━━━━━━━━━━━━━
⭐ ${playbook.managerName.toUpperCase()} FORMULASI (${playbook.conversionRate}% konversiya)
${techniques}
${topObjHandling ? "\nE'tirozga javob:\n" + topObjHandling : ""}

→ Ertaga jamoangizga shu texnikani o'rgating (10 daqiqa yetadi)`;
    }

    const message = `🌇 KUN YAKUNI — ${t.date}
🏢 ${t.companyName}

👥 JAMOA (${t.managers.length} menejer)
📞 Qo'ng'iroqlar: ${t.totalCalls}
💰 Sotuvlar: ${t.totalSales}
⭐ O'rtacha ball: ${t.avgScore}/100
${growthIcon} O'sish: ${growthText}

🏆 TOP 3
${topLines}

━━━━━━━━━━━━━━━━━━━━━
⚠️ BUGUNGI ENG ZAIF KO'NIKMA
🎯 ${report.weakestSkill.name}: ${report.weakestSkill.avgScore}/100
${strugglingLine}

💡 TAVSIYA (${report.advice.bookChapter})
${report.advice.text}${quoteBlock}${topPerformerBlock}

━━━━━━━━━━━━━━━━━━━━━
📚 O'rganish uchun:
📺 ${report.resources.youtubeUz}`;

    await bot.sendMessage(telegramId, message, { disable_web_page_preview: true });
  } catch (err) {
    console.error("Telegram send ROP report error:", err);
  }
};

// ───────────────────────── Weekly Funnel Alert ─────────────────────────

export interface WeeklyFunnelData {
  companyName: string;
  totalCalls: number;
  totalSales: number;
  conversionRate: number;
  speechViolationPercent: number;
  speechWorstManagers: Array<{ managerName: string; ratio: number }>;
  surrenderPercent: number;
  surrenderWorstType: string;
  surrenderWorstCount: number;
  openEndingPercent: number;
  openEndingWorstManagers: Array<{ managerName: string; count: number }>;
  topPerformerName?: string;
  topPerformerConversion?: number;
  topPerformerTechnique?: string;
  estimatedLostDeals: number;
}

export const sendWeeklyFunnelAlert = async (
  telegramId: string,
  data: WeeklyFunnelData
): Promise<void> => {
  if (!bot) return;
  try {
    const speechLine = data.speechViolationPercent > 30
      ? `🔴 Nutq nisbati: ${data.speechViolationPercent}% qo'ng'iroqda menejer 70%+ gapirdi\n   → ${data.speechWorstManagers.slice(0, 2).map((m) => `${m.managerName} (${m.ratio}%)`).join(", ")}`
      : `🟡 Nutq nisbati: ${data.speechViolationPercent}% (maqbul)`;

    const surrenderLine = data.surrenderPercent > 40
      ? `🔴 E'tirozda taslim: ${data.surrenderPercent}% (${data.surrenderWorstType} eng ko'p — ${data.surrenderWorstCount} ta)`
      : `🟡 E'tirozda taslim: ${data.surrenderPercent}%`;

    const openLine = data.openEndingPercent > 15
      ? `🔴 Ochiq yakunlar: ${data.openEndingPercent}%\n   → ${data.openEndingWorstManagers.slice(0, 2).map((m) => `${m.managerName} (${m.count} ta)`).join(", ")}`
      : `🟡 Ochiq yakunlar: ${data.openEndingPercent}%`;

    const eliteBlock = data.topPerformerName
      ? `\n━━━━━━━━━━━━━━━━━━━━━
⭐ ${data.topPerformerName.toUpperCase()} FORMULASI (${data.topPerformerConversion}% konversiya)
${data.topPerformerTechnique || ""}

→ Bu hafta jamoa shu texnikani o'rgansin`
      : "";

    const message = `📊 HAFTALIK FUNNEL TAHLILI
🏢 ${data.companyName}

📞 ${data.totalCalls} qo'ng'iroq | 💰 ${data.totalSales} sotuv (${data.conversionRate}%)
💸 Taxminiy yo'qotilgan: ~${data.estimatedLostDeals} ta sotuv

━━━━━━━━━━━━━━━━━━━━━
3 TA ASOSIY TESHIK:

${speechLine}

${surrenderLine}

${openLine}${eliteBlock}`;

    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram weekly funnel alert error:", err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Re-engagement (Qayta Ishlash) alerts
// ─────────────────────────────────────────────────────────────────────────────

export interface ReEngagementManagerAlert {
  totalOpenLeads: number;
  healthy: number;
  risk: number;
  abandoned: number;
  urgentLeads: Array<{
    clientPhone: string | null;
    daysSinceLast: number;
    lastCallSummary?: string;
    followupReason?: string | null;
  }>;
  topPerformerTechnique?: string;
  topPerformerName?: string;
}

/**
 * Menejerga shaxsiy qayta ishlash eslatma — har kuni 09:00
 */
export const sendManagerReEngagementAlert = async (
  telegramId: string,
  managerName: string,
  data: ReEngagementManagerAlert
): Promise<void> => {
  if (!bot) return;
  try {
    // Agar muammo yo'q bo'lsa — xabar yubormaymiz
    if (data.abandoned === 0 && data.risk === 0) return;

    const urgentList = data.urgentLeads
      .slice(0, 7)
      .map((l, i) => {
        const phone = l.clientPhone || "Nomalum";
        const reason = l.followupReason ? ` — ${l.followupReason}` : "";
        return `${i + 1}. 📞 ${phone} — ${l.daysSinceLast} kun oldin${reason}`;
      })
      .join("\n");

    const eliteBlock = data.topPerformerName && data.topPerformerTechnique
      ? `\n━━━━━━━━━━━━━━━━━━━━━\n⭐ ${data.topPerformerName.toUpperCase()} FORMULASI:\n${data.topPerformerTechnique}`
      : "";

    const message = `📞 QAYTA ISHLASH — ${managerName.toUpperCase()}

🔴 ${data.abandoned} ta lead TASHLAB QO'YILDI (6+ kun)
🟡 ${data.risk} ta lead RISK ZONASIDA (3+ kun)
🟢 ${data.healthy} ta lead aktiv ishlanmoqda

━━━━━━━━━━━━━━━━━━━━━
BUGUN QAYTA QO'NG'IROQ QILING:

${urgentList || "(ro'yxat bo'sh)"}${eliteBlock}

💡 Har qo'ng'iroqda aniq keyingi qadam belgilang —
   "Ertaga soat 15:00 da yana gaplashamiz" kabi.`;

    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram re-engagement alert error:", err);
  }
};

export interface ReEngagementRopAlert {
  companyName: string;
  totalOpenLeads: number;
  healthy: number;
  risk: number;
  abandoned: number;
  worstManagers: Array<{ managerName: string; abandoned: number; risk: number }>;
  insight: string;
}

/**
 * ROP uchun umumiy kompaniya qayta ishlash hisoboti — har kuni 09:00
 */
export const sendRopReEngagementAlert = async (
  telegramId: string,
  data: ReEngagementRopAlert
): Promise<void> => {
  if (!bot) return;
  try {
    const abandonPercent = data.totalOpenLeads > 0
      ? Math.round((data.abandoned / data.totalOpenLeads) * 100)
      : 0;

    // Agar muammo kichik bo'lsa — yuborish zarur emas
    if (data.abandoned === 0 && data.risk === 0) return;

    const worstList = data.worstManagers
      .filter((m) => m.abandoned > 0 || m.risk > 0)
      .slice(0, 5)
      .map((m, i) => `${i + 1}. ${m.managerName} — 🔴 ${m.abandoned} tashlab qo'yilgan, 🟡 ${m.risk} risk`)
      .join("\n");

    const message = `📊 QAYTA ISHLASH SALOMATLIGI
🏢 ${data.companyName}

📈 Ochiq leadlar: ${data.totalOpenLeads}
🟢 Aktiv ishlanmoqda: ${data.healthy}
🟡 Risk zonasida: ${data.risk}
🔴 Tashlab qo'yilgan: ${data.abandoned} (${abandonPercent}%)

━━━━━━━━━━━━━━━━━━━━━
ENG KO'P MUAMMOLI MENEJERLAR:

${worstList || "(ro'yxat bo'sh)"}

━━━━━━━━━━━━━━━━━━━━━
💡 ${data.insight}`;

    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram ROP re-engagement alert error:", err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Follow-up overdue alerts (B2-2)
// ─────────────────────────────────────────────────────────────────────────────

export interface OverdueFollowupAlert {
  clientPhone: string | null;
  daysOverdue: number;
  reasonLabel: string;
  phrase: string | null;
  audioUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal Daily Digest (B3-2 + B2-6) — ertalab 08:00
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyDigestDeal {
  clientPhone: string | null;
  daysSinceLast: number;
  topObjection: string | null;
  nextBestAction: string;
  heat?: number | null;
}

export interface ManagerDailyDigest {
  managerName: string;
  totalActions: number;
  overdueFollowups: DailyDigestDeal[];
  hotDeals: DailyDigestDeal[];
  atRiskDeals: DailyDigestDeal[];
  stuckDeals: DailyDigestDeal[];
  topPerformerName?: string;
  topPerformerTechnique?: string;
}

/**
 * Menejerga ertalab 08:00 — "bugun qilish kerak" reja
 */
export const sendManagerDailyDigest = async (
  telegramId: string,
  data: ManagerDailyDigest
): Promise<void> => {
  if (!bot) return;
  if (data.totalActions === 0) return;

  try {
    const sections: string[] = [];

    if (data.overdueFollowups.length > 0) {
      const list = data.overdueFollowups
        .slice(0, 5)
        .map((d, i) => {
          const phone = d.clientPhone || "Nomalum";
          return `${i + 1}. 📞 ${phone} — ${d.daysSinceLast} kun oldin\n   ${d.nextBestAction}`;
        })
        .join("\n");
      sections.push(`🚨 VAQTI O'TGAN FOLLOW-UP (${data.overdueFollowups.length} ta):\n${list}`);
    }

    if (data.hotDeals.length > 0) {
      const list = data.hotDeals
        .slice(0, 5)
        .map((d, i) => {
          const phone = d.clientPhone || "Nomalum";
          const heat = d.heat ? ` (${d.heat}%)` : "";
          return `${i + 1}. 🔥 ${phone}${heat}\n   ${d.nextBestAction}`;
        })
        .join("\n");
      sections.push(`🔥 ISSIQ LIDLAR (${data.hotDeals.length} ta):\n${list}`);
    }

    if (data.atRiskDeals.length > 0) {
      const list = data.atRiskDeals
        .slice(0, 3)
        .map((d, i) => {
          const phone = d.clientPhone || "Nomalum";
          const obj = d.topObjection ? ` [${d.topObjection}]` : "";
          return `${i + 1}. ⚠️ ${phone}${obj}\n   ${d.nextBestAction}`;
        })
        .join("\n");
      sections.push(`⚠️ RISK ZONASIDA:\n${list}`);
    }

    if (data.stuckDeals.length > 0) {
      const list = data.stuckDeals
        .slice(0, 3)
        .map((d, i) => {
          const phone = d.clientPhone || "Nomalum";
          return `${i + 1}. 🧊 ${phone} — ${d.daysSinceLast} kun harakatsiz`;
        })
        .join("\n");
      sections.push(`🧊 QOTIB QOLGAN:\n${list}`);
    }

    const eliteBlock = data.topPerformerName && data.topPerformerTechnique
      ? `\n━━━━━━━━━━━━━━━━━━━━━\n⭐ ${data.topPerformerName} FORMULASI:\n${data.topPerformerTechnique}`
      : "";

    const message = `🌅 BUGUNGI REJA — ${data.managerName.toUpperCase()}
${new Date().toLocaleDateString("uz-UZ")}

Jami ${data.totalActions} ta harakat kerak.

${sections.join("\n\n━━━━━━━━━━━━━━━━━━━━━\n")}${eliteBlock}

💪 Omad!`;

    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram manager daily digest error:", err);
  }
};

/**
 * Menejerga vaqti o'tgan follow-uplar ro'yxati — ertalab 09:00
 */
export const sendManagerFollowupAlert = async (
  telegramId: string,
  managerName: string,
  items: OverdueFollowupAlert[],
  topPerformerPhrase?: string
): Promise<void> => {
  if (!bot || items.length === 0) return;
  try {
    const list = items
      .slice(0, 10)
      .map((it, i) => {
        const phone = it.clientPhone || "Nomalum";
        const phraseLine = it.phrase
          ? `\n   💬 "${it.phrase.slice(0, 100)}"`
          : "";
        return `${i + 1}. 📞 ${phone} — ${it.daysOverdue} kun oldin\n   🎯 ${it.reasonLabel}${phraseLine}`;
      })
      .join("\n\n");

    const eliteBlock = topPerformerPhrase
      ? `\n━━━━━━━━━━━━━━━━━━━━━\n⭐ SKRIPT (top performer uslubida):\n"${topPerformerPhrase}"`
      : "";

    const message = `🚨 FOLLOW-UP UNUTILDI — ${managerName.toUpperCase()}

${items.length} ta mijoz keyin qaytib qo'ng'iroq kerak edi — hali bog'lanmadingiz.

${list}${eliteBlock}

💡 Bugun qaytib qo'ng'iroq qiling — aks holda bu lidlar soviydi.`;

    await bot.sendMessage(telegramId, message);
  } catch (err) {
    console.error("Telegram manager followup alert error:", err);
  }
};
