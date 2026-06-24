/**
 * Audio xarajatlarini DB'ga yozadi.
 *
 * Pricing (May 2026, Vertex AI + Yandex):
 *   Yandex Deferred STT  : $0.13/hr  → $3.611e-5 /sec
 *   Yandex Streaming STT : $0.50/hr  → $1.389e-4 /sec
 *
 *   Gemini 2.5 Flash (online):
 *     Text input  : $0.075/M tokens
 *     Audio input : $0.075/M tokens
 *     Output      : $0.30/M tokens
 *   Gemini 2.5 Flash (batch): 50% chegirma
 *
 *   Gemini 2.5 Pro (online):
 *     Text input  : $1.25/M tokens
 *     Output      : $5.00/M tokens
 *   Gemini 2.5 Pro (batch): 50% chegirma
 */

import { prisma } from "../utils/prisma";

export type Mode = "batch" | "online";

const STT_PRICE_PER_SEC: Record<Mode, number> = {
  batch: 0.13 / 3600,
  online: 0.5 / 3600,
};

const FLASH_INPUT_PER_TOKEN: Record<Mode, number> = {
  online: 0.075 / 1_000_000,
  batch: 0.0375 / 1_000_000,
};
const FLASH_OUTPUT_PER_TOKEN: Record<Mode, number> = {
  online: 0.3 / 1_000_000,
  batch: 0.15 / 1_000_000,
};

const PRO_INPUT_PER_TOKEN: Record<Mode, number> = {
  online: 1.25 / 1_000_000,
  batch: 0.625 / 1_000_000,
};
const PRO_OUTPUT_PER_TOKEN: Record<Mode, number> = {
  online: 5.0 / 1_000_000,
  batch: 2.5 / 1_000_000,
};

export const calcSttCost = (durationSec: number, mode: Mode): number =>
  Math.max(0, durationSec) * STT_PRICE_PER_SEC[mode];

export const calcFlashCost = (
  inputTokens: number,
  outputTokens: number,
  mode: Mode,
): number =>
  inputTokens * FLASH_INPUT_PER_TOKEN[mode] +
  outputTokens * FLASH_OUTPUT_PER_TOKEN[mode];

export const calcProCost = (
  inputTokens: number,
  outputTokens: number,
  mode: Mode,
): number =>
  inputTokens * PRO_INPUT_PER_TOKEN[mode] +
  outputTokens * PRO_OUTPUT_PER_TOKEN[mode];

/**
 * Audio uchun xarajat yozish — bir nechta komponent bir vaqtda yoki keyin
 * qo'shilishi mumkin (har komponent o'z chaqirig'idan keyin yoziladi).
 */
export interface CostUpsertInput {
  audioFileId: string;
  companyId: string;

  stt?: {
    mode: Mode;
    durationSec: number;
    provider?: string;
  };
  flash?: {
    mode: Mode;
    inputTokens: number;
    outputTokens: number;
    audioSec?: number;
  };
  pro?: {
    mode: Mode;
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Yangi AudioCost qatori yaratadi (har komponent uchun alohida-alohida ham
 * chaqirilishi mumkin — bunda boshqa fieldlar null qoladi).
 *
 * Best-effort: xato yuz bersa, log qiladi va asosiy oqimni to'xtatmaydi.
 */
export async function recordAudioCost(input: CostUpsertInput): Promise<void> {
  try {
    const data: Record<string, unknown> = {
      audioFileId: input.audioFileId,
      companyId: input.companyId,
    };
    let total = 0;

    if (input.stt) {
      const cost = calcSttCost(input.stt.durationSec, input.stt.mode);
      data.sttProvider = input.stt.provider || "yandex";
      data.sttMode = input.stt.mode;
      data.sttDurationSec = Math.round(input.stt.durationSec);
      data.sttCostUsd = cost;
      total += cost;
    }
    if (input.flash) {
      const cost = calcFlashCost(
        input.flash.inputTokens,
        input.flash.outputTokens,
        input.flash.mode,
      );
      data.flashMode = input.flash.mode;
      data.flashInputTokens = input.flash.inputTokens;
      data.flashOutputTokens = input.flash.outputTokens;
      if (input.flash.audioSec != null)
        data.flashAudioSec = Math.round(input.flash.audioSec);
      data.flashCostUsd = cost;
      total += cost;
    }
    if (input.pro) {
      const cost = calcProCost(
        input.pro.inputTokens,
        input.pro.outputTokens,
        input.pro.mode,
      );
      data.proMode = input.pro.mode;
      data.proInputTokens = input.pro.inputTokens;
      data.proOutputTokens = input.pro.outputTokens;
      data.proCostUsd = cost;
      total += cost;
    }

    data.totalCostUsd = total;
    await prisma.audioCost.create({ data: data as any });
  } catch (e) {
    console.error("[cost-tracker] DB write error:", (e as Error).message);
  }
}
