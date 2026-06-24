// Bitta audioni qayta transcribe qilish (deferred STT orqali).
// Usage: node scripts/retranscribe-one.js <audioId>
require("ts-node/register");
const { PrismaClient } = require("@prisma/client");
const { processAudioFile } = require("../src/services/processor");

const prisma = new PrismaClient();

(async () => {
  const audioId = process.argv[2];
  if (!audioId) {
    console.error("Usage: node scripts/retranscribe-one.js <audioId>");
    process.exit(1);
  }

  const audio = await prisma.audioFile.findUnique({
    where: { id: audioId },
    select: { id: true, fileName: true, duration: true, transcription: true, status: true },
  });
  if (!audio) {
    console.error("Audio topilmadi:", audioId);
    process.exit(1);
  }

  console.log(`Audio:     ${audio.fileName}`);
  console.log(`Duration:  ${audio.duration}s`);
  console.log(`Eski trans: ${audio.transcription?.length || 0} char`);

  // Oxirgi [MM:SS] timestamp
  const matches = audio.transcription?.match(/\[(\d{2}):(\d{2})\]/g) || [];
  const lastTs = matches[matches.length - 1];
  console.log(`Eski oxirgi ts: ${lastTs || "—"}`);

  // Reset + re-process
  await prisma.analysis.deleteMany({ where: { audioFileId: audioId } });
  await prisma.audioFile.update({
    where: { id: audioId },
    data: { status: "pending", transcription: null },
  });

  console.log("\nProcessing...");
  const t0 = Date.now();
  await processAudioFile(audioId);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const after = await prisma.audioFile.findUnique({
    where: { id: audioId },
    select: { transcription: true, status: true },
  });
  const newMatches = after?.transcription?.match(/\[(\d{2}):(\d{2})\]/g) || [];
  const newLastTs = newMatches[newMatches.length - 1];

  console.log(`\n✓ Tugadi ${elapsed}s`);
  console.log(`Yangi status:   ${after?.status}`);
  console.log(`Yangi trans:    ${after?.transcription?.length || 0} char`);
  console.log(`Yangi oxirgi ts: ${newLastTs || "—"}`);

  await prisma.$disconnect();
  process.exit(0);
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
