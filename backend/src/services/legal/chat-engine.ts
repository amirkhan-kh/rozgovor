/**
 * Smart-Advokat chat-engine — Gemini 2.5 Pro + tool-calling loop.
 *
 * Oqim:
 *   1. Case + so'nggi 20 ta xabar yuklanadi.
 *   2. systemInstruction = SMART_ADVOKAT_PROMPT, history + yangi user msg.
 *   3. Gemini Pro generateContent -> functionCall bo'lsa dispatch -> result
 *      qo'shib loopni davom ettirish (max 8 iteration).
 *   4. Har qadam LegalMessage'ga yoziladi (user | assistant | tool).
 */

import { GoogleGenAI, type Content, type FunctionCall } from "@google/genai";
import { prisma } from "../../utils/prisma";
import { SMART_ADVOKAT_PROMPT } from "./system-prompt";
import { legalToolDeclarations, dispatchTool } from "./tools";

const PRO_MODEL = "gemini-2.5-pro";
const MAX_ITERATIONS = 8;
const HISTORY_LIMIT = 20;

function getAI(): GoogleGenAI {
  return new GoogleGenAI({
    vertexai: true,
    project: process.env.VERTEX_PROJECT || "",
    location: process.env.VERTEX_LOCATION || "us-central1",
  });
}

export interface RunChatInput {
  caseId: string;
  companyId: string;
  userMessage: string;
  attachmentIds?: string[];
}

export interface RunChatResult {
  assistantMessage: {
    id: string;
    role: string;
    content: string;
    createdAt: Date;
  };
  evidence: Array<{ id: string; type: string; summary: string }>;
  iterations: number;
}

export async function runChat(input: RunChatInput): Promise<RunChatResult> {
  const { caseId, companyId, userMessage, attachmentIds = [] } = input;

  const legalCase = await prisma.legalCase.findFirst({
    where: { id: caseId, companyId },
  });
  if (!legalCase) throw new Error("Keys topilmadi");

  // ─── Fetch history ──────────────────────────────────────────────────
  const historyMsgs = await prisma.legalMessage.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  historyMsgs.reverse();

  // ─── Build Gemini contents from prior history ────────────────────────
  const contents: Content[] = [];
  for (const m of historyMsgs) {
    if (m.role === "user") {
      contents.push({ role: "user", parts: [{ text: m.content }] });
    } else if (m.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: m.content }] });
    } else if (m.role === "tool" && m.toolName) {
      // Tool call + response shaped pair (best-effort reconstruction)
      contents.push({
        role: "model",
        parts: [
          {
            functionCall: {
              name: m.toolName,
              args: (m.toolArgs as Record<string, unknown>) || {},
            },
          },
        ],
      });
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: m.toolName,
              response:
                (m.toolResult as Record<string, unknown>) || { result: "" },
            },
          },
        ],
      });
    }
  }

  // ─── Build user message + Gemini payload ─────────────────────────────
  // DB ga toza foydalanuvchi matnini saqlaymiz (UI da ko'rinishi uchun).
  // Gemini'ga esa biriktirma matnlari bilan birga yuboramiz.
  const cleanUserText = userMessage.trim();
  let geminiUserText = cleanUserText;

  if (attachmentIds.length > 0) {
    const atts = await prisma.legalAttachment.findMany({
      where: { id: { in: attachmentIds }, caseId },
    });
    if (atts.length > 0) {
      const attBlocks = atts
        .map(
          (a) =>
            `\n\n---\n[Foydalanuvchi yuklagan dalil: ${a.filename}]\n` +
            (a.extractedText?.slice(0, 8000) || "(matn ajratib olinmagan)"),
        )
        .join("");
      geminiUserText = cleanUserText + attBlocks;
    }
  }

  // Save user message — toza matn (UI uchun)
  await prisma.legalMessage.create({
    data: {
      caseId,
      role: "user",
      content: cleanUserText,
    },
  });

  contents.push({ role: "user", parts: [{ text: geminiUserText }] });

  // ─── Tool-calling loop ────────────────────────────────────────────────
  const ai = getAI();
  let iterations = 0;
  let finalText = "";
  let totalTokensIn = 0;
  let totalTokensOut = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents,
      config: {
        systemInstruction: SMART_ADVOKAT_PROMPT,
        temperature: 0.3,
        maxOutputTokens: 8192,
        tools: [{ functionDeclarations: legalToolDeclarations }],
      },
    });

    const usage =
      (response.usageMetadata as
        | { promptTokenCount?: number; candidatesTokenCount?: number }
        | undefined) || {};
    totalTokensIn += usage.promptTokenCount || 0;
    totalTokensOut += usage.candidatesTokenCount || 0;

    const fnCalls: FunctionCall[] = response.functionCalls || [];

    if (fnCalls.length === 0) {
      finalText = response.text || "";
      break;
    }

    // Echo model parts (functionCall) back into contents
    contents.push({
      role: "model",
      parts: fnCalls.map((fc) => ({
        functionCall: { name: fc.name || "", args: fc.args || {} },
      })),
    });

    // Dispatch each tool, save tool message, append functionResponse
    const responseParts = [];
    for (const fc of fnCalls) {
      const name = fc.name || "";
      const args = (fc.args || {}) as Record<string, unknown>;
      const result = await dispatchTool(name, args, { companyId });

      await prisma.legalMessage.create({
        data: {
          caseId,
          role: "tool",
          content: `[tool:${name}]`,
          toolName: name,
          toolArgs: args as object as never,
          toolResult: result as object as never,
          model: PRO_MODEL,
        },
      });

      // Auto-evidence: tool results dan dalil yozish
      try {
        if (name === "getAudioTranscripts") {
          const audios = (result as { audios?: Array<{ id: string; fileName?: string; transcript?: string }> }).audios || [];
          for (const a of audios.slice(0, 5)) {
            await prisma.legalEvidence.create({
              data: {
                caseId,
                type: "audio-transcript",
                source: a.id,
                summary: `Audio: ${a.fileName || a.id} — ${(a.transcript || "").slice(0, 300)}`,
                rawData: a as object,
              },
            });
          }
        } else if (name === "searchKnowledge") {
          const items = (result as { items?: Array<{ id: string; title: string; snippet?: string }> }).items || [];
          for (const it of items.slice(0, 5)) {
            await prisma.legalEvidence.create({
              data: {
                caseId,
                type: "knowledge",
                source: it.id,
                summary: `${it.title}: ${(it.snippet || "").slice(0, 300)}`,
                rawData: it as object,
              },
            });
          }
        }
      } catch (e) {
        console.error("[legal/chat-engine] evidence write error:", (e as Error).message);
      }

      responseParts.push({
        functionResponse: {
          name,
          response: result,
        },
      });
    }

    contents.push({ role: "user", parts: responseParts });
  }

  if (!finalText) {
    finalText =
      "Kechirasiz, hozircha aniq javob bera olmadim. Iltimos, savolingizni " +
      "qayta aniqlashtirib bering yoki kerakli dalillarni yuklang.";
  }

  // Save assistant message
  const assistant = await prisma.legalMessage.create({
    data: {
      caseId,
      role: "assistant",
      content: finalText,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
      model: PRO_MODEL,
    },
  });

  // Bump case updatedAt
  await prisma.legalCase.update({
    where: { id: caseId },
    data: { updatedAt: new Date() },
  });

  // TODO: Pro xarajatini yozish — recordAudioCost audioFileId talab qiladi.
  // LegalCost jadvali kelajakda qo'shilganda shu yerda yozish kerak.

  const evidence = await prisma.legalEvidence.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, summary: true },
  });

  return {
    assistantMessage: {
      id: assistant.id,
      role: assistant.role,
      content: assistant.content,
      createdAt: assistant.createdAt,
    },
    evidence,
    iterations,
  };
}
