import { prisma } from "./utils/prisma";
import { processAudioFile } from "./services/processor";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const API_KEYS = [
  "AIzaSyB6yaewRVwSC0mEiMKsasoRllWgtwQp278",
  "AIzaSyBjRodQNXlmVSGewA42ZsqrINzPHI9z2aw",
];

let currentKeyIndex = 0;

function switchKey(): boolean {
  if (currentKeyIndex + 1 < API_KEYS.length) {
    currentKeyIndex++;
    process.env.GEMINI_API_KEY = API_KEYS[currentKeyIndex];
    console.log(`\n>>> KEY O'ZGARTIRILDI: #${currentKeyIndex + 1} <<<\n`);
    return true;
  }
  return false;
}

async function run() {
  // Birinchi key'ni o'rnatish
  process.env.GEMINI_API_KEY = API_KEYS[currentKeyIndex];

  await prisma.audioFile.updateMany({
    where: { status: { in: ["error", "processing"] } },
    data: { status: "pending" },
  });

  const total = await prisma.audioFile.count({ where: { status: "pending" } });
  console.log(`Jami pending: ${total}`);
  console.log(`API keys: ${API_KEYS.length} ta`);
  if (total === 0) { await prisma.$disconnect(); return; }

  let done = 0, fail = 0;
  let consecutive429 = 0;
  const startTime = Date.now();

  while (true) {
    const batch = await prisma.audioFile.findMany({
      where: { status: "pending" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 3,
    });

    if (batch.length === 0) break;

    const results = await Promise.allSettled(
      batch.map(async (f) => {
        try {
          await processAudioFile(f.id);
        } catch (err: any) {
          await prisma.audioFile.update({
            where: { id: f.id },
            data: { status: "error" },
          }).catch(() => {});
          throw err;
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        done++;
        consecutive429 = 0;
      } else {
        const msg = (r.reason as Error)?.message || "";
        if (msg.includes("429") || msg.includes("quota")) {
          consecutive429++;
          if (consecutive429 >= 3) {
            // Key'ni almashtirish
            const switched = switchKey();
            if (switched) {
              consecutive429 = 0;
              // Error fayllarni pending ga qaytarish
              await prisma.audioFile.updateMany({
                where: { status: "error" },
                data: { status: "pending" },
              });
              console.log("Error fayllar pending ga qaytarildi");
            } else {
              console.log("Hamma key'lar tugadi! 5 min kutish...");
              await sleep(5 * 60 * 1000);
              currentKeyIndex = 0;
              process.env.GEMINI_API_KEY = API_KEYS[0];
              consecutive429 = 0;
            }
          } else {
            await sleep(10000);
          }
        } else if (msg.includes("403") || msg.includes("suspended")) {
          console.log("403/Suspended — keyni almashtiramiz");
          const switched = switchKey();
          if (!switched) {
            console.log("Hamma key'lar suspended! To'xtash.");
            break;
          }
          consecutive429 = 0;
        } else {
          fail++;
        }
      }
    }

    if ((done + fail) % 6 === 0 || (done + fail) % 15 === 0) {
      const mins = ((Date.now() - startTime) / 60000).toFixed(1);
      const rate = done > 0 ? (done / ((Date.now() - startTime) / 60000)).toFixed(1) : "0";
      console.log(`[${done + fail}/${total}] Done: ${done} | Fail: ${fail} | Key: #${currentKeyIndex + 1} | ${mins} min | ~${rate}/min`);
    }

    await sleep(1000);
  }

  console.log(`\n========== YAKUNLANDI ==========`);
  console.log(`Muvaffaqiyatli: ${done}`);
  console.log(`Xato: ${fail}`);
  console.log(`Umumiy vaqt: ${((Date.now() - startTime) / 1000 / 60).toFixed(1)} daqiqa`);
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
