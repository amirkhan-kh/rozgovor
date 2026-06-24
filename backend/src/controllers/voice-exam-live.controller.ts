/** Voice Exam Live — Gemini Live API (native audio dialog) real-time bidirectional voice. */
import { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { buildClientBehaviorBlock } from "../services/voice-exam/client-history";

const LIVE_MODEL = "gemini-2.5-flash-preview-native-audio-dialog";

interface ExamMessage {
  role: "salesperson" | "client";
  text: string;
  ts: number;
}

interface ClientPersona {
  age?: number | null;
  gender?: "male" | "female" | null;
  name?: string | null;
}

function personaBlock(persona: ClientPersona): string {
  if (!persona.age && !persona.gender && !persona.name) return "";
  const parts: string[] = [];
  if (persona.name) parts.push(`Sizning ismingiz ${persona.name}`);
  if (persona.age) parts.push(`yoshingiz ${persona.age}`);
  if (persona.gender) {
    const g = persona.gender === "female" ? "ayol" : "erkak";
    parts.push(`jinsingiz ${g}`);
  }
  if (parts.length === 0) return "";
  return `\nSENING PERSONANG:\n${parts.join(", ")}. Shu personaga mos tabiiy gaplashing.\n`;
}

function timePhaseBlock(): string {
  // Real-time Live API uchun barcha bosqichlarni system instructionga qo'shamiz —
  // model suhbat davomida o'zi vaqtga qarab tabiiy yakunlaydi.
  return `
VAQT VA YAKUNLASH HOLATI (suhbat davomida o'zing nazorat qil):
- 0-8 daqiqa: TABIIY SUHBAT. Sotuvchi savollariga qisqa, tabiiy javob ber. Sen mijozsan — ketma-ket savol berma. Javoblaring 1-2 jumla.
- 8-10 daqiqa: YAKUNGA TAYYORGARLIK. "Yaxshi, tushunarli", "o'ylab ko'raman", "vaqtim cheklangan" kabi yakun signallarini ber. Yangi savol ochma.
- 10+ daqiqa: QAT'IY YAKUNLASH. "Rahmat, men o'ylab ko'raman, xayr" deb suhbatni yakunla. Yangi e'tiroz chiqarMa.
`;
}

async function buildLiveSystemPrompt(
  scenarioSystemPrompt: string,
  persona: ClientPersona,
  companyId: string,
): Promise<string> {
  let clientBehavior = "";
  try {
    clientBehavior = await buildClientBehaviorBlock(companyId);
  } catch {
    clientBehavior = "";
  }

  return `${scenarioSystemPrompt}
${personaBlock(persona)}${clientBehavior}
XULQ-ATVOR:
Telefonda gaplashayotgan REAL mijozsan. O'zbek tilida 1-2 jumla, tabiiy ohangda gapir. Sotuvchi suhbatni yuritsin — sen yakunlama. Ketma-ket savol berma — real mijoz ko'p savol bermaydi. Ba'zan "ha", "hmm", "tushundim" kabi qisqa javoblar ber.
${timePhaseBlock()}`.trim();
}

function voiceNameForGender(gender?: "male" | "female" | null): string {
  if (gender === "male") return "Puck";
  return "Kore";
}

/**
 * POST /api/voice-exam/:id/live-token
 * Frontend Vertex Live'ga to'g'ridan ulanolmaydi (Bearer header brauzerda yo'q).
 * Shuning uchun backend proxy ishlatamiz. Bu endpoint shunchaki proxy WS URL'ini
 * va sotuvchi token'ini qaytaradi. Haqiqiy Vertex ulanishi
 * `services/voice-exam-live-proxy.ts` ichida amalga oshiriladi.
 */
export async function createExamLiveToken(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.params.id;
    const companyId = req.companyId;
    if (!companyId) { error(res, "Auth talab qilinadi", 401); return; }

    const session = await prisma.examSession.findFirst({
      where: { id: sessionId, companyId },
      select: { id: true, status: true },
    });
    if (!session) { error(res, "Imtihon topilmadi", 404); return; }
    if (session.status === "completed") { error(res, "Imtihon allaqachon yakunlangan", 400); return; }

    // Auth header'dan original JWT'ni ko'chiramiz — proxy WS ham shu token bilan validate qiladi
    const authHeader = req.headers.authorization || "";
    const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    success(res, {
      // Frontend bu URL'ga ulanadi
      wsPath: `/api/voice-exam/${sessionId}/live-ws`,
      token: userToken,
      sessionId: session.id,
      mode: "proxy",
    });
  } catch (err: any) {
    console.error("[voice-exam-live] createExamLiveToken:", err?.message || err);
    error(res, "Live ulanishni tayyorlashda xatolik: " + (err?.message || ""));
  }
}

/**
 * POST /api/voice-exam/:id/save-turn
 * Body: { role: "salesperson" | "client", text: string }
 * Live API tomonidan transkript qilingan turnni messages JSON'ga qo'shadi.
 */
export async function saveLiveTurn(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = req.params.id;
    const companyId = req.companyId;
    if (!companyId) {
      error(res, "Auth talab qilinadi", 401);
      return;
    }

    const { role, text } = (req.body || {}) as { role?: string; text?: string };
    if (role !== "salesperson" && role !== "client") {
      error(res, "role 'salesperson' yoki 'client' bo'lishi kerak", 400);
      return;
    }
    const cleanText = typeof text === "string" ? text.trim() : "";
    if (!cleanText) {
      error(res, "text bo'sh", 400);
      return;
    }

    const session = await prisma.examSession.findFirst({
      where: { id: sessionId, companyId },
      select: { id: true, messages: true, status: true },
    });
    if (!session) {
      error(res, "Imtihon topilmadi", 404);
      return;
    }
    if (session.status === "completed") {
      error(res, "Imtihon allaqachon yakunlangan", 400);
      return;
    }

    const history: ExamMessage[] = Array.isArray(session.messages)
      ? (session.messages as unknown as ExamMessage[])
      : [];
    const newHistory: ExamMessage[] = [
      ...history,
      { role, text: cleanText, ts: Date.now() },
    ];

    await prisma.examSession.update({
      where: { id: sessionId },
      data: { messages: newHistory as any },
    });

    success(res, { count: newHistory.length });
  } catch (err: any) {
    console.error("[voice-exam-live] saveLiveTurn:", err?.message || err);
    error(res, "Turn saqlashda xatolik: " + (err?.message || ""));
  }
}
