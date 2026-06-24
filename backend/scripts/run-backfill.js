require("dotenv").config({ path: "/var/www/prosales-backend/.env" });
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const { runBatchBackfill } = require("/var/www/prosales-backend/dist/services/batch-backfill");
(async () => {
  const c = await p.company.findFirst();
  console.log(new Date().toISOString(), "start backfill for", c.name);
  const n = await runBatchBackfill(c.id, {});
  console.log(new Date().toISOString(), "backfill returned:", n);
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
