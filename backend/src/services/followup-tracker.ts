/**
 * Follow-up Tracker (B2-2)
 *
 * Har kuni tekshiradi — "o'ylayman / yaqinlarim bilan maslahatlashaman" degan mijozlarga
 * menejer vaqtida qaytib qo'ng'iroq qildimi.
 *
 * Agar:
 *  - Analysis.requiresFollowup = true
 *  - Analysis.followupCompleted = false
 *  - followupDeadline o'tgan
 *  → menejerga Telegram alert yuboriladi
 */

import { prisma } from "../utils/prisma";

export interface OverdueFollowup {
  audioFileId: string;
  leadId: number | null;
  clientPhone: string | null;
  managerId: string | null;
  managerName: string | null;
  managerTelegramId: string | null;
  followupReason: string | null;
  followupPhrase: string | null;
  followupDeadline: Date | null;
  daysOverdue: number;
  lastCallSummary: string | null;
  callDate: Date | null;
}

/**
 * Bitta kompaniya uchun overdue (vaqti o'tgan) follow-uplarni topish.
 */
export async function getOverdueFollowups(companyId: string): Promise<OverdueFollowup[]> {
  const now = new Date();

  const rows = await prisma.analysis.findMany({
    where: {
      requiresFollowup: true,
      followupCompleted: false,
      followupDeadline: { lt: now },
      audioFile: {
        companyId,
        // Agar mijoz keyinchalik sotib olgan bo'lsa — ehtiyoj yo'q
        isSale: false,
      },
    },
    include: {
      audioFile: {
        select: {
          id: true,
          leadId: true,
          phoneNumber: true,
          managerId: true,
          callDate: true,
          manager: { select: { name: true, telegramId: true, isActive: true } },
        },
      },
    },
    orderBy: { followupDeadline: "asc" },
  });

  // Faqat aktiv menejerlar + per-lead deduplikatsiya
  // (bir lead uchun bir nechta overdue analysis bo'lsa — eng oxirgisini oldim)
  const byLead: Record<string, OverdueFollowup> = {};

  for (const r of rows) {
    const af = r.audioFile;
    if (!af || !af.manager?.isActive) continue;

    const leadKey = af.leadId ? `lead_${af.leadId}` : `audio_${af.id}`;
    const daysOverdue = r.followupDeadline
      ? Math.floor((now.getTime() - r.followupDeadline.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const row: OverdueFollowup = {
      audioFileId: af.id,
      leadId: af.leadId,
      clientPhone: af.phoneNumber,
      managerId: af.managerId,
      managerName: af.manager?.name || null,
      managerTelegramId: af.manager?.telegramId || null,
      followupReason: r.followupReason,
      followupPhrase: r.followupPhrase,
      followupDeadline: r.followupDeadline,
      daysOverdue,
      lastCallSummary: r.summary?.slice(0, 200) || null,
      callDate: af.callDate,
    };

    // Eng oxirgisini saqlash
    const existing = byLead[leadKey];
    if (!existing || (row.callDate && existing.callDate && row.callDate > existing.callDate)) {
      byLead[leadKey] = row;
    }
  }

  return Object.values(byLead);
}

/**
 * Menejer ID bo'yicha overdue follow-uplar (per-manager filter).
 */
export async function getManagerOverdueFollowups(
  managerId: string
): Promise<OverdueFollowup[]> {
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { companyId: true },
  });
  if (!manager) return [];

  const all = await getOverdueFollowups(manager.companyId);
  return all.filter((f) => f.managerId === managerId);
}

/**
 * Reason uchun o'qish uchun mos matn.
 */
export function followupReasonLabel(reason: string | null): string {
  switch (reason) {
    case "thinking": return "O'ylayman dedi";
    case "family_consultation": return "Yaqinlari bilan maslahat";
    case "price": return "Narx haqida o'ylash";
    case "timing": return "Keyinroq qaytadan";
    case "other": return "Boshqa sabab";
    default: return "Follow-up kerak";
  }
}
