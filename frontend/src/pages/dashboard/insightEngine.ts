/**
 * Insight Engine — Dashboard uchun avtomatik narrative generatsiyasi.
 *
 * Principle: raqamdan → kontekstga → insight'ga → HARAKATGA.
 *
 * Ma'lumot manbalari:
 *   - stats (avg score, conversion, calls)
 *   - benchmark (team avg, top performer)
 *   - red-alerts (at-risk deals count)
 *   - trend (growth direction)
 *
 * Natija: { kind, title, message, action? }
 */

import type { BenchmarkStats, RedAlert } from "../../services/agents.service";
import type { DashboardStats } from "../../types";
import type { InsightKind } from "../../components/ui/stats";

export interface DashboardInsight {
  kind: InsightKind;
  title: string;
  message: string;
  action?: {
    label: string;
    path: string;
  };
}

interface Input {
  stats?: DashboardStats | null;
  benchmark?: BenchmarkStats | null;
  redAlerts?: RedAlert[];
  /** Menejerning o'zi uchun aniq insight — bo'lsa, jamoa insight o'rniga shu chiqadi */
  managerName?: string;
}

/**
 * Eng muhim insight'ni tanlaydi. Ustuvorlik:
 *   1. Red-Alerts bor → "bugun qo'ng'iroq qiling"
 *   2. Ball past → "Looping texnikasini sinang"
 *   3. Konversiya past → "yakunlashga e'tibor"
 *   4. Hammasi yaxshi → "ajoyib natija"
 *   5. Ma'lumot yo'q → "birinchi qo'ng'iroqni yuklang"
 */
export function generateInsight(input: Input): DashboardInsight {
  const { stats, benchmark, redAlerts = [], managerName } = input;

  // ── 1. Critical red-alerts bor ───────────────────────────
  const critical = redAlerts.filter((a) => a.riskLevel === "critical").length;
  const highRisk = redAlerts.filter((a) => a.riskLevel === "high").length;
  if (critical > 0) {
    return {
      kind: "warning",
      title: "Zudlik bilan harakat",
      message: `${critical} ta bitim kritik xavfda — callback deadlineni o'tib ketgan. Bugun aloqa qilib, ha yoki yo'q javobini oling. Muzlashga ruxsat bermang.`,
      action: { label: "Xavfli bitimlarni ko'rish", path: "/audio" },
    };
  }
  if (highRisk >= 2) {
    return {
      kind: "warning",
      title: "Bugun diqqat kerak",
      message: `${highRisk} ta bitim yuqori xavfda. Ularga bugun qo'ng'iroq qiling — "o'ylab ko'ramiz" javobini olish o'rniga aniq sana bilan kelishing.`,
      action: { label: "Batafsil", path: "/audio" },
    };
  }

  // ── 2. Ma'lumot yo'q (dastlabki holat) ────────────────────
  if (!stats || stats.totalCalls === 0) {
    return {
      kind: "info",
      title: "Boshlash uchun",
      message:
        "Hali qo'ng'iroqlar tahlil qilinmagan. Audio fayllarni yuklang yoki AmoCRM ulanishini sozlang — birinchi tahlil 2-3 daqiqada tayyor bo'ladi.",
      action: { label: "Audio yuklash", path: "/audio/upload" },
    };
  }

  // ── 3. Jamoa statistikasi asosida ─────────────────────────
  if (benchmark) {
    const { teamStats, errorDistribution } = benchmark;
    const surrender = teamStats.surrenderRate;
    const openEnd = teamStats.openEndingRate;

    // Taslim stavka yuqori
    if (surrender >= 40) {
      const topErr = errorDistribution.find((e) => e.type.includes("taslim") || e.type.includes("E'tiroz"));
      const davronMsg = topErr?.topPerformerHasIt === false ? " Ustoz sotuvchilarda bu xato 0% — ularning Looping texnikasini o'rganing." : "";
      return {
        kind: "tip",
        title: "Looping texnikasi vaqti",
        message: `Jamoaning ${surrender}% qo'ng'iroqlarida e'tirozga javob berilmaydi (taslim bo'lyapti).${davronMsg}`,
        action: { label: "Mashq qilish", path: managerName ? `/benchmark` : `/benchmark` },
      };
    }

    // Ochiq yakun yuqori
    if (openEnd >= 30) {
      return {
        kind: "tip",
        title: "Yakunlash ustida ishlash",
        message: `Jamoaning ${openEnd}% qo'ng'iroqlari aniq keyingi qadamsiz tugayapti. Har suhbat oxirida sana va vaqtni aniq belgilang — "ertaga 14:00da qo'ng'iroq qilaman" kabi.`,
        action: { label: "Tafsilot", path: "/dashboard/analysis" },
      };
    }

    // Ball past
    if (stats.avgScore < 60) {
      const gap = teamStats.avgScore - stats.avgScore;
      return {
        kind: "warning",
        title: "Ball pasaydi",
        message: `${stats.avgScore}/100 — jamoa o'rtachasidan ${Math.abs(gap)} ball past. AI Coach siz uchun 3 ta eng muhim diqqat joyini tayyorlagan.`,
        action: { label: "Coaching olish", path: "/coach" },
      };
    }

    // Hammasi yaxshi
    if (stats.avgScore >= 80 && stats.growthRate >= 0) {
      return {
        kind: "success",
        title: "Ajoyib",
        message: `O'rtacha ball ${stats.avgScore}/100 · O'sish ${stats.growthRate >= 0 ? "+" : ""}${stats.growthRate}%. Bu sur'atda davom etsangiz, bu oyda rekord qo'yasiz.`,
      };
    }
  }

  // ── 4. Default — o'sish yo'nalishi bo'yicha ───────────────
  if (stats.growthRate > 5) {
    return {
      kind: "success",
      title: "O'sayapsiz",
      message: `O'tgan haftaga nisbatan +${stats.growthRate}%. Bu ijobiy trend — shu ritmda davom eting va yangi mashqlarni sinab ko'ring.`,
      action: { label: "Mashq qilish", path: "/benchmark" },
    };
  }

  if (stats.growthRate < -5) {
    return {
      kind: "warning",
      title: "O'sish sekinlashdi",
      message: `${stats.growthRate}% — o'tgan davrdan past. Sabablarini Strategist Agent aniqlab bergan — bu hafta 3 ta diqqat joyiga qarating.`,
      action: { label: "Strategiyamni ko'rish", path: "/managers" },
    };
  }

  return {
    kind: "info",
    title: "Barqaror holat",
    message: `O'rtacha ball ${stats.avgScore}/100 · ${stats.totalCalls} ta tahlil qilingan qo'ng'iroq. Haftalik strategiyangizni ko'rib, keyingi o'sishni rejalashtiring.`,
    action: { label: "Mening strategiyam", path: "/managers" },
  };
}

/**
 * Qisqa label (badge) generatsiyasi — Dashboard header'da ko'rsatish uchun.
 */
export function generateBadgeLabel(stats?: DashboardStats | null): string {
  if (!stats) return "Kutilmoqda";
  if (stats.avgScore >= 80) return "A'lo natija";
  if (stats.avgScore >= 70) return "Yaxshi";
  if (stats.avgScore >= 60) return "O'rta";
  if (stats.avgScore >= 50) return "Yaxshilash kerak";
  return "Zaif";
}
