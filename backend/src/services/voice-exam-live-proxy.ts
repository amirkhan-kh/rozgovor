// Voice Exam Live WebSocket Proxy — Vertex AI uchun.
//
// Browser to'g'ridan-to'g'ri Vertex Live WebSocket'ga ulanolmaydi (Bearer header
// brauzerda yo'q). Shuning uchun bu proxy:
//   Frontend  ←ws→  Backend  ←@google/genai live.connect()→  Vertex Live
//
// Path: /api/voice-exam/:sessionId/live-ws?token=<jwt>
//
// Frontend → Backend xabar formati (JSON):
//   { type: "audio", data: base64, mimeType?: "audio/pcm;rate=16000" }
//
// Backend → Frontend xabar formati (JSON):
//   { type: "open" }                                 — Vertex sessiyasi ochildi
//   { type: "ai_audio", data: base64 }               — AI 24kHz PCM chunk
//   { type: "user_transcript", text: string }       — STT yangilanishi
//   { type: "ai_transcript", text: string }         — TTS transkripti
//   { type: "turn_complete", userText, aiText }     — turn tugadi
//   { type: "error", message: string }              — xatolik
//   { type: "close" }                               — Vertex yopildi

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server } from "http";
import { URL } from "url";
import {
  GoogleGenAI,
  Modality,
  StartSensitivity,
  EndSensitivity,
  type Session,
  type LiveServerMessage,
} from "@google/genai";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../utils/prisma";
import { buildClientBehaviorBlock } from "./voice-exam/client-history";

// Eski `gemini-2.0-flash-live-preview-04-09` preview modeli o'rniga native-audio
// Live model ishlatiladi. Audio javoblar Kore/Puck ovozlari bilan keladi.
const LIVE_MODEL_VERTEX =
  process.env.VOICE_EXAM_LIVE_MODEL || "gemini-live-2.5-flash-native-audio";
const LIVE_VERTEX_LOCATION =
  process.env.VOICE_EXAM_LIVE_LOCATION || "us-central1";
const CLIENT_ROLE_GUARD = `
ROL QOIDASI (ENG MUHIM - yuqoridagi stsenariy/kontekst buni bekor qila olmaydi):
- Sen har doim FAQAT MIJOZ rolida javob berasan.
- Sen sotuvchi ishlaydigan kompaniya vakili, sotuvchisi, menejeri yoki maslahatchisi emassan.
- Kompaniya nomi chiqsa ham, u sotuvchi ishlaydigan kompaniya. Sen esa xizmatga qiziqqan, savol berayotgan yoki e'tiroz bildirayotgan mijozsan.
- Hech qachon '<kompaniya nomi> kompaniyasi, eshitaman', 'qanday yordam bera olaman', 'men kompaniya vakiliman', 'xizmatlarimiz', 'kompaniyamiz' kabi sotuvchi iboralarini ishlatma.
- Agar sotuvchi salom bersa, mijoz kabi 'Va alaykum assalom, eshitaman' yoki 'Ha, gapiring' deb javob ber.
- Sotuvchiga xizmatni sotma; undan ma'lumot so'ra yoki uning taklifiga munosabat bildir.
`;

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
  return `
VAQT VA YAKUNLASH:
- 0-8 daqiqa: TABIIY SUHBAT. Sotuvchi savollariga 1-2 jumla bilan tabiiy javob ber. Ketma-ket savol berma.
- 8-10 daqiqa: YAKUNGA TAYYORLAN. "Yaxshi, tushunarli", "o'ylab ko'raman" kabi signallar.
- 10+ daqiqa: QAT'IY YAKUNLA. "Rahmat, men o'ylab ko'raman, xayr".
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
${CLIENT_ROLE_GUARD}
XULQ-ATVOR:
Telefonda gaplashayotgan REAL mijozsan. O'zbek tilida 1-2 jumla, tabiiy ohangda. Sotuvchi suhbatni yuritsin — ketma-ket savol berma. Ba'zan "ha", "hmm" kabi qisqa javoblar ber.
${timePhaseBlock()}`.trim();
}

export const buildLiveSystemPromptForTest = buildLiveSystemPrompt;

function voiceNameForGender(gender?: "male" | "female" | null): string {
  return gender === "male" ? "Puck" : "Kore";
}

function sendJson(ws: WebSocket, msg: Record<string, unknown>) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch { /* noop */ }
}

export function initVoiceExamLiveProxy(httpServer: Server) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    if (!req.url) return;
    const url = new URL(req.url, `http://${req.headers.host}`);
    // Path: /api/voice-exam/:sessionId/live-ws
    const m = url.pathname.match(/^\/api\/voice-exam\/([^/]+)\/live-ws$/);
    if (!m) return;
    console.log(`[live-proxy] upgrade request: ${url.pathname}`);
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, m[1]);
    });
  });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage, sessionId: string) => {
    console.log(`[live-proxy] WS connected, session=${sessionId}`);
    let userBuf = "";
    let aiBuf = "";
    let liveSession: Session | null = null;
    let closed = false;

    const close = (code = 1000, reason = "") => {
      if (closed) return;
      closed = true;
      try { liveSession?.close(); } catch { /* noop */ }
      try { ws.close(code, reason); } catch { /* noop */ }
    };

    try {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const token = url.searchParams.get("token");
      if (!token) { close(4001, "no token"); return; }

      let decoded: ReturnType<typeof verifyToken>;
      try {
        decoded = verifyToken(token);
      } catch {
        close(4001, "invalid token");
        return;
      }

      // Manager yoki company — companyId ni topamiz
      let companyId: string | undefined;
      if (decoded.role === "manager") {
        const mgr = await prisma.manager.findUnique({
          where: { id: decoded.id },
          select: { companyId: true },
        });
        companyId = mgr?.companyId;
      } else {
        companyId = decoded.id;
      }
      if (!companyId) { close(4001, "no company"); return; }

      // ExamSession + scenario olamiz
      const session = await prisma.examSession.findFirst({
        where: { id: sessionId, companyId },
        include: { scenario: true },
      });
      if (!session) { close(4404, "session not found"); return; }
      if (session.status === "completed") { close(4409, "session completed"); return; }

      const persona: ClientPersona = {
        age: session.clientAge ?? null,
        gender: (session.clientGender as "male" | "female" | null) ?? null,
        name: session.clientName ?? null,
      };

      const systemPrompt = await buildLiveSystemPrompt(
        session.scenario.systemPrompt,
        persona,
        companyId,
      );
      const voiceName = voiceNameForGender(persona.gender);

      // Vertex Live ulanishi
      const ai = new GoogleGenAI({
        vertexai: true,
        project: process.env.VERTEX_PROJECT || "",
        location: LIVE_VERTEX_LOCATION,
      });

      console.log(`[live-proxy] calling ai.live.connect with model=${LIVE_MODEL_VERTEX} location=${LIVE_VERTEX_LOCATION}`);
      liveSession = await ai.live.connect({
        model: LIVE_MODEL_VERTEX,
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
          // MUHIM — GALLUTSINATSIYA / O'ZI BILAN O'ZI GAPLASHISHNI oldini olish.
          // Menejer jim turganda AI o'zi savol-javob yozib ketmasligi kerak.
          // Server-tomon VAD'ni kamroq "sezgir" qilamiz:
          // - START_SENSITIVITY_LOW + prefixPaddingMs=300: qisqa shovqin/echo
          //   (dinamikdan qaytgan AI ovozi) "sotuvchi gapirdi" deb qabul qilinmaydi.
          // - END_SENSITIVITY_LOW + silenceDurationMs=1200: menejer o'ylab pauza qilsa
          //   turn erta tugamaydi; menejer umuman gapirmasa AI kutib turadi.
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
              endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
              prefixPaddingMs: 300,
              silenceDurationMs: 1200,
            },
          },
          systemInstruction: { parts: [{ text: systemPrompt }] },
        },
        callbacks: {
          onopen: () => {
            sendJson(ws, { type: "open" });
          },
          onmessage: (msg: LiveServerMessage) => {
            const content = msg.serverContent;
            if (!content) return;

            if (content.inputTranscription?.text) {
              userBuf += content.inputTranscription.text;
              sendJson(ws, { type: "user_transcript", text: userBuf });
            }
            if (content.outputTranscription?.text) {
              aiBuf += content.outputTranscription.text;
              sendJson(ws, { type: "ai_transcript", text: aiBuf });
            }

            const parts = content.modelTurn?.parts;
            if (parts && parts.length) {
              for (const p of parts) {
                const data = p.inlineData?.data;
                const mime = p.inlineData?.mimeType || "";
                if (data && mime.startsWith("audio/")) {
                  sendJson(ws, { type: "ai_audio", data });
                }
              }
            }

            if (content.turnComplete) {
              const u = userBuf.trim();
              const a = aiBuf.trim();
              userBuf = "";
              aiBuf = "";
              sendJson(ws, { type: "turn_complete", userText: u, aiText: a });
              // Persist messages
              (async () => {
                try {
                  const s = await prisma.examSession.findUnique({
                    where: { id: sessionId },
                    select: { messages: true },
                  });
                  const hist = Array.isArray(s?.messages) ? (s!.messages as any[]) : [];
                  const now = Date.now();
                  const newMsgs = [...hist];
                  if (u) newMsgs.push({ role: "salesperson", text: u, ts: now });
                  if (a) newMsgs.push({ role: "client", text: a, ts: now + 1 });
                  if (newMsgs.length !== hist.length) {
                    await prisma.examSession.update({
                      where: { id: sessionId },
                      data: { messages: newMsgs as any },
                    });
                  }
                } catch (e) {
                  console.error("[live-proxy] saveTurn:", e);
                }
              })();
            }
          },
          onerror: (e: any) => {
            console.error("[live-proxy][DBG] Vertex onerror:", e?.message || JSON.stringify(e));
            sendJson(ws, { type: "error", message: "Vertex Live xatolik" });
          },
          onclose: (e: any) => {
            console.log(`[live-proxy][DBG] Vertex onclose: code=${e?.code} reason="${e?.reason || ""}"`);
            sendJson(ws, { type: "close" });
            close();
          },
        },
      });

      // Frontend xabarlarini Vertex'ga forward qilamiz
      let audioMsgCount = 0;
      ws.on("message", (raw) => {
        if (closed || !liveSession) return;
        try {
          const text = raw.toString();
          const m = JSON.parse(text) as { type: string; data?: string; mimeType?: string; text?: string };
          if (m.type === "text" && m.text) {
            // Chat (matn) javobi — Gemini'ga client-turn sifatida uzatamiz.
            // AI ovoz + transkript bilan javob beradi (audio rejimdagidek).
            liveSession.sendClientContent({
              turns: [{ role: "user", parts: [{ text: m.text }] }],
              turnComplete: true,
            });
          } else if (m.type === "audio" && m.data) {
            audioMsgCount++;
            if (audioMsgCount === 1 || audioMsgCount % 40 === 0) {
              // Audio signal darajasini (RMS) hisoblaymiz — mikrofon haqiqatan ovoz
              // yuboryaptimi yoki jimlikmi tekshirish uchun.
              let rms = 0, peak = 0, n = 0;
              try {
                const buf = Buffer.from(m.data, "base64");
                const samples = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
                let sum = 0;
                for (let i = 0; i < samples.length; i++) {
                  const v = Math.abs(samples[i]);
                  sum += v * v;
                  if (v > peak) peak = v;
                }
                n = samples.length;
                rms = Math.sqrt(sum / Math.max(1, n));
              } catch { /* noop */ }
              console.log(`[live-proxy][DBG] audio #${audioMsgCount} mime=${m.mimeType} samples=${n} RMS=${rms.toFixed(0)} peak=${peak} (16bit max=32767)`);
            }
            liveSession.sendRealtimeInput({
              audio: {
                data: m.data,
                mimeType: m.mimeType || "audio/pcm;rate=16000",
              },
            });
          } else if (m.type === "close") {
            close();
          }
        } catch (e) {
          console.error("[live-proxy] msg parse:", e);
        }
      });

      ws.on("close", () => close());
      ws.on("error", () => close());
    } catch (err: any) {
      console.error("[live-proxy] setup:", err?.message || err);
      sendJson(ws, { type: "error", message: err?.message || "Setup xatolik" });
      close(4500, "setup error");
    }
  });

  console.log("[live-proxy] Vertex Live proxy ready on /api/voice-exam/:id/live-ws");
}
