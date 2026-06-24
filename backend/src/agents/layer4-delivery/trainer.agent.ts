/**
 * Trainer Agent — Layer 4: Delivery
 *
 * Maqsad: Menejer ovoz bilan mashq qilishi. Trainer ssenariy beradi,
 * menejer mikrofonga javob aytadi, STT matnga o'giradi, Flash baholaydi,
 * Pro feedback beradi.
 *
 * Ish tartibi:
 * 1. Trainer scenariy tanlaydi (Strategist rejasiga mos, yoki random)
 * 2. Frontend menejerdan audio oladi → base64 yuboradi
 * 3. Trainer agent audio → transcribeAudio (Yandex STT)
 * 4. Flash baholaydi (tone, speed, technique, content, score)
 * 5. Pro feedback beradi (nimani yaxshilash kerak)
 * 6. PracticeSession'ga saqlaydi
 *
 * Model: Yandex STT + Gemini Flash (scoring) + Gemini Pro (feedback)
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { safeParseJson } from "../../utils/json-repair";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";
import { transcribeAudio } from "../../services/call-transcriber";

/**
 * Retry helper — 429 (quota) va 503 (unavailable) uchun eksponentsial backoff.
 * 3 urinish: 8s → 16s → 32s
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  logger: { warn: (msg: string, meta?: any) => void },
  maxAttempts = 3,
): Promise<T> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const msg = err?.message || String(err);
      const isQuota =
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("Resource exhausted");
      const isUnavailable = msg.includes("503") || msg.includes("UNAVAILABLE");
      if (!isQuota && !isUnavailable) throw err;
      if (attempt === maxAttempts) break;
      const delayMs = Math.pow(2, attempt + 2) * 1000; // 8s, 16s, 32s
      logger.warn(
        `[${label}] ${isQuota ? "429 quota" : "503 unavailable"} — ${delayMs}ms kutib, qayta urinish (${attempt}/${maxAttempts - 1})`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

const FLASH_MODEL = "gemini-2.5-flash";
const PRO_MODEL = "gemini-2.5-pro";

interface TrainerScenario {
  id: string;
  title: string;
  category: "objection-price" | "objection-time" | "objection-trust" | "soprano-need" | "close";
  difficulty: "easy" | "medium" | "hard";
  prompt: string; // mijoz nima degan
  idealResponse?: string; // ustoz javobi (agar bor bo'lsa)
}

interface TrainerInput {
  managerId: string;
  companyId: string;
  scenarioId: string;
  audioBuffer: Buffer;
  fileName: string;
  attemptNumber?: number;
  // ⭐ Agar Strategist tarafidan dinamik ssenariy tanlansa — uni qo'yib yuborish mumkin
  customScenario?: {
    title: string;
    prompt: string;
    idealResponse?: string;
    category?: string;
    difficulty?: "easy" | "medium" | "hard";
  };
}

interface Evaluation {
  tone: number; // 0-100
  speed: number;
  technique: number;
  content: number;
  score: number;
  notes: string;
}

interface TrainerOutput {
  sessionId: string;
  scenario: TrainerScenario;
  userTranscript: string;
  evaluation: Evaluation;
  feedback: string;
}

// Default scenario library — keyinchalik DB'ga ko'chirilishi mumkin
const DEFAULT_SCENARIOS: TrainerScenario[] = [
  {
    id: "obj-price-01",
    title: "Qimmat e'tirozi — Looping bilan",
    category: "objection-price",
    difficulty: "medium",
    prompt:
      "Mijoz: 'Sizning kursingiz juda qimmat ekan. Boshqa joyda arzonroq bor. Buni ko'tara olmayman hozir.'",
    idealResponse:
      "Tushunaman, narx muhim. Lekin menga bir narsa ayting: aniq qaysi qism qimmat tuyulyapti — to'lov shakli, narx o'zimi, yoki qaytish muddatimi?",
  },
  {
    id: "obj-time-01",
    title: "Vaqt yo'q e'tirozi — Callback kelishuvi",
    category: "objection-time",
    difficulty: "easy",
    prompt: "Mijoz: 'Hozir vaqtim yo'q, boshqa paytda gaplashamiz.'",
    idealResponse:
      "Tushunaman. Sizga qulay bo'lgan soatni aytib bering — ertaga 10:00 da yoki 14:00 da telefon qilay?",
  },
  {
    id: "obj-trust-01",
    title: "Natijaga ishonmaslik — Social proof bilan",
    category: "objection-trust",
    difficulty: "hard",
    prompt:
      "Mijoz: 'Siz aytgan natijalarga ishonmayman. Boshqalar ham shunday va'da berishadi-yu, natija yo'q.'",
    idealResponse:
      "Siz haqsiz, ko'p joyda quruq va'dalar bor. Shuning uchun biz sizga bir nechta muvaffaqiyatli o'quvchimizning videosini yuborishimiz mumkin — real natijalar, real gaplar. Ertaga messenger'ga tashlab qo'ysam bo'ladimi?",
  },
  {
    id: "soprano-need-01",
    title: "Ehtiyoj aniqlash — SOPRANO savollari",
    category: "soprano-need",
    difficulty: "medium",
    prompt: "Mijoz: 'Ingliz tilini o'rganmoqchiman, shunga qarab turibman.'",
    idealResponse:
      "Yaxshi niyat. Bir savol: ingliz tilini qaysi maqsadda o'rganmoqchisiz — ish uchun, o'qish uchun, yoki chet elga chiqish uchun? Bu bilsak men sizga aniq qaysi kursimiz mos kelishini ayta olaman.",
  },
  {
    id: "close-01",
    title: "Yopish — Muqobilsiz close",
    category: "close",
    difficulty: "medium",
    prompt: "Mijoz: 'Ha, kursingiz qiziq ekan, o'ylab ko'raman.'",
    idealResponse:
      "Yaxshi. O'ylab ko'ring. Men sizga ikki variant taklif qilaman: ertaga 10:00 da to'lovni qilasiz va dushanbadan boshlaysiz, yoki juma kuni boshlanadigan yangi guruhga yoziladigan siz oxirgi odam bo'lasiz. Qaysi biri ko'proq mos keladi?",
  },
];

export class TrainerAgent extends BaseAgent<TrainerInput, TrainerOutput> {
  readonly metadata: AgentMetadata = {
    id: "trainer",
    name: "Trainer Agent",
    layer: "layer4-delivery",
    version: "1.0.0",
    description:
      "Menejer ovoz bilan mashq qiladi — Yandex STT + Gemini Flash baholash + Gemini Pro feedback",
    model: `${FLASH_MODEL} + ${PRO_MODEL}`,
    dependencies: ["transcriber", "strategist"],
  };

  private client: GoogleGenAI;

  constructor() {
    super();
    this.client = new GoogleGenAI({
      vertexai: true,
      project: process.env.VERTEX_PROJECT || "",
      location: process.env.VERTEX_LOCATION || "us-central1",
    });
  }

  /**
   * Public API: default ssenariylar ro'yxatini qaytaradi.
   */
  static getScenarios(): TrainerScenario[] {
    return DEFAULT_SCENARIOS;
  }

  /**
   * Har kategoriya uchun prompt variantlari — turli exercise uchun turli matn.
   * Index bo'yicha rotatsiya qilinadi, shunda har senariy unikal bo'ladi.
   */
  private static readonly CATEGORY_PROMPTS: Record<
    TrainerScenario["category"],
    Array<{ prompt: string; idealResponse: string }>
  > = {
    "objection-price": [
      {
        prompt:
          "Mijoz: 'Sizning kursingiz juda qimmat ekan. Boshqa joyda arzonroq bor. Buni ko'tara olmayman hozir.'",
        idealResponse:
          "Tushunaman, narx muhim. Aniq aytib bering: to'lov shakli o'zimi, yoki oylik mablag'mi qiyin? Biz sizga bo'lib to'lash yoki boshqa rejaga o'tish taklif qila olamiz.",
      },
      {
        prompt:
          "Mijoz: 'Oldin boshqa joyda o'qiganman, o'shalar 1 million arzonroq edi. Sizlar nega qimmat?'",
        idealResponse:
          "To'g'ri savolga rahmat. Narxdagi farq sababi — bizda 1-to-1 feedback, natija kafolati va IELTS speaking yordami bor. Taqqoslayotgan kursda bu 3 narsa qaysilari bor edi?",
      },
      {
        prompt:
          "Mijoz: 'Chegirma bersangiz shu bugun to'layman, aks holda boshqa joy qidiraman.'",
        idealResponse:
          "Shoshiluvchanligingizni tushunaman, ammo chegirma siyosatimiz yo'q — sababi, narx qiymatga mos. Buning o'rniga birinchi hafta bepul sinov kunini beraman, siz qiymatni ko'rib qaror qilasiz. Kelishilganmi?",
      },
      {
        prompt:
          "Mijoz: 'Budjetim yo'q, keyingi oyga qoldirsak bo'ladimi?'",
        idealResponse:
          "Albatta. Lekin bir savol: sizning maqsadingiz qachonga belgilangan? Agar IELTS sentabrda bo'lsa — keyingi oy kutish 1 oy yo'qotish demak. Bo'lib to'lash imkoniyati bizda bor, shuni ko'rib chiqamizmi?",
      },
    ],
    "objection-time": [
      {
        prompt: "Mijoz: 'Hozir vaqtim yo'q, boshqa paytda gaplashamiz.'",
        idealResponse:
          "Tushunaman. 2 daqiqa ham bo'ladi — sizga qulay bo'lgan soatni aytib bering. Ertaga 10:00 da yoki 14:00 da telefon qilsam bo'ladimi?",
      },
      {
        prompt: "Mijoz: 'Ishim ko'p, kurs uchun vaqtim yetmaydi.'",
        idealResponse:
          "Ishxonangiz juda band ko'rinadi. Aynan shu sababdan bizda 30-40 min'lik intensiv modul bor — tushlik paytida yoki kechki soat 20:00 dan keyin. Kuniga qaysi vaqt sizga qulayroq?",
      },
      {
        prompt:
          "Mijoz: 'Imtihonlarim yaqin, kursga boshlashim uchun erta.'",
        idealResponse:
          "Aynan imtihonlar yaqin bo'lgani uchun intensiv rejim kerak. 2 oyda IELTS 7+ olgan 50 dan ortiq o'quvchimiz bor. Sizning imtihon sanasi qachon? Unga mos reja tuzib bermoqchiman.",
      },
      {
        prompt:
          "Mijoz: 'Hozir safardaman, keyinroq qo'ng'iroq qilasizmi?'",
        idealResponse:
          "Albatta, xalaqit bermay. Bir narsa aniqlashtirib olay: qaytishingizda qaysi kun qulay — dushanba 10:00 yoki chorshanba 14:00? Kalendarga qo'yib qo'yaman.",
      },
    ],
    "objection-trust": [
      {
        prompt:
          "Mijoz: 'Siz aytgan natijalarga ishonmayman. Boshqalar ham shunday va'da berishadi-yu, natija yo'q.'",
        idealResponse:
          "Haqsiz, quruq va'dalar ko'p. Biz sizga real o'quvchilarning video guvohliklarini yuboramiz, shartnomada kafolat yozilgan. Telegram orqali yuborsam, bugunoq ko'ra olasizmi?",
      },
      {
        prompt:
          "Mijoz: 'Avval shunday kurslarga borganman, foyda bo'lmagan. Qanday kafolat berasizlar?'",
        idealResponse:
          "Shunday tajribadan keyin ikkilanish tabiiy. Bizning kafolat: 2 oy ichida IELTS 0.5-1 ball o'smasa, keyingi oyni bepul beramiz — shartnomada yozilgan. Yozma ko'chirma yuborsam bo'ladimi?",
      },
      {
        prompt:
          "Mijoz: 'O'qituvchilaringiz kim? Sertifikat ko'rsatib bera olasizlarmi?'",
        idealResponse:
          "To'liq ro'yxatni yuboraman — har bir o'qituvchining CELTA, IELTS balli va real keyslari bor. Bugun WhatsApp'ga yuborib qo'ysam — ko'rib chiqasizmi?",
      },
      {
        prompt:
          "Mijoz: 'Instagram'da juda yaxshi ko'rinasiz, lekin u yerda real odamlar emasmi?'",
        idealResponse:
          "Yaxshi savol. Har post ostida odam va natija bor — sizga video guvohliklar yuboraman. Ma'lum qilingan o'quvchilar bilan to'g'ridan-to'g'ri bog'lashish ham mumkin — xohlaysizmi?",
      },
    ],
    "soprano-need": [
      {
        prompt: "Mijoz: 'Ingliz tilini o'rganmoqchiman, shunga qarab turibman.'",
        idealResponse:
          "Ajoyib niyat. Aniq ma'lumot olishim uchun bir savol: ingliz tilini qaysi maqsadda — ish uchun, o'qish uchun, yoki chet elga ketish uchun? Bu bilinsa men aniq kursni tavsiya qilaman.",
      },
      {
        prompt:
          "Mijoz: 'O'zim o'rganib boraman, shartmi sizlarga qo'shilish?'",
        idealResponse:
          "O'z-o'zidan o'rganish yaxshi, lekin bir savol: IELTS speaking qismini qanday mashq qilmoqdasiz? Agar imtihon kerak bo'lsa, bu qismsiz 6.0 dan yuqoriga chiqish qiyin — shunga yordam kerakmi?",
      },
      {
        prompt:
          "Mijoz: 'Hali aniq fikrim yo'q, ko'rib turibman.'",
        idealResponse:
          "Tushunaman. Sizga kichik bir savol: ingliz tilida hozir qaysi muammo ko'proq — gaplashishmi, yozishmi yoki tushunishmi? Aniq nuqtani topish uchun so'rayapman.",
      },
      {
        prompt:
          "Mijoz: 'Shunchaki narxini bilmoqchi edim, boshqa ma'lumot kerak emas.'",
        idealResponse:
          "Narx haqida albatta aytaman. Faqat sizga to'g'ri kursni tavsiya qilishim uchun: darajangiz taxminan qanday — A1 boshlang'ich, A2, B1 yoki B2? Shunga qarab aniq variantni yuboraman.",
      },
    ],
    close: [
      {
        prompt: "Mijoz: 'Ha, kursingiz qiziq ekan, o'ylab ko'raman.'",
        idealResponse:
          "Yaxshi. Aniq aytib bering: nimani o'ylab ko'rish kerak — narxmi, vaqtmi, yoki natija haqidami? Shunga qarata yechim taklif qila olaman.",
      },
      {
        prompt:
          "Mijoz: 'Oilamga aytib, ertaga qayta aloqaga chiqaman.'",
        idealResponse:
          "Tushunaman, oila bilan maslahatlashmoqchisiz. Ertaga qaysi vaqt qulay — 11:00 yoki 16:00? Men uni kalendarga kiritib, eslatma qo'yaman.",
      },
      {
        prompt:
          "Mijoz: 'Yaxshi, menga linkini yuboring, keyin o'zim bog'lanaman.'",
        idealResponse:
          "Link yuboraman, lekin tajribadan bilishim bo'yicha — 80% hollatda link yuborganda mijoz unutib qo'yadi. Buning o'rniga ertaga 10 daqiqalik bepul konsultatsiyaga yozib qo'yaman — bepul, majburiyatsiz. Kelasizmi?",
      },
    ],
  };

  /**
   * Matn ichidan eng mos kategoriyani topish.
   * AVVAL exerciseTitle ichini qidiradi — u aniqroq (masalan: "E'tiroz: 'O'ylab ko'raman'").
   * Keyin focusArea ichiga qaraydi.
   * Topilmasa — null.
   */
  private static detectCategory(text: string): TrainerScenario["category"] | null {
    const t = text.toLowerCase();
    // Close signals (eng xos iboralar)
    if (
      t.includes("o'ylab ko'raman") ||
      t.includes("oylab koraman") ||
      t.includes("yopish") ||
      t.includes("close") ||
      t.includes("yakun") ||
      t.includes("qaror") ||
      t.includes("link yuboring") ||
      t.includes("oilam")
    ) {
      return "close";
    }
    // Trust
    if (
      t.includes("ishonm") ||
      t.includes("trust") ||
      t.includes("kafolat") ||
      t.includes("haqiqiy") ||
      t.includes("shubha") ||
      t.includes("sertifikat")
    ) {
      return "objection-trust";
    }
    // Time
    if (
      t.includes("vaqt") ||
      t.includes("time") ||
      t.includes("shosha") ||
      t.includes("band") ||
      t.includes("imtihon")
    ) {
      return "objection-time";
    }
    // Price
    if (
      t.includes("narx") ||
      t.includes("qimmat") ||
      t.includes("arzon") ||
      t.includes("price") ||
      t.includes("chegirma") ||
      t.includes("budjet") ||
      t.includes("to'lov")
    ) {
      return "objection-price";
    }
    // SOPRANO / need
    if (
      t.includes("ehtiyoj") ||
      t.includes("soprano") ||
      t.includes("aniqlash") ||
      t.includes("savol") ||
      t.includes("qaytarish") ||
      t.includes("need") ||
      t.includes("reality") ||
      t.includes("opinion")
    ) {
      return "soprano-need";
    }
    return null;
  }

  /**
   * Strategist practice exercise asosida dinamik ssenariy yaratadi.
   *
   * Category aniqlanadi AVVAL exerciseTitle dan (aniqroq), keyin focusArea dan.
   * Prompt kategoriya variantlaridan title hash bo'yicha tanlanadi.
   *
   * `uniqueSuffix` — dublikat ID oldini olish uchun (focusArea + exercise index)
   */
  static buildScenarioFromStrategy(
    focusAreaName: string,
    exerciseTitle: string,
    difficulty: "easy" | "medium" | "hard" = "medium",
    uniqueSuffix: string | number = "0",
  ): TrainerScenario {
    // Avval exerciseTitle dan aniqlash (u aniqroq)
    const titleCategory = TrainerAgent.detectCategory(exerciseTitle);
    const areaCategory = TrainerAgent.detectCategory(focusAreaName);
    const category: TrainerScenario["category"] =
      titleCategory || areaCategory || "objection-price";

    // Prompt variantlarini olish va title'ga mos rotatsiya qilish
    const variants = TrainerAgent.CATEGORY_PROMPTS[category] || [];
    // Title'dan stable hash — bir xil title doim bir xil variant beradi
    let hash = 0;
    for (let i = 0; i < exerciseTitle.length; i++) {
      hash = (hash * 31 + exerciseTitle.charCodeAt(i)) | 0;
    }
    const pick = variants[Math.abs(hash) % Math.max(variants.length, 1)] || variants[0];

    // Unique ID — timestamp + suffix + random
    const rand = Math.random().toString(36).slice(2, 8);
    const id = `dynamic-${Date.now()}-${uniqueSuffix}-${rand}`;

    return {
      id,
      title: exerciseTitle || category,
      category,
      difficulty,
      prompt: pick?.prompt || "Mijoz: 'Sotuv suhbati boshlandi.'",
      idealResponse: pick?.idealResponse,
    };
  }

  protected async run(input: TrainerInput, _ctx: AgentContext): Promise<TrainerOutput> {
    // 1. Scenario manbai:
    //    a) Custom scenario (Strategist yoki Coach bergan) — birinchi ustuvor
    //    b) DEFAULT_SCENARIOS dan ID bo'yicha qidirish
    let scenario: TrainerScenario;
    if (input.customScenario) {
      scenario = {
        id: input.scenarioId || `custom-${Date.now()}`,
        title: input.customScenario.title,
        category: (input.customScenario.category as TrainerScenario["category"]) || "objection-price",
        difficulty: input.customScenario.difficulty || "medium",
        prompt: input.customScenario.prompt,
        idealResponse: input.customScenario.idealResponse,
      };
    } else {
      const found = DEFAULT_SCENARIOS.find((s) => s.id === input.scenarioId);
      if (!found) {
        throw new Error(`Scenario not found: ${input.scenarioId}`);
      }
      scenario = found;
    }

    // 1. Yandex STT — audio → matn
    const userTranscript = await transcribeAudio(
      input.audioBuffer,
      input.fileName,
      "Menejer",
      0,
    );

    if (!userTranscript || userTranscript.includes("SUHBAT YO'Q")) {
      throw new Error("Audio yozuvdan matn chiqmadi — qayta urinib ko'ring");
    }

    // 2. Flash baholash — tone/speed/technique/content
    const evaluation = await this.evaluateWithFlash(userTranscript, scenario);

    // 3. Pro feedback — menejerga tavsiyalar
    const feedback = await this.buildFeedbackWithPro(userTranscript, scenario, evaluation);

    // 4. DB ga saqlash
    const saved = await prisma.practiceSession.create({
      data: {
        managerId: input.managerId,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        scenarioPrompt: scenario.prompt,
        userTranscript,
        evaluation: evaluation as unknown as object,
        feedback,
        attemptNumber: input.attemptNumber ?? 1,
      },
    });

    this.logger.info(
      `[trainer] ${input.managerId} scenario=${scenario.id} score=${evaluation.score}`,
    );

    return {
      sessionId: saved.id,
      scenario,
      userTranscript,
      evaluation,
      feedback,
    };
  }

  private async evaluateWithFlash(
    userTranscript: string,
    scenario: TrainerScenario,
  ): Promise<Evaluation> {
    const prompt = `Sen sotuvchi ovozi va texnikasi bo'yicha baholovchi ekspert.

Menejer shu ssenariyga javob berdi:

SSENARIY: ${scenario.title}
Mijoz: ${scenario.prompt}
${scenario.idealResponse ? `Ideal javob (ustoz): "${scenario.idealResponse}"` : ""}

MENEJER JAVOBI (transkriptsiya):
"${userTranscript}"

Quyidagi 4 ta o'lchov bo'yicha 0-100 oralig'ida baholang:
1. TONE — ishonchli, tinch, samimiymi?
2. SPEED — tezligi normalmi (shoshilmadi yoki cho'zmadi)?
3. TECHNIQUE — mos sotuv texnikasi qo'llandimi (Looping, SOPRANO, close)?
4. CONTENT — kontent mazmunli va aniqmi?

Va umumiy SCORE (bu 4 ning o'rtachasi).

JAVOB FAQAT JSON:
{
  "tone": 85,
  "speed": 75,
  "technique": 70,
  "content": 80,
  "score": 78,
  "notes": "Ton ishonchli edi, lekin texnika qo'llanmadi — Looping o'rniga to'g'ridan-to'g'ri chegirma taklif qildingiz"
}`;

    const response = await withRetry(
      "trainer:flash",
      () =>
        this.client.models.generateContent({
          model: FLASH_MODEL,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            temperature: 0,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      this.logger,
    );

    const raw = response.text || "";
    const parsed: any = safeParseJson(raw);
    if (!parsed || typeof parsed.score !== "number") {
      this.logger.warn(`[trainer] failed to parse Flash eval: ${raw.slice(0, 200)}`);
      return { tone: 50, speed: 50, technique: 50, content: 50, score: 50, notes: "Auto eval" };
    }
    return {
      tone: this.clampScore(parsed.tone),
      speed: this.clampScore(parsed.speed),
      technique: this.clampScore(parsed.technique),
      content: this.clampScore(parsed.content),
      score: this.clampScore(parsed.score),
      notes: String(parsed.notes || ""),
    };
  }

  private async buildFeedbackWithPro(
    userTranscript: string,
    scenario: TrainerScenario,
    evaluation: Evaluation,
  ): Promise<string> {
    const prompt = `Sen sotuv ustozi — menejer amaliyot javobiga qisqa, aniq va foydali feedback berasan.

SSENARIY: ${scenario.title}
Mijoz: ${scenario.prompt}
${scenario.idealResponse ? `Ustoz javobi: "${scenario.idealResponse}"` : ""}

MENEJER AYTDI: "${userTranscript}"

AVTO-BAHOLASH:
- Ton: ${evaluation.tone}/100
- Tezlik: ${evaluation.speed}/100
- Texnika: ${evaluation.technique}/100
- Kontent: ${evaluation.content}/100
- Umumiy: ${evaluation.score}/100

Vazifang:
1. 2-3 jumla yordamida nima YAXSHI bo'lganini ayt
2. 2-3 jumla yordamida nima YAXSHILANISHI kerak ekanligini ayt
3. 1 ta ANIQ script ber — menejer keyingi urinishda shu jumlani aytishi kerak
4. O'zbek tilida, samimiy ustoz tilida

Markdown format, hech qanday JSON emas.`;

    try {
      const response = await withRetry(
        "trainer:pro",
        () =>
          this.client.models.generateContent({
            model: PRO_MODEL,
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
              temperature: 0.4,
              maxOutputTokens: 2048,
            },
          }),
        this.logger,
      );
      return response.text || this.buildFallbackFeedback(evaluation);
    } catch (err: any) {
      // Pro quota tugasa ham baholash saqlanadi — oddiy fallback feedback
      this.logger.warn(
        `[trainer] Pro feedback failed (${err?.message?.slice(0, 100)}) — fallback`,
      );
      return this.buildFallbackFeedback(evaluation);
    }
  }

  /** Pro quota tugasa — oddiy template feedback (ball asosida) */
  private buildFallbackFeedback(ev: Evaluation): string {
    type MetricKey = "tone" | "speed" | "technique" | "content";
    const keys: MetricKey[] = ["tone", "speed", "technique", "content"];
    let topArea: MetricKey = "tone";
    for (const k of keys) {
      if (ev[k] < ev[topArea]) topArea = k;
    }
    const labels: Record<MetricKey, string> = {
      tone: "ton (ishonchlilik)",
      speed: "tezlik",
      technique: "texnika (Looping / SOPRANO)",
      content: "kontent mazmunliligi",
    };
    return `**Umumiy ball: ${ev.score}/100**

${ev.notes || "Javobingiz yozib olindi va baholandi."}

**Yaxshilash kerak:** eng zaif joy — **${labels[topArea]}** (${ev[topArea]}/100). Keyingi urinishda shu tomonga e'tibor bering.

_Batafsil feedback hozir mavjud emas (Pro model band). 1-2 daqiqadan keyin qayta urinib ko'ring._`;
  }

  private clampScore(v: unknown): number {
    const n = typeof v === "number" ? v : 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}

export const trainerAgent = new TrainerAgent();
