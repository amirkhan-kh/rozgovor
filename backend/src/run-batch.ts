import dotenv from "dotenv";
dotenv.config();

import { prisma } from "./utils/prisma";
import { processAudioFile } from "./services/processor";

const COMPANY_ID = "cmnip6jb1000075z6oed7lnlx";

async function main() {
  const pendingFiles = await prisma.audioFile.findMany({
    where: { companyId: COMPANY_ID, status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n${pendingFiles.length} ta pending audio topildi. Tahlil boshlanmoqda...\n`);

  let done = 0;
  let errors = 0;
  let noConversation = 0;
  const startTime = Date.now();

  for (const file of pendingFiles) {
    const n = done + errors + noConversation + 1;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const avg = n > 1 ? ((Date.now() - startTime) / (n - 1) / 1000).toFixed(1) : "?";
    const remaining = n > 1 ? (((pendingFiles.length - n) * (Date.now() - startTime)) / (n - 1) / 1000 / 60).toFixed(0) : "?";

    process.stdout.write(`\r[${n}/${pendingFiles.length}] ${file.fileName} (${elapsed}s, ~${avg}s/audio, ~${remaining} min qoldi)    `);

    try {
      await processAudioFile(file.id);

      // Natijani tekshirish
      const updated = await prisma.audioFile.findUnique({ where: { id: file.id } });
      if (updated?.transcription?.includes("SUHBAT YO'Q")) {
        noConversation++;
      } else {
        done++;
      }
    } catch (err) {
      errors++;
      console.log(`\n  XATO: ${file.id} - ${err}`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`\n\n========================================`);
  console.log(`  TAHLIL TUGADI`);
  console.log(`========================================`);
  console.log(`Jami: ${pendingFiles.length}`);
  console.log(`Tahlil qilindi: ${done}`);
  console.log(`Suhbat yo'q: ${noConversation}`);
  console.log(`Xatolar: ${errors}`);
  console.log(`Vaqt: ${totalTime} daqiqa`);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
