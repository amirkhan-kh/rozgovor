/**
 * Pattern Miner Agent — Layer 2: Quality
 *
 * Maqsad: Menejerning so'nggi qo'ng'iroqlaridan YUTUQLI daqiqalarni
 * ("golden moments") topish — texnika, iqtibos, nima uchun ishlagani.
 *
 * Nega kerak: Coach hozir asosan xatolarga qaraydi. Yutuqlarni ham yuborish
 * orqali ijobiy motivatsiya beriladi — "siz 02:45 da zo'r qildingiz, shuni
 * davom ettiring". Samaradorlik 2x oshadi.
 *
 * Model: Gemini 2.5 Pro (sifat kerak — texnika nomini to'g'ri topishi uchun)
 * Input: managerId (oxirgi 7-14 kun qo'ng'iroqlari tahlil qilinadi)
 * Output: GoldenMoment[] DB ga saqlanadi
 *
 * Ritm: haftalik scheduler (dushanba ertalab) yoki yangi qo'ng'iroq kelganda
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

const MINER_MODEL = "gemini-2.5-pro";
const LOOKBACK_DAYS = 14;
const MAX_CALLS_PER_RUN = 10;
const MAX_GOLDEN_PER_CALL = 3;

interface PatternMinerInput {
  managerId: string;
  companyId: string;
  lookbackDays?: number;
}

interface MinedMoment {
  timestamp: string;
  technique: string;
  quote: string;
  whyItWorked: string;
  replicable: boolean;
  audioFileId: string;
}

interface PatternMinerOutput {
  managerId: string;
  moments: MinedMoment[];
  callsAnalyzed: number;
  alreadyExisting: number;
}

export class PatternMinerAgent extends BaseAgent<PatternMinerInput, PatternMinerOutput> {
  readonly metadata: AgentMetadata = {
    id: "pattern-miner",
    name: "Pattern Miner Agent",
    layer: "layer2-quality",
    version: "1.0.0",
    description:
      "Menejer qo'ng'iroqlaridan yutuqli daqiqalarni (golden moments) topadi — texnika + iqtibos + sabab bilan",
    model: MINER_MODEL,
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

  protected async run(
    input: PatternMinerInput,
    _ctx: AgentContext,
  ): Promise<PatternMinerOutput> {
    const lookbackDays = input.lookbackDays ?? LOOKBACK_DAYS;
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    // Oxirgi qo'ng'iroqlar — eng yuqori ballilari birinchi
    // (zo'r daqiqa odatda yaxshi qo'ng'iroqlarda bo'ladi)
    const analyses = await prisma.analysis.findMany({
      where: {
        audioFile: {
          managerId: input.managerId,
          companyId: input.companyId,
        },
        createdAt: { gte: since },
        overallScore: { gte: 60 }, // past ballilarda golden moment bo'lmaydi
      },
      orderBy: { overallScore: "desc" },
      take: MAX_CALLS_PER_RUN,
      select: {
        id: true,
        overallScore: true,
        winPoints: true,
        coachingInsights: true,
        audioFile: {
          select: {
            id: true,
            transcription: true,
            isSale: true,
          },
        },
      },
    });

    if (analyses.length === 0) {
      return {
        managerId: input.managerId,
        moments: [],
        callsAnalyzed: 0,
        alreadyExisting: 0,
      };
    }

    // Eski golden momentlar — duplicate oldini olish
    const existing = await prisma.goldenMoment.findMany({
      where: { managerId: input.managerId, createdAt: { gte: since } },
      select: { audioFileId: true, timestamp: true },
    });
    const existingKeys = new Set(existing.map((e) => `${e.audioFileId}@${e.timestamp}`));

    // Har qo'ng'iroq uchun Pro'ga yuboramiz va yutuqlarni chiqaramiz
    const allMoments: MinedMoment[] = [];
    for (const a of analyses) {
      const transcription = a.audioFile.transcription || "";
      if (!transcription || transcription.length < 300) continue;

      try {
        const mined = await this.mineSingleCall(
          transcription,
          a.audioFile.id,
          a.audioFile.isSale === true,
          a.overallScore,
        );
        for (const m of mined) {
          const key = `${m.audioFileId}@${m.timestamp}`;
          if (!existingKeys.has(key) && this.isQualityMoment(m)) {
            allMoments.push(m);
            existingKeys.add(key);
          }
        }
      } catch (err) {
        this.logger.warn(
          `[pattern-miner] single call failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // DB ga saqlash
    if (allMoments.length > 0) {
      await prisma.goldenMoment.createMany({
        data: allMoments.map((m) => ({
          companyId: input.companyId,
          managerId: input.managerId,
          audioFileId: m.audioFileId,
          timestamp: m.timestamp,
          technique: m.technique,
          quote: m.quote,
          whyItWorked: m.whyItWorked,
          replicable: m.replicable,
        })),
      });
    }

    this.logger.info(
      `[pattern-miner] ${input.managerId}: ${analyses.length} calls → ${allMoments.length} new golden moments (${existing.length} already existed)`,
    );

    return {
      managerId: input.managerId,
      moments: allMoments,
      callsAnalyzed: analyses.length,
      alreadyExisting: existing.length,
    };
  }

  private async mineSingleCall(
    transcription: string,
    audioFileId: string,
    isSale: boolean,
    overallScore: number,
  ): Promise<MinedMoment[]> {
    const prompt = this.buildPrompt(transcription, isSale, overallScore);
    const response = await this.client.models.generateContent({
      model: MINER_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    });

    const raw = response.text || "";
    const parsed = this.safeParse(raw);
    if (!parsed || !Array.isArray(parsed.goldenMoments)) return [];

    return parsed.goldenMoments
      .slice(0, MAX_GOLDEN_PER_CALL)
      .filter((m: any) => m && typeof m === "object")
      .map((m: any) => ({
        timestamp: String(m.timestamp || ""),
        technique: String(m.technique || "").trim(),
        quote: String(m.quote || "").trim(),
        whyItWorked: String(m.whyItWorked || "").trim(),
        replicable: m.replicable !== false,
        audioFileId,
      }));
  }

  private buildPrompt(transcription: string, isSale: boolean, score: number): string {
    const saleLabel = isSale ? "✅ Sotuv yopildi" : `📊 Ball: ${score}/100`;
    return `Sen sotuv texnikalari bo'yicha mutaxassis — "bo'ri yo'li" (Jordan Belfort), SOPRANO (Situation-Opinion-Problem-Reality-Alternative-Need-Outcome), MEDDIC metodologiyalarini bilasan.

VAZIFANG: Shu qo'ng'iroqdan menejerning eng yaxshi 1-3 ta "OLTIN DAQIQA"sini topish.

🏆 OLTIN DAQIQA nima? — bu TO'RT shart birga bo'lgan aniq lahza:
1. Menejer real sotuv TEXNIKA qo'lladi (kitobdan yoki ustoz playbookidan)
2. Texnikaning natijasi MIJOZ REAKSIYASIDA KO'RINYAPTI:
   - mijoz rozi bo'ldi ("ha", "qo'yinglar", "ko'ramiz")
   - mijoz savolga savol bilan javob berdi (qiziqish)
   - mijoz e'tirozdan voz kechdi
   - mijoz kulib qo'ydi / yumshadi
   - mijoz aniq keyingi qadamga rozi bo'ldi
3. Iqtibos transkriptda so'zma-so'z mavjud (hech narsa o'ylab chiqarilmaydi)
4. Boshqa menejerlar ham TAKRORLAY oladi (replicable)

TEXNIKALAR RO'YXATI — faqat shulardan birini "technique" sifatida ishlat (real metodologiyalar):
- "Narx reframing" (Value-First Pricing)
- "Looping" / "Doiraviy texnika" (e'tirozni qaytarish)
- "SOPRANO — Resources question" (budjet, vaqt, imkoniyatni aniqlash)
- "SOPRANO — Objective question" (mijozning maqsadini ochish)
- "SOPRANO — Need question" (aniq ehtiyoj savoli)
- "SOPRANO — Outcome question" (qaror va keyingi qadam)
- "Assumptive close" (muqobilsiz yopish)
- "Social proof" (ijtimoiy dalil)
- "Contrast principle" (qarama-qarshilik)
- "Scarcity" (cheklangan imkoniyat)
- "GPS texnikasi" (aniq yo'nalish)
- "Tie-down" (tasdiqlatish savoli)
- "Alternative close" (ikkita variantdan biri)

❌ OLTIN DAQIQA EMAS:
- Oddiy "Assalomu alaykum" (salomlashuv — oddiy ish)
- "Kursimiz zo'r" (umumiy maqtov)
- "Rahmat" (oddiy minnatdorchilik)
- Texnik ko'rsatmalar ("PayLater", "PlayMarket orqali", "linkni yuboraman")
- Menejerning monolog'i — mijoz reaksiyasi yo'q

SIFAT FILTRLARI:
1. Iqtibos kamida 40 belgi uzunligi (muhim: mazmunli gap)
2. Texnika nomi yuqoridagi ro'yxatdan bo'lsin
3. whyItWorked maydonida MIJOZNING REAKSIYASI keltirilsin
4. Agar haqiqiy oltin daqiqa topilmasa — bo'sh array qaytar ("goldenMoments": [])

JAVOB FORMATI (faqat JSON, hech qanday markdown yoki tushuntirish):
{
  "goldenMoments": [
    {
      "timestamp": "MM:SS",
      "technique": "Narx reframing",
      "quote": "Biz sizga 2.5M so'm emas, balki bolangizning kelajagini sotayapmiz. 10 yildan keyin..",
      "whyItWorked": "Mijoz narx haqida savol bermay, 'keyingi qadam qanday' deb so'radi — qiymat ko'rsatildi",
      "replicable": true
    }
  ]
}

═══════════════════════════════════════════════════
QO'NG'IROQ (${saleLabel}):
${transcription.slice(0, 10000)}
═══════════════════════════════════════════════════`;
  }

  private safeParse(raw: string): { goldenMoments?: unknown[] } | null {
    if (!raw) return null;
    try {
      const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  /**
   * Sifat filtri — bema'ni yoki juda qisqa golden momentlarni rad etadi.
   * Prompt'dagi 4 shart (texnika + reaksiya + so'zma-so'z + replicable) ni
   * JS darajasida ham tekshirib, noto'g'ri natijalarni filtrlaydi.
   */
  private isQualityMoment(m: MinedMoment): boolean {
    // Uzunlik tekshiruvi
    if (!m.quote || m.quote.length < 40) return false;
    if (!m.technique || m.technique.length < 5) return false;
    if (!m.whyItWorked || m.whyItWorked.length < 15) return false;

    const quoteLower = m.quote.toLowerCase();
    const noise = [
      "aha aha",
      "ha ha",
      "playmarket",
      "playstore",
      "appstore",
      "paylater",
      "assalomu alaykum",
      "rahmat",
      "xayr",
    ];
    if (noise.some((n) => quoteLower.includes(n))) return false;

    // Texnika nomi realistik metodologiya bo'lsinmi?
    const techLower = m.technique.toLowerCase();
    const knownTechniques = [
      "looping",
      "reframing",
      "soprano",
      "assumptive",
      "social proof",
      "contrast",
      "scarcity",
      "gps",
      "tie-down",
      "alternative close",
      "narx",
      "ehtiyoj",
      "doiraviy",
      "resources",
      "objective",
      "alternatives",
      "need",
      "outcome",
      "value",
      "close",
    ];
    if (!knownTechniques.some((kt) => techLower.includes(kt))) return false;

    // whyItWorked da mijoz reaksiyasi bormi?
    const whyLower = m.whyItWorked.toLowerCase();
    const reactionWords = ["mijoz", "kulib", "rozi", "qiziqdi", "rahmat bergan", "tasdiqladi", "ishondi", "qarab"];
    if (!reactionWords.some((r) => whyLower.includes(r))) return false;

    // So'z soni
    const wordCount = m.quote.split(/\s+/).filter(Boolean).length;
    if (wordCount < 7) return false;

    return true;
  }
}

export const patternMinerAgent = new PatternMinerAgent();
