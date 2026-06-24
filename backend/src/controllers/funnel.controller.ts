/**
 * Funnel Leakage Metrics
 *
 * Sotuv voronkasidagi 3 ta asosiy "teshik"ni hisoblaydi:
 * 1. Nutq nisbati xatosi — menejer 70%+ gapirsa (mijoz eshitilmayapti)
 * 2. E'tirozda taslim bo'lish — e'tiroz kelib menejer javob bermadi
 * 3. Ochiq yakunlash — keyingi qadam belgilanmadi
 *
 * Bularning barchasi MAVJUD ma'lumotlardan hisoblanadi — yangi tahlil shart emas.
 */

import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success } from "../utils/response";

// ─────────────────────────────────────────────────────────────────────────────

export const getFunnelLeakage = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  const days = parseInt(req.query.days as string) || 30;

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Tahlil qilingan qo'ng'iroqlar
  const files = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: "done",
      createdAt: { gte: since },
    },
    select: {
      id: true,
      isSale: true,
      managerId: true,
      manager: { select: { name: true } },
      analysis: {
        select: {
          managerSpeech: true,
          errors: true,
          objections: true,
          leadQuality: true,
          coachingInsights: true,
        },
      },
    },
  });

  const total = files.length;
  if (total === 0) {
    return success(res, {
      period: `${days} kun`,
      totalCalls: 0,
      funnelLeaks: { speechRatioViolations: null, surrenderedObjections: null, openEndings: null },
      conversionRate: 0,
      message: "Ma'lumot yo'q",
    });
  }

  // ── 1. Nutq nisbati xatosi (menejer > 70%) ──────────────────────────────
  const speechViolations: Array<{ managerId: string; managerName: string; ratio: number }> = [];
  const mgrSpeechAcc: Record<string, { sum: number; count: number; name: string }> = {};

  for (const f of files) {
    const ratio = f.analysis?.managerSpeech ?? 0;
    if (!f.managerId || !f.manager) continue;
    const mid = f.managerId;
    if (!mgrSpeechAcc[mid]) mgrSpeechAcc[mid] = { sum: 0, count: 0, name: f.manager.name };
    mgrSpeechAcc[mid].sum += ratio;
    mgrSpeechAcc[mid].count += 1;
  }

  const speechViolationCalls = files.filter((f) => (f.analysis?.managerSpeech ?? 0) > 70).length;

  const mgrSpeechAvgs = Object.entries(mgrSpeechAcc)
    .map(([id, s]) => ({
      managerId: id,
      managerName: s.name,
      ratio: Math.round(s.sum / s.count),
    }))
    .sort((a, b) => b.ratio - a.ratio);

  const worstSpeech = mgrSpeechAvgs.filter((m) => m.ratio > 70);

  // ── 2. E'tirozda taslim bo'lish ──────────────────────────────────────────
  // errors array da "E'tirozga javob berilmadi" bor + objections > 0
  let totalObjectionCalls = 0;
  let surrenderedCalls = 0;
  const surrenderByType: Record<string, { surrendered: number; total: number }> = {};
  const mgrSurrenderAcc: Record<string, { surrendered: number; total: number; name: string }> = {};

  for (const f of files) {
    const objections = (f.analysis?.objections as Array<{ type: string; count: number }>) || [];
    const errors = (f.analysis?.errors as Array<{ type: string }>) || [];
    const hasObjection = objections.length > 0;
    const hasSurrender = errors.some((e) => e.type === "E'tirozga javob berilmadi");

    if (hasObjection) totalObjectionCalls++;

    if (hasSurrender) {
      surrenderedCalls++;
      if (f.managerId && f.manager) {
        const mid = f.managerId;
        if (!mgrSurrenderAcc[mid]) mgrSurrenderAcc[mid] = { surrendered: 0, total: 0, name: f.manager.name };
        mgrSurrenderAcc[mid].surrendered += 1;
      }
    }

    // E'tiroz turi bo'yicha
    for (const obj of objections) {
      if (!surrenderByType[obj.type]) surrenderByType[obj.type] = { surrendered: 0, total: 0 };
      surrenderByType[obj.type].total += obj.count;
      if (hasSurrender) surrenderByType[obj.type].surrendered += 1;
    }

    if (f.managerId && f.manager) {
      const mid = f.managerId;
      if (!mgrSurrenderAcc[mid]) mgrSurrenderAcc[mid] = { surrendered: 0, total: 0, name: f.manager.name };
      if (hasObjection) mgrSurrenderAcc[mid].total += 1;
    }
  }

  const surrenderPercent = totalObjectionCalls > 0
    ? Math.round((surrenderedCalls / totalObjectionCalls) * 100 * 10) / 10
    : 0;

  const surrenderByTypeArr = Object.entries(surrenderByType)
    .map(([type, s]) => ({ type, surrendered: s.surrendered, total: s.total }))
    .sort((a, b) => b.surrendered - a.surrendered);

  const worstSurrender = Object.entries(mgrSurrenderAcc)
    .filter(([, s]) => s.total > 0)
    .map(([id, s]) => ({
      managerId: id,
      managerName: s.name,
      surrendered: s.surrendered,
      total: s.total,
      rate: Math.round((s.surrendered / s.total) * 100),
    }))
    .sort((a, b) => b.surrendered - a.surrendered)
    .slice(0, 3);

  // ── 3. Ochiq yakunlash (keyingi qadam yo'q) ──────────────────────────────
  const openEndingCalls = files.filter((f) => {
    const errors = (f.analysis?.errors as Array<{ type: string }>) || [];
    return errors.some((e) => e.type === "Yakunlash zaif");
  });

  const openEndingPercent = Math.round((openEndingCalls.length / total) * 100 * 10) / 10;

  const mgrOpenAcc: Record<string, { count: number; name: string }> = {};
  for (const f of openEndingCalls) {
    if (!f.managerId || !f.manager) continue;
    const mid = f.managerId;
    if (!mgrOpenAcc[mid]) mgrOpenAcc[mid] = { count: 0, name: f.manager.name };
    mgrOpenAcc[mid].count += 1;
  }
  const worstOpen = Object.entries(mgrOpenAcc)
    .map(([id, s]) => ({ managerId: id, managerName: s.name, count: s.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // ── Konversiya ────────────────────────────────────────────────────────────
  const salesCount = files.filter((f) => f.isSale).length;
  const conversionRate = Math.round((salesCount / total) * 100 * 10) / 10;

  // ── Yo'qotilgan sotuv taxmini ─────────────────────────────────────────────
  // Agar surrender va openEnding kamaytirish mumkin bo'lsa qancha qo'shimcha sotuv bo'ladi
  const estimatedLostFromSurrender = Math.round(surrenderedCalls * (conversionRate / 100));
  const estimatedLostFromOpenEnding = Math.round(openEndingCalls.length * 0.15); // 15% ni saqlab qolish mumkin

  return success(res, {
    period: `${days} kun`,
    totalCalls: total,
    totalSales: salesCount,
    conversionRate,
    funnelLeaks: {
      speechRatioViolations: {
        count: speechViolationCalls,
        percent: Math.round((speechViolationCalls / total) * 100 * 10) / 10,
        title: "Menejer haddan ortiq ko'p gapiryapti",
        problem: `${speechViolationCalls} ta qo'ng'iroqda menejer 70%+ vaqt o'zi gapirdi. Mijoz nima xohlashini aytolmagan — bu sotuv emas, monolog.`,
        impact: "Mijoz zerikadi, e'tirozini ham aytmay xayrlashadi",
        worstManagers: worstSpeech,
        solution: {
          technique: "50/50 + Ochiq savollar",
          steps: [
            "Har 30 soniyada to'xtang va savol bering: 'Sizga bu qanday ko'rinyapti?'",
            "Ochiq savollar ishlating: 'Nima uchun?', 'Qanday?', 'Sizga qaysi qismi muhim?'",
            "Mijoz gapirayotganda jim turing — to'xtatmang, bo'lmasa qaytaring",
          ],
          example: "Yomon: 'Bizda 12 oylik kurs bor, har modul...' (3 daqiqa monolog)\nYaxshi: 'Sizga ingliz tilini o'rganishda eng katta qiyinchilik nima?' (mijoz gapiradi)",
        },
      },
      surrenderedObjections: {
        count: surrenderedCalls,
        totalWithObjection: totalObjectionCalls,
        percent: surrenderPercent,
        title: "E'tiroz keldi — menejer tushib qoldi",
        problem: `${surrenderedCalls} ta qo'ng'iroqda mijoz biron e'tiroz aytdi (qimmat, vaqt yo'q, oylayman...), menejer esa javob bermay "mayli, oylab koring" deb tugatdi.`,
        impact: "E'tirozga javob berilmagan = sotuv yopildi",
        byType: surrenderByTypeArr,
        worstManagers: worstSurrender,
        estimatedLostDeals: estimatedLostFromSurrender,
        solution: {
          technique: "Feel-Felt-Found (Sezdim—Boshqalar ham sezgan—Topdik)",
          steps: [
            "TASDIQLA: 'Tushunaman, bu qaror muhim'",
            "MISOL BER: 'Boshqa mijozlar ham shunday o'ylagan, lekin...'",
            "AYNAN SO'RA: 'Aynan qaysi qismi sizga shubhali — narxmi, vaqtmi, sifatmi?'",
            "YECHIM TAKLIF QIL: aniq fakt yoki bonus bilan e'tirozni yoping",
          ],
          example: "Mijoz: 'Qimmat'\nYomon: 'Ha, mayli, oylab koring'\nYaxshi: 'Tushunaman. Aslida boshqa kurslarga qaraganda 30% arzonroq, chunki onlayn. Sizga byudjet jihatidan qaysi summa qulay edi?'",
        },
      },
      openEndings: {
        count: openEndingCalls.length,
        percent: openEndingPercent,
        title: "Keyingi qadamsiz tugagan",
        problem: `${openEndingCalls.length} ta qo'ng'iroq "yana gaplashamiz", "oylayman aytaman" bilan tugadi. Sana yo'q, vaqt yo'q, kim qo'ng'iroq qiladi noma'lum.`,
        impact: "Mijoz 1-2 kunda butunlay sovub ketadi va qayta qo'ng'iroqlarga javob bermaydi",
        worstManagers: worstOpen,
        estimatedLostDeals: estimatedLostFromOpenEnding,
        solution: {
          technique: "Specific Next Step Closing",
          steps: [
            "ANIQ SANA SO'RA: 'Ertaga soat 14:00 da yana qo'ng'iroq qilsam to'g'ri keladimi?'",
            "ALTERNATIVE TAKLIF QIL: 'Chorshanbami juma yaxshi?' (ikkisidan birini tanlatish)",
            "SABABNI AYT: 'Shu vaqt ichida materiallarni jo'natib qo'yaman, ko'rib turasiz'",
            "TASDIQLA: 'Demak juma soat 16:00 — kalendaringizga yozib qo'ying'",
          ],
          example: "Yomon: 'Mayli, o'ylab javob bering'\nYaxshi: 'Tushundim, oylash kerak. Ertaga soat 15:00 da qo'ng'iroq qilaman, shu vaqtgacha siz to'liq narx-navo va dasturni emailingizga jo'nataman. Yaqshimi?'",
        },
      },
    },
    totalEstimatedLostDeals: estimatedLostFromSurrender + estimatedLostFromOpenEnding,
    insight: buildInsight(speechViolationCalls, surrenderPercent, openEndingPercent, total),
  });
};

function buildInsight(
  speechViolations: number,
  surrenderPercent: number,
  openEndingPercent: number,
  total: number
): string {
  const parts: string[] = [];

  if (surrenderPercent > 50) {
    parts.push(`Eng katta muammo: e'tirozlarning ${surrenderPercent}% ida menejer javob bermayapti.`);
  } else if (surrenderPercent > 25) {
    parts.push(`E'tirozlarning ${surrenderPercent}% ida menejer tushib qolmoqda.`);
  }

  if ((speechViolations / total) * 100 > 40) {
    parts.push("Menejerlar mijozdan ko'ra ko'p gapirmoqda — savol bermayapti.");
  }

  if (openEndingPercent > 25) {
    parts.push(`Qo'ng'iroqlarning ${openEndingPercent}% i aniq keyingi qadamsiz tugamoqda.`);
  }

  return parts.length > 0 ? parts.join(" ") : "Sotuv jarayoni umumiy maqbul, lekin yaxshilash imkoni bor.";
}
