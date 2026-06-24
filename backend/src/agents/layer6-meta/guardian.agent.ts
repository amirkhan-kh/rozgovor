/**
 * Guardian Agent — Layer 6: Meta / Supervisor
 *
 * Maqsad: Boshqa agentlarni nazorat qilish. Ularning javoblarini tekshirish,
 * nosozliklarni topish, avtomatik qayta ishlatish va dasturchiga ogohlantirish.
 *
 * Asosiy vazifalar:
 * 1. Post-analysis validation — har bir Analysis yozuvini tekshiradi:
 *      - 21 ta kutilgan maydon mavjudmi
 *      - fallback qiymatlari bormi (questionQualityScore=50 + 0/0)
 *      - JSON strukturasi to'g'rimi
 * 2. Agent health check — jamoa bo'yicha statistika:
 *      - Fallback foizi
 *      - Error rate (so'nggi 24 soat)
 *      - Trend (vaqt bo'yicha)
 * 3. Telegram alerts — dasturchiga (@dev_st200) xabar:
 *      - Yangi crash/xato
 *      - Fallback foizi chegaradan oshsa
 *      - Tuzatish zarur bo'lsa (manual)
 * 4. Auto-remediation — ma'lum muammo turlari uchun avtomatik qayta tahlil
 *      - Truncated JSON → Flash bilan yo'qolgan qismni so'rash
 *      - Failed sync → qayta trigger
 *
 * Model: gemini-2.5-flash (tezkor, arzon — tejash uchun)
 * Ritm: Har batch tugaganda + har soatda cron orqali
 */

import { GoogleGenAI } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";

const GUARDIAN_MODEL = "gemini-2.5-flash";

// Dasturchi Telegram ID (env orqali sozlanadi; default esa yo'q bo'ladi)
const DEV_ALERT_CHAT_ID = process.env.DEV_ALERT_CHAT_ID || "";
const DEV_ALERT_HANDLE = process.env.DEV_ALERT_HANDLE || "@dev_st200";

// Alert qachon yuboriladi:
const FALLBACK_ALERT_THRESHOLD_PCT = 5; // >5% fallback → alert
const ERROR_ALERT_THRESHOLD_PCT = 2; // >2% error → alert
const MIN_SAMPLE_SIZE = 10; // Kamida 10 ta analiz bo'lsin statistika uchun

interface HealthReport {
  totalAnalyses: number;
  fallbackQuestions: number;
  missingCallStructure: number;
  missingVoc: number;
  recentErrors: number; // so'nggi 24 soat
  fallbackPct: number;
  problems: Problem[];
  severity: "ok" | "warning" | "critical";
  summary: string;
}

interface Problem {
  kind: "truncation" | "missing_field" | "crash" | "sync_failure" | "other";
  severity: "low" | "medium" | "high" | "critical";
  count: number;
  description: string;
  affectedIds?: string[];
  fixable: boolean; // auto-remediate mumkinmi
}

export class GuardianAgent extends BaseAgent<{ companyId: string }, HealthReport> {
  readonly metadata: AgentMetadata = {
    id: "guardian",
    name: "Guardian Agent",
    layer: "layer5-advanced",
    version: "1.0.0",
    description: "Boshqa agentlarni nazorat qiladi — nosozliklarni topadi va tuzatadi",
    model: GUARDIAN_MODEL,
  };

  private client = new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT_ID || "big-quanta-469517-h6",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });

  protected async run(
    input: { companyId: string },
    _ctx: AgentContext,
  ): Promise<HealthReport> {
    const { companyId } = input;
    const report = await this.collectHealthReport(companyId);

    // AI xulosasini qo'shamiz (ixtiyoriy, faqat problem bo'lsa)
    if (report.problems.length > 0) {
      try {
        report.summary = await this.generateAiSummary(report);
      } catch (e: any) {
        this.logger.warn(`[Guardian] AI summary xato: ${e.message}`);
      }
    }

    // Alert yuborish
    if (report.severity !== "ok") {
      await this.sendAlert(report);
    }

    // Auto-remediation (fixable problemlar uchun)
    for (const p of report.problems) {
      if (p.fixable && p.affectedIds && p.affectedIds.length > 0) {
        await this.triggerAutoFix(p);
      }
    }

    return report;
  }

  /** Asosiy check — DB'dan statistika yig'adi */
  private async collectHealthReport(companyId: string): Promise<HealthReport> {
    // Faqat shu kompaniyaning AudioFile'larini tekshiramiz
    const totalResult = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS count FROM "Analysis" a
       JOIN "AudioFile" f ON f.id = a."audioFileId"
       WHERE f."companyId" = $1`,
      companyId,
    );
    const total = Number(totalResult[0]?.count || 0);

    // Fallback signature
    const fallbackResult = await prisma.$queryRawUnsafe<
      { id: string }[]
    >(
      `SELECT a.id FROM "Analysis" a
       JOIN "AudioFile" f ON f.id = a."audioFileId"
       WHERE f."companyId" = $1
         AND (a.questions->>'questionQualityScore')::int = 50
         AND (a.questions->>'managerTotal')::int = 0
         AND (a.questions->>'clientTotal')::int = 0`,
      companyId,
    );
    const fallbackIds = fallbackResult.map((r) => r.id);

    // Missing callStructure
    const callStructMissing = await prisma.$queryRawUnsafe<
      { id: string }[]
    >(
      `SELECT a.id FROM "Analysis" a
       JOIN "AudioFile" f ON f.id = a."audioFileId"
       WHERE f."companyId" = $1 AND a."callStructure" IS NULL`,
      companyId,
    );

    // Missing VoC
    const vocMissing = await prisma.$queryRawUnsafe<
      { id: string }[]
    >(
      `SELECT a.id FROM "Analysis" a
       JOIN "AudioFile" f ON f.id = a."audioFileId"
       WHERE f."companyId" = $1 AND a."voiceOfCustomer" IS NULL`,
      companyId,
    );

    // So'nggi 24 soat "error" statusli audio
    const recentErrorResult = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(
      `SELECT COUNT(*) AS count FROM "AudioFile"
       WHERE "companyId" = $1 AND status = 'error'
         AND "createdAt" > NOW() - INTERVAL '24 hours'`,
      companyId,
    );
    const recentErrors = Number(recentErrorResult[0]?.count || 0);

    const fallbackPct = total >= MIN_SAMPLE_SIZE ? (fallbackIds.length / total) * 100 : 0;
    const errorPct = recentErrors > 0 && total > 0 ? (recentErrors / total) * 100 : 0;

    const problems: Problem[] = [];

    if (fallbackIds.length > 0 && fallbackPct > FALLBACK_ALERT_THRESHOLD_PCT) {
      problems.push({
        kind: "truncation",
        severity: fallbackPct > 15 ? "critical" : fallbackPct > 10 ? "high" : "medium",
        count: fallbackIds.length,
        description: `${fallbackIds.length} ta analizda questions fallback (maxOutputTokens cheklovi sababli truncated)`,
        affectedIds: fallbackIds.slice(0, 100), // top 100 — auto-fix uchun
        fixable: true,
      });
    }

    if (callStructMissing.length > 5) {
      problems.push({
        kind: "missing_field",
        severity: "medium",
        count: callStructMissing.length,
        description: `${callStructMissing.length} ta analizda callStructure yo'q`,
        affectedIds: callStructMissing.map((r) => r.id).slice(0, 50),
        fixable: true,
      });
    }

    if (vocMissing.length > 5) {
      problems.push({
        kind: "missing_field",
        severity: "low",
        count: vocMissing.length,
        description: `${vocMissing.length} ta analizda voiceOfCustomer yo'q`,
        affectedIds: vocMissing.map((r) => r.id).slice(0, 50),
        fixable: true,
      });
    }

    if (errorPct > ERROR_ALERT_THRESHOLD_PCT && recentErrors > 2) {
      problems.push({
        kind: "crash",
        severity: errorPct > 10 ? "critical" : "high",
        count: recentErrors,
        description: `So'nggi 24 soatda ${recentErrors} ta audio 'error' statusida (${errorPct.toFixed(1)}%)`,
        fixable: true,
      });
    }

    const severity: HealthReport["severity"] = problems.some((p) => p.severity === "critical")
      ? "critical"
      : problems.some((p) => p.severity === "high" || p.severity === "medium")
      ? "warning"
      : "ok";

    return {
      totalAnalyses: total,
      fallbackQuestions: fallbackIds.length,
      missingCallStructure: callStructMissing.length,
      missingVoc: vocMissing.length,
      recentErrors,
      fallbackPct: Math.round(fallbackPct * 10) / 10,
      problems,
      severity,
      summary: "",
    };
  }

  /** AI qo'shimcha xulosa yozadi (Flash model) */
  private async generateAiSummary(report: HealthReport): Promise<string> {
    const prompt = `Sen SalesAI loyihasining "Guardian" nazoratchi agentsan. Quyidagi jamoa health reportini 2-3 jumla qilib, dasturchi uchun tushunarli Telegram xabariga qisqa xulosa yoz. O'zbek tilida, aniq va harakatga undovchi.

Total: ${report.totalAnalyses}
Fallback savollar: ${report.fallbackQuestions} (${report.fallbackPct}%)
CallStructure yo'q: ${report.missingCallStructure}
So'nggi 24h error: ${report.recentErrors}
Muammolar:
${report.problems.map((p) => `- [${p.severity}] ${p.description}`).join("\n")}

Javob faqat matn (markdown bo'lmasin, emoji minimal).`;

    const response = await this.client.models.generateContent({
      model: GUARDIAN_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });
    return (response.text || "").trim();
  }

  /** Telegram alert yuborish — telegram.ts ichidagi bot orqali */
  private async sendAlert(report: HealthReport): Promise<void> {
    if (!DEV_ALERT_CHAT_ID) {
      this.logger.warn(
        `[Guardian] DEV_ALERT_CHAT_ID sozlanmagan — alert yuborilmaydi. Severity: ${report.severity}`,
      );
      return;
    }

    const emoji = report.severity === "critical" ? "🚨" : report.severity === "warning" ? "⚠️" : "ℹ️";
    const header = `${emoji} Guardian Alert — ${report.severity.toUpperCase()}`;
    const stats = `📊 Jami analizlar: ${report.totalAnalyses}\n` +
      `❌ Fallback savollar: ${report.fallbackQuestions} (${report.fallbackPct}%)\n` +
      `🔴 So'nggi 24h error: ${report.recentErrors}`;
    const problemList = report.problems
      .map((p) => `• [${p.severity}] ${p.description}${p.fixable ? " — auto-fix triggered" : ""}`)
      .join("\n");
    const footer = `\n${DEV_ALERT_HANDLE} iltimos tekshiring.`;

    const message = `${header}\n\n${stats}\n\n${problemList}${report.summary ? `\n\n💭 ${report.summary}` : ""}${footer}`;

    // Dynamic import to avoid circular deps
    try {
      const { sendRawMessage } = await import("../../services/telegram");
      await sendRawMessage(DEV_ALERT_CHAT_ID, message);
    } catch (e: any) {
      this.logger.error(`[Guardian] Telegram send failed: ${e.message}`);
    }
  }

  /**
   * Auto-fix O'CHIRILGAN — Vertex quota tejaladi.
   * Endi xatolar qo'lda Audio Detail sahifasida "Qayta tahlil qilish" orqali tuzatiladi.
   */
  private async triggerAutoFix(problem: Problem): Promise<void> {
    this.logger.info(
      `[Guardian] Auto-fix O'CHIRILGAN. ${problem.kind}: ${problem.count} ta yozuv — qo'lda tuzatish kerak`,
    );
  }

  /**
   * Fallback `questions` yozuvlari uchun Flash batch job yaratish.
   * Kichik prompt + kichik output — arzon va tez.
   */
  private async submitQuestionsBatch(analysisIds: string[]): Promise<string | null> {
    const { Storage } = await import("@google-cloud/storage");
    const aip = await import("@google-cloud/aiplatform");
    const { JobServiceClient } = (aip as any).v1;

    const bucketName = process.env.VERTEX_BUCKET || "big-quanta-469517-h6-salesai-stt";
    const projectId = process.env.VERTEX_PROJECT_ID || "big-quanta-469517-h6";
    const location = process.env.VERTEX_LOCATION || "us-central1";

    const jobClient = new JobServiceClient({
      apiEndpoint: `${location}-aiplatform.googleapis.com`,
    });
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    // Transkripsiyalar bilan
    const records = await prisma.analysis.findMany({
      where: { id: { in: analysisIds } },
      select: {
        audioFileId: true,
        audioFile: { select: { transcription: true } },
      },
    });
    const withTrans = records.filter((r) => r.audioFile?.transcription);
    if (withTrans.length === 0) return null;

    const SYSTEM_INSTRUCTION = `Sen professional o'zbek sotuv tahlilchisan. MUHIM QOIDALAR:
1. Javob FAQAT toza JSON — hech qanday kirish matni yo'q
2. Markdown fence ishlatma — faqat { bilan boshla, } bilan tugat`;

    const buildPrompt = (transcription: string) => `Quyidagi sotuv suhbat transkriptida FAQAT savollar tahlilini qaytar.

TRANSKRIPT:
${transcription}

JSON format (SOPRANO — 7 bosqichli kashfiyot texnikasi):
{
  "managerTotal": <jami menejer savollari>,
  "clientTotal": <jami mijoz savollari>,
  "openCount": <menejer ochiq savollari>,
  "closedCount": <menejer yopiq savollari>,
  "sopranoBreakdown": {
    "situation": 0,     // S — Vaziyat savollari (mijozning hozirgi holati)
    "objective": 0,     // O — Maqsad (mijoz nimaga erishmoqchi)
    "problem": 0,       // P — Muammo (mijoz qanday qiyinchilikda)
    "resources": 0,     // R — Resurslar (budjet, vaqt, imkoniyat)
    "alternatives": 0,  // A — Muqobillar (boshqa qanday variantlar ko'rilgan)
    "need": 0,          // N — Ehtiyoj (aniq nima kerak)
    "outcome": 0        // O — Natija (qaror qabul qilish, keyingi qadam)
  },
  "topManagerQuestions": [{"question": "...", "type": "open|closed", "category": "situation|objective|problem|resources|alternatives|need|outcome|other", "timestamp": "MM:SS"}],
  "topClientQuestions": [{"question": "...", "timestamp": "MM:SS"}],
  "questionQualityScore": <0-100>
}

- managerTotal = openCount + closedCount
- topManagerQuestions max 5, topClientQuestions max 3`;

    const requests = withTrans.map((r) => ({
      request: {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `[AUDIO_ID: ${r.audioFileId}]\n\n${buildPrompt(r.audioFile!.transcription!)}`,
              },
            ],
          },
        ],
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      },
    }));

    const jsonl = requests.map((r) => JSON.stringify(r)).join("\n");
    const timestamp = Date.now();
    const inputFile = `guardian/q-input-${timestamp}.jsonl`;
    const outputPrefix = `guardian/q-output-${timestamp}/`;

    await bucket.file(inputFile).save(jsonl);

    const [createdJob] = await jobClient.createBatchPredictionJob({
      parent: `projects/${projectId}/locations/${location}`,
      batchPredictionJob: {
        displayName: `guardian-questions-${timestamp}`,
        model: "publishers/google/models/gemini-2.5-flash",
        inputConfig: {
          instancesFormat: "jsonl",
          gcsSource: { uris: [`gs://${bucketName}/${inputFile}`] },
        },
        outputConfig: {
          predictionsFormat: "jsonl",
          gcsDestination: { outputUriPrefix: `gs://${bucketName}/${outputPrefix}` },
        },
      },
    });

    return createdJob.name || null;
  }

  /**
   * Flash batch jobni polling qiladi va natijalarni DB'ga saqlaydi.
   * Fon rejimida ishlaydi — agent run() blokirlanmaydi.
   */
  private async pollAndSaveQuestionsBatch(jobName: string): Promise<void> {
    const { Storage } = await import("@google-cloud/storage");
    const aip = await import("@google-cloud/aiplatform");
    const { JobServiceClient } = (aip as any).v1;
    const { safeParseJson } = await import("../../utils/json-repair");

    const bucketName = process.env.VERTEX_BUCKET || "big-quanta-469517-h6-salesai-stt";
    const location = process.env.VERTEX_LOCATION || "us-central1";

    const jobClient = new JobServiceClient({
      apiEndpoint: `${location}-aiplatform.googleapis.com`,
    });
    const storage = new Storage();
    const bucket = storage.bucket(bucketName);

    // Poll
    let job: any;
    let lastState = "";
    const maxWait = 60 * 60 * 1000; // 1 soat max
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, 30000));
      [job] = await jobClient.getBatchPredictionJob({ name: jobName });
      if (job.state !== lastState) {
        this.logger.info(`[Guardian batch] ${jobName.slice(-8)}: ${job.state}`);
        lastState = job.state;
      }
      if (job.state === "JOB_STATE_SUCCEEDED") break;
      if (job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED") {
        this.logger.error(`[Guardian batch] FAILED: ${JSON.stringify(job.error)}`);
        return;
      }
    }

    if (job.state !== "JOB_STATE_SUCCEEDED") {
      this.logger.error(`[Guardian batch] Timeout waiting for ${jobName}`);
      return;
    }

    // Download + save
    const outputDir = job.outputInfo?.gcsOutputDirectory;
    if (!outputDir) return;
    const prefix = outputDir.replace(`gs://${bucketName}/`, "");
    await new Promise((r) => setTimeout(r, 2000));
    const [files] = await bucket.getFiles({ prefix });
    const predFile = files.find((f: any) => f.name.includes("predictions"));
    if (!predFile) return;

    const [content] = await predFile.download();
    const lines = content.toString().split("\n").filter((l: string) => l.trim());

    let saved = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const rawText =
          parsed.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
          parsed.response?.text ||
          "";
        if (!rawText) continue;

        const reqText = parsed.request?.contents?.[0]?.parts?.[0]?.text || "";
        const m1 = rawText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
        const m2 = reqText.match(/\[AUDIO_ID:\s*([a-z0-9]+)\]/);
        const audioId = (m1 && m1[1]) || (m2 && m2[1]);
        if (!audioId) continue;

        const qdata: any = safeParseJson(rawText);
        if (!qdata || typeof qdata.managerTotal !== "number") continue;

        await prisma.analysis.update({
          where: { audioFileId: audioId },
          data: {
            questionsData: {
              managerTotal: Number(qdata.managerTotal) || 0,
              clientTotal: Number(qdata.clientTotal) || 0,
              openCount: Number(qdata.openCount) || 0,
              closedCount: Number(qdata.closedCount) || 0,
              sopranoBreakdown: {
                situation: Number(qdata.sopranoBreakdown?.situation) || 0,
                objective: Number(qdata.sopranoBreakdown?.objective) || 0,
                problem: Number(qdata.sopranoBreakdown?.problem) || 0,
                resources: Number(qdata.sopranoBreakdown?.resources) || 0,
                alternatives: Number(qdata.sopranoBreakdown?.alternatives) || 0,
                need: Number(qdata.sopranoBreakdown?.need) || 0,
                outcome: Number(qdata.sopranoBreakdown?.outcome) || 0,
              },
              topManagerQuestions: Array.isArray(qdata.topManagerQuestions)
                ? qdata.topManagerQuestions.slice(0, 5)
                : [],
              topClientQuestions: Array.isArray(qdata.topClientQuestions)
                ? qdata.topClientQuestions.slice(0, 3)
                : [],
              questionQualityScore: Number(qdata.questionQualityScore) || 0,
            },
          },
        });
        saved++;
      } catch {
        // continue
      }
    }
    this.logger.info(`[Guardian batch] Saved ${saved}/${lines.length}`);
  }
}

export const guardianAgent = new GuardianAgent();
