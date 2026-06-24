/**
 * Voice Test — 3 ta real-time provider'ni taqqoslash uchun.
 * Faqat test maqsadida — DB'ga hech narsa saqlamaydi, grading yo'q.
 *
 * Providerlar:
 *   - openai:     gpt-4o-realtime-preview (WebRTC browser → OpenAI)
 *   - gemini-flash: gemini-2.5-flash-preview-native-audio-dialog (Live API)
 *   - gemini-pro:   gemini-2.5-pro-preview-native-audio-dialog (Live API)
 */
import { Request, Response } from "express";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import { success, error } from "../utils/response";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const SYSTEM_INSTRUCTIONS = `Sen telefonda gaplashayotgan REAL MIJOZSAN. O'zbek tilida qisqa javob ber.

STSENARIY: Yangi mijoz — ingliz tili kurslariga qiziqayotgan
Sen VisionSchool ingliz tili kurslariga qiziqib qo'ng'iroq qilgansan.
Sotuvchi (sotuvchi = sales manager) senga kurslar haqida gapiradi.

XULQ-ATVOR:
- Tabiiy o'zbekcha gaplash, "aka"/"opa" kabi murojaatlar ishlat
- Ba'zan savol ber (narxi, davomiyligi, jadval, o'qituvchi)
- Agar sotuvchi yaxshi tushuntirsa — qiziqish ortib boradi
- Agar sotuvchi yomon ishlasa — shubha bildir, e'tirozlar ayt
- Sen o'z tashabbusing bilan suhbatni yakunlama — sotuvchi qilsin
- Har javob 1-2 jumla, qisqa

BU FAQAT TEST — sen ovoz sifatini baholash uchun o'zbek tilida tabiiy gaplashyapsan.`;

/**
 * POST /api/voice-test/openai-session
 * OpenAI Realtime uchun ephemeral session yaratadi.
 * Frontend WebRTC bilan to'g'ridan-to'g'ri OpenAI'ga ulanadi.
 */
export async function createOpenAIRealtimeSession(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    if (!OPENAI_API_KEY) {
      error(res, "OPENAI_API_KEY o'rnatilmagan", 500);
      return;
    }

    const resp = await axios.post(
      "https://api.openai.com/v1/realtime/sessions",
      {
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "alloy",
        instructions: SYSTEM_INSTRUCTIONS,
        modalities: ["audio", "text"],
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "realtime=v1",
        },
        timeout: 20_000,
      },
    );

    success(res, {
      clientSecret: resp.data.client_secret?.value,
      expiresAt: resp.data.client_secret?.expires_at,
      model: resp.data.model,
      sessionId: resp.data.id,
    });
  } catch (err: any) {
    console.error("[voice-test] openai session error:", err?.response?.data || err?.message);
    error(
      res,
      "OpenAI session yaratishda xatolik: " + (err?.response?.data?.error?.message || err?.message || ""),
    );
  }
}

/**
 * POST /api/voice-test/gemini-token?variant=flash|pro
 * Gemini Live API uchun ephemeral auth token yaratadi.
 * Frontend @google/genai SDK bilan to'g'ridan-to'g'ri Gemini Live'ga ulanadi.
 */
export async function createGeminiLiveToken(req: Request, res: Response): Promise<void> {
  try {
    const variant = (req.query.variant as string) || "flash";
    const model =
      variant === "pro"
        ? "gemini-2.5-pro-preview-native-audio-dialog"
        : "gemini-2.5-flash-preview-native-audio-dialog";

    // Vertex AI orqali — server-side Gen AI SDK
    const ai = new GoogleGenAI({
      vertexai: true,
      project: process.env.VERTEX_PROJECT || "",
      location: process.env.VERTEX_LOCATION || "us-central1",
    });

    // Live API ephemeral token — 30 daqiqa amal qiladi
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    // @google/genai SDK 1.x — authTokens.create (ephemeral token for Live API)
    const token = await (ai as any).authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: ["AUDIO"],
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTIONS }] },
          },
        },
      },
    });

    success(res, {
      token: token?.name || token,
      model,
      expiresAt: expireTime,
      systemInstruction: SYSTEM_INSTRUCTIONS,
    });
  } catch (err: any) {
    console.error("[voice-test] gemini token error:", err?.message || err);
    error(res, "Gemini token yaratishda xatolik: " + (err?.message || ""));
  }
}
