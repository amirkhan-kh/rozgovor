/**
 * Voice Exam Chat controller.
 *
 * Push-to-talk REST API:
 *   POST /api/voice-exam/start       → stsenariy tanlab session boshlash, AI ochilish jumlasi + TTS audio
 *   POST /api/voice-exam/:id/turn    → sotuvchi audio yuboradi → STT → Gemini → TTS → javob
 *   POST /api/voice-exam/:id/finish  → suhbatni yakunlash, Claude bilan baholash
 *   GET  /api/voice-exam/:id         → session natijasi
 *   GET  /api/voice-exam/scenarios   → mavjud stsenariylar ro'yxati
 *   GET  /api/voice-exam/history     → sotuvchining o'tgan imtihonlari
 */
import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { transcribeAudio } from "../services/voice-exam/stt";
import { speak, YandexVoice } from "../services/voice-exam/tts";
import {
  nextTurn,
  openingLine,
  ExamMessage,
} from "../services/voice-exam/conversation";
import { gradeExam, updateSalespersonStats } from "../services/voice-exam/grader";
import { autoPickExam } from "../services/voice-exam/auto-pick";

// Turn limiti yo'q — manager suhbatni qo'lda yakunlaydi. AI faqat vaziyatga qarab tabiiy yakunlashi mumkin.

function voiceForScenario(
  difficulty: string,
  gender?: "male" | "female" | null,
): { voice: YandexVoice; emotion: "neutral" | "good" | "evil" } {
  // Google Cloud TTS uz-UZ:
  //   female → uz-UZ-Standard-A
  //   male   → uz-UZ-Standard-B
  // Emotion (pitch/speakingRate) TTS modulining o'zi qayta ishlaydi.
  const emotion: "neutral" | "good" | "evil" =
    difficulty === "hard" ? "evil" : difficulty === "easy" ? "good" : "neutral";

  const voice: YandexVoice = gender === "female" ? "female" : "male";
  return { voice, emotion };
}

/**
 * GET /api/voice-exam/scenarios
 */
export async function listScenarios(req: Request, res: Response): Promise<void> {
  try {
    const scenarios = await prisma.examScenario.findMany({
      where: { companyId: req.companyId!, isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        difficulty: true,
        icon: true,
        category: true,
      },
    });
    success(res, scenarios);
  } catch (err: any) {
    console.error("[voice-exam] listScenarios:", err?.message);
    error(res, "Stsenariylarni olishda xatolik");
  }
}

/**
 * POST /api/voice-exam/start
 * Hech qanday body kerak emas. Admin tomonidan tayinlangan imtihonni boshlaydi.
 * Auth: manager (sotuvchi) — req.managerId
 */
export async function startExam(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.managerId;
    if (!managerId) { error(res, "Faqat sotuvchilar imtihon topshira oladi", 403); return; }

    // Tayinlangan imtihonni olish
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: {
        examEnabled: true,
        pendingExamScenarioId: true,
        pendingExamAge: true,
        pendingExamGender: true,
        pendingExamName: true,
        pendingExamMaxAttempts: true,
        pendingExamAttemptsUsed: true,
      },
    });
    if (!manager?.examEnabled) { error(res, "Imtihon sizga hali ochilmagan. Admin bilan bog'laning.", 403); return; }
    if (!manager.pendingExamScenarioId) {
      error(res, "Sizga imtihon tayinlanmagan. Rahbaringiz imtihon tayinlashini kuting.", 403);
      return;
    }
    if (manager.pendingExamAttemptsUsed >= manager.pendingExamMaxAttempts) {
      error(res, `Urinishlar tugadi (${manager.pendingExamMaxAttempts} marta). Admin yangi imtihon tayinlashi kerak.`, 403);
      return;
    }

    const age = manager.pendingExamAge ?? null;
    const gender = (manager.pendingExamGender === "male" || manager.pendingExamGender === "female")
      ? manager.pendingExamGender
      : null;
    const name = manager.pendingExamName ?? null;

    const scenario = await prisma.examScenario.findFirst({
      where: { id: manager.pendingExamScenarioId, companyId: req.companyId!, isActive: true },
    });
    if (!scenario) { error(res, "Stsenariy topilmadi yoki o'chirilgan", 404); return; }

    // Yangi mijoz (new_client) — sotuvchi boshlaydi (outbound call).
    // Boshqa stsenariylarda — AI mijoz boshlaydi.
    const managerStartsFirst = scenario.code === "new_client";
    const ts = Date.now();
    let messages: ExamMessage[] = [];
    let opening = "";
    let audioBase64 = "";

    if (!managerStartsFirst) {
      opening = await openingLine(
        scenario.systemPrompt,
        scenario.name,
        scenario.code,
        { age, gender, name },
        req.companyId!,
      );
      messages = [{ role: "client", text: opening, ts }];
    }

    // Session yaratamiz
    const session = await prisma.examSession.create({
      data: {
        salespersonId: managerId,
        companyId: req.companyId!,
        scenarioId: scenario.id,
        messages: messages as any,
        status: "active",
        clientAge: age,
        clientGender: gender,
        clientName: name,
      },
    });

    // Urinish counterini oshiramiz. Pending fieldlar finishExam'da
    // pass yoki max attempts bo'lganda tozalanadi (5 ta urinish flow uchun).
    await prisma.manager.update({
      where: { id: managerId },
      data: { pendingExamAttemptsUsed: { increment: 1 } },
    });

    // TTS faqat AI gapirgan paytda
    if (opening) {
      const { voice, emotion } = voiceForScenario(scenario.difficulty, gender);
      const { audio, cached } = await speak(opening, { voice, emotion });
      if (cached) {
        await prisma.examSession.update({
          where: { id: session.id },
          data: { ttsCacheHits: { increment: 1 } },
        });
      }
      audioBase64 = audio.toString("base64");
    }

    success(res, {
      sessionId: session.id,
      scenario: {
        id: scenario.id,
        code: scenario.code,
        name: scenario.name,
        difficulty: scenario.difficulty,
      },
      clientMessage: opening,
      audioBase64,
      clientName: name,
      clientAge: age,
      clientGender: gender,
      managerStartsFirst,
    });
  } catch (err: any) {
    console.error("[voice-exam] startExam:", err?.message || err);
    error(res, "Imtihonni boshlashda xatolik: " + (err?.message || ""));
  }
}

/**
 * POST /api/voice-exam/:id/turn
 * multipart/form-data: audio (webm/ogg/mp3)
 */
export async function examTurn(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.params.id;
    const audioFile = (req as any).file as Express.Multer.File | undefined;
    if (!audioFile) { error(res, "Audio fayl kerak", 400); return; }

    const session = await prisma.examSession.findFirst({
      where: { id: sessionId, companyId: req.companyId!, status: "active" },
      include: { scenario: true },
    });
    if (!session) { error(res, "Imtihon topilmadi yoki tugagan", 404); return; }

    const history: ExamMessage[] = (session.messages as any) || [];

    // 1. STT — sotuvchi gapi
    const inputFormat = (audioFile.mimetype.split("/")[1] || "webm").replace("x-", "");
    let salespersonText: string;
    try {
      salespersonText = await transcribeAudio(audioFile.buffer, inputFormat);
    } catch (sttErr: any) {
      console.error("[voice-exam] STT error:", sttErr?.message);
      salespersonText = "";
    }
    if (!salespersonText || salespersonText.trim().length < 1) {
      error(res, "Ovoz tanib olinmadi. Mikrofon yoqilganligini tekshiring va aniqroq gapiring.", 400);
      return;
    }

    const nowTs = Date.now();
    const salespersonMsg: ExamMessage = { role: "salesperson", text: salespersonText, ts: nowTs };

    // Suhbat boshidan o'tgan vaqt (sekund)
    const firstTs = history.length > 0 ? history[0].ts : nowTs;
    const elapsedSec = Math.max(0, Math.round((nowTs - firstTs) / 1000));

    // 2. AI javobi (mijoz rolida)
    const clientReply = await nextTurn({
      scenarioSystemPrompt: session.scenario.systemPrompt,
      scenarioName: session.scenario.name,
      scenarioCode: session.scenario.code,
      history,
      salespersonText,
      persona: {
        age: session.clientAge,
        gender: (session.clientGender as "male" | "female" | null) ?? null,
        name: session.clientName ?? null,
      },
      elapsedSec,
      companyId: req.companyId!,
    });
    const clientMsg: ExamMessage = { role: "client", text: clientReply, ts: Date.now() };

    // 3. TTS
    const sessionGender = (session.clientGender as "male" | "female" | null) ?? null;
    const { voice, emotion } = voiceForScenario(session.scenario.difficulty, sessionGender);
    const { audio, cached } = await speak(clientReply, { voice, emotion });

    // 4. DB yangilash
    const newHistory = [...history, salespersonMsg, clientMsg];
    await prisma.examSession.update({
      where: { id: sessionId },
      data: {
        messages: newHistory as any,
        ttsCacheHits: cached ? { increment: 1 } : undefined,
      },
    });

    success(res, {
      salespersonText,
      clientMessage: clientReply,
      audioBase64: audio.toString("base64"),
    });
  } catch (err: any) {
    console.error("[voice-exam] examTurn:", err?.message || err);
    error(res, "Turnda xatolik: " + (err?.message || ""));
  }
}

/**
 * POST /api/voice-exam/:id/finish
 * Suhbatni yakunlaydi va baholaydi. Og'ir operatsiya, ~5-15s.
 */
export async function finishExam(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.params.id;
    const session = await prisma.examSession.findFirst({
      where: { id: sessionId, companyId: req.companyId! },
      include: { scenario: true },
    });
    if (!session) { error(res, "Imtihon topilmadi", 404); return; }
    if (session.status === "completed") {
      success(res, {
        sessionId: session.id,
        status: "completed",
        overallScore: session.overallScore,
        criteria: session.criteria,
        errors: session.errors,
        winPoints: session.winPoints,
        coaching: session.coaching,
        summary: session.summary,
        messages: session.messages,
      });
      return;
    }

    const history: ExamMessage[] = (session.messages as any) || [];
    // Sotuvchi gapirmagan bo'lsa — baholashsiz "abandoned" qilamiz
    if (history.filter((m) => m.role === "salesperson").length === 0) {
      await prisma.examSession.update({
        where: { id: sessionId },
        data: { status: "abandoned", completedAt: new Date() },
      });
      success(res, {
        sessionId,
        status: "abandoned",
        overallScore: 0,
        messages: history,
        examOutcome: null,
      });
      return;
    }

    // Baholash
    const grading = await gradeExam({
      companyId: session.companyId,
      messages: history,
      scenarioName: session.scenario.name,
      scenarioDescription: session.scenario.description,
      difficulty: session.scenario.difficulty,
    });

    const durationSec = history.length > 0
      ? Math.max(1, Math.round((history[history.length - 1].ts - history[0].ts) / 1000))
      : 0;

    const updated = await prisma.examSession.update({
      where: { id: sessionId },
      data: {
        status: "completed",
        completedAt: new Date(),
        duration: durationSec,
        overallScore: grading.overallScore,
        criteria: grading.criteria as any,
        errors: grading.errors as any,
        winPoints: grading.winPoints as any,
        coaching: grading.coaching as any,
        summary: grading.summary,
      },
    });

    // Statistikani yangilash
    await updateSalespersonStats({
      salespersonId: session.salespersonId,
      companyId: session.companyId,
      score: grading.overallScore,
      criteria: grading.criteria,
      scenarioCode: session.scenario.code,
    });

    // Standart natijasi: pass yoki max attempts → pending tozalanadi.
    // Aks holda manager qayta urinish qila oladi.
    const mgr = await prisma.manager.findUnique({
      where: { id: session.salespersonId },
      select: {
        pendingExamTargetScore: true,
        pendingExamMaxAttempts: true,
        pendingExamAttemptsUsed: true,
        pendingExamScenarioId: true,
      },
    });
    let examOutcome: "passed" | "failed" | "retry" | null = null;
    let attemptsLeft = 0;
    if (mgr?.pendingExamScenarioId) {
      const target = mgr.pendingExamTargetScore ?? 0;
      const used = mgr.pendingExamAttemptsUsed;
      const max = mgr.pendingExamMaxAttempts;
      attemptsLeft = Math.max(0, max - used);
      if (target > 0 && grading.overallScore >= target) {
        examOutcome = "passed";
      } else if (used >= max) {
        examOutcome = "failed";
      } else {
        examOutcome = "retry";
      }
      if (examOutcome === "passed" || examOutcome === "failed") {
        await prisma.manager.update({
          where: { id: session.salespersonId },
          data: {
            pendingExamScenarioId: null,
            pendingExamAge: null,
            pendingExamGender: null,
            pendingExamName: null,
            pendingExamAssignedAt: null,
            pendingExamTargetScore: null,
            pendingExamAttemptsUsed: 0,
          },
        });
      }
    }

    success(res, {
      sessionId: updated.id,
      status: "completed",
      overallScore: updated.overallScore,
      criteria: updated.criteria,
      errors: updated.errors,
      winPoints: updated.winPoints,
      coaching: updated.coaching,
      summary: updated.summary,
      duration: durationSec,
      messages: history,
      examOutcome,
      attemptsLeft,
      targetScore: mgr?.pendingExamTargetScore ?? null,
    });
  } catch (err: any) {
    console.error("[voice-exam] finishExam:", err?.message || err);
    error(res, "Yakunlashda xatolik: " + (err?.message || ""));
  }
}

/**
 * GET /api/voice-exam/:id
 */
export async function getExamResult(req: Request, res: Response): Promise<void> {
  try {
    const session = await prisma.examSession.findFirst({
      where: { id: req.params.id, companyId: req.companyId! },
      include: {
        scenario: { select: { id: true, code: true, name: true, difficulty: true, icon: true } },
        salesperson: { select: { id: true, name: true } },
      },
    });
    if (!session) { error(res, "Imtihon topilmadi", 404); return; }
    success(res, session);
  } catch (err: any) {
    console.error("[voice-exam] getExamResult:", err?.message);
    error(res, "Olishda xatolik");
  }
}

/**
 * GET /api/voice-exam/history?salespersonId=...
 * Sotuvchi — faqat o'ziniki; menejer/admin — barcha
 */
export async function examHistory(req: Request, res: Response): Promise<void> {
  try {
    const queriedSalesperson = (req.query.salespersonId as string) || undefined;

    // Rolni aniqlash: boss (company admin) va ROP hamma natijalarni ko'radi.
    // Oddiy sotuvchi faqat o'zini ko'radi.
    let canSeeAll = req.userRole === "company";
    if (!canSeeAll && req.managerId) {
      const me = await prisma.manager.findUnique({
        where: { id: req.managerId },
        select: { role: true },
      });
      if (me?.role === "rop") canSeeAll = true;
    }

    const where: any = { companyId: req.companyId! };
    if (queriedSalesperson) {
      where.salespersonId = queriedSalesperson;
    } else if (!canSeeAll) {
      where.salespersonId = req.managerId;
    }

    const sessions = await prisma.examSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: canSeeAll ? 200 : 50,
      select: {
        id: true,
        status: true,
        overallScore: true,
        duration: true,
        startedAt: true,
        completedAt: true,
        clientName: true,
        clientAge: true,
        clientGender: true,
        scenario: { select: { name: true, difficulty: true, icon: true } },
        salesperson: { select: { id: true, name: true, role: true } },
      },
    });
    success(res, sessions);
  } catch (err: any) {
    console.error("[voice-exam] examHistory:", err?.message);
    error(res, "Tarixni olishda xatolik");
  }
}

/**
 * GET /api/voice-exam/admin/managers
 * Admin: barcha managerlar + examEnabled + o'rtacha imtihon bali
 */
export async function adminExamManagers(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }

    const managers = await prisma.manager.findMany({
      where: { companyId: req.companyId!, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        examEnabled: true,
        role: true,
        pendingExamScenarioId: true,
        pendingExamAge: true,
        pendingExamGender: true,
        pendingExamName: true,
        pendingExamAssignedAt: true,
        pendingExamTargetScore: true,
        pendingExamMaxAttempts: true,
        pendingExamAttemptsUsed: true,
        stats: { select: { averageScore: true, totalExams: true, completedExams: true, bestScore: true } },
      },
      orderBy: { name: "asc" },
    });

    // Har bir pending scenario uchun ma'lumot olamiz
    const scenarioIds = Array.from(new Set(managers.map((m) => m.pendingExamScenarioId).filter((x): x is string => !!x)));
    const scenarios = scenarioIds.length > 0
      ? await prisma.examScenario.findMany({
          where: { id: { in: scenarioIds } },
          select: { id: true, name: true, icon: true, difficulty: true, code: true },
        })
      : [];
    const scenarioMap = new Map(scenarios.map((s) => [s.id, s]));

    const enriched = managers.map((m) => ({
      ...m,
      pendingExam: m.pendingExamScenarioId
        ? {
            scenario: scenarioMap.get(m.pendingExamScenarioId) || null,
            age: m.pendingExamAge,
            gender: m.pendingExamGender,
            name: m.pendingExamName,
            assignedAt: m.pendingExamAssignedAt,
            targetScore: m.pendingExamTargetScore,
            maxAttempts: m.pendingExamMaxAttempts,
            attemptsUsed: m.pendingExamAttemptsUsed,
            attemptsLeft: Math.max(0, m.pendingExamMaxAttempts - m.pendingExamAttemptsUsed),
          }
        : null,
    }));

    success(res, enriched);
  } catch (err: any) {
    console.error("[voice-exam] adminExamManagers:", err?.message);
    error(res, "Olishda xatolik");
  }
}

/**
 * POST /api/voice-exam/admin/assign
 * Body: { managerId, scenarioId, clientAge?, clientGender?, clientName? }
 * Admin sotuvchiga imtihon tayinlaydi. Avtomatik examEnabled=true qiladi.
 */
export async function assignExam(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
    const { managerId, scenarioId, clientAge, clientGender, clientName, targetScore, maxAttempts } = req.body as {
      managerId: string;
      scenarioId: string;
      clientAge?: number;
      clientGender?: "male" | "female";
      clientName?: string;
      targetScore?: number;
      maxAttempts?: number;
    };
    if (!managerId || !scenarioId) { error(res, "managerId va scenarioId kerak", 400); return; }

    const scenario = await prisma.examScenario.findFirst({
      where: { id: scenarioId, companyId: req.companyId!, isActive: true },
      select: { id: true },
    });
    if (!scenario) { error(res, "Stsenariy topilmadi", 404); return; }

    const manager = await prisma.manager.findFirst({
      where: { id: managerId, companyId: req.companyId! },
      select: { id: true },
    });
    if (!manager) { error(res, "Menejer topilmadi", 404); return; }

    const age = typeof clientAge === "number" && clientAge >= 10 && clientAge <= 80 ? Math.round(clientAge) : null;
    const gender = clientGender === "male" || clientGender === "female" ? clientGender : null;
    const name = typeof clientName === "string" && clientName.trim().length > 0 && clientName.trim().length <= 40
      ? clientName.trim()
      : null;
    const target = typeof targetScore === "number" && targetScore >= 1 && targetScore <= 100 ? Math.round(targetScore) : 70;
    const attempts = typeof maxAttempts === "number" && maxAttempts >= 1 && maxAttempts <= 20 ? Math.round(maxAttempts) : 5;

    await prisma.manager.update({
      where: { id: managerId },
      data: {
        examEnabled: true,
        pendingExamScenarioId: scenarioId,
        pendingExamAge: age,
        pendingExamGender: gender,
        pendingExamName: name,
        pendingExamAssignedAt: new Date(),
        pendingExamTargetScore: target,
        pendingExamMaxAttempts: attempts,
        pendingExamAttemptsUsed: 0,
      },
    });

    success(res, { ok: true });
  } catch (err: any) {
    console.error("[voice-exam] assignExam:", err?.message);
    error(res, "Tayinlashda xatolik");
  }
}

/**
 * POST /api/voice-exam/admin/assign-auto
 * Body: { managerId }
 * AI managerning kuchsiz tomoniga qarab stsenariy + persona tanlaydi va
 * to'g'ridan-to'g'ri saqlaydi. examEnabled=true qiladi.
 */
export async function assignExamAuto(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
    const { managerId, targetScore, maxAttempts } = req.body as {
      managerId: string;
      targetScore?: number;
      maxAttempts?: number;
    };
    if (!managerId) { error(res, "managerId kerak", 400); return; }

    const manager = await prisma.manager.findFirst({
      where: { id: managerId, companyId: req.companyId! },
      select: { id: true },
    });
    if (!manager) { error(res, "Menejer topilmadi", 404); return; }

    const target = typeof targetScore === "number" && targetScore >= 1 && targetScore <= 100 ? Math.round(targetScore) : 70;
    const attempts = typeof maxAttempts === "number" && maxAttempts >= 1 && maxAttempts <= 20 ? Math.round(maxAttempts) : 5;

    const pick = await autoPickExam(req.companyId!, managerId);

    await prisma.manager.update({
      where: { id: managerId },
      data: {
        examEnabled: true,
        pendingExamScenarioId: pick.scenarioId,
        pendingExamAge: pick.clientAge,
        pendingExamGender: pick.clientGender,
        pendingExamName: pick.clientName,
        pendingExamAssignedAt: new Date(),
        pendingExamTargetScore: target,
        pendingExamMaxAttempts: attempts,
        pendingExamAttemptsUsed: 0,
      },
    });

    success(res, {
      scenario: {
        id: pick.scenarioId,
        code: pick.scenarioCode,
        name: pick.scenarioName,
        icon: pick.scenarioIcon,
        difficulty: pick.scenarioDifficulty,
      },
      clientAge: pick.clientAge,
      clientGender: pick.clientGender,
      clientName: pick.clientName,
      reason: pick.reason,
      basedOnAudio: pick.basedOnAudio,
      targetScore: target,
      maxAttempts: attempts,
    });
  } catch (err: any) {
    console.error("[voice-exam] assignExamAuto:", err?.message);
    error(res, err?.message || "AI tanlovida xatolik");
  }
}

/**
 * POST /api/voice-exam/admin/assign-target
 * Body: { managerId, targetScore, maxAttempts? }
 * Scenarioga tegmasdan target/maxAttempts yangilaydi (AI tayinlovi keyin).
 */
export async function updateExamTarget(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
    const { managerId, targetScore, maxAttempts } = req.body as {
      managerId: string;
      targetScore: number;
      maxAttempts?: number;
    };
    if (!managerId) { error(res, "managerId kerak", 400); return; }
    const manager = await prisma.manager.findFirst({
      where: { id: managerId, companyId: req.companyId! },
      select: { id: true, pendingExamScenarioId: true },
    });
    if (!manager) { error(res, "Menejer topilmadi", 404); return; }
    if (!manager.pendingExamScenarioId) { error(res, "Avval imtihon tayinlang", 400); return; }
    const target = typeof targetScore === "number" && targetScore >= 1 && targetScore <= 100 ? Math.round(targetScore) : null;
    if (target == null) { error(res, "targetScore 1-100 oralig'ida", 400); return; }
    const attempts = typeof maxAttempts === "number" && maxAttempts >= 1 && maxAttempts <= 20 ? Math.round(maxAttempts) : undefined;
    await prisma.manager.update({
      where: { id: managerId },
      data: {
        pendingExamTargetScore: target,
        ...(attempts !== undefined ? { pendingExamMaxAttempts: attempts } : {}),
      },
    });
    success(res, { ok: true });
  } catch (err: any) {
    console.error("[voice-exam] updateExamTarget:", err?.message);
    error(res, "Yangilashda xatolik");
  }
}

/**
 * POST /api/voice-exam/admin/assign-company-test
 * Body: { managerId }
 * Faqat Kompaniya testini tayinlaydi (AI suhbat yo'q). examEnabled=true,
 * pendingExamScenarioId tozalanadi — sotuvchi faqat test bo'limini ko'radi.
 */
export async function assignCompanyTestOnly(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
    const { managerId } = req.body as { managerId: string };
    if (!managerId) { error(res, "managerId kerak", 400); return; }

    const manager = await prisma.manager.findFirst({
      where: { id: managerId, companyId: req.companyId! },
      select: { id: true, name: true },
    });
    if (!manager) { error(res, "Menejer topilmadi", 404); return; }

    await prisma.manager.update({
      where: { id: managerId },
      data: {
        examEnabled: true,
        pendingExamScenarioId: null,
        pendingExamAge: null,
        pendingExamGender: null,
        pendingExamName: null,
        pendingExamAssignedAt: new Date(),
      },
    });

    success(res, { ok: true, managerId, mode: "company-test" });
  } catch (err: any) {
    console.error("[voice-exam] assignCompanyTestOnly:", err?.message);
    error(res, "Tayinlashda xatolik");
  }
}

/**
 * DELETE /api/voice-exam/admin/assign/:managerId
 * Tayinlangan imtihonni bekor qilish (examEnabled tegmaydi).
 */
export async function unassignExam(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
    const { managerId } = req.params;
    await prisma.manager.updateMany({
      where: { id: managerId, companyId: req.companyId! },
      data: {
        pendingExamScenarioId: null,
        pendingExamAge: null,
        pendingExamGender: null,
        pendingExamName: null,
        pendingExamAssignedAt: null,
        pendingExamTargetScore: null,
        pendingExamAttemptsUsed: 0,
      },
    });
    success(res, { ok: true });
  } catch (err: any) {
    console.error("[voice-exam] unassignExam:", err?.message);
    error(res, "Bekor qilishda xatolik");
  }
}

/**
 * GET /api/voice-exam/pending
 * Sotuvchi o'ziga tayinlangan imtihonni oladi.
 */
export async function getPendingExam(req: Request, res: Response): Promise<void> {
  try {
    const managerId = req.managerId;
    if (!managerId) { error(res, "Faqat sotuvchilar", 403); return; }

    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: {
        examEnabled: true,
        pendingExamScenarioId: true,
        pendingExamAge: true,
        pendingExamGender: true,
        pendingExamName: true,
        pendingExamAssignedAt: true,
        pendingExamTargetScore: true,
        pendingExamMaxAttempts: true,
        pendingExamAttemptsUsed: true,
      },
    });
    if (!manager) { error(res, "Topilmadi", 404); return; }

    if (!manager.pendingExamScenarioId) {
      success(res, { pending: null, examEnabled: manager.examEnabled });
      return;
    }

    const scenario = await prisma.examScenario.findFirst({
      where: { id: manager.pendingExamScenarioId, companyId: req.companyId!, isActive: true },
      select: { id: true, code: true, name: true, description: true, icon: true, difficulty: true, category: true },
    });

    success(res, {
      examEnabled: manager.examEnabled,
      pending: scenario
        ? {
            scenario,
            age: manager.pendingExamAge,
            gender: manager.pendingExamGender,
            name: manager.pendingExamName,
            assignedAt: manager.pendingExamAssignedAt,
            targetScore: manager.pendingExamTargetScore,
            maxAttempts: manager.pendingExamMaxAttempts,
            attemptsUsed: manager.pendingExamAttemptsUsed,
            attemptsLeft: Math.max(0, manager.pendingExamMaxAttempts - manager.pendingExamAttemptsUsed),
          }
        : null,
    });
  } catch (err: any) {
    console.error("[voice-exam] getPendingExam:", err?.message);
    error(res, "Olishda xatolik");
  }
}

/**
 * POST /api/voice-exam/admin/toggle
 * Body: { managerId, enabled }
 */
export async function toggleExamAccess(req: Request, res: Response): Promise<void> {
  try {
    if (req.userRole !== "company") { error(res, "Faqat admin", 403); return; }
    const { managerId, enabled } = req.body as { managerId: string; enabled: boolean };
    if (!managerId) { error(res, "managerId kerak", 400); return; }

    await prisma.manager.update({
      where: { id: managerId },
      data: { examEnabled: !!enabled },
    });
    success(res, { ok: true });
  } catch (err: any) {
    console.error("[voice-exam] toggleExamAccess:", err?.message);
    error(res, "Xatolik");
  }
}

/**
 * POST /api/voice-exam/:id/abandon
 */
export async function abandonExam(req: Request, res: Response): Promise<void> {
  try {
    await prisma.examSession.updateMany({
      where: { id: req.params.id, companyId: req.companyId!, status: "active" },
      data: { status: "abandoned", completedAt: new Date() },
    });
    success(res, { ok: true });
  } catch (err: any) {
    error(res, "Abandon xatosi");
  }
}
