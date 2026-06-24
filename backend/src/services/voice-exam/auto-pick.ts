/**
 * AI auto-pick exam scenario + persona based on manager's weak points.
 *
 * Algoritm:
 *  1. Manager'ning oxirgi 30 kunlik tahlillaridan har mezon o'rtacha balli
 *  2. Eng past mezonni topish (canonical nom)
 *  3. Mezon → stsenariy mapping
 *  4. O'sha mezon past bo'lgan eng yomon audio'dan clientProfile (yosh, jins)
 *     personaga seed sifatida olinadi.
 *  5. Agar ma'lumot yo'q bo'lsa — random fallback.
 */
import { prisma } from "../../utils/prisma";

// Canonical mezon nomlari (managers.controller.ts dagi bilan moslashgan)
const CANONICAL: Record<string, string> = {
  "Salomlashish va suhbatni boshlash": "Salomlashish",
  "Salomlashish": "Salomlashish",
  "Ehtiyojni aniqlash — SOPRANO texnikasi": "Ehtiyojni aniqlash",
  "Ehtiyojni aniqlash — SPIN texnikasi": "Ehtiyojni aniqlash",
  "Ehtiyojni aniqlash": "Ehtiyojni aniqlash",
  "Mahsulotni tushuntirish": "Mahsulotni tushuntirish",
  "Mahsulot taqdimoti": "Mahsulotni tushuntirish",
  "Taqdimot": "Mahsulotni tushuntirish",
  "E'tirozlar bilan ishlash": "E'tirozlar bilan ishlash",
  "E'tiroz bilan ishlash": "E'tirozlar bilan ishlash",
  "Bosim o'tkazish": "Bosim o'tkazish",
  "Keyingi qadamga yo'naltirish": "Keyingi qadamga yo'naltirish",
  "Yakunlash": "Keyingi qadamga yo'naltirish",
  "Kayfiyati": "Kayfiyati",
  "Aktiv tinglash": "Aktiv tinglash",
  "Kontekstni eslatish": "Kontekstni eslatish",
  "Oldingi to‘siqni tekshirish": "Oldingi to'siqni tekshirish",
  "Oldingi to'siqni tekshirish": "Oldingi to'siqni tekshirish",
  "Yangi sabab bilan chiqish": "Yangi sabab bilan chiqish",
  "Qaror holatini aniqlash": "Qaror holatini aniqlash",
  "Closing va keyingi qadamni kelishish": "Closing va keyingi qadamni kelishish",
};
const canon = (n: string): string => CANONICAL[n] ?? n;

// Mezon → stsenariy code mapping (ikkala kategoriya).
// Birinchi mos keladigan stsenariy ishlatiladi; bo'lmasa fallback.
const WEAKNESS_TO_SCENARIO: Record<string, { code: string; reason: string }> = {
  "E'tirozlar bilan ishlash": { code: "objection", reason: "E'tirozlarga javob berish — kuchsiz" },
  "Bosim o'tkazish": { code: "hard", reason: "Qiyin/sovuq mijozda boshqaruv — kuchsiz" },
  "Mahsulotni tushuntirish": { code: "price", reason: "Mahsulot/narx qiymatini ko'rsatish — kuchsiz" },
  "Salomlashish": { code: "new_client", reason: "Salomlashish va aloqa o'rnatish — kuchsiz" },
  "Ehtiyojni aniqlash": { code: "new_client", reason: "Ehtiyojni aniqlash savollari — kuchsiz" },
  "Keyingi qadamga yo'naltirish": { code: "cancel", reason: "Yakuniy kelishuv — kuchsiz" },
  "Aktiv tinglash": { code: "new_client", reason: "Aktiv tinglash — kuchsiz" },
  "Kayfiyati": { code: "hard", reason: "Hissiy ohang boshqaruvi — kuchsiz" },
  // Qayta mezonlar
  "Kontekstni eslatish": { code: "callback_after_test", reason: "Kontekst eslatish — kuchsiz" },
  "Oldingi to'siqni tekshirish": { code: "callback_after_test", reason: "Eski to'siqni tekshirish — kuchsiz" },
  "Yangi sabab bilan chiqish": { code: "callback_after_test", reason: "Yangi sabab/ofer — kuchsiz" },
  "Qaror holatini aniqlash": { code: "callback_after_test", reason: "Qaror holatini aniqlash — kuchsiz" },
  "Closing va keyingi qadamni kelishish": { code: "callback_after_test", reason: "Qayta closing — kuchsiz" },
};

const UZ_MALE = ["Akmal", "Sardor", "Bobur", "Javlonbek", "Otabek", "Sherzod", "Diyor", "Anvar", "Jasur", "Rustam", "Asadbek", "Murod"];
const UZ_FEMALE = ["Madina", "Dilnoza", "Sevara", "Nodira", "Zilola", "Mohira", "Kamila", "Lola", "Shahnoza", "Gulnora", "Nigora", "Ozoda"];

function randomFromArr<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface AutoPickResult {
  scenarioId: string;
  scenarioCode: string;
  scenarioName: string;
  scenarioIcon: string;
  scenarioDifficulty: string;
  clientAge: number;
  clientGender: "male" | "female";
  clientName: string;
  reason: string;
  basedOnAudio?: { id: string; mezonScore: number; mezonName: string } | null;
}

/**
 * Manager uchun avtomatik stsenariy + persona tanlaydi.
 */
export async function autoPickExam(
  companyId: string,
  managerId: string,
): Promise<AutoPickResult> {
  // 1) Manager'ning rolini va kategoriyasini aniqlash uchun audio kategoriyasini olamiz
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const audios = await prisma.audioFile.findMany({
    where: {
      managerId,
      companyId,
      callDate: { gte: since },
      analysis: { isNot: null },
    },
    select: {
      id: true,
      category: true,
      analysis: {
        select: {
          criteria: true,
          clientProfile: true,
          overallScore: true,
          judgeSkipped: true,
        },
      },
    },
    orderBy: { callDate: "desc" },
    take: 200,
  });

  // 2) Eng ko'p kategoriyani aniqlash (sotuv yoki qayta)
  const catCount: Record<string, number> = {};
  for (const a of audios) {
    const cat = a.category || "sotuv";
    catCount[cat] = (catCount[cat] || 0) + 1;
  }
  const dominantCategory: "sotuv" | "qayta" =
    (catCount["qayta"] || 0) > (catCount["sotuv"] || 0) ? "qayta" : "sotuv";

  // 3) Har canonical mezon bo'yicha o'rtacha + eng yomon audio
  // criteria ikki shaklda kelishi mumkin:
  //   - Array<{name, score}> (eski format)
  //   - Record<name, {score, comment}> (yangi format — Vision DB'da hozir shu)
  const mezonAgg = new Map<string, { sum: number; n: number; worst: { audioId: string; score: number } | null }>();
  for (const a of audios) {
    if (a.analysis?.judgeSkipped) continue;
    const raw = a.analysis?.criteria;
    if (!raw) continue;
    const entries: Array<{ name: string; score: number }> = Array.isArray(raw)
      ? raw
          .filter((c: any) => c && typeof c.name === "string" && typeof c.score === "number")
          .map((c: any) => ({ name: c.name, score: c.score }))
      : typeof raw === "object"
        ? Object.entries(raw as Record<string, any>)
            .filter(([, v]) => v && typeof v.score === "number")
            .map(([k, v]: [string, any]) => ({ name: k, score: v.score }))
        : [];
    for (const c of entries) {
      const name = canon(c.name);
      const cur = mezonAgg.get(name) || { sum: 0, n: 0, worst: null };
      cur.sum += c.score;
      cur.n += 1;
      if (!cur.worst || c.score < cur.worst.score) {
        cur.worst = { audioId: a.id, score: c.score };
      }
      mezonAgg.set(name, cur);
    }
  }

  // 4) Eng past o'rtacha balli mezon (kamida 3 ta sample bo'lsin)
  let weakestName: string | null = null;
  let weakestAvg = Infinity;
  for (const [name, agg] of mezonAgg.entries()) {
    if (agg.n < 3) continue;
    const avg = agg.sum / agg.n;
    if (avg < weakestAvg) {
      weakestAvg = avg;
      weakestName = name;
    }
  }

  // 5) Mezon → stsenariy code; fallback — kategoriya bo'yicha default
  let mapping = weakestName ? WEAKNESS_TO_SCENARIO[weakestName] : null;
  if (!mapping) {
    mapping = dominantCategory === "qayta"
      ? { code: "callback_after_test", reason: "Qayta qo'ng'iroq amaliyoti" }
      : { code: "new_client", reason: "Umumiy sotuv ko'nikmasi" };
  }

  // 6) Stsenariyni DB'dan topamiz (yoki shu kompaniya uchun mavjud bo'lgan birinchi)
  let scenario = await prisma.examScenario.findFirst({
    where: { companyId, code: mapping.code, isActive: true },
    select: { id: true, code: true, name: true, icon: true, difficulty: true, category: true },
  });
  if (!scenario) {
    // fallback — kompaniyaning birinchi aktiv stsenariysi
    scenario = await prisma.examScenario.findFirst({
      where: { companyId, isActive: true },
      orderBy: { order: "asc" },
      select: { id: true, code: true, name: true, icon: true, difficulty: true, category: true },
    });
  }
  if (!scenario) {
    throw new Error("Bu kompaniyada faol stsenariy yo'q. Avval imtihon stsenariylarini sozlang.");
  }

  // 7) Persona seed — eng yomon audio'dagi clientProfile dan
  let basedOn: AutoPickResult["basedOnAudio"] = null;
  let clientAge = 25 + Math.floor(Math.random() * 25); // 25-50
  let clientGender: "male" | "female" = Math.random() < 0.5 ? "male" : "female";

  if (weakestName) {
    const worst = mezonAgg.get(weakestName)?.worst;
    if (worst) {
      const seedAudio = audios.find((a) => a.id === worst.audioId);
      const cp = (seedAudio?.analysis?.clientProfile as any) || null;
      if (cp) {
        if (typeof cp.age === "number" && cp.age >= 14 && cp.age <= 75) {
          clientAge = cp.age;
        }
        if (cp.gender === "male" || cp.gender === "female") {
          clientGender = cp.gender;
        }
      }
      basedOn = { id: worst.audioId, mezonScore: worst.score, mezonName: weakestName };
    }
  }

  const clientName = clientGender === "male" ? randomFromArr(UZ_MALE) : randomFromArr(UZ_FEMALE);

  return {
    scenarioId: scenario.id,
    scenarioCode: scenario.code,
    scenarioName: scenario.name,
    scenarioIcon: scenario.icon,
    scenarioDifficulty: scenario.difficulty,
    clientAge,
    clientGender,
    clientName,
    reason: weakestName
      ? `${mapping.reason} — oxirgi 30 kunda "${weakestName}" o'rtacha bali ${Math.round(weakestAvg)}`
      : mapping.reason + " — yetarli ma'lumot yo'q, default tanlandi",
    basedOnAudio: basedOn,
  };
}
