import dotenv from "dotenv";
dotenv.config();

import { prisma } from "./utils/prisma";
import { processAudioFile } from "./services/processor";

const MANAGER_NAMES = ["14 DAVRON", "15 MUHAMMADQODIR", "06 CHAROS"];

async function main() {
  const managers = await prisma.manager.findMany({
    where: { name: { in: MANAGER_NAMES } },
  });
  const managerIds = managers.map((m) => m.id);

  const pendingFiles = await prisma.audioFile.findMany({
    where: { managerId: { in: managerIds }, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n${pendingFiles.length} ta pending audio (${MANAGER_NAMES.join(", ")})\n`);

  let done = 0, noConv = 0, errors = 0;
  const start = Date.now();

  for (const file of pendingFiles) {
    const n = done + noConv + errors + 1;
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const pct = Math.round((n / pendingFiles.length) * 100);
    process.stdout.write(`\r[${n}/${pendingFiles.length}] ${pct}% | done:${done} noconv:${noConv} err:${errors} | ${elapsed}s`);

    try {
      await processAudioFile(file.id);
      const updated = await prisma.audioFile.findUnique({ where: { id: file.id } });
      if (updated?.status === "no_conversation") noConv++;
      else done++;
    } catch {
      errors++;
    }
  }

  const totalMin = ((Date.now() - start) / 60000).toFixed(1);
  console.log(`\n\nTugadi! Done: ${done} | No conv: ${noConv} | Errors: ${errors} | Vaqt: ${totalMin} min`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
