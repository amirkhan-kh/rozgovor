/**
 * Lokal batch AI backfill runner (ROZGOVOR).
 * Mavjud scripts/run-backfill.js prod yo'llariga (/var/www/...) hardcode qilingan — lokalda ishlamaydi.
 * Bu skript lokal .env va ts-node bilan ishlaydi.
 *
 *   cd backend
 *   npx ts-node scripts/run-backfill-local.ts        # barcha pending audio
 *   npx ts-node scripts/run-backfill-local.ts 2      # faqat 2 ta (test)
 *
 * Pipeline: Stage1 Yandex STT → Stage2 Gemini Flash batch (diarization) → Stage3 Gemini batch (21-maydon analiz).
 * Batch joblar global endpoint + gemini-3-flash-preview (USE_FLASH_3_BATCH=1).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { runBatchBackfill } from "../src/services/batch-backfill";

const prisma = new PrismaClient();

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("Company topilmadi");

  const limitArg = process.argv[2];
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  console.log(
    new Date().toISOString(),
    `backfill START — company=${company.name}` + (limit ? ` (limit=${limit})` : " (barcha pending)")
  );

  const n = await runBatchBackfill(company.id, limit ? { limit } : {});

  console.log(new Date().toISOString(), `backfill DONE — natija: ${n}`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error("backfill XATO:", e);
  await prisma.$disconnect();
  process.exit(1);
});
