// Aloqaga chiqish vaqti — lid yaratilgan → birinchi JAVOB BERILGAN aloqa
// (Lead.firstAnsweredCallAt). Mahalliy va Chet el raqami ALOHIDA.
// /sales va /audit ikkalasi SHU funksiyani ishlatadi — natijalar aynan mos.

import { businessHoursBetween } from "./business-hours";

export interface ContactStats {
  avgHours: number; // umumiy (xom, wall-clock) o'rtacha soat
  avgWorkHours: number; // faqat ish vaqti bo'yicha o'rtacha soat
  totalLeadsCount: number;
  contactedLeadsCount: number; // javob berilgan aloqa bo'lgan lidlar soni
}

export interface LeadContactRow {
  dateCreate: Date;
  responsibleManagerId: string | null;
  statusName: string | null;
  rejectReasonName: string | null;
  firstAnsweredCallAt: Date | null;
}

// "Chet el raqami" — Bitrix kanban statusi yoki "Sifatsiz lid" sababi.
export const isForeignLead = (l: {
  statusName: string | null;
  rejectReasonName: string | null;
}): boolean => l.statusName === "Chet el raqami" || l.rejectReasonName === "Chet el raqami";

export function contactStatsFromLeads(
  leads: LeadContactRow[],
  opts: {
    workStartMin: number;
    workEndMin: number;
    daysOffByManager: Map<string, Set<string>>;
  }
): { local: ContactStats; foreign: ContactStats } {
  const { workStartMin, workEndMin, daysOffByManager } = opts;
  const avgRounded = (arr: number[]): number =>
    arr.length > 0
      ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
      : 0;

  const statsFor = (rows: LeadContactRow[]): ContactStats => {
    const gaps: number[] = [];
    const workGaps: number[] = [];
    for (const l of rows) {
      if (!l.firstAnsweredCallAt) continue;
      const diff = l.firstAnsweredCallAt.getTime() - l.dateCreate.getTime();
      if (diff < 0) continue;
      gaps.push(diff / 3_600_000);
      workGaps.push(
        businessHoursBetween(l.dateCreate, l.firstAnsweredCallAt, {
          workStartMin,
          workEndMin,
          daysOff: l.responsibleManagerId
            ? daysOffByManager.get(l.responsibleManagerId)
            : undefined,
        })
      );
    }
    return {
      avgHours: avgRounded(gaps),
      avgWorkHours: avgRounded(workGaps),
      totalLeadsCount: rows.length,
      contactedLeadsCount: gaps.length,
    };
  };

  return {
    local: statsFor(leads.filter((l) => !isForeignLead(l))),
    foreign: statsFor(leads.filter(isForeignLead)),
  };
}
