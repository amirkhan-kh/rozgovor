/**
 * BatchScheduler Agent — Layer 6: Meta
 *
 * Maqsad: Vertex AI batch pipeline qachon ishga tushishini AQLLI hal qiladi.
 *
 * Sabab: Batch overhead ~15–25 daqiqa (STT + Flash + Pro setup vaqti).
 * Bu vaqt audio soni bilan kam o'zgaradi — 5 audio ham, 50 audio ham.
 * Shuning uchun batch'ni **yetarli audio to'plangach** ishga tushirish
 * har audio uchun xarajatni 8× kamaytiradi.
 *
 * Qaror chegaralari:
 *   pending ≥ 20               → RUN NOW (optimal)
 *   oldest pending > 60 min    → RUN NOW (juda uzoq kutildi)
 *   pending ≥ 10 & since > 90m → RUN NOW (moderate volume + long wait)
 *   else                       → WAIT (keyingi tekshiruv)
 *
 * Har qaror natijasi:
 *   1. Log + return reason
 *   2. RUN NOW bo'lsa — runBatchBackfill() trigger (fonda)
 *   3. Admin + ROP'larga Telegram xabar (faqat action olinganda)
 *
 * Model: hisoblash-only (AI chaqiruv yo'q — arzon, tezkor)
 * Ritm: scheduler.ts har soatda chaqiradi
 */

import { prisma } from "../../utils/prisma";
import { BaseAgent } from "../base.agent";
import type { AgentContext, AgentMetadata } from "../types";
import { runBatchBackfill } from "../../services/batch-backfill";
import { sendRawMessage } from "../../services/telegram";

// In-memory last batch time per company — server restart'da reset (OK)
const lastBatchAt = new Map<string, Date>();

// Chegaralar (env orqali override qilish mumkin)
const THRESHOLD_OPTIMAL = Number(process.env.BATCH_THRESHOLD_OPTIMAL || 20);
const THRESHOLD_MODERATE = Number(process.env.BATCH_THRESHOLD_MODERATE || 10);
const MAX_OLDEST_AGE_MIN = Number(process.env.BATCH_MAX_AGE_MIN || 60);
const MIN_TIME_SINCE_LAST_MIN = Number(process.env.BATCH_MIN_INTERVAL_MIN || 90);

type BatchAction = "run_now" | "wait";

interface BatchDecision {
  action: BatchAction;
  reason: string;
  pendingCount: number;
  oldestAgeMin: number | null;
  minutesSinceLastBatch: number | null;
  thresholds: {
    optimal: number;
    moderate: number;
    maxAge: number;
    minInterval: number;
  };
}

export class BatchSchedulerAgent extends BaseAgent<
  { companyId: string },
  BatchDecision
> {
  readonly metadata: AgentMetadata = {
    id: "batch-scheduler",
    name: "Batch Scheduler Agent",
    layer: "layer5-advanced",
    version: "1.0.0",
    description:
      "Vertex batch pipeline'ni samarali vaqtda ishga tushirish qarori — pending count + yosh + interval",
  };

  protected async run(
    input: { companyId: string },
    _ctx: AgentContext,
  ): Promise<BatchDecision> {
    const { companyId } = input;

    // 1. Pending audio statistikasi
    const activeManagers = await prisma.manager.findMany({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    const activeIds = activeManagers.map((m) => m.id);

    if (activeIds.length === 0) {
      return {
        action: "wait",
        reason: "Faol menejer yo'q",
        pendingCount: 0,
        oldestAgeMin: null,
        minutesSinceLastBatch: null,
        thresholds: {
          optimal: THRESHOLD_OPTIMAL,
          moderate: THRESHOLD_MODERATE,
          maxAge: MAX_OLDEST_AGE_MIN,
          minInterval: MIN_TIME_SINCE_LAST_MIN,
        },
      };
    }

    const pendingAudios = await prisma.audioFile.findMany({
      where: {
        companyId,
        // "error" avtomatik qayta urinmaydi — admin qo'lda "Tahlil qilish"
        // bossagina status="pending" qaytadi va keyingi batch pick qiladi.
        status: "pending",
        managerId: { in: activeIds },
        crmLeadId: { not: null },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const pendingCount = pendingAudios.length;
    const oldestAgeMin = pendingAudios[0]
      ? Math.round((Date.now() - pendingAudios[0].createdAt.getTime()) / 60000)
      : null;

    const lastRun = lastBatchAt.get(companyId) || null;
    const minutesSinceLastBatch = lastRun
      ? Math.round((Date.now() - lastRun.getTime()) / 60000)
      : null;

    const thresholds = {
      optimal: THRESHOLD_OPTIMAL,
      moderate: THRESHOLD_MODERATE,
      maxAge: MAX_OLDEST_AGE_MIN,
      minInterval: MIN_TIME_SINCE_LAST_MIN,
    };

    // 2. Qaror logikasi
    let action: BatchAction = "wait";
    let reason = "";

    if (pendingCount === 0) {
      action = "wait";
      reason = "Pending audio yo'q — hech narsa qilmaymiz";
    } else if (pendingCount >= THRESHOLD_OPTIMAL) {
      action = "run_now";
      reason = `${pendingCount} ≥ ${THRESHOLD_OPTIMAL} — samarali batch (optimal chegara)`;
    } else if (oldestAgeMin !== null && oldestAgeMin > MAX_OLDEST_AGE_MIN) {
      action = "run_now";
      reason = `Eng qadim audio ${oldestAgeMin} min kutdi (chegara ${MAX_OLDEST_AGE_MIN} min) — darhol batch`;
    } else if (
      pendingCount >= THRESHOLD_MODERATE &&
      (minutesSinceLastBatch === null || minutesSinceLastBatch > MIN_TIME_SINCE_LAST_MIN)
    ) {
      action = "run_now";
      reason = `${pendingCount} ≥ ${THRESHOLD_MODERATE} va oxirgi batch ${
        minutesSinceLastBatch !== null ? minutesSinceLastBatch + " min oldin" : "yo'q"
      } — moderate volume ishga tushadi`;
    } else {
      action = "wait";
      if (pendingCount < THRESHOLD_MODERATE) {
        reason = `Faqat ${pendingCount} ta — ${THRESHOLD_MODERATE}+ gacha kutaman (samarali emas)`;
      } else {
        reason = `${pendingCount} ta bor, lekin oxirgi batch ${minutesSinceLastBatch} min oldin — kutaman`;
      }
    }

    const decision: BatchDecision = {
      action,
      reason,
      pendingCount,
      oldestAgeMin,
      minutesSinceLastBatch,
      thresholds,
    };

    this.logger.info(
      `[BatchScheduler] ${companyId}: ${action.toUpperCase()} — ${reason}`,
    );

    // 3. Action execute
    if (action === "run_now") {
      lastBatchAt.set(companyId, new Date());
      // Fon rejimida — cron bloklanmasin
      runBatchBackfill(companyId)
        .then((count) => {
          this.logger.info(
            `[BatchScheduler] ${companyId} batch tugadi: ${count} ta fayl`,
          );
        })
        .catch((err) => {
          this.logger.error(
            `[BatchScheduler] ${companyId} batch xato: ${err?.message || err}`,
          );
        });

      await this.notifyStakeholders(companyId, decision, "run_now");
    } else if (oldestAgeMin !== null && oldestAgeMin > MAX_OLDEST_AGE_MIN / 2) {
      // WAIT bo'lsa ham, oldest age yarim chegara ustida — ogohlantirish
      await this.notifyStakeholders(companyId, decision, "wait_warning");
    }
    // WAIT (normal) — telegram yo'q (spam bo'lmasin)

    return decision;
  }

  /**
   * Admin va ROP'larga Telegram xabar yuborish.
   * kind: run_now | wait_warning
   */
  private async notifyStakeholders(
    companyId: string,
    decision: BatchDecision,
    kind: "run_now" | "wait_warning",
  ): Promise<void> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        name: true,
        telegramId: true,
        telegramEnabled: true,
      },
    });
    if (!company || !company.telegramEnabled) return;

    const rops = await prisma.manager.findMany({
      where: {
        companyId,
        role: "rop",
        isActive: true,
        telegramId: { not: null },
      },
      select: { telegramId: true, name: true },
    });

    const targets = new Set<string>();
    if (company.telegramId) targets.add(company.telegramId);
    for (const r of rops) {
      if (r.telegramId) targets.add(r.telegramId);
    }
    if (targets.size === 0) return;

    const msg = this.formatMessage(company.name, decision, kind);

    for (const chatId of targets) {
      try {
        await sendRawMessage(chatId, msg);
      } catch (e: any) {
        this.logger.warn(
          `[BatchScheduler] telegram yuborish xato (${chatId}): ${e?.message}`,
        );
      }
    }
  }

  /**
   * Minut miqdorini inson-do'stona formatga o'giradi:
   *   45 → "45 min"
   *   90 → "1s 30m"
   *   9859 → "6k 20s" (6 kun 20 soat)
   *   2880 → "2k" (2 kun)
   */
  private formatMinutes(mins: number | null): string {
    if (mins === null || mins === undefined) return "—";
    if (mins < 60) return `${mins} min`;
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const remainMin = mins % 60;
    if (days > 0) {
      return hours > 0 ? `${days}k ${hours}s` : `${days}k`;
    }
    if (hours > 0) {
      return remainMin > 0 ? `${hours}s ${remainMin}m` : `${hours}s`;
    }
    return `${mins} min`;
  }

  private formatMessage(
    companyName: string,
    d: BatchDecision,
    kind: "run_now" | "wait_warning",
  ): string {
    const oldest = this.formatMinutes(d.oldestAgeMin);
    const lastRun =
      d.minutesSinceLastBatch !== null
        ? `${this.formatMinutes(d.minutesSinceLastBatch)} oldin`
        : "birinchi marta";

    if (kind === "run_now") {
      return `🚀 Batch tahlil BOSHLANDI

🏢 ${companyName}
📞 Kutayotgan audio: ${d.pendingCount}
⏰ Eng qadim: ${oldest}
🕒 Oxirgi batch: ${lastRun}

✅ ${d.reason}

⏳ Taxminiy vaqt: 15–25 min
📊 Tahlil tugagach, sizga yakuniy hisobot yuboriladi`;
    }

    // wait_warning
    return `⚠️ Batch KUTIB TURYAPTI

🏢 ${companyName}
📞 Kutayotgan audio: ${d.pendingCount}
⏰ Eng qadim: ${oldest} (chegara: ${d.thresholds.maxAge} min)

💭 ${d.reason}

ℹ️ Batch ${d.thresholds.optimal}+ audio yoki ${d.thresholds.maxAge} min yosh bo'lganda ishga tushadi — bu pul va vaqt tejaydi`;
  }

  /** Debug/status uchun — hozirgi state */
  public getLastBatchAt(companyId: string): Date | null {
    return lastBatchAt.get(companyId) || null;
  }

  /** Manual override — last batch time ni yangilash (masalan, qo'lda ishga tushirilsa) */
  public setLastBatchAt(companyId: string, date: Date = new Date()): void {
    lastBatchAt.set(companyId, date);
  }
}

export const batchSchedulerAgent = new BatchSchedulerAgent();
