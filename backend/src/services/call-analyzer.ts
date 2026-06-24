import { GoogleGenAI } from "@google/genai";
import { prisma } from "../utils/prisma";

// Flash 3 migration toggle (ENV: USE_FLASH_3=1 → gemini-3-flash-preview, global region)
const USE_FLASH_3 = process.env.USE_FLASH_3 === "1";
const MODEL = USE_FLASH_3
  ? "gemini-3-flash-preview"
  : "gemini-2.5-flash";
const ANALYZER_LOCATION = USE_FLASH_3
  ? "global"
  : (process.env.VERTEX_LOCATION || "us-central1");

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: ANALYZER_LOCATION,
  });
}

interface CriteriaResult {
  score: number;
  comment: string;
}

interface CriticalMoment {
  timestamp: string;
  whatHappened: string;
  whatManagerDid: string;
  whatToDoInstead: string;
  technique: string;
  evidenceQuote?: string; // Analyzer majburiy chiqaradi — Validator tekshiradi
}

interface CoachingInsights {
  speechRatioAlert: boolean;       // manager 70%+ gapirsa
  surrenderedObjections: number;    // e'tirozda nechtasida taslim bo'ldi
  openEnding: boolean;              // keyingi qadam belgilanmadimi
  criticalMoments: CriticalMoment[]; // eng muhim 2-3 moment
  topWin: string;                   // eng yaxshi narsa qildi
  quickFix: string;                 // keyingi qo'ng'iroq uchun bitta o'zgarish
  dealRiskScore: number;            // 0-100: bu lead qaytib kelish ehtimoli
}

// ─── Follow-up signal (B2-2) ──────────────────────────────────────────────
interface FollowupSignal {
  requiresFollowup: boolean;         // "o'ylayman" / kerakmi qayta qo'ng'iroq
  followupReason: string | null;     // thinking | family_consultation | price | timing | other
  followupPhrase: string | null;     // transkripsiyadan aniq ibora
  suggestedDeadlineDays: number;     // kuniga — odatda 2-3
}

// ─── Promise tracking (B2-9) ──────────────────────────────────────────────
interface ManagerPromise {
  what: string;                      // "shartnoma yuboraman", "narx yuboraman"
  deadline: string;                  // "ertaga", "dushanba", "bir kundan keyin"
  deadlineDays: number;              // 1, 2, 3 ...
  timestamp: string;                 // qachon aytildi (MM:SS)
}

// ─── MEDDIC/BANT scoring (B3-4) ───────────────────────────────────────────
// SOPRANO — 7 bosqichli kashfiyot texnikasi (Situation, Experience, Problem,
// Decision-maker, Alternatives, Nuances, Limits)
interface SopranoStage {
  asked: boolean;
  value: string | null;
  evidence: string | null;
}
interface DealQualification {
  situation: SopranoStage;      // С — Vaziyat (Sizga nima kerak, qachon, qancha)
  experience: SopranoStage;     // О — Tajriba (boshqa variantlar, shu sohada ish)
  problem: SopranoStage;        // П — Muammolar (qiyinchiliklar, bosh og'riqlar)
  decisionMaker: SopranoStage;  // Р — Qaror qiluvchi (yolg'iz/maslahatchi)
  alternatives: SopranoStage;   // А — Tanlovlar (boshqa hamkorlik)
  nuances: SopranoStage;        // Н — Noyob farqlar (e'tibor, istisno)
  limits: SopranoStage;         // О — Cheklovlar (vaqt, deadline)
  overallQualification: number; // 0-100 (aniqlangan bosqichlar × 14)
}

// ─── Respect indicators (B3-10, mahalliy soft skills) ─────────────────────
interface RespectIndicators {
  ageAppropriateTone: number;        // 0-100 — yoshi kattaga qanday gaplashdi
  noPrematureClosing: number;        // 0-100 — erta yopishga urinmadimi
  activeListening: number;           // 0-100 — mijoz gapini tingladimi
  respectScore: number;              // umumiy 0-100
  notes: string;                     // qisqa tushuntirish
}

// ─── Call Structure (B4-1) — qo'ng'iroq bosqichlari ───────────────────────
interface CallPhase {
  name: string;                      // "Salomlashish" | "Kashfiyot" | "Taqdimot" | "E'tirozlar" | "Yakunlash"
  startTime: string;                 // "MM:SS"
  endTime: string;                   // "MM:SS"
  qualityScore: number;              // 0-100 — bu bosqich qanchalik yaxshi o'tdi
  notes: string;                     // qisqa izoh
}
interface CallStructure {
  phases: CallPhase[];
  totalDurationSec: number;
  structureScore: number;            // 0-100 — jami tuzilma sifati
}

// ─── Questions Breakdown (B4-1) — SOPRANO metodologiyasi ─────────────────
// S: Situation (vaziyat) — mijozning hozirgi holatini aniqlash
// O: Objective (maqsad) — mijoz nimaga erishmoqchi
// P: Problem (muammo) — qanday muammolari bor
// R: Resources (resurs) — qaysi imkoniyat/byudjeti bor
// A: Alternatives (muqobil) — qanday alternativlar ko'rib chiqyapti
// N: Need (ehtiyoj) — haqiqiy ehtiyoji va ustuvorligi
// O: Outcome (natija) — kutgan natija va yakuniy qadam
interface QuestionItem {
  text: string;
  timestamp: string;                 // "MM:SS"
  type: "open" | "closed";
  sopranoCategory?:
    | "situation"
    | "objective"
    | "problem"
    | "resources"
    | "alternatives"
    | "need"
    | "outcome"
    | null;
}
interface QuestionsBreakdown {
  managerTotal: number;              // menejer bergan savollar
  clientTotal: number;               // mijoz bergan savollar (engagement)
  openCount: number;                 // ochiq savollar (yaxshi)
  closedCount: number;               // yopiq savollar (ha/yo'q)
  sopranoBreakdown: {
    situation: number;
    objective: number;
    problem: number;
    resources: number;
    alternatives: number;
    need: number;
    outcome: number;
  };
  topManagerQuestions: QuestionItem[];  // eng muhim 3-5 ta
  topClientQuestions: QuestionItem[];   // mijoz savollari
  questionQualityScore: number;      // 0-100
}

// ─── Close Attempts (B4-1) — yopishga urinishlar ─────────────────────────
interface CloseAttempt {
  timestamp: string;                 // "MM:SS"
  type: "soft" | "direct" | "trial" | "assumptive";
  phrase: string;                    // menejer nima dedi
  clientResponse?: string;           // mijoz javobi
  successful: boolean;               // natija berdi mi
}
interface CloseAttemptsBlock {
  attempts: CloseAttempt[];
  totalCount: number;
  quality: "none" | "weak" | "good" | "excellent";
  recommendation: string;            // "Siz umuman yopishga urinmadingiz" kabi
}

// ─── Voice of Customer (B4-1) — Mijoz ovozi ──────────────────────────────
interface BudgetHint {
  phrase: string;                    // aynan ibora
  timestamp: string;
  amount?: string;                   // agar aniq raqam bo'lsa
}
interface CompetitorMention {
  name: string;                      // kompaniya/kurs nomi
  context: string;                   // nima dedi
  timestamp: string;
}
interface VoiceOfCustomer {
  mainPain: string | null;           // mijozning asl og'rig'i
  expectations: string[];            // mijoz nimani kutyapti
  buyingCriteria: string[];          // mijoz qanday mezonlar bo'yicha tanlaydi
  competitorsMentioned: CompetitorMention[];
  budgetHints: BudgetHint[];
  urgencySignals: string[];          // "qancha tez boshlashim mumkin?" kabi
}

// ─── Intent Signals (B4-1) — Sotib olish niyatlari ───────────────────────
interface AnalysisResult {
  summary: string;
  overallScore: number;
  leadQuality: string;
  leadScore: number;
  criteria: Record<string, CriteriaResult>;
  errors: Array<{ type: string; description: string; timestamp: string; evidenceQuote?: string }>;
  winPoints: Array<{ description: string; timestamp: string }>;
  lossPoints: Array<{ description: string; timestamp: string }>;
  objectionsList: Array<{ type: string; count: number }>;
  managerSpeechPercent: number;
  clientSpeechPercent: number;
  coachingInsights: CoachingInsights;
  followupSignal: FollowupSignal;
  promises: ManagerPromise[];
  qualification: DealQualification;
  // B4-1 kengaytirish
  callStructure: CallStructure;
  questions: QuestionsBreakdown;
  closeAttempts: CloseAttemptsBlock;
  voiceOfCustomer: VoiceOfCustomer;
}

export const getCriteriaPrompt = async (companyId: string, category: string = "sotuv"): Promise<{ text: string; criteriaNames: string[] }> => {
  try {
    // Kategoriya nomi mapping
    const categoryNameMap: Record<string, string> = {
      sotuv: "Sotuv",
      qayta: "Qayta qo'ng'iroq",
      boshqa: "Boshqa",
    };
    const targetCategoryName = categoryNameMap[category] || "Sotuv";

    const categories = await prisma.criteriaCategory.findMany({
      where: { companyId, name: targetCategoryName },
      include: { criteria: { orderBy: { sortOrder: "asc" } } },
    });

    const lines: string[] = [];
    const criteriaNames: string[] = [];
    for (const cat of categories) {
      for (const c of cat.criteria) {
        // HTML taglarni tozalash
        const cleanDesc = c.description.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        lines.push(`- ${c.name} (vazn: ${c.weight}%): ${cleanDesc}`);
        criteriaNames.push(c.name);
      }
    }
    return { text: lines.join("\n"), criteriaNames };
  } catch (err) {
    console.error("Get criteria prompt error:", err);
    return { text: "", criteriaNames: [] };
  }
};

/**
 * V2 — XML + systemInstruction + responseSchema format (Gemini optimal).
 * Stable qoidalar systemInstruction'da → cache qilinadi (90% chegirma).
 * Variable kontent userMessage'da.
 * JSON struktura responseSchema (text JSON example o'rniga).
 */
export const buildAnalysisPromptV2 = (
  transcription: string,
  criteriaNames: string[],
  category: string = "sotuv",
  courseInfo: string = "",
  topPerformerPlaybook: Record<string, any> | null = null,
  leadContext: { realClientName?: string; phone?: string } | null = null,
): {
  systemInstruction: string;
  userMessage: string;
  responseSchema: any;
} => {
  const isQayta = category === "qayta";

  // ─── SYSTEM INSTRUCTION (stable, cache qilinadi) ─────────────────
  const systemInstruction = `<role>
You are a professional sales call analyst for B2C sales teams in Uzbekistan (Tashkent and regions). Company-specific product, pricing, and offer details are provided in the <course_info> block of the user message — treat that as authoritative.
Analyze sales calls in Uzbek language with cultural sensitivity. Output strict JSON.
</role>

<cultural_rules>
<rule id="xojayin">"Xo'jayin" / "xo'jayinim" from married women = HUSBAND, NEVER "boss/rahbar".
Example: "xo'jayinim bilan maslahatlashay" = "consult with my husband".</rule>

<rule id="family_decision">"Family/parent consultation" = NORMAL Uzbek practice, NOT surrender.
- If manager sets specific callback time after this → SUCCESSFUL followup.
- If manager says "yana gaplashamiz" without specific time → ERROR (Yakunlash zaif).</rule>

<rule id="parent_involvement">16-22 yosh + "otam bilan gaplashay" = NATURAL.
Manager should set time to add parent to next call.</rule>

<rule id="name_respect">Using client's name 2-3 times with "aka/opa" = RESPECT (sales positive).</rule>
</cultural_rules>

<evaluation_rules>
<rule id="yandex_stt_warning" severity="critical">
Yandex STT mishears 30-50% of:
- Names (Latofat→"rufat", Madina→"madiyna", Diyorbek→"duyorbek")
- English/brand words (brand names — transliterated)
- Numbers (1.2 mln might be "1.1 mln" due to STT error)

DO NOT flag manager errors based on transcript ALONE if it could be Yandex error.
Always cross-check: lead_context.realClientName for name verification.
</rule>

<rule id="name_error_strict">
- 1 wrong name → DO NOT flag (likely Yandex error)
- 2 wrong names with similar sounds → DO NOT flag
- 3+ DIFFERENT wrong names (e.g., Rufat, Azamat, Abduvohid) → FLAG as critical (Yandex doesn't make this pattern)
- Wrong gender (female client called by male name 2+ times) → FLAG as critical
- Client corrects manager ("men ... emas") → ALWAYS flag
</rule>

<rule id="fact_check">
DO NOT flag "Noto'g'ri ma'lumot" for:
- Brand names (brand) transliterated by Yandex
- English words in Russian transliteration (onlayn, intensiv)
- Number diff < 10% (likely Yandex mishears)
- Single misheard detail with rest correct

ONLY flag for:
- Major price diff (>50%)
- Wrong product/duration entirely
- Made-up bonuses/discounts not in courseInfo
</rule>

<rule id="soprano_strict">
Score "Ehtiyojni aniqlash" by COUNTING ACTUAL SOPRANO questions:
- S(situation), O(objective), P(problem), R(resources), A(alternatives), N(need), O(outcome)
- 7/7 closed → 90-100
- 5-6/7 → 70-90
- 3-4/7 → 40-70
- 1-2/7 → MAX 30 (Real avg = 1.5/7, expect this score range)
- 0/7 → 0-10
ALWAYS include in comment: "SOPRANO yopildi: [S, O] — 2/7. Yopilmagan: ..."
</rule>

<rule id="speech_ratio">
Optimal manager speech: 50-65% (top performers).
- 70%+ → speechRatioAlert: true
- 80%+ → Taqdimot -20 ball (monolog problem)
- 90%+ → Ehtiyojni aniqlash MAX 30 (client didn't speak)
</rule>

<rule id="closing_detection">
- Specific time + reason ("ertaga 14:00, chegirma tugaydi") → 90+
- Specific time, no reason → 60-70
- "Yana gaplashamiz" no time → 30
- "O'ylab ko'ring" + manager surrendered → 15-20
- Client confirmed "kelishdik" + time → 95+
</rule>

<rule id="qayta_specific">
For QAYTA (callback) category:
- DO NOT flag "Ehtiyoj aniqlanmadi" (already done in 1st call)
- For QAYTA: salomlashish mezon emas — uni baholama va flag qilma
- For SOTUV: short greeting OK — flag faqat agar salom umuman yo'q bo'lsa
- Score "Taqdimot" only if NEW value/argument added (not full A→Z)
- Critical: Kontekstni eslatish (must reference prior conversation)
</rule>
</evaluation_rules>

<examples>
<example category="aktiv_tinglash" type="strong" score="90">
[00:08] Manager: Salom Madina opa, charchamayapsizmi?
[00:11] Mijoz: Yaxshi, rahmat
[03:45] Manager: Madina opa, oldin gaplashganimda B1 darajasi tushib qolgan dedingiz, hozir ham shundaymi?
[03:52] Mijoz: Ha aslida
→ Score 90: name preserved, prior info recalled, no interruption
</example>

<example category="aktiv_tinglash" type="weak" score="10">
[00:17] Manager: Allo Latofat, biz kompaniyamizdan
[05:22] Manager: Endi Rufat aka, biz... [different male name]
[05:25] Mijoz: Men Latofat, ayol kishi
[05:28] Manager: Davom etamiz unda... [no apology]
→ Score 10: wrong name, wrong gender, no apology
</example>

<example category="bosim_closing" type="strong" score="95">
[18:34] Manager: Demak Madina opa, ertaga 14:00 ofisga keling, hujjat bilan
[18:40] Mijoz: Ha kelishdik
[18:42] Manager: Telefonim 95-510-15-15
→ Score 95: specific time, action, client confirmed
</example>

<example category="bosim_closing" type="weak" score="15">
[20:11] Manager: Mayli, o'ylab ko'ring
[20:14] Mijoz: Ha o'ylab ko'raman
[20:16] Manager: Kerak bo'lsa men yana qo'ng'iroq qilaman
→ Score 15: no time, no specific action, transferred decision to client
</example>

<example category="soprano" type="strong" score="90">
[02:15] Manager: Qayerda o'qiysiz hozir?  [S]
[02:34] Manager: Ingliz tili nima maqsadda kerak?  [O]
[03:11] Manager: Nimada qiynalasiz — speaking, listening?  [P]
[04:22] Manager: Haftada qancha vaqt ajrata olasiz?  [R]
[05:03] Manager: Boshqa kurslarni qaradingizmi?  [A]
[05:38] Manager: Aynan nima kerak — IELTS yoki umumiy?  [N]
[06:12] Manager: Qachon boshlamoqchisiz?  [O]
→ SOPRANO 90: 7/7 yopildi
</example>

<example category="soprano" type="weak" score="25">
[01:45] Manager: Hozir qayerda ishlaysiz?  [S only]
[02:12] Manager: Bizning kursimiz juda zo'r, 3 oy davomida... [10 min monolog]
→ SOPRANO 25: 1/7, qolgani so'ralmadi, monologga o'tib ketdi
</example>
</examples>

<anti_shablon>
NEVER use these generic phrases (TAQIQLANADI):
❌ "Suhbatda ijobiy holat kuzatilmadi"
❌ "Ushbu qo'ng'iroqda ijobiy jihatlar mavjud emas"
❌ "Suhbat bo'lmaganligi sababli..."
❌ "Yaxshi gaplashdi"
❌ "Mijoz bilan hamkorlik taklif qilindi"

INSTEAD:
✅ Direct quote from transcript with [MM:SS]
✅ Specific action with metric ("Manager 25 sec monolog")
✅ Reference to top performer technique
</anti_shablon>

<output_rules>
- Return ONLY valid JSON matching the provided schema
- evidenceQuote MUST be exact transcript quote (≥25 chars, NOT made up)
- timestamp format: "MM:SS" (2-digit minutes : 2-digit seconds)
- All comments in Uzbek (Latin alphabet)
- summary: 400-700 chars (NOT 2-3 sentences, structured 5 parts + Tahmin)
</output_rules>`;

  // ─── USER MESSAGE (variable, har audio uchun yangi) ─────────────────
  const courseBlock = courseInfo && courseInfo.trim()
    ? `<course_info>\n${courseInfo.trim()}\n</course_info>\n\n`
    : "";

  const topPerformerBlock = topPerformerPlaybook
    ? `<top_performer>
Manager: ${topPerformerPlaybook.managerName || "?"} (${topPerformerPlaybook.conversionRate || "?"}% conversion)

TECHNIQUES:
${(topPerformerPlaybook.techniques || []).map((t: any) => `- ${t.name}: "${t.example}"`).join("\n")}

OBJECTION HANDLING:
${(topPerformerPlaybook.objectionHandling || []).map((o: any) => `- ${o.objectionType}: "${o.response}"`).join("\n")}

CLOSING STYLE: ${topPerformerPlaybook.closingStyle || ""}
SPEECH RATIO: Manager ${topPerformerPlaybook.avgManagerSpeech || "?"}% / Client ${topPerformerPlaybook.avgClientSpeech || "?"}%

Use these techniques in criticalMoments[].whatToDoInstead field.
</top_performer>\n\n`
    : "";

  const leadBlock = leadContext?.realClientName
    ? `<lead_context>
Real client name (from CRM): ${leadContext.realClientName}
Phone: ${leadContext.phone || "?"}

⚠️ Use this REAL name for verification. Yandex STT may have written different name in transcript.
DO NOT flag "Mijozni tinglash" if transcript shows similar-sounding name (Yandex error).
</lead_context>\n\n`
    : "";

  const criteriaBlock = `<criteria>
Mezon ro'yxati (DB'dan, sortOrder bo'yicha):
${criteriaNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Har biri uchun: score (0-100) + comment (Uzbek tilida, aniq, transkriptdan iqtibos bilan).
</criteria>\n\n`;

  const categoryBlock = `<category>
${isQayta
      ? `QAYTA QO'NG'IROQ — manager bu mijoz bilan oldin gaplashgan.
1-qo'ng'iroqda bajarilgan ishlar (to'liq tanishtirish, SOPRANO ehtiyoj, mahsulot A→Z) BU YERDA QAYTA TALAB QILINMAYDI.
Kontekstni eslatish — asosiy mezon. E'tirozga aniq YECHIM. Bosim closing — qarorga olib kelish.`
      : `1-QO'NG'IROQ — birinchi aloqa. Barcha mezonlar muhim. SOPRANO to'liq o'tilishi kerak.`}
</category>\n\n`;

  const userMessage = `${categoryBlock}${courseBlock}${topPerformerBlock}${leadBlock}${criteriaBlock}<transcript>
${transcription}
</transcript>

<task>
Tahlil qil. JSON schema'ga aniq mos ravishda javob qaytar.
- Har mezonga 0-100 ball + comment
- evidenceQuote har xato uchun MAJBURIY (transkriptdan aniq iqtibos)
- coachingInsights: aniq, individual, transkriptdan misol bilan
- summary: 400-700 chars, 5 strukturali qism + "Tahmin: DAVOM ETILADI/YOPILADI/SHUBHALI/YO'QOLGAN"
${isQayta ? `- qualification: QAYTA QO'NG'IROQDA SOPRANO TAHLIL QILINMAYDI. qualification.overallQualification = 0, qolgan barcha situation/objective/problem/resources/alternatives/need/outcome → asked=false, value="", evidence=null. SOPRANO 1-qo'ng'iroqda allaqachon qilingan deb hisoblanadi.` : ""}
</task>`;

  // ─── RESPONSE SCHEMA (Gemini structured output) ─────────────────
  const errorTypes = isQayta
    ? ["Kontekst eslatilmadi", "E'tirozga javob berilmadi",
       "Yakunlash zaif", "Mijozni tinglash", "Taqdimot zaif"]
    : ["Salomlashish xatosi", "Ehtiyoj aniqlanmadi", "Taqdimot zaif",
       "E'tirozga javob berilmadi", "Yakunlash zaif", "Mijozni tinglash"];

  const responseSchema = {
    type: "object",
    required: ["summary", "overallScore", "leadQuality", "criteria", "errors",
               "winPoints", "lossPoints", "coachingInsights"],
    properties: {
      summary: { type: "string", minLength: 200, maxLength: 1500 },
      overallScore: { type: "integer", minimum: 0, maximum: 100 },
      leadQuality: { type: "string", enum: ["sovuq", "iliq", "issiq"] },
      leadScore: { type: "integer", minimum: 0, maximum: 100 },
      clientProfile: {
        type: "object",
        properties: {
          // Vertex batch API tuple type ["string","null"] ni qabul qilmaydi.
          // O'rniga: type: "string" + nullable: true (Gemini structured output format).
          age: { type: "integer", nullable: true },
          gender: { type: "string", enum: ["male", "female", "unknown"], nullable: true },
          region: { type: "string", nullable: true },
          interests: { type: "array", items: { type: "string" } },
          fears: { type: "array", items: { type: "string" } },
          mainQuestion: { type: "string", nullable: true },
          mainObjection: { type: "string", enum: ["Narx", "Vaqt", "Ishonch", "Raqobat", "Kerak emas"], nullable: true },
          decisionTimeDays: { type: "integer", nullable: true },
          decisionSignals: { type: "string", nullable: true },
        },
      },
      criteria: (() => {
        // Gemini responseSchema needs EXPLICIT properties (additionalProperties weak).
        // Build object schema from criteriaNames list dynamically.
        const props: Record<string, any> = {};
        for (const name of criteriaNames) {
          props[name] = {
            type: "object",
            required: ["score", "comment"],
            properties: {
              score: { type: "integer", minimum: 0, maximum: 100 },
              comment: { type: "string", minLength: 30 },
            },
          };
        }
        return {
          type: "object",
          required: criteriaNames.slice(), // har mezon majburiy
          properties: props,
        };
      })(),
      errors: {
        type: "array",
        items: {
          type: "object",
          required: ["type", "description", "timestamp", "evidenceQuote"],
          properties: {
            type: { type: "string", enum: errorTypes },
            description: { type: "string", minLength: 20 },
            timestamp: { type: "string", pattern: "^\\d{1,2}:\\d{2}$" },
            evidenceQuote: { type: "string", minLength: 25 },
          },
        },
      },
      winPoints: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string", minLength: 30 },
            timestamp: { type: "string" },
          },
        },
      },
      lossPoints: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string", minLength: 30 },
            timestamp: { type: "string" },
          },
        },
      },
      objectionsList: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["Narx", "Vaqt", "Ishonch", "Raqobat", "Kerak emas"] },
            count: { type: "integer", minimum: 0 },
          },
        },
      },
      managerSpeechPercent: { type: "integer", minimum: 0, maximum: 100 },
      clientSpeechPercent: { type: "integer", minimum: 0, maximum: 100 },
      coachingInsights: {
        type: "object",
        properties: {
          speechRatioAlert: { type: "boolean" },
          speechRatioAdvice: { type: "string" },
          surrenderedObjections: { type: "integer" },
          openEnding: { type: "boolean" },
          criticalMoments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                timestamp: { type: "string" },
                whatHappened: { type: "string" },
                whatManagerDid: { type: "string" },
                whatToDoInstead: { type: "string" },
                technique: { type: "string" },
                evidenceQuote: { type: "string", minLength: 25 },
              },
            },
          },
          topWin: { type: "string", minLength: 50 },
          topLoss: { type: "string", minLength: 50 },
          quickFix: { type: "string" },
          sopranoSummary: { type: "string" },
          nextCallScript: { type: "string" },
          dealRiskScore: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      followupSignal: {
        type: "object",
        properties: {
          requiresFollowup: { type: "boolean" },
          followupReason: { type: "string", nullable: true },
          followupPhrase: { type: "string", nullable: true },
          suggestedDeadlineDays: { type: "integer", nullable: true },
        },
      },
      qualification: {
        type: "object",
        properties: {
          situation: { type: "object", properties: { asked: { type: "boolean" }, value: { type: "string" }, evidence: { type: "string", nullable: true } } },
          objective: { type: "object", properties: { asked: { type: "boolean" }, value: { type: "string" }, evidence: { type: "string", nullable: true } } },
          problem: { type: "object", properties: { asked: { type: "boolean" }, value: { type: "string" }, evidence: { type: "string", nullable: true } } },
          resources: { type: "object", properties: { asked: { type: "boolean" }, value: { type: "string" }, evidence: { type: "string", nullable: true } } },
          alternatives: { type: "object", properties: { asked: { type: "boolean" }, value: { type: "string" }, evidence: { type: "string", nullable: true } } },
          need: { type: "object", properties: { asked: { type: "boolean" }, value: { type: "string" }, evidence: { type: "string", nullable: true } } },
          outcome: { type: "object", properties: { asked: { type: "boolean" }, value: { type: "string" }, evidence: { type: "string", nullable: true } } },
          overallQualification: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
    },
  };

  return { systemInstruction, userMessage, responseSchema };
};

/**
 * Analiz prompt'ini quradi. Batch va online yo'llarda bir xil.
 * Bu funksiya faqat string qaytaradi — AI ga chaqirmaydi.
 */
export const buildAnalysisPrompt = (
  transcription: string,
  criteriaText: string,
  category: string = "sotuv",
  criteriaNames: string[] = [],
  courseInfo: string = "",
  topPerformerPlaybook: Record<string, any> | null = null
): string => {
  const isQayta = category === "qayta";

  // DB dagi mezon nomlaridan JSON schema yasash
  const criteriaSchema = criteriaNames.length > 0
    ? `{\n${criteriaNames.map((n) => `    "${n}": {"score": 0-100, "comment": "..."}`).join(",\n")}\n  }`
    : isQayta
      ? `{
    "Kontekstni eslatish": {"score": 0-100, "comment": "Oldingi suhbatga bog'lash, mijoz holatini bilish"},
    "E'tirozga yechim berish": {"score": 0-100, "comment": "E'tirozga ANIQ yechim — raqam/case/taqqoslash bilan"},
    "Bosim o'tkazish": {"score": 0-100, "comment": "..."},
    "Kayfiyati": {"score": 0-100, "comment": "..."},
    "Aktiv tinglash": {"score": 0-100, "comment": "..."}
  }`
      : `{
    "Salomlashish": {"score": 0-100, "comment": "..."},
    "Ehtiyojni aniqlash": {"score": 0-100, "comment": "SOPRANO 7-bosqich (Situatsiya, Maqsad, Muammo, Resurslar, Variantlar, Ehtiyoj, Natija) qancha to'liq qo'llandi"},
    "Taqdimot": {"score": 0-100, "comment": "..."},
    "E'tiroz bilan ishlash": {"score": 0-100, "comment": "..."},
    "Bosim o'tkazish": {"score": 0-100, "comment": "..."},
    "Kayfiyati": {"score": 0-100, "comment": "..."},
    "Aktiv tinglash": {"score": 0-100, "comment": "..."}
  }`;

  const categoryInstruction = isQayta
    ? `Bu QAYTA QO'NG'IROQ — menejer bu mijoz bilan OLDIN GAPLASHGAN (kamida 1 marta).
Qayta-qo'ng'iroq mezon ro'yxati 5 ta — barchasini baholash MAJBURIY.

⚠️ MUHIM QOIDA: 1-qo'ng'iroqda bajarilgan ishlar (TO'LIQ tanishtirish, SOPRANO ehtiyojni aniqlash, Mahsulot taqdimoti A→Z, SALOMLASHISH) BU YERDA QAYTA TALAB QILINMAYDI. Salomlashishni alohida mezon sifatida BAHOLAMA — qayta qo'ng'iroqda ortiqcha tanishtirish shart emas.

📋 QAYTA QO'NG'IROQ uchun 5 mezon va baholash standartlari:

1️⃣ "Kontekstni eslatish — oldingi suhbatga bog'lash" (qayta'ning O'ZAGI):
   ✅ Mijoz ismi bilan murojaat ("Mahmudova opa") → kamida 60 ball
   ✅ Mijoz darrov tanisa ("Ha, eslayman") → kontekst ishladi, kamida 70 ball
   ✅ Specific oldingi narsani eslatsa (test natijasi, daraja, kurs tanlovi) → 90-100 ball
   ✅ Mijozning oldingi holatini bilsa ("sizda B1 chiqqan", "aytgan edingiz") → 90-100 ball
   ❌ Hech qanday kontekst bermasa, mijoz ham tanimasa → past ball
   📌 "To'liq oldingi suhbatni takrorlash" ShART EMAS — mijoz va menejer bir-birini eslashi yetarli.

2️⃣ "E'tirozga yechim berish" (faqat eshitib qo'ymasdan, ANIQ YECHIM bilan javob):
   ✅ E'tiroz → 30 sekundda aniq yechim (raqam/case/taqqoslash) → 80-100 ball
   ✅ Sababni aniqlab, fakt bilan javob ("o'shanda narx qimmat dedingiz, bo'lib to'lash chiqdi") → 90-100 ball
   ➖ "Tushunaman" deb aytib, lekin yechim aniqlanmasa → 50-60 ball
   ❌ "Yo'q-yo'q" yoki "yana o'ylab ko'ring" deb yopib qo'ysa → 20-30 ball
   📌 Agar mijoz e'tiroz bermasa (darrov rozi) → 70 ball + "E'tiroz bo'lmadi, yechim talab qilinmadi" izohi.

3️⃣ "Bosim — closing va keyingi qadamga olib kelish" (qayta'da AYNAN MUHIM — chunki maqsad qarorga olib kelish):
   ✅ Aniq vaqt + harakat ("ertaga 14:00 hujjat olib keling") → 80-100 ball
   ✅ "Nega aynan hozir" sababini bersa (chegirma tugaydi, joy tugayapti) → 90-100 ball
   ✅ Yumshoq closing ("kelasi haftani 1-darsga qachon yozsam?") → 70-80 ball
   ❌ "O'ylab ko'ring, men yana qo'ng'iroq qilaman" deb yopib qo'ysa → 20-30 ball

4️⃣ "Kayfiyat — ovoz tonusi va energiya":
   ✅ Ijobiy energiya, samimiy ohang, mijoz kayfiyatini aks ettiradi → 80-100 ball
   ➖ Monoton, charchagan ohang → 40-60 ball
   ❌ "Yana bir client" tonida, sovuq → past ball

5️⃣ "Aktiv tinglash":
   ✅ Paraphrase, tasdiqlash, mijozni bo'lmasdan eshitish → 80-100 ball
   ➖ Mijozni 1-2 marta bo'lib gaplashsa → 50-60 ball
   ❌ Mijozni doimiy bo'lib, ismini unutsa → past ball

Asosiy maqsad bu qo'ng'iroqda: oldingi suhbatni tabiiy davom ettirish, mijoz e'tirozlariga aniq yechim berish, qarorga yaqinlashtirish, keyingi aniq qadamni kelishish.`
    : `Bu 1-QO'NG'IROQ — mijoz bilan birinchi aloqa. Barcha sotuv mezonlari muhim.`;

  const mezonCount = criteriaNames.length || 5;

  const courseContextBlock = courseInfo && courseInfo.trim()
    ? `
============== KOMPANIYA VA KURS MA'LUMOTLARI (AUTHORITATIVE) ==============
Quyida kompaniyaning RASMIY kurs ma'lumotlari keltirilgan.
Menejer mijozga bergan ma'lumotlarni shu manba bilan solishtir.

${courseInfo.trim()}
============== KURS MA'LUMOTLARI TUGADI ==============

FACT-CHECK QOIDASI (barcha mezonlarga ta'sir qiladi):

⚠️ MUHIM — YANDEX STT XATOLARINI MANAGER XATOSI DEB SANAMA:
Yandex STT (uz-UZ) quyidagilarni 30-50% adashtiradi:
  • Mijoz va manager ISMLARI (Latofat → Rufat, Madina → Madiyna, Diyorbek → Duyorbek)
  • Kompaniya/brend nomlari (transliterated)
  • Ingliz so'zlari (online → onlayn, intensive → intensiv, speaking → spiking)
  • RAQAMLAR ba'zan (1.2 mln → 1.1 mln, ming/mln chalkash)

❌ "Noto'g'ri ma'lumot" XATOSINI QO'YMA agar:
  • Faqat ism noto'g'ri yozilgan bo'lsa (Yandex xatosi ehtimoli > 50%)
  • Faqat kompaniya/brend nomi (brand/products) noto'g'ri yozilgan bo'lsa
  • Ingliz so'zi rus transliteratsiyada bo'lsa (onlayn, intensiv, spiking)
  • Raqam farqi 10% dan kam bo'lsa (1.1 vs 1.2 mln — Yandex chalkashtirgan ehtimol)
  • Faqat 1 ta detal noto'g'ri yozilgan bo'lsa, qolgani to'g'ri

✅ "Noto'g'ri ma'lumot" QO'Y faqat:
  • Manager kurs narxini 50%+ FARQ aytsa (1.2 mln → 600 ming kabi)
  • Manager butunlay BOSHQA mahsulotni tasvirlasa (umuman boshqa modullar)
  • Manager mahsulot DAVOMIYLIGINI ANIQ noto'g'ri aytsa (3 oy → 6 oy)
  • Manager mavjud bo'lmagan bonus/aksiya VAD'a qilsa
  • Manager raqobatchi (boshqa kompaniya) ma'lumotini chalkashtirsa

📌 ISHONCHSIZ holatlarda → xato qo'yma. False positive manager ishonchini yo'q qiladi.

✅ Aniq, ishonchli ma'lumot → plus, mezonlarga 90+ ball
- Menejer mijozga yolg'on yoki hujjatga zid ma'lumot ASOSLI tasdiqlangan bo'lsa — "errors" ga kiritilsin (type: "Noto'g'ri ma'lumot") + evidenceQuote MAJBURIY
`
    : "";

  // Top performer playbook konteksti
  const topPerformerBlock = topPerformerPlaybook
    ? `
============== TOP PERFORMER USLUBI (KOMPANIYANING ENG YAXSHI SOTUVCHISI) ==============
Bu kompaniyada eng yuqori sotuv konversiyasiga ega sotuvchi: ${topPerformerPlaybook.managerName || "Noma'lum"}
Konversiya: ${topPerformerPlaybook.conversionRate || "?"}%

UNING ASOSIY TEXNIKALARI:
${(topPerformerPlaybook.techniques || []).map((t: any) => `- ${t.name}: "${t.example}"`).join("\n")}

E'TIROZLARGA JAVOB USLUBI:
${(topPerformerPlaybook.objectionHandling || []).map((o: any) => `- ${o.objectionType}: "${o.response}"`).join("\n")}

YAKUNLASH USLUBI: ${topPerformerPlaybook.closingStyle || ""}

NUTQ NISBATI: Menejer ${topPerformerPlaybook.avgManagerSpeech || "?"}% / Mijoz ${topPerformerPlaybook.avgClientSpeech || "?"}%

MUHIM: criticalMoments[].whatToDoInstead maydonida bu sotuvchining REAL iboralaridan foydalanish tavsiya etiladi.
============== TOP PERFORMER TUGADI ==============
`
    : "";

  const prompt = `Sen professional sotuvchi trener va qo'ng'iroq tahlilchisisisan.
Quyidagi sotuvchi suhbatini o'zbek tilida tahlil qil.

============== O'ZBEK TILI VA MADANIY QOIDALAR (MAJBURIY) ==============
🔴 "Xo'jayin" so'zi:
   Ayollar (turmushga chiqqanlar) "xo'jayinim" desa — BU **turmush o'rtog'i (er)**ni anglatadi, ish boshlig'i EMAS.
   Misol: "xo'jayinim bilan maslahatlashay" = "erim bilan maslahatlashay".
   ⚠ AI uni "boss", "rahbar", "ish joyi" bilan bog'lamasligi SHART.

🟢 Oila qarori — hurmatli jarayon, "taslim bo'lish" emas:
   - "Erim/otam bilan maslahatlashay" — NORMAL va o'zbek kulturasida hurmatli jarayon.
   - Agar menejer bunga rozi bo'lib, aniq callback vaqti belgilasa — bu **muvaffaqiyatli followup**, "surrender" EMAS.
   - Agar menejer aniq vaqt belgilamay, "yana gaplashamiz" desa — O'SHA xato.

🟢 Ota-ona ishtiroki (yoshlar uchun):
   - 16–22 yosh "otam bilan gaplashay" desa — bu tabiiy, xato emas.
   - Menejer **otani ham ertaga qo'shish uchun vaqt belgilashi** kerak.

🟢 Ism bilan murojaat:
   - Mijoz ismini 2–3 marta "aka/opa" bilan ishlatish — hurmatning belgisi, sotuvda plus.
============== MADANIY QOIDALAR TUGADI ==============

============== STRICT EVALUATION RULES (MAJBURIY o'qing) ==============

🔴 KRITIK XATOLAR (har audio uchun MAJBURIY tekshir):

1. **MIJOZ ISMI XATOSI** (CHUQUR tekshir — false positive xavfli):
   ALGORITM:
   a) Suhbat boshida (0:00-0:30) mijoz ismini ANIQLA ("Salom, men Latofat" / "Bu Madina")
   b) Ismdan jinsni aniqla:
      • Ayol ismlari: Latofat, Madina, Sevinch, Gulnora, Dilfuza, Munisa, Dilnoza, Lola, Nigora, Sayyora, Munira
      • Erkak ismlari: Davron, Bobur, Shohruh, Diyor, Elyor, Akmal, Sherzod, Botir, Aziz, Rustam
   c) Manager keyin shu ismni ishlatdimi tekshir

   ⚠️ ENG MUHIM — YANDEX STT 30-50% ihtimoli bilan ismlarni adashtiradi:
   • Latofat → "Rufat" / "Latifa"
   • Madina → "Madiyna" / "Madna"
   • Diyorbek → "Duyorbek" / "Diyor"

   QO'SHIB QO'YISh QOIDALARI (false positive oldini olish):
   • AGAR transkriptda manager faqat 1 marta boshqa ism aytgan bo'lsa
     → Yandex xatosi ehtimoli yuqori → "Mijozni tinglash" QO'YMA
   • AGAR ismlar ovoz jihatdan o'xshash bo'lsa (Latofat ↔ Rufat 5 harf, ham ayol)
     → ehtimol Yandex chalkashtirgan → QO'YMA
   • AGAR transkriptda manager 3+ HAR XIL ism aytgan bo'lsa (Rufat, Azamat, Abduvohid)
     → Bu HAQIQIY xato (Yandex bunday adashmaydi) → QO'Y (CRITICAL)
   • AGAR mijoz transkriptda "men ... emas" deb tuzatgan bo'lsa
     → Bu HAQIQIY xato (mijoz dalil) → QO'Y
   • AGAR manager ayolga ERKAK ismi (Latofat→Rufat 1 marta), lekin keyin to'g'rilagan
     → Yandex xatosi ehtimol katta → QO'YMA, faqat izohda eslatish

   BALL QOIDALARI (faqat HAQIQIY xato bo'lsa):
   • 1 marta haqiqiy xato (mijoz tuzatdi) → Aktiv tinglash -15 ball
   • 2 marta → -30 ball
   • 3+ HAR XIL ism + qarama-qarshi jins → Aktiv tinglash MAX 10 + CRITICAL error

   📌 SHUBHA bo'lsa → xato QO'YMA. Manager noto'g'ri jazolanishi false positive — bizning eng katta muammo.

2. **MONOLOG DETECTION** (manager 70%+ gapiradi):
   • Manager nutq foizi 70%+ → "speechRatioAlert": true MAJBURIY + izoh
   • 80%+ → "Taqdimot" -20 ball ("monolog muammosi")
   • 90%+ → "Ehtiyojni aniqlash" MAX 30 ball (mijoz gapirmagan)
   • Ideal: 50-65% manager (real top sotuvchilar shu nisbatda gapiradi)

3. **EHTIYOJNI ANIQLASH — SOPRANO TO'LIQLIK** (KATTIQ qoidalar — "95%" ko'rsatib qo'yish bug'i):

   ⚠️ MUHIM BUG TUZATISH: Hozirgi tahlilda ko'p audio'da SOPRANO 95% ko'rsatib qo'yiladi-yu, real
   manager faqat 1-2 savol bergan. Bu noto'g'ri. SOPRANO ball'i HAQIQIY savollar soniga ASOSAN beriladi.

   Manager SOPRANO 7 bosqichdan nechtasini SO'RAGANINI ANIQ HISOBLA:
   • S (Situation) — vaziyat ("qayerda ishlaysiz/o'qiysiz?", "yoshingiz nechi?", "oilada qancha kishi?")
   • O (Objective) — maqsad ("nima uchun ingliz tili kerak?", "qanday natija kutyapsiz?")
   • P (Problem) — muammo ("hozir nimada qiynalasiz?", "oldin urinib ko'rganingizmi?")
   • R (Resources) — Resources ("qancha to'lay olasiz?", "haftada qancha vaqt ajrata olasiz?", "qachongacha kerak?")
   • A (Alternatives) — Alternatives ("boshqa kursda qaradingizmi?", "repetitor bilan ishlaganmisiz?")
   • N (Need) — Need ("aynan nima kerak — speaking, IELTS, kasbiy?", "qanday natija kutyapsiz?")
   • O (Outcome) — Outcome ("kim qaror qiladi?", "qachon boshlamoqchisiz?", "ota-ona bilan maslahat?")

   ⚠️ HISOBLASH ALGORITMI (qattiq):
   1. Har bosqich uchun TRANSKRIPTDA aniq SAVOL borligini tekshir
   2. "Hozir qayerda ishlaysiz?" — bu S (Situation) yopilgan
   3. Faqat manager AYTGAN, lekin SO'RAMAGAN bo'lsa — bu YOPILMAGAN
      Misol: "Bizning kursimiz ish topishga yordam beradi" — bu Objective EMAS, bu taqdimot
   4. Mijoz O'ZIDAN aytgan bo'lsa-yu, manager so'ramagan — YOPILMAGAN
   5. Har savol kategoriyalarga MOSLASHIShI shart, mavhum gap emas

   📊 BALL QOIDALARI (KATTIQ — "95%" bug'ini bartaraf qilish):
   • 7 dan 7 yopilgan → 90-100 ball
   • 6 dan 7 yopilgan → 80-90 ball
   • 5 dan 7 yopilgan → 70-80 ball
   • 4 dan 7 yopilgan → 55-70 ball
   • 3 dan 7 yopilgan → 40-55 ball
   • 2 dan 7 yopilgan → 25-40 ball
   • 1 dan 7 yopilgan → 10-25 ball ⚠️ MAX 30
   • 0 dan 7 yopilgan → 0-10 ball

   ⚠️ SHUBHA bo'lsa → past ball ber. 95% YO'Q bo'lishi mumkin agar manager faqat 1-2 ta savol bergan bo'lsa.

   📌 Real ma'lumot: managerlar avg 1.5/7 yopadi → demak avg ball ~25-30 bo'lishi MANTIQAN to'g'ri.
       Agar siz 80+ ball qo'yayotgan bo'lsangiz — TEKSHIRING, haqiqatan 5+ yopilganmi?

   📋 izohda HAR DOIM yoz:
   "SOPRANO yopildi: [S, O, P] — 3/7. Yopilmagan: Resources, Alternatives, Need, Outcome."

   ⚠️ Resources/Alternatives/Outcome — bu 3 ta bosqich Real managerlarda DEYARLI HECH QACHON so'ralmaydi.
       Agar hech biri so'ralmasa, qolgani 4 ta yopilgan → MAX 60 ball.

4. **CLOSING DETECTION** (Real ma'lumot — eng zaif joy — avg 31.8 ball):
   • Aniq vaqt + sabab ("ertaga 14:00, chegirma tugaydi") → 90+
   • Aniq vaqt, sabab yo'q ("ertaga qo'ng'iroq qilaman") → 60-70
   • Mavhum ("yana gaplashamiz") → 30 ball
   • "O'ylab ko'ring" + manager javob bermay yopgan → 15-20
   • Mijoz "ha kelishdik" + aniq vaqt → 95+
   ⚠️ "Surrender" faqat: e'tiroz + mazmunsiz javob + keyingi qadam yo'q. Agar aniq vaqt belgilangan bo'lsa — surrender EMAS.

5. **OUTCOME-BASED ADJUSTMENT** (mijoz reaksiyasiga qarab):
   • Mijoz "ha kelishdik" / "yaxshi" / "kelaman" → overallScore +10
   • Mijoz "men o'ylab ko'raman" + aniq vaqt belgilangan → neytral
   • Mijoz "yo'q rahmat" / "kerak emas" + manager taslim bo'ldi → -15
   • Mijoz darrov rozi (1 daqiqada hal bo'ldi) → score = max(60, current)

6. **ANTI-ShABLON** (har audio uchun unique izohlar):
   ⚠️ Quyidagi shablon iboralar TAQIQLANADI ("topWin" yoki "comment"):
   • "Suhbatda ijobiy holat kuzatilmadi"
   • "Ushbu qo'ng'iroqda ijobiy jihatlar mavjud emas"
   • "Suhbat bo'lmaganligi sababli..."
   • "Yaxshi gaplashdi" / "yaxshi muloqot"
   • "Mijoz bilan hamkorlik taklif qilindi"

   Buning o'rniga:
   • Aniq iqtibos transkriptdan ("[02:14] Manager: 'Demak ertaga 14:00 ofisga'")
   • Aniq harakat ("Manager 'kelishdik' degan tasdiqdan keyin telefon nomerini saqlatdi")
   • Spetsifik metrik ("Manager 25 sek davomida monolog qildi 03:45-04:10")

7. **QAYTA QO'NG'IROQ — false negative oldini olish**:
   ⚠️ Quyidagi xatolarni QAYTA'da ISHLATMA (DB criteria'da yo'q):
   • "Ehtiyoj aniqlanmadi" — qayta'da SOPRANO TAKRORLASH SHART EMAS
   • "Salomlashish xatosi" — qisqa salom yetarli, to'liq tanishtirish shart emas
   • "Taqdimot zaif" — qayta'da yangi narsa kelmasa, "Bu qo'ng'iroqda yangi taqdimot kerak bo'lmadi" deb yoz
   ✅ QAYTA'da MAJBURIY tekshir:
   • Kontekstni eslatish (ism + oldingi detal)
   • E'tirozga ANIQ yechim berish (faqat "tushunaman" yo'q)
   • Bosim — closing aniq vaqt bilan

============== EVALUATION RULES TUGADI ==============

============== TIPIK MISOLLAR (real audiolardan) ==============

✅ KUCHLI Aktiv tinglash (90+ ball):
"[00:08] Manager: Salom Madina opa, charchamayapsizmi?
 [00:11] Mijoz: Yaxshi, rahmat
 [03:45] Manager: Madina opa, oldin gaplashganimda B1 darajasi tushib qolgan dedingiz, hozir ham shundaymi?
 [03:52] Mijoz: Ha aslida"
→ Aktiv tinglash 92: ism saqlangan, oldingi malumot ESLANGAN, mijoz gapini bo'lmagan.

❌ ZAIF Aktiv tinglash (10-20 ball):
"[00:17] Manager: Allo Latofat, biz kompaniyamizdan
 [05:22] Manager: Endi Rufat aka, biz...
 [05:25] Mijoz: Men Latofat, ayol kishi
 [05:28] Manager: Davom etamiz unda..."
→ Aktiv tinglash 12: ismi noto'g'ri, jinsi noto'g'ri (erkak ismi), kechirim so'ramadi.

✅ KUCHLI Bosim closing (95 ball):
"[18:34] Manager: Demak Madina opa, ertaga 14:00 ofisga keling, hujjat bilan
 [18:40] Mijoz: Ha kelishdik
 [18:42] Manager: Telefon raqamim 95-510-15-15, kerak bo'lsa qo'ng'iroq qiling
 [18:48] Manager: Ertaga 14:00 da kutamiz!"
→ Bosim 95: aniq vaqt, aniq harakat, mijoz tasdiqladi, follow-up bor.

❌ ZAIF Bosim (15 ball):
"[20:11] Manager: Mayli, o'ylab ko'ring
 [20:14] Mijoz: Ha o'ylab ko'raman
 [20:16] Manager: Kerak bo'lsa men yana qo'ng'iroq qilaman, salomat bo'ling"
→ Bosim 15: aniq vaqt yo'q, mijozga "yana o'ylash" topshirildi, qaytib kelmaydi.

✅ KUCHLI SOPRANO (80+ ball):
"[02:15] Manager: Qayerda o'qiysiz hozir?  → S (Situation)
 [02:34] Manager: Ingliz tili sizga nima maqsadda kerak?  → O (Objective)
 [03:11] Manager: Ko'proq nimada qiynalasiz — speaking, listening?  → P (Problem)
 [04:22] Manager: Haftada qancha vaqt ajrata olasiz?  → R (Resources)
 [05:03] Manager: Boshqa kurslarni ham qaradingizmi?  → A (Alternatives)
 [05:38] Manager: Aynan nima kerak — IELTS yoki umumiy?  → N (Need)
 [06:12] Manager: Qachon boshlamoqchisiz, kim bilan maslahatlasholmaysiz?  → O (Outcome)"
→ SOPRANO 90: 7 dan 7 bosqich yopildi.

❌ ZAIF SOPRANO (30 ball):
"[01:45] Manager: Hozir qayerda ishlaysiz?  → faqat S
 [02:12] Manager: Kursimiz juda zo'r, 3 oy davomida... [10 min monolog]"
→ SOPRANO 25: 7 dan faqat 1 bosqich, qolgani so'ralmadi, monologga o'tib ketdi.

============== MISOLLAR TUGADI ==============

${categoryInstruction}
${courseContextBlock}${topPerformerBlock}
MUHIM: BARCHA ${mezonCount} ta mezonni ALBATTA baholab, har biriga score (0-100) va comment ber. Hech birini tashlab ketma!

${isQayta
  ? `Agar mezon bu qo'ng'iroqda TABIATAN kerak emas bo'lsa (masalan, mijoz darrov rozi bo'ldi → "Oldingi to'siqni tekshirish" kerak emas) — 70 ball va "Bu qo'ng'iroqda ushbu bosqich kerak bo'lmadi, mijoz darrov yechimni qabul qildi" deb yoz. 0 ball BERMA, chunki bu menejerning xatosi emas.`
  : `Agar suhbatda mezon bo'yicha ma'lumot bo'lmasa — 0 ball va "Suhbatda bu mezon bo'yicha faoliyat kuzatilmadi" deb yoz.`}

overallScore MANTIQAN hisoblab ber: barcha mezon ballarining oddiy o'rtachasi, yoki kontekstga qarab vazn bilan. 0 ball olgan bir mezon butun ball'ni pastga tortishi kerak emas, agar qolgan mezonlar yaxshi bo'lsa.

MEZONLAR:
${criteriaText}

TRANSKRIPSIYA:
${transcription}

XATO TURLARI — faqat shu nomlardan birini ishlat:
- "Salomlashish xatosi" — salomlashish yo'q, noto'g'ri yoki professional emas
- "Ehtiyoj aniqlanmadi" — savollar berilmadi, mijoz ehtiyoji o'rganilmadi
- "Taqdimot zaif" — mahsulot taqdimoti yo'q yoki zaif
- "E'tirozga javob berilmadi" — mijoz e'tiroziga MAZMUNAN javob berilmadi
   ⚠ MUHIM: Agar mijoz "vaqtim yo'q, X soatda qayta qo'ng'iroq qiling" desa va menejer rozi bo'lsa — bu TASLIM EMAS, bu MUVAFFAQIYATLI CALLBACK kelishuvi, xato deb belgilamang
   ⚠ Agar mijoz "oilam bilan maslahat qilaman" desa va menejer aniq deadline (sana/vaqt) bilan callback ber'sa — bu HAM xato emas, bu BANT followup
   ✋ "Surrender" faqat: mijoz e'tiroz aytdi + menejer mazmunli javob bermay tugatdi + hech qanday keyingi qadam belgilanmadi
- "Yakunlash zaif" — suhbat keyingi qadamsiz tugagan ("yana gaplashamiz" - aniq vaqt yo'q)
   ⚠ Agar aniq sana/vaqt belgilangan bo'lsa (masalan: "ertaga 14:00 da") — bu xato emas
- "Mijozni tinglash" — mijoz gapini bo'ldi yoki tinglamadi
- "Kontekst eslatilmadi" — oldingi suhbat eslatilmadi (qayta qo'ng'iroq uchun)
- "To'siq tekshirilmadi" — oldingi e'tiroz/to'siq so'ralmadi (qayta qo'ng'iroq uchun)
- "Noto'g'ri ma'lumot" — menejer kurs narxi/davomiyligi/moduli/bonusi bo'yicha kompaniya hujjatidan farqli ma'lumot bergan

🎯 EVIDENCE QUOTE QOIDASI (MAJBURIY):
Har xato va har critical moment uchun "evidenceQuote" maydoniga transkriptdan ANIQ iqtibos qo'shish shart:
- Iqtibos transkriptda so'zma-so'z mavjud bo'lishi kerak (o'ylab chiqarma!)
- Kamida 25 belgi uzun bo'lsin (qisqa "ha" / "mayli" ishlatma)
- Xatoni yoki critical moment'ni ISBOTLOVCHI gap bo'lsin
- Agar aniq iqtibos topilmasa — xato yoki moment'ni KIRITMA (xato sifatida sanama)

Bu qoida noto'g'ri xato (false positive) chiqmasligi uchun. Validator keyinchalik transkriptda bu iqtibosni qidirib tekshiradi — agar topilmasa, xato rad etiladi.

E'TIROZ TURLARI — faqat shu nomlardan birini ishlat:
- "Narx" — qimmat, byudjet yo'q, moliyaviy imkoniyat
- "Vaqt" — vaqt yo'q, band, keyinroq, o'ylab ko'rish kerak
- "Ishonch" — natijaga ishonch yo'q, kafolat kerak
- "Raqobat" — boshqa kursda o'qiyapti, boshqa joyni tanlagan
- "Kerak emas" — hozir kerak emas, qiziqmaydi

🎯 XULOSA (SUMMARY) QOIDASI — MAJBURIY BATAFSILLIK

"summary" maydoni — suhbatning TO'LIQ fakt-asosli rezyume'si. 2-3 jumla yetarli EMAS. Mavhum so'zlar
("yaxshi gaplashdi", "ma'lumot berdi", "hamkorlik taklif qilindi") QAT'IY TAQIQLANADI.
Xulosa 3-5 jumla — 400-700 belgi. Uni o'qib menejer chiqmasdan suhbatning mazmunini to'liq tushunsin.

Majburiy struktura (shu tartibda):

1) KIM–KIM BILAN + NIMA HAQIDA:
   Menejer ismi + mijoz roli/soha + suhbat mavzusi.
   Misol: "Sotuvchi Husnora xususiy maktab rahbari bilan seminarga taklif bo'yicha gaplashdi"

2) MIJOZ KONTEKSTI — aniqlangan RAQAMLAR va FAKTLAR:
   Xodim soni, oborot, reklama budjeti, mijozlar soni, muammoli jarayonlar (raqamlar bilan,
   transkriptdan faqat aniq aytilganlari). "Tizim yo'q, hisobot yo'q" kabi aniq muammolar.
   Misol: "90 nafar o'quvchi, 2 xodim, kuniga $80 target reklama, tizim va hisobotlar yo'qligi aniqlandi"

3) MENEJER NIMALARNI TAQDIM QILDI:
   Kurs/xizmat modullari, qiymat takliflari — vergul bilan ro'yxat.
   Misol: "bozor tahlili, UTP, CRM integratsiyasi (AMO/Bitrix), skriptlar, motivatsiya, hiring testlari va nazorat modullari taqdim qilindi; ta'lim sohasidan keyslar va kafolat eslatildi"

4) NARX TAKLIFI (agar aytilgan bo'lsa) — ANIQ RAQAMLAR:
   To'liq narx, bugungi chegirma, to'liq to'lov chegirmasi — mln/ming UZS da.
   Misol: "Narx 1.5 mln, bugun to'lovda 1.0 mln (to'liq to'lovda 0.9 mln) taklif etildi"

5) YAKUN — MIJOZ POZITSIYASI + KELISHUV:
   Mijoz nima dedi, qachon javob beradi, qanday kontakt bo'lishi kelishildi.
   Misol: "mijoz oylikni kutayotganini aytib, 1–2 soat ichida javob berishga kelishildi va Telegram username berildi"

6) Oxirgi satrda alohida qator — "Tahmin:" + quyidagilardan biri:
   - DAVOM ETILADI (follow-up aniq, mijoz qaytaradigan vaqt bor, signal ijobiy)
   - YOPILADI (to'lov qildi yoki aniq shartnoma)
   - SHUBHALI (aniq qaror yo'q, mavhum "o'ylab ko'raman")
   - YO'QOLGAN (mijoz rad etdi yoki aloqa uzildi)

MUHIM:
- Faqat TRANSKRIPTDA aytilgan faktlarni yoz — o'ylab chiqarma, taxmin qilma
- Raqamlar (narx, xodim soni, oborot) — aynan aytilgan ko'rinishda
- Bir ustunda barcha 6 qismni birlashtir (6-si "Tahmin:" yangi qator)
- Agar qismi suhbatda yo'q bo'lsa (masalan narx kelishmagan) — shu qismi tashlab keting (5 qismga qisqaring)

🎯 CLIENT PROFILE — MIJOZNI ANIQLASH (MAJBURIY)

"clientProfile" maydoni — mijoz haqida strukturalangan ma'lumot.
Transkriptdan aniq topiladigan yoki kontekstdan xulosa chiqariladigan ma'lumotlar:

1. **age** (son) — "30 yoshdaman", "yoshman", "o'rta yosh" kabi signallardan. Aniq bilmasangiz null.
2. **gender** ("male"|"female"|null) — "xo'jayinim/erim" → female; ism asosida aniq bo'lsa. Bilmasangiz null.
3. **region** — viloyat ("Toshkent shahri", "Samarqand", "Farg'ona"...) yoki null.
4. **interests** (String[]) — 1-3 ta qiziqish ("CRM", "marketing", "xodim nazorati").
5. **fears** (String[]) — 1-3 ta to'siq ("narx qimmat", "natija olmaslik", "vaqt yo'q").
6. **mainQuestion** — mijoz bergan eng muhim BIZNES savoli (qisqa, aniq).

   ⚠️ MAJBURIY QOIDALAR:
   - FAQAT mahsulot/xizmat/narx/natija/jarayon haqidagi asosli savol.
   - "Qaysi kompaniya?", "Nima kompaniya?", "Kim bu?", "Alo", "Nimaga qo'ng'iroq qildingiz?",
     "Qayerdan?", "Kecha telefon qilgandingiz?" kabi salomlashish / identifikatsiya / tasdiq savollari **QABUL QILINMAYDI**.
   - Mavhum savollar ("Narxini ayting") o'rniga AYNAN KONTEKSTLI savolni yoz:
     "Kurs narxi qancha?" yoki "2.5 mln uchun nima kiradi?"
   - Agar mijoz faqat salomlashish yoki tasdiq savoli bergan bo'lsa — null qaytar.
   - Savol 4 so'zdan kam yoki juda umumiy bo'lsa — null qaytar.
   - Iloji bo'lsa savol KONTEKSTNI o'z ichiga olsin (mavzu + so'rov).
7. **mainObjection** — "Narx"|"Vaqt"|"Ishonch"|"Raqobat"|"Kerak emas" yoki null.
8. **decisionTimeDays** (son) — "1 hafta" → 7, "ertaga" → 1. Aytmagan bo'lsa null.
9. **decisionSignals** — "oila bilan maslahat", "boshliq ruxsati", "darhol" va h.k.

⚠️ O'YLAB CHIQARMA: transkriptda tasdiq yo'q bo'lsa null. Bo'sh string qoldirma.

JSON formatda javob ber:
{
  "summary": "Sotuvchi [ismi] [mijoz roli] bilan [mavzu] haqida gaplashdi: [aniq kontekst raqamlari]. [Nimalar taqdim qilindi — vergul bilan]. [Narx va chegirmalar aniq]; [mijoz pozitsiyasi + kelishuv].\\n\\nTahmin: DAVOM ETILADI|YOPILADI|SHUBHALI|YO'QOLGAN",
  "clientProfile": {
    "age": null,
    "gender": null,
    "region": null,
    "interests": [],
    "fears": [],
    "mainQuestion": null,
    "mainObjection": null,
    "decisionTimeDays": null,
    "decisionSignals": null
  },
  "overallScore": 0-100,
  "leadQuality": "sovuq"|"iliq"|"issiq",
  "leadScore": 0-100,
  "criteria": ${criteriaSchema},
  "errors": [{"type":"...","description":"...","timestamp":"MM:SS","evidenceQuote":"transkriptdan aniq iqtibos (25 belgidan ko'p)"}],
  "winPoints": [{"description":"...","timestamp":"MM:SS"}],
  "lossPoints": [{"description":"...","timestamp":"MM:SS"}],
  "objectionsList": [{"type":"...","count":1}],
  "managerSpeechPercent": 50,
  "clientSpeechPercent": 50,
  "coachingInsights": {
    "speechRatioAlert": true/false,
    "surrenderedObjections": 0,
    "openEnding": true/false,
    "criticalMoments": [
      {
        "timestamp": "MM:SS",
        "whatHappened": "Mijoz 'narx qimmat' dedi",
        "whatManagerDid": "Menejer nima dedi (transkripsiyadan aniq ibora)",
        "whatToDoInstead": "Aniq skript: nima deyish kerak edi (top performer uslubida)",
        "technique": "Texnika nomi (masalan: Price Reframing, GPS Texnikasi)",
        "evidenceQuote": "transkriptdan aniq iqtibos — xato yoki moment'ni tasdiqlovchi gap"
      }
    ],
    "topWin": "Eng yaxshi qilgan narsa — bitta aniq misol transkripsiyadan (TRANSKRIPTDAN ANIQ IBORA bilan)",
    "topLoss": "Eng katta yo'qotilgan imkoniyat (aniq timestamp + iqtibos)",
    "quickFix": "Keyingi qo'ng'iroq uchun BITTA o'zgarish — qisqa va aniq",
    "speechRatioAdvice": "Manager X% gapirdi (ideal 50-65%). [agar 70%+] Ko'proq ochiq savollar bering, mijoz gapirsin.",
    "sopranoSummary": "SOPRANO: yopildi [S, O] — 2/7. Yopilmagan: Resources, Alternatives, Need, Outcome. Tavsiya: keyingi qo'ng'iroqda Resources (qancha to'lay olasiz?) va Outcome (qachon boshlamoqchisiz?) so'rang.",
    "nextCallScript": "Agar qayta qo'ng'iroq kerak bo'lsa, manager nima deyishi kerak (1-2 jumla, real foydalanuvchi tomonidan amalga oshirilishi mumkin)",
    "dealRiskScore": 50,

    "_ANTI_SHABLON_QOIDALAR": "QUYIDAGI iboralar TAQIQLANADI (generic shablon):",
    "_ban1": "❌ 'Suhbatda ijobiy holat kuzatilmadi'",
    "_ban2": "❌ 'Ushbu qo'ng'iroqda ijobiy jihatlar mavjud emas'",
    "_ban3": "❌ 'Yaxshi gaplashdi'",
    "_ban4": "❌ 'Mijoz bilan hamkorlik taklif qilindi'",
    "_use_instead": "✅ Aniq iqtibos transkriptdan ([02:14] iboradan misol) + aniq harakat + spetsifik metrik"
  },
  "followupSignal": {
    "requiresFollowup": true/false,
    "followupReason": "thinking | family_consultation | price | timing | other | null",
    "followupPhrase": "mijozning aniq iborasi transkripsiyadan yoki null",
    "suggestedDeadlineDays": 2
  },
  "promises": [
    {"what": "Shartnoma yuboraman", "deadline": "ertaga", "deadlineDays": 1, "timestamp": "MM:SS"}
  ],
  "qualification": {
    "situation": {"asked": true/false, "value": "mijozning vaziyati haqida nimani aniqladi", "evidence": "transkripsiya iborasi yoki null"},
    "experience": {"asked": true/false, "value": "mijoz qaysi variantlarni ko'rgan/ishlab ko'rgan", "evidence": "..."},
    "problem": {"asked": true/false, "value": "mijozning qiyinchiliklari, bosh og'riqlari", "evidence": "..."},
    "decisionMaker": {"asked": true/false, "value": "qaror qiluvchi kim, yolg'iz qaror qiladimi", "evidence": "..."},
    "alternatives": {"asked": true/false, "value": "boshqa hamkor/tanlovlarni ko'rib chiqishga tayyormi", "evidence": "..."},
    "nuances": {"asked": true/false, "value": "mijoz uchun noyob farqlar, e'tibor nimalarga", "evidence": "..."},
    "limits": {"asked": true/false, "value": "vaqt cheklovlari, qachongacha qaror", "evidence": "..."},
    "overallQualification": 0-100
  },
  "callStructure": {
    "phases": [
      {"name": "Salomlashish | Kashfiyot | Taqdimot | E'tirozlar | Yakunlash", "startTime": "MM:SS", "endTime": "MM:SS", "qualityScore": 0-100, "notes": "qisqa izoh"}
    ],
    "totalDurationSec": 600,
    "structureScore": 0-100
  },
  "questions": {
    "managerTotal": 0,
    "clientTotal": 0,
    "openCount": 0,
    "closedCount": 0,
    "sopranoBreakdown": {"situation": 0, "objective": 0, "problem": 0, "resources": 0, "alternatives": 0, "need": 0, "outcome": 0},
    "topManagerQuestions": [
      {"text": "real savol transkripsiyadan", "timestamp": "MM:SS", "type": "open | closed", "sopranoCategory": "situation | objective | problem | resources | alternatives | need | outcome | null"}
    ],
    "topClientQuestions": [
      {"text": "mijoz real savoli", "timestamp": "MM:SS", "type": "open | closed"}
    ],
    "questionQualityScore": 0-100
  },
  "closeAttempts": {
    "attempts": [
      {"timestamp": "MM:SS", "type": "soft | direct | trial | assumptive", "phrase": "menejer aniq iborasi", "clientResponse": "mijoz javobi yoki ''", "successful": true/false}
    ],
    "totalCount": 0,
    "quality": "none | weak | good | excellent",
    "recommendation": "bir jumla tavsiya"
  },
}

coachingInsights uchun qoidalar:
- criticalMoments: faqat 1-3 ta ENG MUHIM moment, ortiqcha emas
- criticalMoments faqat HAQIQIY xatolar uchun — yaxshi qo'ng'iroqlarda 0 ta bo'lishi mumkin
- whatToDoInstead: top performer ma'lumoti bo'lsa uning iborasini ishlat, bo'lmasa umumiy texnika
- dealRiskScore: 100 = mijoz albatta qaytadi; 0 = qaytmaydi. Hisoblash: issiq+20, keyingi qadam+15, openEnding-20, surrendered>1 -15, menejer>70% -10, ko'p winPoints+10
- quickFix: bitta gap, buyruq shaklida

followupSignal uchun qoidalar:
- requiresFollowup=true AGAR mijoz "o'ylayman", "keyin aytaman", "yaqinlarim bilan maslahatlashaman", "ota-onam bilan maslahat", "vaqtim yo'q hozir", "keyinroq qaytadan qo'ng'iroq qiling" kabi iboralar ishlatgan bo'lsa
- followupReason: thinking="o'ylayman", family_consultation="oila/yaqin bilan", price="narx to'lash uchun vaqt kerak", timing="keyinroq/hozir kerak emas", other=boshqa
- followupPhrase: transkripsiyadan AYNAN mijoz aytgan iborani copy-paste qil
- suggestedDeadlineDays: thinking=2, family_consultation=3, price=3, timing=7, other=3

promises uchun qoidalar:
- Menejer "ertaga yuboraman", "shartnoma qilamiz", "dushanba qo'ng'iroq qilaman" kabi aniq va'dalar bersa — ro'yxatga qo'sh
- deadlineDays: ertaga=1, indinga=2, bir haftadan keyin=7, dushanba (agar bugun juma)=3
- Umumiy gaplar ("keyin gaplashamiz") — promise EMAS, faqat aniq harakat va muddat
- Agar hech qanday va'da bo'lmasa — bo'sh array []

qualification uchun qoidalar (SOPRANO — 7 bosqichli kashfiyot tekshiruvi):
  С situation — Vaziyat: "Sizga aynan nima kerak?" "Qachon va qancha?"
  О experience — Tajriba: "Siz hozirgacha boshqa variantlarni ko'rdingizmi?" "Shu sohada ishlaganmisiz?"
  П problem — Muammolar: "Hozir qanday qiyinchiliklar va bosh og'riqlar bor?"
  Р decisionMaker — Qaror qiluvchi: "Yolg'iz qaror qabul qilmaysiz-a?" "Kim bilan maslahat?"
  А alternatives — Tanlovlar: "Boshqa hamkorliklarni ko'rib chiqishga tayyormisiz?"
  Н nuances — Noyob farqlar: "Nimalarga e'tibor qaratishimiz kerak?" "Kim bilan ishlamagan bo'lardingiz?"
  О limits — Cheklovlar: "Kelishuv uchun bizda qancha vaqtimiz?"
- asked=true AGAR menejer shu yo'nalishda savol bergan yoki mijoz o'zi shu haqida gapirgan bo'lsa
- value: mijoz javobi yoki topilgan ma'lumot (bir gap); topilmasa null
- evidence: transkripsiyadan aniq ibora; topilmasa null
- overallQualification = 7 yo'nalishdan nechtasi aniqlandi × 14 (max 98, ~100 bonus bilan)

- -20 agar openEnding
- -15 agar surrenderedObjections>1
- -10 agar menejer>80% gapirdi
- 0-100 oraliqda

callStructure uchun qoidalar:
- phases: 3-5 ta asosiy bosqich (Salomlashish, Kashfiyot, Taqdimot, E'tirozlar, Yakunlash)
- Bosqichlar transkripsiyadagi real vaqt bilan belgilanadi — agar aniq topilmasa, taxminiy vaqt ber
- Qayta qo'ng'iroqda "Salomlashish" → "Kontekst eslatish" bo'lishi mumkin
- qualityScore: shu bosqich qanchalik yaxshi bajarilgan (0-100)
- structureScore: umumiy tuzilma sifat (masalan, kashfiyotsiz to'g'ridan-to'g'ri taqdimot = past)

questions uchun qoidalar:
- managerTotal: menejer bergan JAMI savollar soni
- clientTotal: mijoz bergan JAMI savollar soni (engagement belgisi)
- openCount: ochiq savollar ("qanday?", "nima?", "nega?", "qachondan?")
- closedCount: yopiq savollar ("shundaymi?", "bormi?", "kerak mi?")

sopranoBreakdown — MAJBURIY TO'LDIRING (SOPRANO metodologiyasi — har savol aniq kategoriya'ga tegishli):

S — SITUATION (vaziyat): mijozning hozirgi holatini aniqlash
  * "Hozir qaysi biznesdasiz?"
  * "Qancha xodimingiz bor?"
  * "Hozir qanday yechim ishlatyapsiz?"

O — OBJECTIVE (maqsad): mijoz aynan nimaga erishmoqchi
  * "Qanday natijaga erishmoqchisiz?"
  * "Oldingizdagi maqsadingiz nima?"
  * "Keyingi 3 oyda nima qilmoqchisiz?"

P — PROBLEM (muammo): qanday qiyinchiliklarga duch kelyapti
  * "Qanday muammolaringiz bor?"
  * "Nima narsa to'sqinlik qilyapti?"
  * "Hozirgi yechimda nima yoqmayapti?"

R — RESOURCES (resurs): qaysi imkoniyat, byudjet, jamoa bor
  * "Byudjet qanday ko'rib chiqilgan?"
  * "Bu masalani kim bilan birga hal qilasiz?"
  * "Qancha vaqt ajrata olasiz?"

A — ALTERNATIVES (muqobillar): qanday alternativlarni ko'rib chiqyapti
  * "Boshqa qanday variantlarni ko'ryapsiz?"
  * "Oldin shu masala uchun nima qilib ko'rgansiz?"
  * "Bizdan boshqa kim bilan gaplashyapsiz?"

N — NEED (ehtiyoj): haqiqiy ehtiyoj va uning ustuvorligi
  * "Sizga eng muhimi nima?"
  * "Qaysi mezonlar bo'yicha tanlaysiz?"
  * "Bu muammo yechilmasa nima bo'ladi?"

O — OUTCOME (natija): kutgan natija, keyingi qadam
  * "Biz bilan ishlagandan keyin qanday ko'rishni xohlaysiz?"
  * "Keyingi qadam sifatida nima qilamiz?"
  * "Muvaffaqiyat uchun qaysi ko'rsatkichni o'lchaymiz?"

QOIDA: BARCHA menejer savollarini yuqoridagi 7 kategoriya'dan biriga joylashtirish SHART.
  * Agar savol umumiy bo'lsa (masalan "alo?") — kategoriya tayinlama
  * Agar aniq kategoriyaga tushmasa, eng yaqinini tanla
  * sopranoBreakdown barcha 7 raqamining yig'indisi open/closed manager savollar soniga yaqin bo'lsin

- topManagerQuestions: 3-5 ta eng muhim menejer savollari (transkripsiyadan ko'chirma, sopranoCategory bilan)
- topClientQuestions: 2-3 ta mijoz savollari
- questionQualityScore: 0-100
  * +15 agar openCount >= closedCount
  * +15 agar clientTotal >= 2 (mijoz savol beradi = engagement)
  * +10 agar situation savol bor
  * +10 agar objective savol bor
  * +15 agar problem savol bor
  * +10 agar resources savol bor
  * +10 agar alternatives bor
  * +10 agar need bor
  * +5 agar outcome bor

closeAttempts uchun qoidalar:
- Menejer sotuvni yopishga urinishlarini topish — aniq iboralar bilan
- type: soft ("qaysi tarifni tanlaysiz?"), direct ("shartnoma qilaylikmi?"), trial ("aytmoqchimisiz..."), assumptive ("man shartnoma jo'nataman")
- successful: mijoz rozi bo'ldimi yoki yana e'tiroz bildirdimi
- Agar 0 ta urinish bo'lsa — totalCount=0, quality="none"
- quality: 0=none, 1=weak, 2=good, 3+=excellent
- recommendation: aniq tavsiya — "Yopishga urinmadingiz, har qo'ng'iroqda kamida 1 marta so'rang"`;

  return prompt;
};

/**
 * AI javobidan AnalysisResult parse qiladi va fallback'larni qo'llaydi.
 * Batch va online yo'llarda bir xil ishlatiladi.
 */
export const applyAnalysisFallbacks = (
  rawResponse: string,
  transcription: string
): AnalysisResult => {
  // JSON extraction — bir nechta strategiya
  let cleanedResponse = rawResponse;

  // Strategy 1: Markdown fence
  const fenceMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleanedResponse = fenceMatch[1];
  }

  // Strategy 2: {...} extraction (biggest match)
  let parsed: AnalysisResult;
  try {
    // Birinchi { dan oxirgi } gacha
    const firstBrace = cleanedResponse.indexOf("{");
    const lastBrace = cleanedResponse.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = cleanedResponse.slice(firstBrace, lastBrace + 1);
      parsed = JSON.parse(jsonStr);
    } else {
      parsed = JSON.parse(cleanedResponse);
    }
  } catch (err) {
    // Strategy 3: Greedy regex
    try {
      const match = cleanedResponse.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw err;
      }
    } catch {
      console.error("[Analysis] JSON parse xato:", rawResponse.substring(0, 300));
      throw new Error("AI javobini parse qilib bo'lmadi");
    }
  }

  // Validatsiya
  const criteriaKeys = Object.keys(parsed.criteria || {});
  if (criteriaKeys.length < 3) {
    console.warn(`[Analysis] Faqat ${criteriaKeys.length} ta mezon baholangan`);
  }
  if (typeof parsed.overallScore !== "number" || parsed.overallScore < 0 || parsed.overallScore > 100) {
    parsed.overallScore = 0;
  }

    // ─── followupSignal fallback ──────────────────────────────────────
    if (!parsed.followupSignal) {
      const transcriptLower = transcription.toLowerCase();
      const thinkingPhrases = ["o'ylayman", "oylayman", "o'ylab", "oylab", "keyin aytaman", "keyin ayt"];
      const familyPhrases = ["oila", "yaqinlar", "maslahat", "ota-ona", "onam", "otam", "kengash"];
      const timingPhrases = ["keyinroq", "hozir vaqtim yo'q", "hozir band"];
      const pricePhrases = ["pul yo'q", "imkoniyat yo'q", "budjet yo'q"];

      let reason: string | null = null;
      let phrase: string | null = null;
      let days = 3;

      if (thinkingPhrases.some((p) => transcriptLower.includes(p))) { reason = "thinking"; days = 2; }
      else if (familyPhrases.some((p) => transcriptLower.includes(p))) { reason = "family_consultation"; days = 3; }
      else if (timingPhrases.some((p) => transcriptLower.includes(p))) { reason = "timing"; days = 7; }
      else if (pricePhrases.some((p) => transcriptLower.includes(p))) { reason = "price"; days = 3; }

      parsed.followupSignal = {
        requiresFollowup: reason !== null,
        followupReason: reason,
        followupPhrase: phrase,
        suggestedDeadlineDays: days,
      };
    }

    // ─── promises fallback ────────────────────────────────────────────
    if (!Array.isArray(parsed.promises)) {
      parsed.promises = [];
    }

    // ─── qualification fallback ───────────────────────────────────────
    if (!parsed.qualification) {
      parsed.qualification = {
        situation: { asked: false, value: null, evidence: null },
        experience: { asked: false, value: null, evidence: null },
        problem: { asked: false, value: null, evidence: null },
        decisionMaker: { asked: false, value: null, evidence: null },
        alternatives: { asked: false, value: null, evidence: null },
        nuances: { asked: false, value: null, evidence: null },
        limits: { asked: false, value: null, evidence: null },
        overallQualification: 0,
      };
    }

    // ─── callStructure fallback (B4-1) ────────────────────────────────
    if (!parsed.callStructure || !Array.isArray(parsed.callStructure?.phases)) {
      parsed.callStructure = {
        phases: [],
        totalDurationSec: 0,
        structureScore: 50,
      };
    }

    // ─── questions fallback (SOPRANO) ─────────────────────────────────
    const EMPTY_SOPRANO = {
      situation: 0, objective: 0, problem: 0, resources: 0,
      alternatives: 0, need: 0, outcome: 0,
    };
    if (!parsed.questions) {
      parsed.questions = {
        managerTotal: 0,
        clientTotal: 0,
        openCount: 0,
        closedCount: 0,
        sopranoBreakdown: { ...EMPTY_SOPRANO },
        topManagerQuestions: [],
        topClientQuestions: [],
        questionQualityScore: 50,
      };
    } else {
      // sopranoBreakdown majburiy — yo'q bo'lsa bo'sh bilan to'ldiramiz
      parsed.questions.sopranoBreakdown =
        parsed.questions.sopranoBreakdown || { ...EMPTY_SOPRANO };
      parsed.questions.topManagerQuestions = parsed.questions.topManagerQuestions || [];
      parsed.questions.topClientQuestions = parsed.questions.topClientQuestions || [];
    }

    // ─── closeAttempts fallback ───────────────────────────────────────
    if (!parsed.closeAttempts) {
      parsed.closeAttempts = {
        attempts: [],
        totalCount: 0,
        quality: "none",
        recommendation: "",
      };
    } else {
      parsed.closeAttempts.attempts = parsed.closeAttempts.attempts || [];
      parsed.closeAttempts.totalCount = parsed.closeAttempts.totalCount ?? parsed.closeAttempts.attempts.length;
    }

    // ─── voiceOfCustomer fallback ─────────────────────────────────────
    if (!parsed.voiceOfCustomer) {
      parsed.voiceOfCustomer = {
        mainPain: null,
        expectations: [],
        buyingCriteria: [],
        competitorsMentioned: [],
        budgetHints: [],
        urgencySignals: [],
      };
    } else {
      parsed.voiceOfCustomer.expectations = parsed.voiceOfCustomer.expectations || [];
      parsed.voiceOfCustomer.buyingCriteria = parsed.voiceOfCustomer.buyingCriteria || [];
      parsed.voiceOfCustomer.competitorsMentioned = parsed.voiceOfCustomer.competitorsMentioned || [];
      parsed.voiceOfCustomer.budgetHints = parsed.voiceOfCustomer.budgetHints || [];
      parsed.voiceOfCustomer.urgencySignals = parsed.voiceOfCustomer.urgencySignals || [];
    }

    // coachingInsights fallback — agar AI qaytarmasa
    if (!parsed.coachingInsights) {
      const mgrSpeech = parsed.managerSpeechPercent || 50;
      const surrendered = (parsed.errors as any[] || []).filter(
        (e: any) => e.type === "E'tirozga javob berilmadi"
      ).length;
      const hasOpenEnding = (parsed.errors as any[] || []).some(
        (e: any) => e.type === "Yakunlash zaif"
      );
      let dealRisk = 50;
      if (parsed.leadQuality === "issiq") dealRisk += 20;
      if (!hasOpenEnding) dealRisk += 15;
      if (hasOpenEnding) dealRisk -= 20;
      if (surrendered > 1) dealRisk -= 15;
      if (mgrSpeech > 70) dealRisk -= 10;
      if ((parsed.winPoints?.length || 0) > (parsed.lossPoints?.length || 0)) dealRisk += 10;
      dealRisk = Math.max(0, Math.min(100, dealRisk));

      parsed.coachingInsights = {
        speechRatioAlert: mgrSpeech > 70,
        surrenderedObjections: surrendered,
        openEnding: hasOpenEnding,
        criticalMoments: [],
        topWin: (parsed.winPoints as any[])?.[0]?.description || "",
        quickFix: hasOpenEnding
          ? "Keyingi qadamni aniq belgilang: sana va vaqt keling"
          : surrendered > 0
          ? "E'tirozga taslim bo'lmang — qayta so'rang va yechim taklif qiling"
          : "Mijozni ko'proq gapirtiring — savollar bering",
        dealRiskScore: dealRisk,
      };
    }

  console.log(`[Analysis] Score: ${parsed.overallScore} | Mezonlar: ${criteriaKeys.length} | DealRisk: ${parsed.coachingInsights.dealRiskScore}`);
  return parsed;
};

/**
 * Vertex AI bilan qo'ng'iroq tahlili — online yo'l.
 * V2 (default): XML + systemInstruction + responseSchema (Gemini optimal, cache'li, 87% arzon)
 * V1 (fallback): legacy plain text prompt (ENV: USE_PROMPT_V2=0)
 */
const USE_PROMPT_V2 = process.env.USE_PROMPT_V2 !== "0"; // default ON

export const analyzeCall = async (
  transcription: string,
  criteriaText: string,
  category: string = "sotuv",
  criteriaNames: string[] = [],
  courseInfo: string = "",
  topPerformerPlaybook: Record<string, any> | null = null,
  leadContext: { realClientName?: string; phone?: string } | null = null,
): Promise<AnalysisResult> => {
  const ai = getAI();

  try {
    let result: any;
    if (USE_PROMPT_V2) {
      // V2 — XML + systemInstruction + responseSchema
      const { systemInstruction, userMessage, responseSchema } = buildAnalysisPromptV2(
        transcription, criteriaNames, category, courseInfo, topPerformerPlaybook, leadContext
      );

      result = await Promise.race([
        ai.models.generateContent({
          model: MODEL,
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          config: {
            temperature: 0,
            maxOutputTokens: 32768,
            responseMimeType: "application/json",
            responseSchema,
            systemInstruction: { parts: [{ text: systemInstruction }] },
          } as any,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Analysis timeout: 5 min")), 300000)),
      ]);
    } else {
      // V1 — legacy plain text prompt
      const prompt = buildAnalysisPrompt(transcription, criteriaText, category, criteriaNames, courseInfo, topPerformerPlaybook);
      result = await Promise.race([
        ai.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: {
            temperature: 0,
            maxOutputTokens: 32768,
            responseMimeType: "application/json",
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Analysis timeout: 5 min")), 300000)),
      ]);
    }

    const responseText = result.text || "";
    return applyAnalysisFallbacks(responseText, transcription);
  } catch (err: any) {
    const msg = err?.message || "";

    // 429 — qayta urinish
    if (msg.includes("429") || msg.includes("Resource exhausted")) {
      console.log("[Analysis] 429 — 30s kutib qayta urinish...");
      await new Promise((r) => setTimeout(r, 30000));
      return analyzeCall(transcription, criteriaText, category, criteriaNames, courseInfo, topPerformerPlaybook, leadContext);
    }

    console.error("[Analysis] Xato:", msg);
    throw new Error(`Tahlil qilishda xatolik: ${msg}`);
  }
};

/**
 * Audio haqida AI chat (DeepSales Copilot-inspired)
 *
 * Kengaytirilgan kontekst: transkripsiya + analysis + top performer playbook + course info
 * Strukturali system prompt: coaching, script generator, objection handler, next action advisor
 */
interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContext {
  transcription: string;
  analysis: Record<string, any> | null;
  managerName?: string;
  clientPhone?: string;
  callDate?: string;
  isSale?: boolean;
  category?: string;
  courseInfo?: string;
  topPerformerPlaybook?: Record<string, any> | null;
}

function buildContextBlock(ctx: ChatContext): string {
  const parts: string[] = [];

  // Call metadata
  parts.push(`═══ QO'NG'IROQ MA'LUMOTI ═══`);
  if (ctx.managerName) parts.push(`Menejer: ${ctx.managerName}`);
  if (ctx.clientPhone) parts.push(`Mijoz: ${ctx.clientPhone}`);
  if (ctx.callDate) parts.push(`Sana: ${ctx.callDate}`);
  if (ctx.category) parts.push(`Kategoriya: ${ctx.category === "qayta" ? "Qayta qo'ng'iroq" : "1-qo'ng'iroq"}`);
  if (ctx.isSale !== undefined) parts.push(`Natija: ${ctx.isSale ? "✅ SOTUV YOPILDI" : "❌ Sotuv yo'q"}`);
  parts.push("");

  // Analysis summary
  if (ctx.analysis) {
    const a = ctx.analysis;
    parts.push(`═══ TAHLIL NATIJASI ═══`);
    if (a.summary) parts.push(`Xulosa: ${a.summary}`);
    if (typeof a.overallScore === "number") parts.push(`Umumiy ball: ${a.overallScore}%`);
    if (a.leadQuality) parts.push(`Lead sifati: ${a.leadQuality}`);
    if (typeof a.leadHeatScore === "number") parts.push(`Lead Heat Score: ${a.leadHeatScore}%`);
    if (typeof a.managerSpeech === "number") parts.push(`Menejer gapirdi: ${a.managerSpeech}% / Mijoz: ${a.clientSpeech}%`);
    parts.push("");

    // Criteria
    if (a.criteria && typeof a.criteria === "object") {
      parts.push(`━━━ MEZONLAR ━━━`);
      for (const [name, val] of Object.entries(a.criteria)) {
        const v = val as { score?: number; comment?: string };
        parts.push(`• ${name}: ${v.score}% — ${v.comment || ""}`);
      }
      parts.push("");
    }

    // Errors
    if (Array.isArray(a.errors) && a.errors.length > 0) {
      parts.push(`━━━ XATOLAR (${a.errors.length}) ━━━`);
      for (const e of a.errors) {
        parts.push(`• [${e.timestamp}] ${e.type}: ${e.description}`);
      }
      parts.push("");
    }

    // Win points
    if (Array.isArray(a.winPoints) && a.winPoints.length > 0) {
      parts.push(`━━━ KUCHLI TOMONLAR ━━━`);
      for (const w of a.winPoints.slice(0, 5)) {
        parts.push(`• ${w.description}`);
      }
      parts.push("");
    }

    // Loss points
    if (Array.isArray(a.lossPoints) && a.lossPoints.length > 0) {
      parts.push(`━━━ ZAIF TOMONLAR ━━━`);
      for (const l of a.lossPoints.slice(0, 5)) {
        parts.push(`• ${l.description}`);
      }
      parts.push("");
    }

    // Objections
    if (Array.isArray(a.objections) && a.objections.length > 0) {
      parts.push(`━━━ E'TIROZLAR ━━━`);
      for (const o of a.objections) {
        parts.push(`• ${o.type} (${o.count} marta)`);
      }
      parts.push("");
    }

    // Coaching insights
    if (a.coachingInsights && typeof a.coachingInsights === "object") {
      const ci = a.coachingInsights;
      parts.push(`━━━ COACHING INSIGHTS ━━━`);
      if (ci.speechRatioAlert) parts.push(`⚠️ Nutq nisbati buzilgan (menejer juda ko'p gapirdi)`);
      if (ci.openEnding) parts.push(`⚠️ Ochiq yakun (keyingi qadam yo'q)`);
      if (typeof ci.surrenderedObjections === "number" && ci.surrenderedObjections > 0) {
        parts.push(`⚠️ ${ci.surrenderedObjections} ta e'tirozda taslim bo'ldi`);
      }
      if (typeof ci.dealRiskScore === "number") {
        parts.push(`Deal Risk Score: ${ci.dealRiskScore}% (100 = mijoz qaytadi, 0 = qaytmaydi)`);
      }
      if (ci.topWin) parts.push(`✅ Eng yaxshi moment: ${ci.topWin}`);
      if (ci.quickFix) parts.push(`🎯 Tez tuzatish: ${ci.quickFix}`);

      if (Array.isArray(ci.criticalMoments) && ci.criticalMoments.length > 0) {
        parts.push(``);
        parts.push(`KRITIK MOMENTLAR:`);
        for (const m of ci.criticalMoments) {
          parts.push(`[${m.timestamp}] ${m.whatHappened}`);
          parts.push(`   Menejer: ${m.whatManagerDid}`);
          parts.push(`   Kerak edi: ${m.whatToDoInstead}`);
          parts.push(`   Texnika: ${m.technique}`);
        }
      }
      parts.push("");
    }

    // Follow-up signal
    if (a.requiresFollowup) {
      parts.push(`━━━ FOLLOW-UP KERAK ━━━`);
      parts.push(`Sabab: ${a.followupReason || "noma'lum"}`);
      if (a.followupPhrase) parts.push(`Mijoz aytdi: "${a.followupPhrase}"`);
      parts.push(`Holati: ${a.followupCompleted ? "✅ Bajarildi" : "❌ Bajarilmagan"}`);
      parts.push("");
    }

    // Promises
    if (Array.isArray(a.promises) && a.promises.length > 0) {
      parts.push(`━━━ MENEJER VA'DALARI ━━━`);
      for (const p of a.promises) {
        parts.push(`• [${p.timestamp}] ${p.what} — ${p.deadline}`);
      }
      parts.push("");
    }

    // Qualification (MEDDIC)
    if (a.qualification && typeof a.qualification === "object") {
      const q = a.qualification;
      parts.push(`━━━ MEDDIC KVALIFIKATSIYA ━━━`);
      if (q.identifiedPain?.value) parts.push(`Muammo: ${q.identifiedPain.value}`);
      if (q.metric?.value) parts.push(`O'lchov: ${q.metric.value}`);
      parts.push(`Budjet: ${q.budgetSignal || "unknown"}`);
      parts.push(`Vakolat: ${q.authoritySignal || "unknown"}`);
      parts.push(`Tezlik: ${q.timelineSignal || "unknown"}`);
      if (q.champion?.identified) parts.push(`⭐ Champion: ${q.champion.note || "aniqlangan"}`);
      parts.push(`Umumiy kvalifikatsiya: ${q.overallQualification || 0}%`);
      parts.push("");
    }
  }

  // Top performer playbook
  if (ctx.topPerformerPlaybook) {
    const pb = ctx.topPerformerPlaybook;
    parts.push(`═══ TOP PERFORMER FORMULASI ═══`);
    parts.push(`Eng yaxshi sotuvchi: ${pb.managerName} (${pb.conversionRate}% konversiya)`);
    if (Array.isArray(pb.techniques)) {
      parts.push(`ASOSIY TEXNIKALAR:`);
      for (const t of pb.techniques.slice(0, 5)) {
        parts.push(`• ${t.name}: "${t.example}"`);
      }
    }
    if (Array.isArray(pb.objectionHandling)) {
      parts.push(`E'TIROZLARGA JAVOB USLUBI:`);
      for (const o of pb.objectionHandling.slice(0, 5)) {
        parts.push(`• ${o.objectionType}: "${o.response}"`);
      }
    }
    parts.push("");
  }

  // Course info (truncated)
  if (ctx.courseInfo && ctx.courseInfo.trim()) {
    parts.push(`═══ KURS MA'LUMOTLARI ═══`);
    parts.push(ctx.courseInfo.slice(0, 2000));
    parts.push("");
  }

  // Transcription (at the end, largest)
  parts.push(`═══ TO'LIQ TRANSKRIPSIYA ═══`);
  parts.push(ctx.transcription);

  return parts.join("\n");
}

export const chatAboutCall = async (
  context: ChatContext,
  chatHistory: ChatHistoryMessage[],
  userMessage: string
): Promise<string> => {
  try {
    const ai = getAI();

    const contextBlock = buildContextBlock(context);

    const systemPrompt = `Sen professional O'zbek sotuvchi treneri va AI copilotisisan. Senga bitta aniq qo'ng'iroq va uning to'liq tahlili berilgan.

SENING ROLING:
• Menejerga shu qo'ng'iroq bo'yicha aniq maslahat bergan do'st/ustoz
• Transkripsiyadagi REAL iboralarni tahlil qilasan
• Top performer formulasini ishlatgan holda skript va javoblar beradsan
• SOPRANO (Situation–Opinion–Problem–Reality–Alternative–Need–Outcome) metodologiyasini chuqur bilasan va asosiy texnika sifatida ishlatasan
• Aniq, foydali, harakatga undovchi javoblar berasan — quruq nazariya emas

═══════════════════════════════════════════
JAVOB FORMATI — MAJBURIY STRUKTURA
═══════════════════════════════════════════

Har bir javobda aniqlangan zaif momentlar uchun quyidagi markdown struktura ishlatiladi:

1.  **Birinchi zaif moment:** [Qachon — transkriptdagi real ibora yoki [MM:SS] bilan]
    *   **Nima qilish kerak edi:** [Aniq tavsif: 1-2 jumla]
    *   **Skript:**
        > **Mijoz:** "aynan mijoz degan ibora (transkriptdan)"
        > **Sen:** "aynan to'g'ri javob (ko'chirma, menejer nima deyishi kerak edi)"
    *   **Harakat tavsiyasi:** [Keyingi qo'ng'iroq uchun bitta aniq qoida]

2.  **Ikkinchi zaif moment:** ...

BOSHLANISHDA BITTA qisqa jumla: "Davom etamiz, [menejer ismi]. Bu qo'ng'iroqda [N] ta asosiy imkoniyatni boy berding..."

QOIDALAR:
• Har moment uchun 4 qism majburiy: nima bo'ldi · nima qilish kerak edi · skript · harakat tavsiyasi
• Skript bloki MAJBURIY: \`> **Mijoz:** ...\` va \`> **Sen:** ...\` formatida (blockquote)
• Transkriptdagi real iboralardan ko'chirma kel (taxmin emas)
• "Nima qilish kerak edi" — nazariy emas, AYNAN nima deyish/qilish kerakligi
• "Harakat tavsiyasi" — keyingi qo'ng'iroq uchun bitta aniq qoida (not generic)
• 2-4 ta moment etarli — eng muhimlarini tanla

JAVOBLAR USLUBI:
• O'zbek tilida (sotuvchiga tushunarli, iliq "sen" shaklida)
• Har javobda **transkripsiyadagi real iboradan ko'chirma** bo'lsin
• Skriptlarda aniq, sotuvchi so'zlay oladigan ibora — nazariy emas
• Raqamlarni va aniq misollarni ishlat

NIMA QILMA:
• Umumiy nazariya ("siz mijozni tinglashingiz kerak") — FAQAT transkriptdagi misol bilan
• "Siz yaxshi ishladingiz, lekin..." kabi sovuq shablonlar
• Skript bloki'siz yengil javob — har moment uchun skript MAJBURIY
• Transkriptdan ko'chirmasiz tavsiya — hech qachon

═══════════════════════════════════════════
KONTEKST:

${contextBlock}
═══════════════════════════════════════════

Endi foydalanuvchining savoliga yuqoridagi strukturada javob ber.`;

    const history = chatHistory.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { role: "user", parts: [{ text: systemPrompt }] },
        { role: "model", parts: [{ text: "Tushundim, kontekstni o'qidim. Savolingizni bering." }] },
        ...history,
        { role: "user", parts: [{ text: userMessage }] },
      ],
      config: { temperature: 0.3, maxOutputTokens: 2048 },
    });

    return result.text || "Javob olishda xatolik";
  } catch (err) {
    console.error("Chat error:", err);
    return "AI bilan bog'lanishda xatolik yuz berdi. Iltimos qayta urinib ko'ring.";
  }
};
