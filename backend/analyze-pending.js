// Tahlil qilinmagan ProSales audiolarni batchda tahlil qilish.
// runBatchBackfill ishlatamiz — pending+noTrans audiolarni Stage 1+2+3 ga,
// keyin reanalyzeForManagers ishlatib trans bor lekin analysis yo'q audiolarga Stage 3.
const { prisma } = require("./dist/utils/prisma");
const { runBatchBackfill, reanalyzeForManagers } = require("./dist/services/batch-backfill");

(async () => {
  try {
    const company = await prisma.company.findFirst({
      where: { name: { contains: "Pro Sales", mode: "insensitive" } },
      select: { id: true, name: true },
    });
    console.log(`Company: ${company.name}`);

    // 1) Tahlil yo'q audiolarning hammasini status=pending qilish (active manager + tegishli audio)
    const activeManagers = await prisma.manager.findMany({
      where: { companyId: company.id, isActive: true },
      select: { id: true },
    });
    const activeIds = activeManagers.map((m) => m.id);

    const noAnalysisAudios = await prisma.audioFile.findMany({
      where: {
        companyId: company.id,
        analysis: null,
        managerId: { in: activeIds },
        status: { notIn: ["too_short", "no_audio", "no_conversation", "transferred", "disconnected"] },
      },
      select: { id: true, status: true, transcription: true, duration: true },
    });

    const withTrans = noAnalysisAudios.filter(a => a.transcription && a.transcription.trim().length > 0);
    const noTrans = noAnalysisAudios.filter(a => !a.transcription || a.transcription.trim().length === 0);

    console.log(`\n=== Tahlil kerak ===`);
    console.log(`Jami: ${noAnalysisAudios.length}`);
    console.log(`Transkripsiya bor (Stage 3 only): ${withTrans.length}`);
    console.log(`Transkripsiya yo'q (Stage 1+2+3): ${noTrans.length}\n`);

    // noTrans audiolarni status=pending ga qaytarish (agar boshqa status'da bo'lsa)
    const noTransIds = noTrans.map((a) => a.id);
    if (noTransIds.length > 0) {
      const upd = await prisma.audioFile.updateMany({
        where: { id: { in: noTransIds }, status: { not: "pending" } },
        data: { status: "pending" },
      });
      if (upd.count > 0) console.log(`Status=pending qilindi: ${upd.count}`);
    }

    // 2) Stage 1+2+3 — runBatchBackfill (status=pending + transcription=null filterda)
    if (noTrans.length > 0) {
      console.log(`\n[STAGE 1+2+3] runBatchBackfill boshlandi...`);
      const processed = await runBatchBackfill(company.id, {});
      console.log(`[STAGE 1+2+3] DONE: ${processed} audio`);
    }

    // 3) Trans bor + analysis yo'q audiolar uchun Stage 3 — reanalyzeForManagers
    if (withTrans.length > 0) {
      console.log(`\n[STAGE 3 only] reanalyzeForManagers boshlandi (${withTrans.length} audio)...`);
      // reanalyzeForManagers managerIds bo'yicha ishlaydi — withTrans'dagi unique managerIds
      const fullAudios = await prisma.audioFile.findMany({
        where: { id: { in: withTrans.map(a => a.id) } },
        select: { managerId: true },
      });
      const mgrIds = [...new Set(fullAudios.map(a => a.managerId).filter(Boolean))];
      if (mgrIds.length > 0) {
        const result = await reanalyzeForManagers(company.id, mgrIds);
        console.log(`[STAGE 3 only] DONE:`, result);
      }
    }

    console.log(`\n✅ Hammasi tugadi`);
    process.exit(0);
  } catch (e) {
    console.error("Error:", e?.stack || e?.message || e);
    process.exit(1);
  }
})();
