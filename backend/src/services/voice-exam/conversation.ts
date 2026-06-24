/**
 * Exam conversation manager — OpenAI GPT-4o-mini.
 *
 * AI mijoz rolida sotuvchi bilan suhbatlashadi. System prompt stsenariydan olinadi
 * va kompaniyaning REAL oldingi suhbat tahlillaridan olingan mijoz naqshlari
 * bilan boyitiladi — shu sababli imtihon real kompaniya mijoziga o'xshaydi.
 */
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import { buildClientBehaviorBlock } from "./client-history";

const MODEL = "gpt-4o-mini";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let knowledgeBase = "";
try {
  knowledgeBase = readFileSync(
    join(__dirname, "../../../knowledge_base/way_of_the_wolf_uz.md"),
    "utf-8"
  );
} catch {
  console.error("[voice-exam] knowledge_base topilmadi");
}

export interface ExamMessage {
  role: "salesperson" | "client"; // "salesperson" = user, "client" = AI (mijoz rolida)
  text: string;
  ts: number;
}

export interface ClientPersona {
  age?: number | null;
  gender?: "male" | "female" | null;
  name?: string | null;
}

export interface ConversationTurnInput {
  scenarioSystemPrompt: string;
  scenarioName: string;
  scenarioCode?: string;
  history: ExamMessage[];
  salespersonText: string;
  persona?: ClientPersona;
  elapsedSec?: number;
  companyId?: string; // kompaniyaning o'tgan suhbatlaridan naqshlarni olish uchun
}

function personaBlock(persona?: ClientPersona): string {
  if (!persona || (!persona.age && !persona.gender && !persona.name)) return "";
  const gender = persona.gender === "female" ? "AYOL" : persona.gender === "male" ? "ERKAK" : "";
  const age = persona.age ? `${persona.age} yoshda` : "";
  const isChild = typeof persona.age === "number" && persona.age <= 16;

  let toneHint = "";
  let addr = "";
  if (isChild) {
    toneHint = "yosh bola — oddiy, samimiy gaplash, sodda so'zlar ishlat, ba'zan uyalibroq javob ber. Ota-onasiz o'zi gaplashishga harakat qilayotgan bola kabi.";
    addr = '"aka" / "opa" deb murojaat qilinishiga odatlangan (kattalarga hurmat)';
  } else if (persona.age && persona.age < 25) {
    toneHint = "yoshroq, jo'shqin, zamonaviy uslub, ba'zan so'zlashuv tilida";
    addr = persona.gender === "female" ? '"opa" / "singlim" deb murojaat qilinishiga odatlangan' : '"aka" / "uka" deb murojaat qilinishiga odatlangan';
  } else if (persona.age && persona.age < 40) {
    toneHint = "ishchan, vaqtini qadrlaydigan, aniqlik kutadigan";
    addr = persona.gender === "female" ? '"opa" deb murojaat qilinishiga odatlangan' : '"aka" deb murojaat qilinishiga odatlangan';
  } else if (persona.age && persona.age < 55) {
    toneHint = "tajribali, tinch, asoslangan savol beradigan";
    addr = persona.gender === "female" ? '"opa" deb murojaat qilinishiga odatlangan' : '"aka" deb murojaat qilinishiga odatlangan';
  } else {
    toneHint = "hurmatli, sekinroq gapiradigan, tushuntirish kutadigan";
    addr = persona.gender === "female" ? '"onaxon" / "opa" deb murojaat qilinishiga odatlangan' : '"ota" / "amaki" / "aka" deb murojaat qilinishiga odatlangan';
  }

  const nameLine = persona.name
    ? `- Isming: ${persona.name}. Sotuvchi ismingni so'rasa shu ismni ayt. Sotuvchi ism bilan murojaat qilsa ("${persona.name} aka/opa/jon") tabiiy qabul qil.`
    : "";

  return `
SENING MIJOZ PERSONANG:
${nameLine}
- Jinsi: ${gender || "belgilanmagan"}
- Yoshi: ${age || "belgilanmagan"}
- Tovush va ohang: ${toneHint}
- ${addr}
- Javoblaringda shu yosh va jinsga mos ohang va so'zlar ishlat. Yosh bola boshqacha, yosh bola boshqacha, katta yoshdagi mijoz boshqacha gapiradi.
`;
}

function callbackContextBlock(scenarioCode?: string): string {
  if (scenarioCode !== "callback_after_test") return "";
  return `
OLDINGI SUHBAT KONTEKSTI (MUHIM — sen buni YODDA tutasan):
Bu sening bu kompaniya sotuvchisi bilan IKKINCHI suhbating. Oldingi birinchi suhbat quyidagicha bo'lgan edi:
- Sotuvchi senga bir necha kun oldin qo'ng'iroq qilgan va ingliz tili kurslariga qiziqishing borligini bilgan
- Sen ingliz tilini ish va sayohat uchun o'rganmoqchi ekanligingni aytgansan
- Oldin ozroq ingliz tilida o'qigansan, lekin ancha bo'lgan, hozirgi darajangni bilmagansan
- Sotuvchi senga daraja aniqlash testini (level test) Telegramdan yuborgan
- Sen testni ishlading va natija: Pre-Intermediate (A2-B1 oraligida)
- Sotuvchi bugun qayta aloqaga chiqishga va'da qilgan edi — mana hozir qo'ng'iroq qilyapti

Sen bu narsalarni YODDA tutasan va suhbatni shu nuqtadan davom ettirasan. Birinchi jumlangda "ha, men testni ishladim, kutayotgan edim" yoki shunga o'xshash gap bilan oldingi suhbatga bog'lanishni ko'rsat.

AGAR sotuvchi o'zini tanitmasa yoki oldingi suhbatni esga olmasa — "kim bilan gaplashyapman?" yoki "qaysi kompaniya edi?" deb tekshir. Sotuvchi darajangni so'ramasdan to'g'ridan-to'g'ri kursni sota boshlasa — "avval mening natijamni so'rang-chi" deb to'xtat.
`;
}

function timePhaseBlock(elapsedSec?: number): string {
  const sec = typeof elapsedSec === "number" && elapsedSec > 0 ? elapsedSec : 0;
  const min = Math.floor(sec / 60);

  if (min < 8) {
    return `
VAQT HOLATI: ~${min} daqiqa o'tdi (0-8 daqiqa bosqichi — TABIIY SUHBAT).
- Hali suhbat davom etadi. Sotuvchi savollariga qisqa, tabiiy javob ber.
- SEN MIJOZSAN, SAVOLCHI EMASSAN. Sotuvchiga ketma-ket savol berma — u senga taklif qilishi kerak. Mayli, bitta-ikkita savol tug'ilsa berish mumkin, lekin asosiy holatda sotuvchini gapirtir.
- Javoblaring 1-2 jumladan oshmasin.`;
  }
  if (min < 10) {
    return `
VAQT HOLATI: ~${min} daqiqa o'tdi (8-10 daqiqa bosqichi — YAKUNGA TAYYORGARLIK).
- Suhbat ancha cho'zildi. Endi TABIIY ravishda yakunlash tomon siljit.
- "Yaxshi, tushunarli", "o'ylab ko'raman", "xo'p, keyin aytaman" kabi YAKUN SIGNALLARINI ber.
- Yangi savol OCHMA. Sotuvchining gaplariga qisqa rozi-norozi javob ber.
- Agar sotuvchi hali taklif qilmagan bo'lsa — "qisqaroq ayting, vaqtim cheklangan" deb asosiy taklifini so'ra.`;
  }
  return `
VAQT HOLATI: ~${min} daqiqa o'tdi (10+ daqiqa — QAT'IY YAKUNLASH).
- Suhbat juda uzoq cho'zildi. ENDI SUHBATNI YAKUNLA.
- Har bir javobingda "xo'p, rahmat", "o'ylab ko'raman", "keyin o'zim bog'lanaman", "vaqt yo'q, boraman" kabi yakunlovchi gaplar ishlat.
- Yangi savol BERMA. Yangi e'tiroz chiqarMa. Sotuvchini gapirtirMa.
- Agar sotuvchi hali ham tortadigan bo'lsa — "rahmat, men o'ylab ko'raman, xayr" deb xayrlash.`;
}

async function buildSystemPrompt(
  scenarioSystemPrompt: string,
  scenarioName: string,
  scenarioCode?: string,
  persona?: ClientPersona,
  elapsedSec?: number,
  companyId?: string,
): Promise<string> {
  const clientBehavior = companyId ? await buildClientBehaviorBlock(companyId) : "";

  return `Sen telefonda gaplashayotgan REAL MIJOZSAN. O'zbek tilida qisqa javob ber.

STSENARIY: ${scenarioName}
${scenarioSystemPrompt}
${personaBlock(persona)}${callbackContextBlock(scenarioCode)}${clientBehavior}
XULQ-ATVOR:
- SEN MIJOZSAN, INTERVYU OLUVCHI EMASSAN. Sotuvchiga ketma-ket savol berma — real mijoz 5-6 ta savolni birvarakay bermaydi.
- Real mijoz kabi gaplash — ba'zan javob ber, ba'zan qisqa savol ber, ba'zan shunchaki "ha", "hmm", "tushundim" de.
- Sotuvchi yaxshi tushuntirsa — qiziqish ko'rsat, "qiziq ekan", "davom eting" de.
- Sotuvchi narx aytsa — o'ylab ko'rish yoki rozi bo'lish mumkin.
- Sotuvchi yomon ishlasa — shubha bildir, qarshilik ko'rsat, lekin birdaniga suhbatni uzma.
- E'tiroz bildirsang — KO'PI BILAN 2-3 marta takrorla. 4-marta yana takrorlama, chunki real mijoz shunchalik sabrli bo'lmaydi.
${timePhaseBlock(elapsedSec)}

QOIDALAR:
- FAQAT 1-2 jumla, o'zbek tilida (IELTS, General kabi atamalar OK)
- THINK, izoh, tushuntirish YOZMA — faqat mijoz gapiradigan gapni yoz
- Tabiiy murojaatlar ishlat (persona jinsiga mos)`;
}

export async function nextTurn(input: ConversationTurnInput): Promise<string> {
  return withRetry(async () => {
    const systemPrompt = await buildSystemPrompt(
      input.scenarioSystemPrompt,
      input.scenarioName,
      input.scenarioCode,
      input.persona,
      input.elapsedSec,
      input.companyId,
    );

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const m of input.history) {
      messages.push({
        role: m.role === "salesperson" ? "user" : "assistant",
        content: m.text,
      });
    }
    messages.push({ role: "user", content: input.salespersonText });

    const result = await openai.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 256,
    });

    let text = (result.choices[0]?.message?.content || "").trim();
    text = text
      .replace(/\*\*[\s\S]*?\*\*/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\n{3,}/g, "\n")
      .trim();
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    text = sentences.slice(0, 2).join(" ").trim();
    if (!text) throw new Error("AI javob bermadi");
    return text;
  });
}

/**
 * Mijozning birinchi salomlashuvini generatsiya qilish (suhbat boshida).
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const is429 = e?.status === 429 || e?.code === 429 || String(e?.message).includes("RESOURCE_EXHAUSTED");
      if (is429 && i < maxRetries - 1) {
        const wait = (i + 1) * 5000;
        console.log(`[voice-exam] Rate limited, retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries reached");
}

export async function openingLine(
  scenarioSystemPrompt: string,
  scenarioName: string,
  scenarioCode?: string,
  persona?: ClientPersona,
  companyId?: string,
): Promise<string> {
  return withRetry(async () => {
    const openingInstruction = scenarioCode === "callback_after_test"
      ? "Sen hozirgina telefoningni ko'tarding va sotuvchi qo'ng'irog'ini qabul qilding. Bu IKKINCHI suhbat — oldin sotuvchi senga test yuborgan va sen uni ishlab bo'lgansan. Birinchi jumlangni ayt — salomlashish + testni ishlaganingni yoki qo'ng'iroqni kutayotganingni eslatib o'ting (1-2 jumla)."
      : "Sotuvchi telefonni yangi ko'tardi. Birinchi jumlangni ayt (1 jumla, 5-10 so'z).";

    const systemPrompt = await buildSystemPrompt(
      scenarioSystemPrompt,
      scenarioName,
      scenarioCode,
      persona,
      undefined,
      companyId,
    );

    const result = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: openingInstruction },
      ],
      temperature: 0.9,
      max_tokens: 160,
    });
    let text = (result.choices[0]?.message?.content || "Salom.").trim();
    text = text
      .replace(/\*\*[\s\S]*?\*\*/g, "")
      .replace(/```[\s\S]*?```/g, "")
      .trim();
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const maxSentences = scenarioCode === "callback_after_test" ? 2 : 1;
    const picked = sentences.slice(0, maxSentences).join(" ").trim();
    return picked || "Salom.";
  });
}

export { knowledgeBase };
