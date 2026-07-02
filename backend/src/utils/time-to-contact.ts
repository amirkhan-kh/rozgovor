// "Aloqaga chiqish" — lid yaratilgandan birinchi qo'ng'iroqgacha o'rtacha vaqt.
//
// Manba: Lead.firstCallAt (Bitrix crm.activity, TYPE_ID=2 — birinchi qo'ng'iroq,
// scripts/sync-lead-first-calls.js orqali sync qilinadi). Bu AudioFile'dan farqli —
// yozuvsiz/qisqa qo'ng'iroqlar ham hisobga olinadi, ya'ni haqiqiy "birinchi aloqa".
//
// Chet el (UC_IISBVC — "Chet el raqami") lidlari main o'rtachadan ajratiladi va
// alohida ko'rsatiladi. Sotuv va Audit ikkalasi shu util'ni chaqiradi.

import { prisma } from "./prisma";
import { businessHoursBetween, parseHmToMinutes } from "./business-hours";

// "Chet el raqami" kanban statusi (Bitrix crm.status.list bilan tasdiqlangan).
export const LEADS_FOREIGN_STATUS_ID = "UC_IISBVC";

export interface TimeToContact {
  avgHours: number; // main (Chet el'siz) wall-clock o'rtacha soat
  avgWorkHours: number; // main ish vaqti bo'yicha o'rtacha soat
  totalLeadsCount: number; // main lidlar soni (Chet el'siz)
  contactedLeadsCount: number; // main aloqaga chiqilgan (firstCallAt bor)
  foreign: {
    avgHours: number;
    avgWorkHours: number;
    leadsCount: number; // Chet el lidlar soni
    contactedLeadsCount: number; // Chet el aloqaga chiqilgan
  };
}

const avgRounded = (arr: number[]): number =>
  arr.length > 0
    ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10
    : 0;

export async function computeLeadTimeToContact(
  companyId: string,
  dateRange: { gte?: Date; lte?: Date } | null
): Promise<TimeToContact> {
  // Ish oynasi — company default (bo'sh bo'lsa 09:00–18:00).
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { adminWorkStart: true, adminWorkEnd: true },
  });
  const workStartMin = parseHmToMinutes(company?.adminWorkStart, 9 * 60);
  const workEndMin = parseHmToMinutes(company?.adminWorkEnd, 18 * 60);

  // Davomatdagi dam kunlari (status 1=dam, 2=ishlamagan) — mas'ul menejer bo'yicha.
  const dayOffRows = await prisma.managerSchedule.findMany({
    where: { manager: { companyId }, status: { in: [1, 2] } },
    select: { managerId: true, date: true },
  });
  const daysOffByManager = new Map<string, Set<string>>();
  for (const r of dayOffRows) {
    let set = daysOffByManager.get(r.managerId);
    if (!set) {
      set = new Set<string>();
      daysOffByManager.set(r.managerId, set);
    }
    set.add(r.date);
  }
  const daysOffFor = (
    managerId: string | null | undefined
  ): Set<string> | undefined =>
    managerId ? daysOffByManager.get(managerId) : undefined;

  const leads = await prisma.lead.findMany({
    where: dateRange ? { companyId, dateCreate: dateRange } : { companyId },
    select: {
      dateCreate: true,
      firstCallAt: true,
      statusId: true,
      responsibleManagerId: true,
    },
  });

  const mainGaps: number[] = [];
  const mainWork: number[] = [];
  const forGaps: number[] = [];
  const forWork: number[] = [];
  let totalMain = 0;
  let totalForeign = 0;
  for (const l of leads) {
    const isForeign = l.statusId === LEADS_FOREIGN_STATUS_ID;
    if (isForeign) totalForeign += 1;
    else totalMain += 1;
    if (!l.firstCallAt) continue;
    const diff = l.firstCallAt.getTime() - l.dateCreate.getTime();
    if (diff < 0) continue;
    const wall = diff / 3_600_000;
    const work = businessHoursBetween(l.dateCreate, l.firstCallAt, {
      workStartMin,
      workEndMin,
      daysOff: daysOffFor(l.responsibleManagerId),
    });
    if (isForeign) {
      forGaps.push(wall);
      forWork.push(work);
    } else {
      mainGaps.push(wall);
      mainWork.push(work);
    }
  }

  return {
    avgHours: avgRounded(mainGaps),
    avgWorkHours: avgRounded(mainWork),
    totalLeadsCount: totalMain,
    contactedLeadsCount: mainGaps.length,
    foreign: {
      avgHours: avgRounded(forGaps),
      avgWorkHours: avgRounded(forWork),
      leadsCount: totalForeign,
      contactedLeadsCount: forGaps.length,
    },
  };
}
