// Ish vaqti bo'yicha o'tgan soatlarni hisoblash — Tashkent timezone (UTC+5).
//
// "Aloqaga chiqish" (time-to-contact) metrikasi uchun: lid yaratilgandan
// birinchi aloqagacha bo'lgan vaqt xom (wall-clock) emas, balki faqat ish
// oynasiga (masalan 09:00–18:00) tushgan soatlar bo'yicha sanaladi. Tun,
// hamda davomatdagi dam kunlari (ManagerSchedule status 1/2 — bayramlar ham
// shu yerga kiritiladi) o'tkazib yuboriladi.
//
// ⚠️ `toISOString().split("T")[0]` ishlatmaymiz — UTC konvertatsiya Tashkent
// sanasini bir kun buradi. Hamma joyda Tashkent offset bilan ishlaymiz.

const TASHKENT_OFFSET_MS = 5 * 3600 * 1000;
const DAY_MS = 86_400_000;

// "HH:MM" → yarim tundan boshlab daqiqa. Noto'g'ri bo'lsa fallback qaytaradi.
export const parseHmToMinutes = (hm: string | null | undefined, fallbackMin: number): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || "").trim());
  if (!m) return fallbackMin;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return fallbackMin;
  return h * 60 + mi;
};

// Tashkent "epoch" (utcMs + offset) → "YYYY-MM-DD" Tashkent lokal sanasi.
// Offset qo'shilgani uchun getUTC* metodlari Tashkent lokal komponentlarini beradi.
const tashkentDateStr = (tashkentEpochMs: number): string => {
  const d = new Date(tashkentEpochMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export interface BusinessHoursOpts {
  workStartMin: number; // yarim tundan ish boshlash daqiqasi (masalan 540 = 09:00)
  workEndMin: number; //   yarim tundan ish tugash daqiqasi (masalan 1080 = 18:00)
  daysOff?: Set<string>; // "YYYY-MM-DD" Tashkent dam kunlari (skip qilinadi)
}

// start → end oralig'ining faqat ish oynasiga tushgan qismini soatda qaytaradi.
// end <= start yoki ish oynasi noto'g'ri bo'lsa 0.
export const businessHoursBetween = (
  start: Date,
  end: Date,
  opts: BusinessHoursOpts
): number => {
  const { workStartMin, workEndMin, daysOff } = opts;
  if (!start || !end) return 0;
  if (workEndMin <= workStartMin) return 0;

  const startMs = start.getTime() + TASHKENT_OFFSET_MS; // Tashkent epoch
  const endMs = end.getTime() + TASHKENT_OFFSET_MS;
  if (endMs <= startMs) return 0;

  let total = 0;
  // Tashkent kun boshidan boshlab kun-bakun yuramiz.
  for (
    let dayStart = Math.floor(startMs / DAY_MS) * DAY_MS;
    dayStart < endMs;
    dayStart += DAY_MS
  ) {
    if (daysOff && daysOff.has(tashkentDateStr(dayStart))) continue;
    const winStart = dayStart + workStartMin * 60_000;
    const winEnd = dayStart + workEndMin * 60_000;
    const ovStart = Math.max(startMs, winStart);
    const ovEnd = Math.min(endMs, winEnd);
    if (ovEnd > ovStart) total += ovEnd - ovStart;
  }
  return total / 3_600_000;
};
