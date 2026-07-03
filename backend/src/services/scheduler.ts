import cron from "node-cron";
import { prisma } from "../utils/prisma";
import { sendDailySummary, sendAnalysisResult, sendAdminDailyReport, sendRopDailyReport, sendWeeklyFunnelAlert, sendManagerFollowupAlert, sendManagerDailyDigest, sendUnifiedReport } from "./telegram";
import { buildUnifiedReport, formatReport } from "./unified-daily-report";
import { processAudioFile } from "./processor";
import { syncCalls } from "./amocrm-sync";
import { makeRequest, refreshToken } from "./amocrm";
import { runBatchBackfill } from "./batch-backfill";
import { runCustdevBatchAnalysis } from "./custdev-batch";
import { runLessonBatchPipeline } from "./lesson-batch";
import { buildRopReport, buildAdminReport } from "./daily-report";
import { refreshAllCompanyPlaybooks } from "./top-performer";
import { getOverdueFollowups, followupReasonLabel } from "./followup-tracker";
import { refreshAllObjectionLibraries } from "./objection-library";
import { syncAllCompaniesSalesLeads } from "./sales-leads-sync";
import { runBitrixIncrementalSync, runBitrixReconcile, runBitrixReconcileRecent } from "./bitrix-sync";
import { runBitrixCallsSync } from "./bitrix-calls-sync";
import { runAnsweredContactsSync } from "./answered-contact-sync";
import { prewarmClientInsights } from "../controllers/clients.controller";
import { runActivitiesSync } from "../controllers/activities.controller";
import { pollVideoOperations } from "./manager-videos";

export const initScheduler = (): void => {
  // Bitrix sync/reconcile ishlarini SERIALIZATSIYA qiluvchi guard — bir ish
  // tugamasdan ikkinchisi boshlanmaydi. Catch-up paytida (DB juda orqada) qisqa
  // reconcile 5 daqiqadan uzoq cho'zilishi mumkin → guard pile-up va bir vaqtda
  // Bitrix API hammaring oldini oladi.
  let bitrixBusy = false;
  const runBitrixGuarded = async (label: string, fn: () => Promise<void>): Promise<void> => {
    if (bitrixBusy) {
      console.log(`[${label}] oldingi bitrix ishi hali tugamagan — skip`);
      return;
    }
    bitrixBusy = true;
    try {
      await fn();
    } catch (err) {
      console.error(`[${label}] failed:`, (err as Error).message);
    } finally {
      bitrixBusy = false;
    }
  };

  // Har 5 daqiqa: incremental (DATE_MODIFY, eski yozuv o'zgarishi) +
  // qisqa reconcile (DATE_CREATE oxirgi N kun — yangi + o'chirilganni tenglashtiradi).
  // O'chirish uchun: SKIP_BITRIX_SYNC=true .env ga qo'shing.
  if (process.env.SKIP_BITRIX_SYNC !== "true") {
    cron.schedule("*/5 * * * *", () =>
      runBitrixGuarded("bitrix-sync cron", async () => {
        console.log("[bitrix-sync cron] tick — incremental + qisqa reconcile");
        await runBitrixIncrementalSync();
        if (process.env.SKIP_BITRIX_RECONCILE !== "true") {
          await runBitrixReconcileRecent();
        }
      }),
    );
    console.log("[Scheduler] Bitrix incremental + qisqa reconcile: har 5 daqiqada");
  }

  // To'liq reconcile — kunlik 04:10 (oxirgi M oy, eski o'chirilganlar uchun) +
  // boot'da bir marta qisqa reconcile (restartdan keyin tez tenglashish).
  // O'chirish uchun: SKIP_BITRIX_RECONCILE=true .env ga qo'shing.
  if (process.env.SKIP_BITRIX_RECONCILE !== "true") {
    setTimeout(
      () => runBitrixGuarded("bitrix-reconcile boot", runBitrixReconcileRecent),
      30000,
    ); // 30s keyin — boot to'la tugagach

    cron.schedule("10 4 * * *", () =>
      runBitrixGuarded("bitrix-reconcile cron", async () => {
        console.log("[bitrix-reconcile cron] tick — to'liq sverka (oxirgi oylar)");
        await runBitrixReconcile();
      }),
    );
    console.log("[Scheduler] Bitrix reconcile: kunlik 04:10 (to'liq) + har 5 daq (qisqa) + boot");
  }

  // Bitrix qo'ng'iroq (voximplant) → AudioFile sync — har 30 daq + boot.
  // Audit/Audio sahifa qo'ng'iroq statistikasi DOIMO Bitrix bilan tenglashadi.
  // Incremental (oxirgi callDate'dan). O'chirish: SKIP_BITRIX_CALLS_SYNC=true.
  if (process.env.SKIP_BITRIX_CALLS_SYNC !== "true") {
    setTimeout(
      () => runBitrixGuarded("bitrix-calls-sync boot", runBitrixCallsSync),
      45000,
    ); // 45s keyin — deal/lead boot'dan keyin

    cron.schedule("*/30 * * * *", () =>
      runBitrixGuarded("bitrix-calls-sync cron", async () => {
        console.log("[bitrix-calls-sync cron] tick — qo'ng'iroqlar sync");
        await runBitrixCallsSync();
        // Aloqaga chiqish uchun javob berilgan qo'ng'iroqlar (Lead.firstAnsweredCallAt)
        await runAnsweredContactsSync();
      }),
    );
    setTimeout(
      () => runBitrixGuarded("answered-contact-sync boot", runAnsweredContactsSync),
      60000,
    ); // 60s keyin — calls boot'dan keyin
    console.log("[Scheduler] Bitrix qo'ng'iroq + answered-contact sync: har 30 daqiqada + boot");
  }

  // Imtihon stsenariylari — boot'da auto-seed (create-only, idempotent, mavjudni
  // BUZMAYDI). Aks holda bo'sh kompaniyada "Imtihon belgilash" → "faol stsenariy
  // yo'q" → 500. O'chirish: SKIP_EXAM_SEED=true .env ga qo'shing.
  if (process.env.SKIP_EXAM_SEED !== "true") {
    setTimeout(() => {
      import("./voice-exam/seed-scenarios")
        .then((m) => m.seedScenariosForAllCompanies())
        .catch((err) => console.error("[exam-seed boot] failed:", (err as Error).message));
    }, 20000);
  }

  // ─── Activities (Zadachalar) sync — har soatda so'nggi 7 kun ─────────
  // Bitrix24'dagi yangi/o'zgargan topshiriq, qo'ng'iroq, uchrashuvlarni DB'ga
  // yig'adi. WebSocket orqali `activity:update` yuboriladi.
  // O'chirish uchun: SKIP_ACTIVITIES_SYNC=true .env ga qo'shing.
  if (process.env.SKIP_ACTIVITIES_SYNC !== "true") {
    // Boot paytida bir marta (15s keyin) — server restartdan keyin ham fresh.
    setTimeout(async () => {
      try {
        const companies = await prisma.company.findMany({ select: { id: true, name: true } });
        for (const c of companies) {
          try {
            const { upserted } = await runActivitiesSync(c.id, 7);
            console.log(`[activities-sync boot] ${c.name}: ${upserted} upserted`);
          } catch (err) {
            console.error(`[activities-sync boot] ${c.name} failed:`, (err as Error).message);
          }
        }
      } catch (err) {
        console.error("[activities-sync boot] global error:", (err as Error).message);
      }
    }, 15000);

    cron.schedule("15 * * * *", async () => {
      console.log("[activities-sync cron] tick — soatlik sinxron boshlandi");
      try {
        const companies = await prisma.company.findMany({ select: { id: true, name: true } });
        for (const c of companies) {
          try {
            const { upserted } = await runActivitiesSync(c.id, 7);
            console.log(`[activities-sync] ${c.name}: ${upserted} upserted`);
          } catch (err) {
            console.error(`[activities-sync] ${c.name} failed:`, (err as Error).message);
          }
        }
      } catch (err) {
        console.error("[activities-sync cron] global error:", (err as Error).message);
      }
    });
    console.log("[Scheduler] Activities sync: har soatning 15-daqiqasida (7 kun deraza)");
  }

  // Mijozlar portreti AI narrative — startda va har 6 soatda pre-warm
  // (Frontend'da Mijozlar sahifasi tez ochilishi uchun)
  setTimeout(() => {
    prewarmClientInsights().catch((err) => console.error("[prewarm start] ", err));
  }, 10000); // 10s keyin server to'la tayyor bo'lgach
  cron.schedule("0 */6 * * *", async () => {
    console.log("[Scheduler] Client insights prewarm...");
    await prewarmClientInsights();
  });
  console.log("[Scheduler] Client insights prewarm: har 6 soatda");

  // ─── Wave 4: Manager Celebration Videos — VEO operation poll ─────────
  // Har 2 daqiqada "generating" status'dagi ManagerVideo rowlarini poll
  // qilamiz. Tayyor bo'lganlar Yandex'ga ko'chirilib status="ready" bo'ladi.
  // O'chirish uchun: SKIP_VIDEO_POLL=true .env ga qo'shing.
  if (process.env.SKIP_VIDEO_POLL !== "true") {
    cron.schedule("*/2 * * * *", async () => {
      try {
        const result = await pollVideoOperations();
        if (result.ready > 0 || result.failed > 0 || result.pending > 0) {
          console.log(
            `[video-poll cron] ready=${result.ready} failed=${result.failed} pending=${result.pending}`,
          );
        }
      } catch (err) {
        console.error("[video-poll cron] failed:", (err as Error).message);
      }
    });
    console.log("[Scheduler] Manager video poll: har 2 daqiqada");
  }

  // Dev rejimda qolgan cron'larni (AI analyze, reportlar) to'xtatish:
  // SKIP_CRON=true .env ga qo'shing
  if (process.env.SKIP_CRON === "true") {
    console.log("[Scheduler] SKIP_CRON=true — auto-analiz o'chirilgan (dev rejim)");
    return;
  }

  // Har kuni 20:00 da: 1) pending audio fayllarni tahlil qilish, 2) kunlik xulosa yuborish
  cron.schedule("0 20 * * *", async () => {
    console.log("[Scheduler] Running daily analysis + summary job...");

    try {
      const companies = await prisma.company.findMany();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const company of companies) {
        try {
          // 1. Bugungi pending audio fayllarni tahlil qilish
          const pendingFiles = await prisma.audioFile.findMany({
            where: {
              companyId: company.id,
              status: "pending",
              createdAt: { gte: today },
            },
          });

          if (pendingFiles.length > 0) {
            console.log(`[Scheduler] Analyzing ${pendingFiles.length} pending files for company ${company.id}`);
            const BATCH_SIZE = 3;
            for (let i = 0; i < pendingFiles.length; i += BATCH_SIZE) {
              const batch = pendingFiles.slice(i, i + BATCH_SIZE);
              const results = await Promise.allSettled(
                batch.map((file) => processAudioFile(file.id))
              );
              for (const r of results) {
                if (r.status === "rejected") {
                  console.error(`[Scheduler] Process error:`, r.reason);
                }
              }
              await new Promise((r) => setTimeout(r, 5000));
            }
          }

          // 2. Kunlik xulosa (telegram)
          if (!company.dailySummaryEnabled || !company.telegramId) continue;

          const doneFiles = await prisma.audioFile.findMany({
            where: {
              companyId: company.id,
              status: "done",
              createdAt: { gte: today },
            },
            include: {
              analysis: { select: { overallScore: true } },
              manager: { select: { name: true } },
            },
          });

          if (doneFiles.length === 0) continue;

          const scores = doneFiles.map((f) => f.analysis?.overallScore || 0);
          const avgScore = Math.round(
            scores.reduce((a, b) => a + b, 0) / scores.length
          );

          let topManager = "—";
          let topScore = 0;
          for (const file of doneFiles) {
            const score = file.analysis?.overallScore || 0;
            if (score > topScore) {
              topScore = score;
              topManager = file.manager?.name || "Noma'lum";
            }
          }

          const yesterday = new Date(today);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayFiles = await prisma.audioFile.findMany({
            where: {
              companyId: company.id,
              status: "done",
              createdAt: { gte: yesterday, lt: today },
            },
            include: { analysis: { select: { overallScore: true } } },
          });

          const yesterdayScores = yesterdayFiles.map((f) => f.analysis?.overallScore || 0);
          const yesterdayAvg = yesterdayScores.length > 0
            ? yesterdayScores.reduce((a, b) => a + b, 0) / yesterdayScores.length
            : 0;
          const growth = yesterdayAvg > 0
            ? Math.round(((avgScore - yesterdayAvg) / yesterdayAvg) * 100)
            : 0;

          await sendDailySummary(company.telegramId, {
            date: today.toISOString().split("T")[0],
            total: doneFiles.length,
            avg: avgScore,
            topManager,
            topScore,
            growth,
          });

          // 3. Kengaytirilgan admin hisoboti (jamoa + zaif ko'nikmalar)
          try {
            const adminReport = await buildAdminReport(company.id);
            if (adminReport && adminReport.totalCalls > 0) {
              await sendAdminDailyReport(company.telegramId, adminReport);
            }
          } catch (adminErr) {
            console.error(`[Scheduler] Admin report error for ${company.id}:`, adminErr);
          }

          // 4. ROP'larga batafsil hisobot (jamoa + zaif ko'nikma + kitob + resurslar)
          try {
            const rops = await prisma.manager.findMany({
              where: {
                companyId: company.id,
                role: "rop",
                isActive: true,
                telegramId: { not: null },
              },
              select: { id: true, name: true, telegramId: true },
            });

            if (rops.length > 0) {
              const ropReport = await buildRopReport(company.id);
              if (ropReport) {
                for (const rop of rops) {
                  if (!rop.telegramId) continue;
                  try {
                    await sendRopDailyReport(rop.telegramId, ropReport);
                    console.log(`[Scheduler] ROP report sent to ${rop.name}`);
                  } catch (ropErr) {
                    console.error(`[Scheduler] ROP send error ${rop.name}:`, ropErr);
                  }
                }
              }
            }
          } catch (ropErr) {
            console.error(`[Scheduler] ROP report error for ${company.id}:`, ropErr);
          }
        } catch (companyErr) {
          console.error(`[Scheduler] Error for company ${company.id}:`, companyErr);
        }
      }

      console.log("[Scheduler] Daily job completed");
    } catch (err) {
      console.error("[Scheduler] Cron error:", err);
    }
  });

  console.log("[Scheduler] Initialized — daily analysis + summary at 20:00");

  // ─── Unified daily bot report — per-company / per-manager time ─────────
  // Har daqiqada Tashkent HH:mm ni hisoblab, profile sahifasida belgilangan
  // vaqtga to'g'ri kelgan kompaniya admin va menejerlarga sotuv+lid+audit
  // jamlangan hisobotni botga yuboradi.
  const lastFiredCompany = new Map<string, string>(); // companyId -> YYYY-MM-DD
  const lastFiredManager = new Map<string, string>();
  cron.schedule("* * * * *", async () => {
    try {
      const nowUtc = new Date();
      const tashkent = new Date(nowUtc.getTime() + 5 * 3600 * 1000);
      const hh = String(tashkent.getUTCHours()).padStart(2, "0");
      const mm = String(tashkent.getUTCMinutes()).padStart(2, "0");
      const now = `${hh}:${mm}`;
      const today = tashkent.toISOString().split("T")[0];

      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          telegramId: true,
          telegramEnabled: true,
          adminReportTime: true,
          reportStyle: true,
          reportIncludeSales: true,
          reportIncludeLeads: true,
          reportIncludeAudit: true,
        },
      });

      for (const c of companies) {
        // Admin
        if (
          c.telegramId &&
          c.telegramEnabled &&
          c.adminReportTime === now &&
          lastFiredCompany.get(c.id) !== today
        ) {
          try {
            const report = await buildUnifiedReport(c.id);
            if (report) {
              const text = formatReport(report, {
                style: (c.reportStyle as any) || "detailed",
                includeSales: c.reportIncludeSales,
                includeLeads: c.reportIncludeLeads,
                includeAudit: c.reportIncludeAudit,
              });
              await sendUnifiedReport(c.telegramId, text);
              lastFiredCompany.set(c.id, today);
              console.log(`[unified-report] ${c.name} admin xabar yuborildi`);
            }
          } catch (err) {
            console.error(`[unified-report] ${c.name} admin xato:`, (err as Error).message);
          }
        }

        // Managers — kim shu daqiqaga to'g'ri kelsa
        const managers = await prisma.manager.findMany({
          where: {
            companyId: c.id,
            isActive: true,
            telegramId: { not: null },
            reportEnabled: true,
            OR: [
              { dailyReportTime: now },
              { dailyReportTime: null, AND: { id: { not: undefined } } }, // null → company time
            ],
          },
          select: {
            id: true,
            name: true,
            telegramId: true,
            dailyReportTime: true,
            reportStyle: true,
          },
        });

        for (const m of managers) {
          const myTime = m.dailyReportTime || c.adminReportTime;
          if (myTime !== now) continue;
          if (lastFiredManager.get(m.id) === today) continue;
          try {
            const report = await buildUnifiedReport(c.id);
            if (!report) continue;
            const text = formatReport(report, {
              style: (m.reportStyle as any) || (c.reportStyle as any) || "detailed",
              forManagerId: m.id,
              includeSales: c.reportIncludeSales,
              includeLeads: c.reportIncludeLeads,
              includeAudit: c.reportIncludeAudit,
            });
            await sendUnifiedReport(m.telegramId!, text);
            lastFiredManager.set(m.id, today);
            console.log(`[unified-report] ${c.name} → ${m.name} yuborildi`);
          } catch (err) {
            console.error(`[unified-report] ${m.name} xato:`, (err as Error).message);
          }
        }
      }
    } catch (err) {
      console.error("[unified-report] tick error:", (err as Error).message);
    }
  });
  console.log("[Scheduler] Unified daily report tick: har daqiqada");

  // Har 30 daqiqada: SalesLead jadvalini AmoCRM bilan sinxronlash
  cron.schedule("*/30 * * * *", async () => {
    console.log("[Scheduler] SalesLead sync starting…");
    try {
      await syncAllCompaniesSalesLeads();
    } catch (err) {
      console.error("[Scheduler] SalesLead sync error:", err);
    }
  });

  // Har soatda: AmoCRM sync → tahlil → note → telegram
  cron.schedule("0 * * * *", async () => {
    console.log("[Scheduler] Running hourly pipeline...");

    try {
      const credentials = await prisma.amoCredential.findMany({
        include: { company: { select: { id: true, telegramId: true, sendEachAnalysis: true } } },
      });

      if (credentials.length === 0) return;

      const twoHoursAgo = new Date();
      twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
      const dateFrom = twoHoursAgo.toISOString();

      for (const cred of credentials) {
        const companyId = cred.companyId;
        try {
          // 1. AmoCRM sync
          console.log(`[Hourly] Sync: ${companyId}`);
          const syncResult = await syncCalls(companyId, dateFrom);
          console.log(`[Hourly] Synced: ${syncResult.synced} new`);

          // 2. BATCH SCHEDULER AGENT — aqlli qaror
          // Qisqa audio (< 10) va yaqin batch (< 90 min) — kutadi.
          // Chegara yoki eskirgan audio — darhol batch.
          // Telegram'ga ROP/admin xabar beradi.
          try {
            const { batchSchedulerAgent } = await import("../agents/layer6-meta/batch-scheduler.agent");
            const result = await batchSchedulerAgent.execute(
              { companyId },
              { companyId },
            );
            if (result.success && result.data) {
              console.log(
                `[Hourly] ${companyId} batch decision: ${result.data.action} — ${result.data.reason}`,
              );
            }
          } catch (err) {
            console.error(
              `[Hourly] BatchScheduler ${companyId} xato:`,
              (err as Error).message?.substring(0, 100),
            );
          }

          // 3. Yangi tahlillar uchun AmoCRM note yuborish
          const recentAnalyzed = await prisma.audioFile.findMany({
            where: {
              companyId,
              status: "done",
              leadId: { not: null },
              createdAt: { gte: twoHoursAgo },
            },
            select: {
              id: true,
              leadId: true,
              analysis: true,
              manager: { select: { name: true } },
            },
          });

          if (recentAnalyzed.length > 0) {
            console.log(`[Hourly] Sending ${recentAnalyzed.length} notes to AmoCRM`);
            for (const audio of recentAnalyzed) {
              if (!audio.leadId || !audio.analysis) continue;
              try {
                const noteText = buildAmoNote(
                  audio.analysis as any,
                  audio.id,
                  audio.manager?.name,
                );
                await makeRequest(companyId, "post", `/leads/${audio.leadId}/notes`, [
                  { note_type: "common", params: { text: noteText } },
                ]);
                await new Promise((r) => setTimeout(r, 350));
              } catch {}
            }
          }

        } catch (err) {
          console.error(`[Hourly] Error for ${companyId}:`, err);
        }
      }

      console.log("[Scheduler] Hourly pipeline completed");
    } catch (err) {
      console.error("[Scheduler] Hourly cron error:", err);
    }
  });

  console.log("[Scheduler] Initialized — hourly pipeline (sync → analyze → notes → telegram)");

  // Har 3 soatda: AmoCRM tokenlarini proactive yangilash (expiry'ni kutmasdan).
  // AmoCRM access_token 24 soat yashaydi, refresh_token har almashinuvda yangilanib 3 oy tirik.
  // Proactive refresh → idle paytda ham token hech qachon "eskirgan" bo'lmaydi,
  // shuning uchun kelajakda refresh_token bekor bo'lib qolish ehtimoli yo'q.
  cron.schedule("0 */3 * * *", async () => {
    console.log("[Scheduler] Proactive AmoCRM token refresh...");
    try {
      const creds = await prisma.amoCredential.findMany({ select: { companyId: true } });
      for (const c of creds) {
        try {
          await refreshToken(c.companyId);
        } catch (err) {
          console.error(`[TokenRefresh] ${c.companyId} failed:`, (err as Error).message);
        }
      }
      console.log(`[Scheduler] Proactive refresh done for ${creds.length} companies`);
    } catch (err) {
      console.error("[Scheduler] Proactive refresh cron error:", err);
    }
  });

  // Boot paytida darhol bir marta refresh — PM2 restart'dan keyin ham tokenlar tez yangilanadi.
  setTimeout(async () => {
    try {
      const creds = await prisma.amoCredential.findMany({ select: { companyId: true } });
      for (const c of creds) {
        try {
          await refreshToken(c.companyId);
          console.log(`[Boot] Token refreshed: ${c.companyId}`);
        } catch (err) {
          console.error(`[Boot] Token refresh failed for ${c.companyId}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.error("[Boot] Token refresh init error:", err);
    }
  }, 5000);

  // ─── Har Yakshanba 23:00: Top performer playbook yangilash ───────────────
  // Barcha aktiv kompaniyalar uchun "Elyor formulasi"ni qayta hisoblaydi.
  // Agar isSale ma'lumotlari to'ldirilmagan bo'lsa — o'tkazib yuboradi.
  cron.schedule("0 23 * * 0", async () => {
    console.log("[Scheduler] Top performer playbook refresh starting (30-day window)...");
    try {
      await refreshAllCompanyPlaybooks();
    } catch (err) {
      console.error("[Scheduler] Top performer refresh error:", err);
    }
  });

  // ─── Har 6 soatda: Red-Alert — at-risk bitimlarni tekshirish ──────────
  cron.schedule("0 */6 * * *", async () => {
    console.log("[Scheduler] Red-Alert — at-risk deals scan...");
    try {
      const { redAlertAgent } = await import("../agents/layer5-advanced/red-alert.agent");
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const company of companies) {
        try {
          await redAlertAgent.execute(
            { companyId: company.id },
            { companyId: company.id },
          );
        } catch (err) {
          console.error(`[RedAlert] ${company.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Scheduler] Red-Alert error:", err);
    }
  });

  // ─── Har kuni 07:30: Knowledge-Distiller — bugungi 30 soniyalik dars ──
  cron.schedule("30 7 * * *", async () => {
    console.log("[Scheduler] Knowledge-Distiller — daily lesson...");
    try {
      const { knowledgeDistillerAgent } = await import(
        "../agents/layer5-advanced/knowledge-distiller.agent"
      );
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      for (const company of companies) {
        try {
          await knowledgeDistillerAgent.execute(
            { companyId: company.id },
            { companyId: company.id },
          );
        } catch (err) {
          console.error(`[Distiller] ${company.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Scheduler] Knowledge-Distiller error:", err);
    }
  });

  // ─── Har dushanba 06:00: Playbook 7-kunlik incremental refresh ────────
  // Weekly refresh — sotuv bozori tez o'zgaradi, yangi texnikalar trendi
  // dushanba ertalab Strategist va Coach'ga yetkazilishi kerak.
  cron.schedule("0 6 * * 1", async () => {
    console.log("[Scheduler] Top performer playbook weekly refresh (7-day window)...");
    try {
      const { refreshTopPerformerPlaybook } = await import("./top-performer");
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });
      for (const company of companies) {
        try {
          await refreshTopPerformerPlaybook(company.id, 7);
          await new Promise((r) => setTimeout(r, 2000));
        } catch (err: any) {
          console.error(`[TopPerformer/weekly] ${company.name}:`, err?.message);
        }
      }
      console.log("[Scheduler] Weekly playbook refresh done");
    } catch (err) {
      console.error("[Scheduler] Weekly playbook refresh error:", err);
    }
  });

  // ─── Har dushanba 08:00: Strategist — haftalik rejalar ────────────────
  // Har menejer uchun bu haftalik bitta diqqat joyi va mashqlar
  cron.schedule("0 8 * * 1", async () => {
    console.log("[Scheduler] Strategist — weekly plans job starting...");
    try {
      const { strategistAgent } = await import("../agents/layer3-intelligence/strategist.agent");
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const company of companies) {
        const managers = await prisma.manager.findMany({
          where: { companyId: company.id, isActive: true },
          select: { id: true },
        });

        for (const m of managers) {
          try {
            const result = await strategistAgent.execute(
              { managerId: m.id, companyId: company.id },
              { companyId: company.id, managerId: m.id },
            );
            if (result.success && result.data) {
              console.log(`[Strategist] ${m.id}: focus="${result.data.focusArea}"`);
            }
          } catch (err) {
            console.error(`[Strategist] ${m.id} failed:`, err);
          }
        }
      }
      console.log("[Scheduler] Strategist weekly plans done");
    } catch (err) {
      console.error("[Scheduler] Strategist error:", err);
    }
  });

  // ─── Har juma 17:00: Progress — haftalik snapshot ────────────────────
  // Strategist rejasining natijasini hisoblash, trend kuzatish
  cron.schedule("0 17 * * 5", async () => {
    console.log("[Scheduler] Progress — weekly snapshot starting...");
    try {
      const { progressAgent } = await import("../agents/layer4-delivery/progress.agent");
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const company of companies) {
        const managers = await prisma.manager.findMany({
          where: { companyId: company.id, isActive: true },
          select: { id: true },
        });

        for (const m of managers) {
          try {
            await progressAgent.execute(
              { managerId: m.id, companyId: company.id },
              { companyId: company.id, managerId: m.id },
            );
          } catch (err) {
            console.error(`[Progress] ${m.id} failed:`, err);
          }
        }
      }
      console.log("[Scheduler] Progress snapshot done");
    } catch (err) {
      console.error("[Scheduler] Progress error:", err);
    }
  });

  // ─── Har yakshanba 23:30: Pattern Miner — Golden Moments yig'ish ──────
  // Menejerning yutuqli daqiqalarini topadi, Coach dushanba ertalabdan
  // ularni ijobiy motivatsiya uchun ishlata boshlaydi.
  cron.schedule("30 23 * * 0", async () => {
    console.log("[Scheduler] Pattern Miner — golden moments job starting...");
    try {
      const { patternMinerAgent } = await import("../agents/layer2-quality/pattern-miner.agent");
      const companies = await prisma.company.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const company of companies) {
        const managers = await prisma.manager.findMany({
          where: { companyId: company.id, isActive: true },
          select: { id: true },
        });

        for (const m of managers) {
          try {
            const result = await patternMinerAgent.execute(
              { managerId: m.id, companyId: company.id },
              { companyId: company.id, managerId: m.id },
            );
            if (result.success && result.data) {
              console.log(
                `[PatternMiner] ${m.id}: ${result.data.moments.length} new, ${result.data.alreadyExisting} existing`,
              );
            }
          } catch (err) {
            console.error(`[PatternMiner] ${m.id} failed:`, err);
          }
        }
      }
      console.log("[Scheduler] Pattern Miner job done");
    } catch (err) {
      console.error("[Scheduler] Pattern Miner error:", err);
    }
  });

  // ─── Har oyning 1-kunida 02:00: Objection library yangilash (B2-4) ───
  // Oylik refresh — Gemini Pro qimmat, shuning uchun seyrek
  cron.schedule("0 2 1 * *", async () => {
    console.log("[Scheduler] Objection library monthly refresh starting...");
    try {
      await refreshAllObjectionLibraries();
    } catch (err) {
      console.error("[Scheduler] Objection library refresh error:", err);
    }
  });

  // ─── Har Dushanba 09:00: Haftalik funnel alert (ROP/Admin) ───────────────
  cron.schedule("0 9 * * 1", async () => {
    console.log("[Scheduler] Weekly funnel alert starting...");
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true, telegramEnabled: true, telegramId: { not: null } },
        select: { id: true, name: true, telegramId: true, topPerformerPlaybook: true },
      });

      const since7 = new Date();
      since7.setDate(since7.getDate() - 7);

      for (const company of companies) {
        try {
          const files = await prisma.audioFile.findMany({
            where: { companyId: company.id, status: "done", createdAt: { gte: since7 } },
            select: {
              isSale: true,
              managerId: true,
              manager: { select: { name: true } },
              analysis: { select: { managerSpeech: true, errors: true, objections: true } },
            },
          });

          if (files.length < 5) continue;

          const total = files.length;
          const totalSales = files.filter((f) => f.isSale).length;
          const conversionRate = Math.round((totalSales / total) * 100 * 10) / 10;

          // Speech violations
          const speechViolations = files.filter((f) => (f.analysis?.managerSpeech ?? 0) > 70);
          const speechViolationPercent = Math.round((speechViolations.length / total) * 100);
          const mgrSpeechAcc: Record<string, { sum: number; count: number; name: string }> = {};
          for (const f of speechViolations) {
            if (!f.managerId || !f.manager) continue;
            const mid = f.managerId;
            if (!mgrSpeechAcc[mid]) mgrSpeechAcc[mid] = { sum: 0, count: 0, name: f.manager.name };
            mgrSpeechAcc[mid].sum += f.analysis?.managerSpeech ?? 0;
            mgrSpeechAcc[mid].count += 1;
          }
          const speechWorstManagers = Object.values(mgrSpeechAcc)
            .map((s) => ({ managerName: s.name, ratio: Math.round(s.sum / s.count) }))
            .sort((a, b) => b.ratio - a.ratio)
            .slice(0, 2);

          // Surrender
          const surrenderedFiles = files.filter((f) =>
            ((f.analysis?.errors as any[]) || []).some((e: any) => e.type === "E'tirozga javob berilmadi")
          );
          const withObjFiles = files.filter((f) => ((f.analysis?.objections as any[]) || []).length > 0);
          const surrenderPercent = withObjFiles.length > 0
            ? Math.round((surrenderedFiles.length / withObjFiles.length) * 100)
            : 0;
          const objTypeCount: Record<string, number> = {};
          for (const f of surrenderedFiles) {
            for (const o of ((f.analysis?.objections as any[]) || [])) {
              objTypeCount[o.type] = (objTypeCount[o.type] || 0) + 1;
            }
          }
          const topObjEntry = Object.entries(objTypeCount).sort((a, b) => b[1] - a[1])[0];

          // Open endings
          const openEndingFiles = files.filter((f) =>
            ((f.analysis?.errors as any[]) || []).some((e: any) => e.type === "Yakunlash zaif")
          );
          const openEndingPercent = Math.round((openEndingFiles.length / total) * 100);
          const mgrOpenAcc: Record<string, { count: number; name: string }> = {};
          for (const f of openEndingFiles) {
            if (!f.managerId || !f.manager) continue;
            const mid = f.managerId;
            if (!mgrOpenAcc[mid]) mgrOpenAcc[mid] = { count: 0, name: f.manager.name };
            mgrOpenAcc[mid].count += 1;
          }
          const openEndingWorstManagers = Object.values(mgrOpenAcc)
            .sort((a, b) => b.count - a.count)
            .slice(0, 2)
            .map((m) => ({ managerName: m.name, count: m.count }));

          // Top performer
          const playbook = company.topPerformerPlaybook as Record<string, any> | null;
          const topTechnique = (playbook?.techniques || [])[0]
            ? `${playbook!.techniques[0].name}: "${playbook!.techniques[0].example}"`
            : undefined;

          await sendWeeklyFunnelAlert(company.telegramId!, {
            companyName: company.name,
            totalCalls: total,
            totalSales,
            conversionRate,
            speechViolationPercent,
            speechWorstManagers,
            surrenderPercent,
            surrenderWorstType: topObjEntry?.[0] || "Narx",
            surrenderWorstCount: topObjEntry?.[1] || 0,
            openEndingPercent,
            openEndingWorstManagers,
            topPerformerName: playbook?.managerName,
            topPerformerConversion: playbook?.conversionRate,
            topPerformerTechnique: topTechnique,
            estimatedLostDeals: Math.round(surrenderedFiles.length * (conversionRate / 100)) +
              Math.round(openEndingFiles.length * 0.15),
          });
        } catch (compErr) {
          console.error(`[Scheduler] Weekly funnel alert error for ${company.name}:`, compErr);
        }
      }
    } catch (err) {
      console.error("[Scheduler] Weekly funnel alert global error:", err);
    }
  });

  // ─── Har kuni 09:30: Follow-up overdue alerts (B2-2) ───────────────────
  // "O'ylayman" dedi, lekin menejer qaytib qo'ng'iroq qilmadi — alert
  cron.schedule("30 9 * * *", async () => {
    console.log("[Scheduler] Daily follow-up alerts starting...");
    try {
      const companies = await prisma.company.findMany({
        where: { isActive: true, telegramEnabled: true },
        select: {
          id: true,
          name: true,
          topPerformerPlaybook: true,
        },
      });

      for (const company of companies) {
        try {
          const overdue = await getOverdueFollowups(company.id);
          if (overdue.length === 0) continue;

          // Menejer bo'yicha guruhlash
          const byManager: Record<string, typeof overdue> = {};
          for (const item of overdue) {
            if (!item.managerId || !item.managerTelegramId) continue;
            if (!byManager[item.managerId]) byManager[item.managerId] = [];
            byManager[item.managerId].push(item);
          }

          const playbook = company.topPerformerPlaybook as Record<string, any> | null;
          const topResponse = playbook?.objectionHandling?.[0]?.response as string | undefined;

          for (const [, items] of Object.entries(byManager)) {
            const first = items[0];
            if (!first.managerTelegramId || !first.managerName) continue;
            try {
              await sendManagerFollowupAlert(
                first.managerTelegramId,
                first.managerName,
                items.map((i) => ({
                  clientPhone: i.clientPhone,
                  daysOverdue: i.daysOverdue,
                  reasonLabel: followupReasonLabel(i.followupReason),
                  phrase: i.followupPhrase,
                })),
                topResponse
              );
            } catch (sendErr) {
              console.error(`[Scheduler] Followup alert send error:`, sendErr);
            }
          }
        } catch (compErr) {
          console.error(`[Scheduler] Followup alert error for ${company.name}:`, compErr);
        }
      }
    } catch (err) {
      console.error("[Scheduler] Daily followup global error:", err);
    }
  });

  // ─── Custdev batch tahlil — har 30 daqiqada ─────────────────────────
  // PHASE 1 (STT) onlayn, PHASE 2 (Gemini Pro savol-javob tahlil) faqat
  // Vertex AI batch prediction orqali bajariladi. Bu cron STT bajarilgan
  // barcha intervyularni (status="processing" + transcription != null)
  // bitta batch job ichida tahlil qiladi.
  //
  // O'chirish uchun: SKIP_CUSTDEV_BATCH=true .env ga qo'shing.
  if (process.env.SKIP_CUSTDEV_BATCH !== "true") {
    cron.schedule("*/30 * * * *", async () => {
      console.log("[custdev-batch cron] tick — tahlil kutayotgan intervyular tekshirilyapti");
      try {
        const n = await runCustdevBatchAnalysis({});
        if (n > 0) {
          console.log(`[custdev-batch cron] ${n} intervyu tahlil qilindi`);
        }
      } catch (err) {
        console.error("[custdev-batch cron] failed:", (err as Error).message);
      }
    });
    console.log("[Scheduler] Custdev batch tahlil: har 30 daqiqada");
  }

  // ─── Lesson batch tahlil — har 30 daqiqada ──────────────────────────
  // PHASE 1 (upload + Yandex deferred STT submit) per-upload ishlaydi.
  // PHASE 2 — ikki pass:
  //   1) STT operation poll — tayyor bo'lganlarning transkriptini DB'ga yozadi
  //   2) Gemini 2.5 Flash BATCH — transkripsiyadan testQuestions + aiSystemPrompt
  //      + aiKeyTopics generatsiya qiladi, status "ready" bo'ladi
  //
  // O'chirish uchun: SKIP_LESSON_BATCH=true .env ga qo'shing.
  if (process.env.SKIP_LESSON_BATCH !== "true") {
    cron.schedule("*/30 * * * *", async () => {
      console.log("[lesson-batch cron] tick — STT poll + Flash batch");
      try {
        const { sttReady, flashReady } = await runLessonBatchPipeline({});
        if (sttReady > 0 || flashReady > 0) {
          console.log(
            `[lesson-batch cron] STT ready: ${sttReady}, Flash ready: ${flashReady}`
          );
        }
      } catch (err) {
        console.error("[lesson-batch cron] failed:", (err as Error).message);
      }
    });
    console.log("[Scheduler] Lesson batch tahlil: har 30 daqiqada");
  }

  // Guardian Agent CRON O'CHIRILGAN — avtomatik Flash batch ishga tushishi
  // Vertex quotasini iste'mol qilardi. Endi xatolar qo'lda Audio Detail sahifasida
  // "Qayta tahlil qilish" tugmasi orqali tuzatiladi.

};

// AI note generatsiya (Gemini Flash)
/**
 * AmoCRM lead note'ini analysis datasidan boy formatda yig'adi.
 * Qo'shimcha Flash call'siz — barcha ma'lumotlar analysis ichida allaqachon bor.
 */
export function buildAmoNote(analysis: any, audioId: string, managerName?: string | null): string {
  const lines: string[] = [];

  const score = analysis.overallScore ?? 0;
  const leadQ = analysis.leadQuality || "—";
  const heat = analysis.leadHeatScore;
  lines.push(`📊 SalesAI tahlili`);
  lines.push(
    `Ball: ${score}/100 · Lead: ${leadQ}${typeof heat === "number" ? ` (heat ${heat})` : ""}${
      managerName ? ` · Menejer: ${managerName}` : ""
    }`,
  );
  lines.push("");

  // 👤 Mijoz haqida — qualification + voiceOfCustomer
  const q = analysis.qualification || {};
  const voc = analysis.voiceOfCustomer || {};
  const clientBlock: string[] = [];

  const pain =
    voc.mainPain ||
    q.identifiedPain?.value ||
    q.identifiedPain?.note;
  if (pain) clientBlock.push(`• Asosiy muammo: ${pain}`);

  const expectations: string[] = Array.isArray(voc.expectations) ? voc.expectations : [];
  if (expectations.length > 0) {
    clientBlock.push(`• Kutayotgani: ${expectations.slice(0, 3).join(", ")}`);
  }

  const buying: string[] = Array.isArray(voc.buyingCriteria) ? voc.buyingCriteria : [];
  if (buying.length > 0) {
    clientBlock.push(`• Tanlash mezoni: ${buying.slice(0, 3).join(", ")}`);
  }

  const metric = q.metric?.value;
  if (metric) clientBlock.push(`• Maqsad/metrika: ${metric}`);

  const eb = q.economicBuyer;
  if (eb?.note) {
    clientBlock.push(`• Qaror qabul qiluvchi: ${eb.note}`);
  } else if (eb?.identified === true) {
    clientBlock.push(`• Qaror qabul qiluvchi: aniqlandi`);
  }

  const budget = q.budgetSignal;
  if (budget) {
    const label =
      budget === "strong" ? "kuchli" :
      budget === "weak" ? "zaif" :
      budget === "vague" ? "noaniq" : budget;
    clientBlock.push(`• Byudjet signali: ${label}`);
  }

  const urgency: string[] = Array.isArray(voc.urgencySignals) ? voc.urgencySignals : [];
  if (urgency.length > 0) {
    clientBlock.push(`• Shoshilinch: ${urgency.slice(0, 2).join(", ")}`);
  }

  if (clientBlock.length > 0) {
    lines.push(`👤 Mijoz haqida:`);
    lines.push(...clientBlock);
    lines.push("");
  }

  // 💬 E'tirozlar
  const objections: any[] = Array.isArray(analysis.objections) ? analysis.objections : [];
  if (objections.length > 0) {
    lines.push(`💬 E'tirozlar:`);
    objections.slice(0, 5).forEach((o, i) => {
      const type = o.type || o.objection || o.name || "—";
      const count = o.count ? ` (${o.count}x)` : "";
      lines.push(`${i + 1}. ${type}${count}`);
    });
    lines.push("");
  }

  // 🎯 Intent signallari
  const intent = analysis.intentSignals || {};
  const strong: any[] = Array.isArray(intent.strong) ? intent.strong : [];
  const weak: any[] = Array.isArray(intent.weak) ? intent.weak : [];
  if (strong.length > 0 || weak.length > 0) {
    const trend = intent.trend ? ` (trend: ${intent.trend})` : "";
    lines.push(`🎯 Qiziqish signallari${trend}:`);
    strong.slice(0, 2).forEach((s) => {
      const phrase = s.phrase || s.quote || "";
      const why = s.interpretation || s.why || "";
      lines.push(`🟢 "${phrase}"${why ? ` — ${why}` : ""}`);
    });
    weak.slice(0, 2).forEach((w) => {
      const phrase = w.phrase || w.quote || "";
      const why = w.interpretation || w.why || "";
      lines.push(`🟡 "${phrase}"${why ? ` — ${why}` : ""}`);
    });
    lines.push("");
  }

  // 🤝 Va'dalar
  const promises: any[] = Array.isArray(analysis.promises) ? analysis.promises : [];
  if (promises.length > 0) {
    lines.push(`🤝 Va'dalar:`);
    promises.slice(0, 5).forEach((p, i) => {
      const what = p.what || p.promise || "—";
      const deadline = p.deadline || (p.deadlineDays ? `${p.deadlineDays} kun` : "");
      lines.push(`${i + 1}. ${what}${deadline ? ` — ${deadline}` : ""}`);
    });
    lines.push("");
  }

  // 🔔 Follow-up
  if (analysis.requiresFollowup) {
    const reason = analysis.followupReason || "";
    const reasonLabel =
      reason === "thinking" ? "o'ylayman" :
      reason === "family_consultation" ? "oila bilan maslahat" :
      reason === "boss_consultation" ? "rahbar bilan maslahat" :
      reason === "price" ? "narx" :
      reason === "timing" ? "vaqt" :
      reason || "—";
    lines.push(`🔔 FOLLOW-UP KERAK`);
    lines.push(`Sabab: ${reasonLabel}`);
    if (analysis.followupDeadline) {
      const d = new Date(analysis.followupDeadline);
      lines.push(`Qachongacha: ${d.toISOString().substring(0, 10)}`);
    }
    if (analysis.followupPhrase) {
      lines.push(`Mijoz iborasi: "${analysis.followupPhrase}"`);
    }
    lines.push("");
  }

  // ❌ Asosiy xatolar
  const errors: any[] = Array.isArray(analysis.errors) ? analysis.errors : [];
  if (errors.length > 0) {
    lines.push(`❌ Menejer xatolari:`);
    errors.slice(0, 3).forEach((e, i) => {
      const type = e.type || e.error || e.name || "—";
      lines.push(`${i + 1}. ${type}`);
    });
    lines.push("");
  }

  // 📝 Xulosa
  if (analysis.summary) {
    lines.push(`📝 Xulosa:`);
    lines.push(analysis.summary);
    lines.push("");
  }

  lines.push(`🔗 Batafsil: https://salesaiasosit.vercel.app/audio/${audioId}`);

  return lines.join("\n");
}

// To'xtatish uchun flag
const backfillRunning = new Map<string, boolean>();

export const stopBackfill = (companyId: string) => {
  backfillRunning.set(companyId, false);
};

/**
 * Faqat aktiv menejerlar + CRM dan sinhronlangan pending audio fayllarni tahlil qilish
 */
export const runBackfill = async (companyId: string): Promise<number> => {
  // Aktiv menejerlar
  const activeManagers = await prisma.manager.findMany({
    where: { companyId, isActive: true },
    select: { id: true },
  });
  const activeIds = activeManagers.map((m) => m.id);

  const pendingFiles = await prisma.audioFile.findMany({
    where: {
      companyId,
      status: { in: ["pending", "error"] },
      managerId: { in: activeIds },
      crmLeadId: { not: null },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`[Backfill] Found ${pendingFiles.length} files for company ${companyId}`);

  backfillRunning.set(companyId, true);
  let processed = 0;

  for (let i = 0; i < pendingFiles.length; i++) {
    if (!backfillRunning.get(companyId)) {
      console.log(`[Backfill] Stopped by user at ${processed}/${pendingFiles.length}`);
      break;
    }

    try {
      await processAudioFile(pendingFiles[i].id);
      processed++;
    } catch (err) {
      console.error(`[Backfill] Error:`, err);
    }

    console.log(`[Backfill] Progress: ${processed}/${pendingFiles.length}`);

    // Har bir tahlil orasida 5s kutish (rate limit uchun)
    if (i + 1 < pendingFiles.length) {
      await new Promise((r) => setTimeout(r, 5000));
    }
  }

  backfillRunning.set(companyId, false);

  return processed;
};
