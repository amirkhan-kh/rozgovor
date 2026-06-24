/**
 * Strategist Agent — Layer 3: Intelligence ⭐
 *
 * Maqsad: Har menejer uchun HAFTALIK strategik reja yaratish. Bu ekotizimning
 * eng muhim qismi — reaktiv coaching emas, proaktiv rivojlanish yo'li.
 *
 * Nima qiladi:
 * 1. Menejerning oxirgi 30 kunlik tahlilini oladi (CleanedAnalysis'dan)
 * 2. Benchmark agent'dan jamoa statistikasini oladi
 * 3. Pattern Miner'dan golden moments
 * 4. Progress'dan o'tgan haftalardagi o'sish
 * 5. Top performer playbook'ni jamoadan oladi
 * 6. Gemini Pro'ga barchasini yuboradi va AYNIQ 1 ta diqqat joyini tanlashni
 *    so'raydi + haftalik maqsadlar + amaliy mashqlar
 * 7. `WeeklyStrategy` jadvaliga saqlaydi
 *
 * Ritm: Har dushanba 08:00 (Scheduler orqali barcha menejerlar uchun)
 * Review: Juma kuni Progress Agent reviewResult ni to'ldiradi
 * Model: Gemini 2.5 Pro (reasoning kuchli)
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { safeParseJson } from "../../utils/json-repair";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";
import { benchmarkAgent } from "./benchmark.agent";

const STRATEGIST_MODEL = "gemini-2.5-pro";

interface StrategistInput {
  managerId: string;
  companyId: string;
  weekOf?: Date; // odatda dushanba sanasi; berilmasa bu haftaning dushanbasi
}

interface WeeklyGoal {
  goal: string;
  target: string;
  measure: string;
  technique: string;
  example: string;
}

interface PracticeExercise {
  scenarioId: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
}

interface FocusArea {
  priority: 1 | 2 | 3;
  area: string; // "E'tirozga javob (Looping)"
  reason: string; // dalillar bilan
  weeklyGoals: WeeklyGoal[];
  practiceExercises: PracticeExercise[];
}

interface StrategistOutput {
  managerId: string;
  weekOf: Date;
  // ⭐ Eski bitta focusArea o'rniga 3 ta prioritized focus areas
  focusAreas: FocusArea[];
  // Eski interfeys bilan backward compatibility (1-darajali focus area'ni ochib ko'rsatadi)
  focusArea: string;
  reason: string;
  weeklyGoals: WeeklyGoal[];
  practiceExercises: PracticeExercise[];
  strategyId: string;
}

export class StrategistAgent extends BaseAgent<StrategistInput, StrategistOutput> {
  readonly metadata: AgentMetadata = {
    id: "strategist",
    name: "Strategist Agent",
    layer: "layer3-intelligence",
    version: "1.0.0",
    description:
      "Har menejer uchun haftalik strategik reja tuzadi — bitta aniq diqqat joyi va amaliy mashqlar bilan",
    model: STRATEGIST_MODEL,
    dependencies: ["benchmark", "pattern-miner", "validator"],
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

  protected async run(input: StrategistInput, ctx: AgentContext): Promise<StrategistOutput> {
    const weekOf = input.weekOf ?? this.getMondayOfWeek(new Date());

    // ─── 1. Benchmark (jamoa statistikasi) ──────────────────────────
    const benchmarkResult = await benchmarkAgent.execute(
      { companyId: input.companyId },
      ctx,
    );
    if (!benchmarkResult.success || !benchmarkResult.data) {
      throw new Error("Benchmark agent failed: " + benchmarkResult.error);
    }
    const benchmark = benchmarkResult.data;

    const managerPercentile = benchmark.managerPercentiles.find(
      (m) => m.managerId === input.managerId,
    );
    if (!managerPercentile) {
      throw new Error(`Manager ${input.managerId} not found in benchmark`);
    }

    // ─── 2. Menejer tahlil tarixi (30 kun, Cleaned afzal) ───────────
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const analyses = await prisma.analysis.findMany({
      where: {
        audioFile: { managerId: input.managerId, companyId: input.companyId },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        overallScore: true,
        criteria: true,
        errors: true,
        coachingInsights: true,
        cleanedAnalysis: {
          select: { cleanedErrors: true, cleanedMoments: true, confidenceScore: true },
        },
      },
    });

    if (analyses.length === 0) {
      throw new Error(`No analyses found for manager ${input.managerId}`);
    }

    // Xatolarni yig'ish (Cleaned afzal)
    const errorCounts: Record<string, number> = {};
    for (const a of analyses) {
      const errs = a.cleanedAnalysis
        ? ((a.cleanedAnalysis.cleanedErrors as Array<{ type: string }>) || [])
        : ((a.errors as Array<{ type: string }>) || []);
      for (const e of errs) {
        errorCounts[e.type] = (errorCounts[e.type] || 0) + 1;
      }
    }

    // ─── 3. Golden Moments ──────────────────────────────────────────
    const goldenMoments = await prisma.goldenMoment.findMany({
      where: { managerId: input.managerId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { timestamp: true, technique: true, quote: true, whyItWorked: true },
    });

    // ─── 4. Oxirgi haftalar progress ────────────────────────────────
    const progressHistory = await prisma.managerProgress.findMany({
      where: { managerId: input.managerId },
      orderBy: { snapshotDate: "desc" },
      take: 4,
    });

    // ─── 5. Top performer playbook ──────────────────────────────────
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { topPerformerPlaybook: true },
    });
    const playbook = (company?.topPerformerPlaybook as any) || {};

    // ─── 6. Gemini Pro'ga yuborish ──────────────────────────────────
    const prompt = this.buildPrompt({
      managerName: managerPercentile.managerName,
      managerStats: managerPercentile,
      benchmark,
      errorCounts,
      goldenMoments,
      progressHistory,
      playbook,
      weekOf,
    });

    const response = await this.client.models.generateContent({
      model: STRATEGIST_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    const raw = response.text || "";
    const parsed = this.safeParse(raw);
    if (!parsed || !Array.isArray(parsed.focusAreas) || parsed.focusAreas.length === 0) {
      throw new Error("Strategist returned invalid JSON (focusAreas missing)");
    }

    // 3 ta prioritized focus area ni parsing qilamiz
    const focusAreas: FocusArea[] = (parsed.focusAreas as any[])
      .slice(0, 3)
      .map((fa: any, idx: number) => ({
        priority: (idx + 1) as 1 | 2 | 3,
        area: String(fa.area || fa.name || ""),
        reason: String(fa.reason || ""),
        weeklyGoals: (Array.isArray(fa.weeklyGoals) ? fa.weeklyGoals : [])
          .slice(0, 4)
          .map((g: any) => ({
            goal: String(g.goal || ""),
            target: String(g.target || ""),
            measure: String(g.measure || ""),
            technique: String(g.technique || ""),
            example: String(g.example || ""),
          })),
        practiceExercises: (Array.isArray(fa.practiceExercises)
          ? fa.practiceExercises
          : []
        )
          .slice(0, 3)
          .map((p: any, i: number) => ({
            scenarioId: String(p.scenarioId || `auto-${idx}-${i}`),
            title: String(p.title || ""),
            difficulty: ["easy", "medium", "hard"].includes(p.difficulty)
              ? p.difficulty
              : "medium",
          })),
      }))
      .filter((fa) => fa.area && fa.reason);

    if (focusAreas.length === 0) {
      throw new Error("Strategist returned no valid focus areas");
    }

    // 1-daraja — backward compat uchun ochiq maydonlarga chiqariladi
    const primary = focusAreas[0];

    // ─── 7. DB ga saqlash ─────────────────────────────────────────────
    // `weeklyGoals` maydoniga `focusAreas` ro'yxatini qo'yamiz (Json),
    // eski `weeklyGoals` esa 1-darajali goals (flatten) bo'ladi
    // `focusArea`/`reason` — 1-darajali fokus (backward compat).
    const saved = await prisma.weeklyStrategy.upsert({
      where: {
        managerId_weekOf: {
          managerId: input.managerId,
          weekOf,
        },
      },
      create: {
        companyId: input.companyId,
        managerId: input.managerId,
        weekOf,
        focusArea: primary.area,
        reason: primary.reason,
        weeklyGoals: focusAreas as unknown as object, // to'liq 3 ta focus area
        practiceExercises: focusAreas.flatMap((f) => f.practiceExercises) as unknown as object,
        status: "active",
      },
      update: {
        focusArea: primary.area,
        reason: primary.reason,
        weeklyGoals: focusAreas as unknown as object,
        practiceExercises: focusAreas.flatMap((f) => f.practiceExercises) as unknown as object,
      },
    });

    this.logger.info(
      `[strategist] ${managerPercentile.managerName} (${input.managerId}): ${focusAreas.length} focus areas, primary="${primary.area}"`,
    );

    return {
      managerId: input.managerId,
      weekOf,
      focusAreas,
      focusArea: primary.area,
      reason: primary.reason,
      weeklyGoals: primary.weeklyGoals,
      practiceExercises: focusAreas.flatMap((f) => f.practiceExercises),
      strategyId: saved.id,
    };
  }

  private buildPrompt(ctx: {
    managerName: string;
    managerStats: { avgScore: number; conversionRate: number; rank: number; totalManagers: number; strongCriteria: string[]; weakCriteria: string[] };
    benchmark: { teamStats: { avgScore: number; avgConversion: number; surrenderRate: number; openEndingRate: number }; errorDistribution: Array<{ type: string; teamPercent: number; topPerformerHasIt: boolean }> };
    errorCounts: Record<string, number>;
    goldenMoments: Array<{ timestamp: string; technique: string; quote: string; whyItWorked: string }>;
    progressHistory: Array<{ snapshotDate: Date; avgScore: number; conversionRate: number }>;
    playbook: any;
    weekOf: Date;
  }): string {
    const { managerName, managerStats, benchmark, errorCounts, goldenMoments, progressHistory, playbook, weekOf } = ctx;

    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => {
        const teamData = benchmark.errorDistribution.find((e) => e.type === type);
        const teamInfo = teamData ? `jamoaning ${teamData.teamPercent}%` : "jamoa ma'lumoti yo'q";
        const eliteInfo = teamData?.topPerformerHasIt ? "ustozlarda ham bor" : "ustozlarda yo'q";
        return `- ${type}: ${count} marta (${teamInfo}, ${eliteInfo})`;
      })
      .join("\n");

    const goldenBlock = goldenMoments.length > 0
      ? goldenMoments.map((g, i) => `${i + 1}. [${g.timestamp}] ${g.technique}\n   "${g.quote}"\n   → ${g.whyItWorked}`).join("\n\n")
      : "(hali topilmadi)";

    const progressBlock = progressHistory.length > 0
      ? progressHistory.map((p) => `- ${p.snapshotDate.toISOString().slice(0, 10)}: ball=${p.avgScore}, konversiya=${p.conversionRate}%`).join("\n")
      : "(bu birinchi hafta)";

    const playbookBlock = this.formatPlaybook(playbook);

    return `Sen sotuv ekotizimining Bosh Strategi — har menejer uchun aniq, amaliy va BITTA asosiy diqqatli haftalik reja tuzasan.

MAQSAD: Shu menejerga bir hafta davomida nima qilishni aytib berish — umumiy maslahat emas, AYNIQ bitta diqqat joyi va amaliy qadamlar.

═══════════════════════════════════════════════════
MENEJER: ${managerName}
Hafta boshi: ${weekOf.toISOString().slice(0, 10)}
═══════════════════════════════════════════════════

📊 ATROF STATISTIKASI
- O'rtacha ball: ${managerStats.avgScore}/100 (jamoa: ${benchmark.teamStats.avgScore})
- Konversiya: ${managerStats.conversionRate}% (jamoa: ${benchmark.teamStats.avgConversion}%)
- Reyting: ${managerStats.rank}/${managerStats.totalManagers}
- Kuchli kriteriyalar: ${managerStats.strongCriteria.join(", ")}
- Zaif kriteriyalar: ${managerStats.weakCriteria.join(", ")}

Jamoa umumiy muammolari:
- Taslim bo'lish stavkasi: ${benchmark.teamStats.surrenderRate}%
- Ochiq yakun stavkasi: ${benchmark.teamStats.openEndingRate}%

🚨 ENG KO'P XATOLARI (30 kunda):
${topErrors || "(yo'q)"}

💪 ZO'R QILGAN DAQIQALARI (Pattern Miner):
${goldenBlock}

📈 O'TGAN HAFTALAR PROGRESSI:
${progressBlock}

🏆 USTOZLAR PLAYBOOK (shu kompaniyada):
${playbookBlock}

═══════════════════════════════════════════════════

VAZIFANG:

Menejer ma'lumot ko'pligidan charchamasligi uchun — MAJBURAN faqat 3 ta
eng ustuvor (prioritized) diqqat nuqtasini tanla. Ko'proq emas, kamroq emas.

EKOTIZIMDAGI 3 DARAJALI USTUVORLIK — menejer ko'rsatkichlariga qarab ulardan tanla:

1-daraja: E'tirozlarga javob (Looping) — agar surrenderedObjections yuqori bo'lsa
2-daraja: Ehtiyoj aniqlash (SOPRANO) — agar ehtiyoj aniqlanmagan xatolar ko'p bo'lsa
3-daraja: Yakunlash va callback (Close) — agar openEnding ko'p bo'lsa

Agar menejer 1-darajada juda zaif bo'lsa — uchala focus area ham shu atrofda
(Looping'ning turli ko'rinishlari) bo'lishi mumkin. Agar bir necha sohada zaif bo'lsa
— ularni priority bo'yicha aralashtir.

HAR FOCUS AREA UCHUN:
- "priority" (1 eng muhim, 3 qo'shimcha)
- "area" — qisqa nom (masalan: "E'tirozga javob — Looping")
- "reason" — nega aynan shu tanlandi (dalil: jamoa foizi, menejer xatolari, rank)
- "weeklyGoals": 2-3 ta aniq maqsad
  - goal, target, measure, technique, example (real iqtibos)
- "practiceExercises": 1-2 ta amaliy mashq (Trainer Agent keyin ishlatadi)
  - scenarioId, title, difficulty

JAVOB FORMATI (faqat JSON, hech qanday markdown yo'q):
{
  "focusAreas": [
    {
      "priority": 1,
      "area": "E'tirozga javob — Looping",
      "reason": "Jamoaning 58%i shu xatoni qiladi, siz 72%da — eng zaif joy. Davron esa 0%.",
      "weeklyGoals": [
        {
          "goal": "Har 'qimmat' e'tirozida Looping texnikasini qo'llash",
          "target": "10 urinishdan 7 tasi muvaffaqiyatli",
          "measure": "Har kuni avtomatik trekka tushadi",
          "technique": "Tonality Loop (Way of the Wolf, 215-bet)",
          "example": "Davron call_xyz [03:12]: 'Tushunaman, bu sizga qimmat tuyulyapti...'"
        }
      ],
      "practiceExercises": [
        {"scenarioId": "obj-price-01", "title": "Qimmat e'tirozi — Looping", "difficulty": "medium"}
      ]
    },
    {
      "priority": 2,
      "area": "Ehtiyoj aniqlash — SOPRANO savollari",
      "reason": "...",
      "weeklyGoals": [...],
      "practiceExercises": [...]
    },
    {
      "priority": 3,
      "area": "Yakunlash — aniq callback",
      "reason": "...",
      "weeklyGoals": [...],
      "practiceExercises": [...]
    }
  ]
}

Majburan aniq 3 ta focusAreas element qaytar. Hech qanday markdown yoki izoh qo'shma.`;
  }

  private formatPlaybook(playbook: any): string {
    if (!playbook) return "(playbook hali tayyor emas)";
    const parts: string[] = [];
    if (playbook.byConversion) {
      parts.push(
        `SIFAT USTASI: ${playbook.byConversion.managerName} (${playbook.byConversion.conversionRate}%)`,
      );
      const techs = (playbook.byConversion.techniques || []).slice(0, 2);
      for (const t of techs) {
        if (t.example) parts.push(`  • ${t.name}: "${t.example}"`);
      }
    }
    if (playbook.byVolume) {
      parts.push(`MIQDOR USTASI: ${playbook.byVolume.managerName}`);
    }
    return parts.join("\n") || "(playbook bo'sh)";
  }

  private getMondayOfWeek(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay(); // 0 yakshanba, 1 dushanba
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private safeParse(raw: string): any {
    return safeParseJson(raw);
  }
}

export const strategistAgent = new StrategistAgent();
