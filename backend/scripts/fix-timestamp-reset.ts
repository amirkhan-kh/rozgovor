// Timestamp reset bug bo'lgan audiolarni qayta transcribe qilib DB ga yozadi.
// Ishlatilishi: npx ts-node scripts/fix-timestamp-reset.ts

import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { transcribeAudio } from "../src/services/call-transcriber";
import { getFileBuffer, getKeyFromUrl } from "../src/services/storage";

const prisma = new PrismaClient();

async function fetchBuffer(fileUrl: string): Promise<Buffer> {
  const isExternal =
    /^https?:\/\//.test(fileUrl) &&
    !fileUrl.includes("yandexcloud.net");
  if (isExternal) {
    const resp = await axios.get(fileUrl, {
      responseType: "arraybuffer",
      timeout: 180000,
      validateStatus: () => true,
    });
    if (resp.status >= 400) {
      throw new Error(`External fetch failed: ${resp.status}`);
    }
    return Buffer.from(resp.data);
  }
  return getFileBuffer(getKeyFromUrl(fileUrl));
}

function hasResetBug(transcription: string | null): boolean {
  if (!transcription) return false;
  const ts: number[] = [];
  for (const line of transcription.split("\n")) {
    const m = line.match(/^\[(\d{1,2}):(\d{2})\]/);
    if (m) ts.push(parseInt(m[1]) * 60 + parseInt(m[2]));
  }
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] < ts[i - 1] - 10) return true;
  }
  return false;
}

async function main() {
  console.log("1) Buzilgan audiolarni topish...");
  const all = await prisma.audioFile.findMany({
    where: { status: "done", transcription: { not: null } },
    select: { id: true, fileName: true, fileUrl: true, duration: true, transcription: true, managerId: true },
  });
  const broken = all.filter((a) => hasResetBug(a.transcription));
  console.log(`   ${all.length} audio tekshirildi, ${broken.length} ta buzilgan`);

  if (broken.length === 0) {
    console.log("\n✓ Hamma transkriptlar monotonic");
    await prisma.$disconnect();
    return;
  }

  for (const [i, f] of broken.entries()) {
    console.log(`\n${i + 1}/${broken.length}) ${f.fileName} (dur=${f.duration}s)`);
    try {
      const mgr = f.managerId
        ? await prisma.manager.findUnique({ where: { id: f.managerId }, select: { name: true } })
        : null;
      const managerName = mgr?.name || "Menejer";

      console.log("   Audio yuklanmoqda...");
      const buffer = await fetchBuffer(f.fileUrl);
      console.log(`   Buffer: ${(buffer.length / 1024).toFixed(0)} KB`);

      console.log("   Transkripsiya (Yandex STT + Gemini Flash)...");
      const newTrans = await transcribeAudio(buffer, f.fileName, managerName, f.duration || 0);

      if (!newTrans || newTrans.trim().length < 10) {
        console.warn("   ⚠️  Yangi transkripsiya bo'sh, o'zgartirilmadi");
        continue;
      }

      if (hasResetBug(newTrans)) {
        console.warn("   ⚠️  Yangi transkript hali ham reset bug'i bor!");
      }

      await prisma.audioFile.update({
        where: { id: f.id },
        data: { transcription: newTrans },
      });
      const nlines = newTrans.split("\n").filter((l) => l.trim()).length;
      console.log(`   ✓ Saqlandi (${nlines} qator)`);
    } catch (err) {
      console.error(`   ✗ Xato: ${(err as Error).message}`);
    }
  }

  console.log("\n✓ Tugadi");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
