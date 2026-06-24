import dotenv from "dotenv";
dotenv.config();

import { prisma } from "./utils/prisma";
import { processAudioFile } from "./services/processor";

async function main() {
  const pendingFiles = await prisma.audioFile.findMany({
    where: { status: "pending" },
    select: { id: true, fileName: true },
  });

  console.log(`Found ${pendingFiles.length} pending files to process`);

  for (let i = 0; i < pendingFiles.length; i++) {
    const file = pendingFiles[i];
    console.log(`[${i + 1}/${pendingFiles.length}] Processing: ${file.fileName}`);
    try {
      await processAudioFile(file.id);
      console.log(`  ✓ Done`);
    } catch (err) {
      console.error(`  ✗ Error:`, err);
    }
    // Rate limit
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("All done!");
  process.exit(0);
}

main();
