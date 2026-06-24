/**
 * Lead Journey Timeline (B2-3)
 *
 * Bitta lead (mijoz) uchun barcha qo'ng'iroqlar tarixi + AI xulosa:
 *  - Qo'ng'iroqlar timeline (sana, menejer, davomiyligi, score, qisqa summary)
 *  - Sentiment trajectory (B2-8)
 *  - AI xulosa: mijoz nima xohlaydi, asosiy e'tirozlar, hozirgi holat, keyingi harakat
 */

import { prisma } from "../utils/prisma";
import { VertexAI } from "@google-cloud/vertexai";

export interface JourneyCall {
  audioFileId: string;
  callDate: string | null;
  managerName: string | null;
  duration: number | null;
  category: string;
  status: string;
  isSale: boolean;
  score: number | null;
  summary: string | null;
  leadQuality: string | null;
  requiresFollowup: boolean;
  followupCompleted: boolean;
  followupReason: string | null;
  followupPhrase: string | null;
  topObjections: Array<{ type: string; count: number }>;
  topErrors: Array<{ type: string }>;
  leadHeatScore: number | null;
  dealRiskScore: number | null;
  sentiment: "positive" | "neutral" | "negative";
}

export interface LeadJourneyData {
  leadId: number;
  clientPhone: string | null;
  companyId: string;
  currentStatusName: string | null;
  pipelineName: string | null;
  leadCreatedAt: string | null;
  saleClosedAt: string | null;
  isSale: boolean;
  saleAmount: number | null;
  totalCalls: number;
  firstCallAt: string | null;
  lastCallAt: string | null;
  daysSinceLast: number;
  calls: JourneyCall[];
  sentimentTrajectory: "improving" | "stable" | "declining";
  avgScoreTrend: number[];           // oxirgi 10 ta score
  topObjections: Array<{ type: string; count: number }>;
  aiSummary: {
    whatClientWants: string;
    mainObjections: string[];
    currentStatus: string;
    nextAction: string;
    riskLevel: "low" | "medium" | "high";
  };
}

export async function getLeadJourney(
  companyId: string,
  leadId: number
): Promise<LeadJourneyData | null> {
  const files = await prisma.audioFile.findMany({
    where: { companyId, leadId },
    orderBy: { callDate: "asc" },
    include: {
      manager: { select: { name: true } },
      analysis: {
        select: {
          overallScore: true,
          summary: true,
          leadQuality: true,
          objections: true,
          errors: true,
          requiresFollowup: true,
          followupCompleted: true,
          followupReason: true,
          followupPhrase: true,
          leadHeatScore: true,
          coachingInsights: true,
        },
      },
    },
  });

  if (files.length === 0) return null;

  const first = files[0];
  const last = files[files.length - 1];

  const now = new Date();
  const lastDate = last.callDate || last.createdAt;
  const daysSinceLast = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));

  // Har qo'ng'iroqdan sentiment
  const calls: JourneyCall[] = files.map((f) => {
    const a = f.analysis;
    const objs = (a?.objections as Array<{ type: string; count: number }>) || [];
    const errs = (a?.errors as Array<{ type: string }>) || [];
    const ci = a?.coachingInsights as Record<string, any> | null;
    const dealRisk = ci?.dealRiskScore ?? null;

    // Sentiment heuristic: score + quality
    let sentiment: "positive" | "neutral" | "negative" = "neutral";
    const score = a?.overallScore ?? 0;
    if (score >= 75 || a?.leadQuality === "issiq") sentiment = "positive";
    else if (score < 50 || a?.leadQuality === "sovuq") sentiment = "negative";

    return {
      audioFileId: f.id,
      callDate: (f.callDate || f.createdAt).toISOString(),
      managerName: f.manager?.name || null,
      duration: f.duration,
      category: f.category,
      status: f.status,
      isSale: f.isSale || false,
      score: a?.overallScore ?? null,
      summary: a?.summary?.slice(0, 300) || null,
      leadQuality: a?.leadQuality ?? null,
      requiresFollowup: a?.requiresFollowup || false,
      followupCompleted: a?.followupCompleted || false,
      followupReason: a?.followupReason || null,
      followupPhrase: a?.followupPhrase || null,
      topObjections: objs.slice(0, 3),
      topErrors: errs.slice(0, 3).map((e) => ({ type: e.type })),
      leadHeatScore: a?.leadHeatScore ?? null,
      dealRiskScore: dealRisk,
      sentiment,
    };
  });

  // Sentiment trajectory
  const scores = calls.map((c) => c.score).filter((s): s is number => typeof s === "number");
  let trajectory: "improving" | "stable" | "declining" = "stable";
  if (scores.length >= 2) {
    const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
    const secondHalf = scores.slice(Math.ceil(scores.length / 2));
    const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    if (avg2 - avg1 > 10) trajectory = "improving";
    else if (avg1 - avg2 > 10) trajectory = "declining";
  }

  // Top objections across all calls
  const objectionAcc: Record<string, number> = {};
  for (const c of calls) {
    for (const o of c.topObjections) {
      objectionAcc[o.type] = (objectionAcc[o.type] || 0) + o.count;
    }
  }
  const topObjections = Object.entries(objectionAcc)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // AI summary
  const aiSummary = await buildAiSummary(calls, topObjections, trajectory, first.isSale || false);

  return {
    leadId,
    clientPhone: last.phoneNumber,
    companyId,
    currentStatusName: last.statusName,
    pipelineName: last.pipelineName,
    leadCreatedAt: last.leadCreatedAt?.toISOString() || null,
    saleClosedAt: last.saleClosedAt?.toISOString() || null,
    isSale: files.some((f) => f.isSale),
    saleAmount: files.find((f) => f.saleAmount && f.saleAmount > 0)?.saleAmount || null,
    totalCalls: files.length,
    firstCallAt: (first.callDate || first.createdAt).toISOString(),
    lastCallAt: lastDate.toISOString(),
    daysSinceLast,
    calls,
    sentimentTrajectory: trajectory,
    avgScoreTrend: scores.slice(-10),
    topObjections,
    aiSummary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI summary generator (Gemini Flash — cheap)
// ─────────────────────────────────────────────────────────────────────────────

async function buildAiSummary(
  calls: JourneyCall[],
  topObjections: Array<{ type: string; count: number }>,
  trajectory: "improving" | "stable" | "declining",
  isSale: boolean
): Promise<LeadJourneyData["aiSummary"]> {
  // Heuristic fallback
  const fallback: LeadJourneyData["aiSummary"] = {
    whatClientWants: isSale ? "Sotib oldi" : "Aniq emas — yana ma'lumot kerak",
    mainObjections: topObjections.map((o) => o.type),
    currentStatus: isSale
      ? "Sotuv yopildi"
      : trajectory === "declining"
      ? "Sovib bormoqda — tezkor aralashuv kerak"
      : trajectory === "improving"
      ? "Qiziqish ortmoqda — davom eting"
      : "Aktiv muloqot",
    nextAction: isSale
      ? "Follow-up va qayta sotuv"
      : calls.some((c) => c.requiresFollowup && !c.followupCompleted)
      ? "Vaqti o'tgan follow-up qilinsin"
      : "Keyingi aniq qadamni belgilang",
    riskLevel: trajectory === "declining" ? "high" : trajectory === "stable" ? "medium" : "low",
  };

  try {
    const vertexAi = new VertexAI({
      project: process.env.VERTEX_PROJECT || "big-quanta-469517-h6",
      location: process.env.VERTEX_LOCATION || "global",
    });
    const model = vertexAi.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: { temperature: 0, maxOutputTokens: 800, responseMimeType: "application/json" },
    });

    const callsDigest = calls
      .slice(-10) // oxirgi 10 ta
      .map((c, i) => {
        const date = c.callDate ? new Date(c.callDate).toISOString().slice(0, 10) : "—";
        const obj = c.topObjections.map((o) => o.type).join(",") || "—";
        return `${i + 1}. ${date} | score=${c.score || "?"} | ${c.leadQuality || "—"} | e'tirozlar: ${obj} | ${(c.summary || "").slice(0, 120)}`;
      })
      .join("\n");

    const prompt = `Mijoz bilan ${calls.length} ta qo'ng'iroq bo'ldi. Oxirgi 10 tasini tahlil qil.

QONG'IROQLAR TARIXI:
${callsDigest}

TRAJECTORY: ${trajectory}
ASOSIY E'TIROZLAR: ${topObjections.map((o) => `${o.type}(${o.count})`).join(", ")}
SOTILDIMI: ${isSale ? "HA" : "YO'Q"}

JSON format:
{
  "whatClientWants": "Mijoz nimani xohlaydi (bir jumla)",
  "mainObjections": ["e'tiroz 1", "e'tiroz 2"],
  "currentStatus": "Hozirgi holat (bir jumla, aniq)",
  "nextAction": "Keyingi aniq harakat (imperativ: 'Bog'laning', 'Taklif qiling', 'Yakunlang')",
  "riskLevel": "low | medium | high"
}

QOIDALAR:
- Faqat yuqoridagi ma'lumotlardan foydalan
- nextAction — aniq, harakatga chaqiruvchi, 1-2 jumla
- riskLevel: sotilmagan + 10+ kun jim = high, 5-10 kun = medium, faol = low`;

    const r = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
    const text = r.response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        whatClientWants: parsed.whatClientWants || fallback.whatClientWants,
        mainObjections: Array.isArray(parsed.mainObjections) ? parsed.mainObjections : fallback.mainObjections,
        currentStatus: parsed.currentStatus || fallback.currentStatus,
        nextAction: parsed.nextAction || fallback.nextAction,
        riskLevel: ["low", "medium", "high"].includes(parsed.riskLevel) ? parsed.riskLevel : fallback.riskLevel,
      };
    }
  } catch (err) {
    console.error("[LeadJourney] AI summary xato:", (err as Error).message);
  }

  return fallback;
}
