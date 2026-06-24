/**
 * Sud Agent (B5-1) — menejerni nohaq baholamaslik uchun.
 *
 * Vazifa: Qo'ng'iroq mezonlarni to'liq namoyon etishga imkon bermagan
 * bo'lsa, shu tahlil manager avgScore hisobiga kirmaydi.
 *
 * Qoidalar (vaqt + kontent + kontekst):
 *  1. Audio juda qisqa (< 60s)
 *  2. Menejer amaliy gap vaqti kam (< 20s)
 *  3. Deyarli hech qanday mezonda ball bor (< 2)
 *  4. Mezonlar 50% dan kamida qamrab olinmagan (vaqtdan qat'i nazar)
 *  5. Adashib tushgan lid — xato raqam / boshqa kompaniya kerak
 *  6. Transfer — menejer boshqa menejerga uzatgan
 *  7. Lead score 20 dan past — juda sovuq lid, baholash adolatli emas
 *  8. Mijoz deyarli gapirmagan (clientSpeech < 10%)
 *  9. Til muammosi — mijoz boshqa tilda gaplashadi
 */

export interface JudgeVerdict {
  skipped: boolean;
  reason: string | null;
}

export interface JudgeInput {
  durationSeconds: number | null;         // audio davomiyligi
  managerSpeechPercent: number | null;    // menejer gap % (0-100)
  clientSpeechPercent: number | null;     // mijoz gap % (0-100)
  criteriaScores: number[];               // mezon ballari (0-100)
  leadScore: number | null;               // AI bahosi (0-100)
  summary: string | null;                 // AI xulosa — keyword detektsiya uchun
  leadQuality?: string | null;            // sovuq/iliq/issiq
}

const MIN_DURATION_SEC = 60;
const MIN_MANAGER_SPEECH_SEC = 20;
const MIN_ATTEMPTED_CRITERIA_COUNT = 2;
const MIN_ATTEMPTED_CRITERIA_RATIO = 0.5;
const COLD_LEAD_SCORE_THRESHOLD = 20;
const MIN_CLIENT_SPEECH_PERCENT = 10;

// Keyword matchers — case-insensitive, Uzbek + Russian
const matchAny = (text: string, keywords: string[]): boolean => {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
};

const WRONG_NUMBER_KEYWORDS = [
  "adash",
  "noto'g'ri raqam",
  "xato raqam",
  "xato tushgan",
  "siz emas",
  "kimga kerak",
  "kim kerak",
  "tushgan",
  "ошиб",
  "не тот номер",
  "не туда",
  "не вам",
  "куда я попал",
];

const TRANSFER_KEYWORDS = [
  "boshqa menejer",
  "o'tkazaman",
  "o‘tkazaman",
  "bog'layman",
  "bog‘layman",
  "ulaymiz",
  "ulayman",
  "perevod",
  "перевожу",
  "переключаю",
  "соединяю с",
  "передаю",
];

const LANGUAGE_ISSUE_KEYWORDS = [
  "tushunmadim tilni",
  "rus tilida gapiring",
  "o'zbek tili",
  "o‘zbek tili",
  "tarjimon",
  "я не понимаю",
  "говорите по-русски",
  "не понимаю узбекский",
];

/**
 * Sud qarori — qo'ng'iroq menejer baholash hisobiga kiritilishi kerakmi.
 */
export const judgeCall = (input: JudgeInput): JudgeVerdict => {
  const {
    durationSeconds,
    managerSpeechPercent,
    clientSpeechPercent,
    criteriaScores,
    leadScore,
    summary,
  } = input;

  // 1. Audio juda qisqa
  if (
    durationSeconds != null &&
    durationSeconds > 0 &&
    durationSeconds < MIN_DURATION_SEC
  ) {
    return {
      skipped: true,
      reason: `Qo'ng'iroq juda qisqa (${durationSeconds}s) — menejer mezonlarni to'liq ko'rsata olmadi`,
    };
  }

  // 2. Menejer amaliy gap vaqti juda qisqa
  if (
    durationSeconds != null &&
    managerSpeechPercent != null &&
    durationSeconds > 0
  ) {
    const managerSeconds = (managerSpeechPercent / 100) * durationSeconds;
    if (managerSeconds < MIN_MANAGER_SPEECH_SEC) {
      return {
        skipped: true,
        reason: `Vaqt kamligi uchun menejer ishlay olmadi — atigi ${Math.round(managerSeconds)}s gapirgan`,
      };
    }
  }

  // 3. Juda kam mezonda ball bor (umuman tahlil qilib bo'lmaydi)
  const attemptedScores = criteriaScores.filter((s) => s > 0);
  if (
    criteriaScores.length > 0 &&
    attemptedScores.length < MIN_ATTEMPTED_CRITERIA_COUNT
  ) {
    return {
      skipped: true,
      reason: `Vaqt kamligi uchun menejer mezonlarni namoyon eta olmadi (${attemptedScores.length}/${criteriaScores.length})`,
    };
  }

  // 4. Mezonlar yetarli qamrab olinmagan (kontent — vaqtdan qat'i nazar)
  if (criteriaScores.length >= 4) {
    const ratio = attemptedScores.length / criteriaScores.length;
    if (ratio < MIN_ATTEMPTED_CRITERIA_RATIO) {
      return {
        skipped: true,
        reason: `Menejer mezonlarni yetarli qamrab olmadi (${attemptedScores.length}/${criteriaScores.length} — ${Math.round(ratio * 100)}%). Tahlil uchun imkoniyat kam bo'lgan.`,
      };
    }
  }

  // 5. Adashib tushgan lid — xato raqam
  if (summary && matchAny(summary, WRONG_NUMBER_KEYWORDS)) {
    return {
      skipped: true,
      reason: "Adashib tushgan qo'ng'iroq — xato raqam yoki boshqa kompaniya so'ralgan",
    };
  }

  // 6. Transfer — menejer boshqa menejerga uzatgan
  if (summary && matchAny(summary, TRANSFER_KEYWORDS)) {
    return {
      skipped: true,
      reason: "Qo'ng'iroq boshqa menejerga o'tkazilgan — to'liq baholash uchun ma'lumot yetarli emas",
    };
  }

  // 7. Lead score juda past — sovuq lid (menejer aybiga bog'liq emas)
  if (
    leadScore != null &&
    leadScore > 0 &&
    leadScore < COLD_LEAD_SCORE_THRESHOLD
  ) {
    return {
      skipped: true,
      reason: `Juda sovuq lid (score ${leadScore}/100) — mijozning qiziqishi juda kam, menejer ishlash imkoniyati cheklangan`,
    };
  }

  // 8. Mijoz deyarli gapirmagan — kontakt bo'lmagan
  if (
    clientSpeechPercent != null &&
    clientSpeechPercent > 0 &&
    clientSpeechPercent < MIN_CLIENT_SPEECH_PERCENT
  ) {
    return {
      skipped: true,
      reason: `Mijoz deyarli gapirmadi (${clientSpeechPercent}%) — dialog bo'lmagan, menejerga imkoniyat berilmagan`,
    };
  }

  // 9. Til muammosi — mijoz boshqa tilda gaplashadi
  if (summary && matchAny(summary, LANGUAGE_ISSUE_KEYWORDS)) {
    return {
      skipped: true,
      reason: "Til muammosi — mijoz boshqa tilda gaplashgan, to'liq suhbat bo'lmagan",
    };
  }

  return { skipped: false, reason: null };
};
