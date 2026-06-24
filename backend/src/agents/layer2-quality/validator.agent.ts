/**
 * Validator Agent — Layer 2: Quality
 *
 * Maqsad: Analyzer (Gemini Pro) chiqargan xatolar va criticalMoments'larni
 * transkriptga solishtirib tekshirish. Har item uchun confidenceScore (0-100)
 * tayinlash. 70 dan past bo'lganlari Coach'ga yuborilmaydi.
 *
 * Nega kerak: Pro ba'zida "mijoz e'tiroz bildirdi" deb hallucinate qiladi,
 * aslida esa mijoz oddiy savol bergan bo'ladi. Yoki "menejer taslim bo'ldi"
 * deydi, aslida esa callback kelishuvi bo'lgan. Shularni tozalash.
 *
 * Model: Gemini 2.5 Flash (arzon, tez — bu "ikkinchi fikr")
 * Input: Analysis + transcription
 * Output: CleanedAnalysis (DB ga saqlanadi)
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { safeParseJson } from "../../utils/json-repair";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

interface AnalysisError {
  type: string;
  description?: string;
  timestamp?: string;
}

interface CriticalMoment {
  timestamp: string;
  whatHappened?: string;
  whatManagerDid?: string;
  whatToDoInstead?: string;
  technique?: string;
}

interface ValidatorInput {
  analysisId: string;
}

interface ValidatedItem<T> {
  original: T;
  confidenceScore: number;
  evidenceQuote: string | null;
  verdict: "confirmed" | "uncertain" | "rejected";
  reason: string;
}

interface ValidatorOutput {
  analysisId: string;
  confidenceScore: number;
  cleanedErrors: AnalysisError[];
  cleanedMoments: CriticalMoment[];
  evidenceQuotes: Record<string, string>;
  rejectedItems: Array<{ kind: "error" | "moment"; item: unknown; reason: string }>;
}

const VALIDATOR_MODEL = "gemini-2.5-flash";
const CONFIDENCE_THRESHOLD = 70;
const SNIPPET_CONTEXT_LINES = 6; // ±6 qator (taxminan ±30-40 soniya)

export class ValidatorAgent extends BaseAgent<ValidatorInput, ValidatorOutput> {
  readonly metadata: AgentMetadata = {
    id: "validator",
    name: "Validator Agent",
    layer: "layer2-quality",
    version: "1.0.0",
    description:
      "Analyzer chiqargan xatolar va criticalMomentlarni transkriptga solishtirib tekshiradi, false positive'lardan himoya qiladi",
    model: VALIDATOR_MODEL,
    dependencies: ["analyzer"],
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

  protected async run(input: ValidatorInput, _ctx: AgentContext): Promise<ValidatorOutput> {
    const analysis = await prisma.analysis.findUnique({
      where: { id: input.analysisId },
      include: {
        audioFile: { select: { transcription: true } },
      },
    });

    if (!analysis) {
      throw new Error(`Analysis not found: ${input.analysisId}`);
    }

    const transcription = analysis.audioFile.transcription || "";
    if (!transcription) {
      this.logger.warn(`[validator] empty transcription for ${input.analysisId}`);
      return this.emptyOutput(input.analysisId);
    }

    const errors = this.parseErrors(analysis.errors);
    const moments = this.parseMoments(analysis.coachingInsights);

    if (errors.length === 0 && moments.length === 0) {
      return this.emptyOutput(input.analysisId);
    }

    // ⭐ HAR ITEM UCHUN ALOHIDA SNIPPET bilan validate qilish.
    // Bu yondashuv "fokuslangan kontekst" printsipini qo'llaydi —
    // Flash butun transkriptni emas, faqat ±30s atrofdagi matnni ko'radi.
    const validatedErrors: Array<ValidatedItem<AnalysisError>> = [];
    for (const err of errors) {
      const snippet = this.extractSnippet(transcription, err.timestamp || "");
      const result = await this.validateItem({
        kind: "error",
        type: err.type,
        description: err.description || "",
        timestamp: err.timestamp || "—",
        snippet,
      });
      validatedErrors.push({
        original: err,
        confidenceScore: result.confidence,
        evidenceQuote: result.quote,
        verdict: this.toVerdict(result.confidence),
        reason: result.reason,
      });
    }

    const validatedMoments: Array<ValidatedItem<CriticalMoment>> = [];
    for (const mom of moments) {
      const snippet = this.extractSnippet(transcription, mom.timestamp);
      const result = await this.validateItem({
        kind: "moment",
        type: mom.technique || "critical",
        description: `${mom.whatHappened || ""} | Menejer: "${mom.whatManagerDid || ""}"`,
        timestamp: mom.timestamp,
        snippet,
      });
      validatedMoments.push({
        original: mom,
        confidenceScore: result.confidence,
        evidenceQuote: result.quote,
        verdict: this.toVerdict(result.confidence),
        reason: result.reason,
      });
    }

    const cleanedErrors = validatedErrors
      .filter((v) => v.confidenceScore >= CONFIDENCE_THRESHOLD)
      .map((v) => v.original);

    const cleanedMoments = validatedMoments
      .filter((v) => v.confidenceScore >= CONFIDENCE_THRESHOLD)
      .map((v) => v.original);

    const rejectedItems: ValidatorOutput["rejectedItems"] = [
      ...validatedErrors
        .filter((v) => v.confidenceScore < CONFIDENCE_THRESHOLD)
        .map((v) => ({ kind: "error" as const, item: v.original, reason: v.reason })),
      ...validatedMoments
        .filter((v) => v.confidenceScore < CONFIDENCE_THRESHOLD)
        .map((v) => ({ kind: "moment" as const, item: v.original, reason: v.reason })),
    ];

    const evidenceQuotes: Record<string, string> = {};
    validatedErrors.forEach((v, i) => {
      if (v.evidenceQuote) evidenceQuotes[`error_${i}`] = v.evidenceQuote;
    });
    validatedMoments.forEach((v, i) => {
      if (v.evidenceQuote) evidenceQuotes[`moment_${i}`] = v.evidenceQuote;
    });

    const overallConfidence = this.calculateOverallConfidence(
      validatedErrors,
      validatedMoments,
    );

    // DB ga saqlash (upsert — qayta ishga tushsa ham ishlaydi)
    await prisma.cleanedAnalysis.upsert({
      where: { analysisId: input.analysisId },
      create: {
        analysisId: input.analysisId,
        confidenceScore: overallConfidence,
        cleanedErrors: cleanedErrors as unknown as object,
        cleanedMoments: cleanedMoments as unknown as object,
        evidenceQuotes: evidenceQuotes as unknown as object,
        rejectedItems: rejectedItems as unknown as object,
        validatorModel: VALIDATOR_MODEL,
      },
      update: {
        confidenceScore: overallConfidence,
        cleanedErrors: cleanedErrors as unknown as object,
        cleanedMoments: cleanedMoments as unknown as object,
        evidenceQuotes: evidenceQuotes as unknown as object,
        rejectedItems: rejectedItems as unknown as object,
        validatorModel: VALIDATOR_MODEL,
        validatedAt: new Date(),
      },
    });

    this.logger.info(
      `[validator] ${input.analysisId}: ${errors.length}e/${moments.length}m → ${cleanedErrors.length}e/${cleanedMoments.length}m (${overallConfidence}%)`,
    );

    return {
      analysisId: input.analysisId,
      confidenceScore: overallConfidence,
      cleanedErrors,
      cleanedMoments,
      evidenceQuotes,
      rejectedItems,
    };
  }

  private parseErrors(raw: unknown): AnalysisError[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is AnalysisError => typeof e === "object" && e !== null && "type" in e)
      .slice(0, 10); // bitta analysisdan 10 tadan ko'p xato bo'lmaydi
  }

  private parseMoments(coachingInsights: unknown): CriticalMoment[] {
    if (typeof coachingInsights !== "object" || coachingInsights === null) return [];
    const ci = coachingInsights as { criticalMoments?: unknown };
    if (!Array.isArray(ci.criticalMoments)) return [];
    return ci.criticalMoments
      .filter(
        (m): m is CriticalMoment =>
          typeof m === "object" && m !== null && "timestamp" in m,
      )
      .slice(0, 6);
  }

  /**
   * Transkriptdan ma'lum [MM:SS] atrofidan ±SNIPPET_CONTEXT_LINES ga teng
   * matn parchasini ajratib oladi. Bu Validator uchun "fokuslangan kontekst".
   */
  private extractSnippet(transcription: string, timestamp: string): string {
    if (!transcription || !timestamp) return "";
    const target = this.timestampToSec(timestamp);
    if (target === 0 && !timestamp.startsWith("00:")) return "";

    const lines = transcription.split("\n").filter((l) => l.trim());
    const lineRe = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/;

    let centerIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(lineRe);
      if (!m) continue;
      const h = m[3] ? parseInt(m[1], 10) : 0;
      const mn = m[3] ? parseInt(m[2], 10) : parseInt(m[1], 10);
      const s = m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10);
      const sec = h * 3600 + mn * 60 + s;
      if (sec >= target) {
        centerIdx = i;
        break;
      }
    }
    if (centerIdx === -1) return "";

    const start = Math.max(0, centerIdx - SNIPPET_CONTEXT_LINES);
    const end = Math.min(lines.length, centerIdx + SNIPPET_CONTEXT_LINES + 2);
    return lines.slice(start, end).join("\n");
  }

  private timestampToSec(ts: string): number {
    const m = ts.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!m) return 0;
    if (m[3]) {
      return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
    }
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  }

  /**
   * Bitta xato/moment uchun Flash'ga so'rov yuboradi — faqat snippet bilan.
   * Natija: confidence (0-100), quote (isbot), reason.
   */
  private async validateItem(item: {
    kind: "error" | "moment";
    type: string;
    description: string;
    timestamp: string;
    snippet: string;
  }): Promise<{ confidence: number; quote: string | null; reason: string }> {
    // Snippet bo'lmasa — validate qila olmaymiz, 0 ball
    if (!item.snippet) {
      return {
        confidence: 0,
        quote: null,
        reason: "Transkriptdan aynan shu vaqt atrofida snippet topilmadi",
      };
    }

    const prompt = this.buildSinglePrompt(item);
    try {
      const response = await this.client.models.generateContent({
        model: VALIDATOR_MODEL,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      });
      const raw = response.text || "";
      const parsed = this.safeParseSingle(raw);
      if (!parsed) {
        return { confidence: 0, quote: null, reason: "JSON parse failed" };
      }
      return {
        confidence: this.clampConfidence(parsed.confidence),
        quote: typeof parsed.quote === "string" ? parsed.quote : null,
        reason: typeof parsed.reason === "string" ? parsed.reason : "",
      };
    } catch (err) {
      this.logger.warn(
        `[validator] single-item call failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { confidence: 0, quote: null, reason: "Validator API error" };
    }
  }

  private buildSinglePrompt(item: {
    kind: "error" | "moment";
    type: string;
    description: string;
    timestamp: string;
    snippet: string;
  }): string {
    const label = item.kind === "error" ? "XATO" : "CRITICAL MOMENT";
    return `Sen — sotuv qo'ng'iroqlari validatsiyasi bo'yicha ikkinchi fikr beruvchi AI.

VAZIFANG: Boshqa AI (Analyzer) chiqargan 1 ta ${label}'ni transkript parchasiga solishtirib tekshirish.

QAT'IY QOIDALAR:
1. Faqat quyidagi SNIPPET (matn parchasi) asosida xulosa chiqar — boshqa ma'lumotlar yo'q deb hisobla.
2. "TASLIM BO'LISH" (surrender) faqat AYNAN SHU 3 shart birga bajarilganda deb sana:
   - Mijoz e'tiroz aytdi VA
   - Menejer mazmunli javob bermadi VA
   - Keyingi qadam (callback, sana, kelishuv) belgilanmadi
3. ⚠ JUDA MUHIM: Agar mijoz "vaqtim yo'q, X da qayta qo'ng'iroq qiling" desa va menejer rozi bo'lsa —
   bu TASLIM EMAS, MUVAFFAQIYATLI CALLBACK kelishuvi → confidence = 0 (bu xato emas).
4. ⚠ Agar mijoz oilasi/boshlig'i bilan maslahat so'rasa va menejer aniq deadline ber'sa — bu HAM xato emas.
5. Agar Analyzer "surrender" deb yozgan bo'lsa, lekin snippet'da callback/kelishuv bo'lsa — confidence = 0.
6. ISBOT QOIDASI: Agar shu xato haqiqiy deb hisoblasang — snippet'dan AYNAN SHU xato'ni isbotlovchi
   gapni "quote" sifatida kel. Agar snippet'da bunday gap topmasan — confidence past bo'lsin.

═══════════════════════════════════════════════════
ANALYZER CHIQARGAN ${label}:
- Turi: ${item.type}
- Tavsif: ${item.description || "(yo'q)"}
- Vaqt: ${item.timestamp}
═══════════════════════════════════════════════════

TRANSKRIPT PARCHASI (±30-40 soniya atrofda, faqat shuni hisobga ol):
${item.snippet}
═══════════════════════════════════════════════════

JAVOB FORMATI (faqat JSON, hech qanday markdown yo'q):
{
  "confidence": 0-100,
  "quote": "snippet'dan AYNAN iqtibos — xato'ni isbotlovchi gap (yoki null)",
  "reason": "1 jumla o'zbekcha izoh: nima uchun shu ball"
}`;
  }

  private safeParseSingle(
    raw: string,
  ): { confidence?: unknown; quote?: unknown; reason?: unknown } | null {
    return safeParseJson(raw);
  }

  private clampConfidence(v: unknown): number {
    const n = typeof v === "number" ? v : 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private toVerdict(confidence: unknown): "confirmed" | "uncertain" | "rejected" {
    const n = typeof confidence === "number" ? confidence : 0;
    if (n >= 80) return "confirmed";
    if (n >= 50) return "uncertain";
    return "rejected";
  }

  private calculateOverallConfidence(
    errors: Array<ValidatedItem<AnalysisError>>,
    moments: Array<ValidatedItem<CriticalMoment>>,
  ): number {
    const all = [...errors, ...moments];
    if (all.length === 0) return 100;
    const sum = all.reduce((s, v) => s + v.confidenceScore, 0);
    return Math.round(sum / all.length);
  }

  private emptyOutput(analysisId: string): ValidatorOutput {
    return {
      analysisId,
      confidenceScore: 100,
      cleanedErrors: [],
      cleanedMoments: [],
      evidenceQuotes: {},
      rejectedItems: [],
    };
  }
}

// Default instance — global ishlatish uchun
export const validatorAgent = new ValidatorAgent();
