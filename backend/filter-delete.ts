/**
 * Hard delete audio files that don't match the filter rule:
 *   - sotuv/first: duration >= 180s (3 min)
 *   - qayta/repeat: duration >= 120s (2 min)
 *   - boshqa/null/unknown: TEGMAYDI
 *
 * Hard delete: Analysis + AudioCost + AudioFile DB rows + S3 audio file.
 */
import { prisma } from "./src/utils/prisma";
import { deleteFile, getKeyFromUrl } from "./src/services/storage";

const KEEP_SOTUV_MIN_SEC = 180; // 3 min
const KEEP_QAYTA_MIN_SEC = 120; // 2 min

async function main() {
  // Find candidates to DELETE
  const candidates = await prisma.audioFile.findMany({
    where: {
      OR: [
        {
          AND: [
            { category: { in: ["sotuv", "first"] } },
            { duration: { not: null } },
            { duration: { lt: KEEP_SOTUV_MIN_SEC } },
          ],
        },
        {
          AND: [
            { category: { in: ["qayta", "repeat"] } },
            { duration: { not: null } },
            { duration: { lt: KEEP_QAYTA_MIN_SEC } },
          ],
        },
      ],
    },
    select: { id: true, fileUrl: true, category: true, duration: true },
  });

  console.log(`[filter-delete] ${candidates.length} candidates to DELETE`);
  if (candidates.length === 0) {
    process.exit(0);
  }

  let dbDeleted = 0;
  let s3Deleted = 0;
  let s3Errors = 0;
  let dbErrors = 0;

  for (const a of candidates) {
    // 1) Delete S3/Yandex audio file (best effort)
    try {
      const key = getKeyFromUrl(a.fileUrl);
      if (key) {
        await deleteFile(key);
        s3Deleted++;
      }
    } catch (err) {
      s3Errors++;
    }

    // 2) Delete dependent rows
    try {
      // Analysis (RESTRICT cascade — must delete first)
      await prisma.analysis.deleteMany({ where: { audioFileId: a.id } }).catch(() => {});
      // AudioCost (Cascade — auto)
      try {
        await (prisma as any).audioCost?.deleteMany?.({ where: { audioFileId: a.id } });
      } catch {}
      // AudioFile
      await prisma.audioFile.delete({ where: { id: a.id } });
      dbDeleted++;
    } catch (err) {
      dbErrors++;
      console.error(`[filter-delete] DB delete err ${a.id}: ${(err as Error).message?.slice(0, 100)}`);
    }

    if (dbDeleted % 100 === 0 && dbDeleted > 0) {
      console.log(`[filter-delete] progress ${dbDeleted}/${candidates.length}`);
    }
  }

  console.log(`[filter-delete] DONE`);
  console.log(`  candidates: ${candidates.length}`);
  console.log(`  DB deleted: ${dbDeleted}, errors: ${dbErrors}`);
  console.log(`  S3 deleted: ${s3Deleted}, errors: ${s3Errors}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[filter-delete] FATAL:", e);
  process.exit(1);
});
