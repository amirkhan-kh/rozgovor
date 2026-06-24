// Audio fayllar va tahlillarda muammoli holatlarni topadi.
// Hech narsani o'zgartirmaydi — faqat hisobot.
//
// Tekshiruvlar:
//   1. Role swap — Menejer/Mijoz almashib qolgan
//   2. Diarization yo'q — transkripsiyada "Menejer:"/"Mijoz:" yo'q
//   3. Bo'sh / juda qisqa transkripsiya
//   4. Status=done lekin tahlil yo'q (analiz failed)
//   5. Status=processing > 1 soat (qotgan)
//   6. Qayta categoryda hali eski sotuv mezonlari bilan tahlil
//   7. overallScore=0 lekin mezonlarda ball bor (paradoks)
//   8. Transkripsiyada faqat bitta speaker (mono dialog)
//   9. Bo'lim biriktirilmagan menejer
//
// Ishlatish:
//   DATABASE_URL=... npx ts-node scripts/audit-data-issues.ts

import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "../src/utils/prisma";

const QAYTA_KEY_MARKERS = new Set([
  "Kontekstni eslatish",
  "Oldingi to‘siqni tekshirish",
  "Oldingi to'siqni tekshirish",
  "Yangi sabab bilan chiqish",
  "Qaror holatini aniqlash",
  "Closing va keyingi qadamni kelishish",
]);

function detectRoleSwap(t: string, mgrName: string): boolean {
  if (!mgrName) return false;
  const firstName = mgrName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstName || firstName.length < 2) return false;
  const intros: RegExp[] = [
    new RegExp(`\\bismim\\s+${firstName}\\b`, "i"),
    new RegExp(`\\bmen\\s+${firstName}\\b`, "i"),
    new RegExp(`\\bmen\\s+\\w+\\s+${firstName}\\b`, "i"),
    new RegExp(`\\b${firstName}\\b.{0,40}(tanish|kompaniya|bo['’]limidan)`, "i"),
  ];
  let cl = 0,
    mg = 0;
  for (const raw of t.split("\n")) {
    const m = raw.match(/^\[\d{1,2}:\d{2}\]\s+(Menejer|Mijoz):\s*(.*)$/i);
    if (!m) continue;
    if (intros.some((re) => re.test(m[2]))) {
      if (/Mijoz/i.test(m[1])) cl += 1;
      else mg += 1;
    }
  }
  return cl > mg;
}

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Company yo'q");
    process.exit(1);
  }
  console.log(`Company: ${company.name}\n`);

  const all = await prisma.audioFile.findMany({
    where: { companyId: company.id },
    include: {
      analysis: { select: { overallScore: true, criteria: true } },
      manager: { select: { name: true, departmentId: true, isActive: true } },
    },
  });

  console.log(`Jami audio: ${all.length}\n`);

  // 1. Role swap
  const swapped = all.filter(
    (a) => a.transcription && detectRoleSwap(a.transcription, a.manager?.name || ""),
  );
  console.log(`1) Role-swap: ${swapped.length}`);
  for (const a of swapped.slice(0, 10)) {
    console.log(`   - ${a.fileName} (${a.manager?.name})`);
  }

  // 2. Diarization yo'q
  const noDiar = all.filter(
    (a) => a.transcription && !/Menejer:|Mijoz:/i.test(a.transcription),
  );
  console.log(`\n2) Diarization yo'q: ${noDiar.length}`);
  for (const a of noDiar.slice(0, 10)) {
    console.log(`   - ${a.fileName}`);
  }

  // 3. Bo'sh / juda qisqa transkripsiya
  const tooShort = all.filter(
    (a) =>
      a.status === "done" &&
      (!a.transcription ||
        a.transcription.trim().length < 50 ||
        /^SUHBAT YO'Q/i.test(a.transcription || "")),
  );
  console.log(`\n3) Bo'sh / qisqa transkripsiya (status=done): ${tooShort.length}`);
  for (const a of tooShort.slice(0, 10)) {
    console.log(`   - ${a.fileName} (${(a.transcription || "").slice(0, 40)})`);
  }

  // 4. Status=done, tahlil yo'q
  const noAnalysis = all.filter((a) => a.status === "done" && !a.analysis);
  console.log(`\n4) Status=done, tahlilsiz: ${noAnalysis.length}`);
  for (const a of noAnalysis.slice(0, 10)) {
    console.log(`   - ${a.fileName}`);
  }

  // 5. Status=processing > 1 soat (createdAt asosida)
  const stuck = all.filter((a) => {
    if (a.status !== "processing") return false;
    const hrs = (Date.now() - a.createdAt.getTime()) / 3600000;
    return hrs > 1;
  });
  console.log(`\n5) Status=processing > 1 soat: ${stuck.length}`);
  for (const a of stuck.slice(0, 10)) {
    const hrs = ((Date.now() - a.createdAt.getTime()) / 3600000).toFixed(1);
    console.log(`   - ${a.fileName} (${hrs}h)`);
  }

  // 6. Qayta categoryda eski sotuv mezonlari
  const wrongQayta = all.filter((a) => {
    if (a.category !== "qayta" || !a.analysis?.criteria) return false;
    const keys = Object.keys(a.analysis.criteria as Record<string, unknown>);
    return !keys.some((k) => QAYTA_KEY_MARKERS.has(k));
  });
  console.log(`\n6) Qayta + eski sotuv mezoni: ${wrongQayta.length}`);
  for (const a of wrongQayta.slice(0, 10)) {
    console.log(`   - ${a.fileName}`);
  }

  // 7. overallScore=0 lekin mezonlarda ball bor (paradoks)
  const paradox = all.filter((a) => {
    const an = a.analysis;
    if (!an || an.overallScore !== 0) return false;
    const c = an.criteria as Record<string, { score?: number }> | null;
    if (!c) return false;
    return Object.values(c).some((v) => (v?.score || 0) > 0);
  });
  console.log(`\n7) overallScore=0 lekin mezon balli > 0: ${paradox.length}`);
  for (const a of paradox.slice(0, 10)) {
    console.log(`   - ${a.fileName}`);
  }

  // 8. Faqat bitta speaker
  const monoDialog = all.filter((a) => {
    if (!a.transcription) return false;
    const hasMgr = /Menejer:/i.test(a.transcription);
    const hasCli = /Mijoz:/i.test(a.transcription);
    if (!hasMgr && !hasCli) return false; // diarization yo'q — yuqorida hisoblangan
    return !(hasMgr && hasCli); // faqat bittasi bor
  });
  console.log(`\n8) Faqat bitta speaker (mono dialog): ${monoDialog.length}`);
  for (const a of monoDialog.slice(0, 10)) {
    console.log(`   - ${a.fileName}`);
  }

  // 9. Bo'lim biriktirilmagan aktiv menejer
  const orphanMgrs = await prisma.manager.findMany({
    where: { companyId: company.id, isActive: true, departmentId: null },
    select: { id: true, name: true },
  });
  console.log(`\n9) Bo'limsiz aktiv menejer: ${orphanMgrs.length}`);
  for (const m of orphanMgrs.slice(0, 10)) {
    console.log(`   - ${m.name}`);
  }

  console.log(
    `\n========\nXulosa:\n  Role-swap: ${swapped.length}\n  Diarization yo'q: ${noDiar.length}\n  Qisqa: ${tooShort.length}\n  Tahlilsiz: ${noAnalysis.length}\n  Qotgan: ${stuck.length}\n  Qayta noto'g'ri mezon: ${wrongQayta.length}\n  Score paradoks: ${paradox.length}\n  Mono dialog: ${monoDialog.length}\n  Bo'limsiz menejer: ${orphanMgrs.length}`,
  );

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
