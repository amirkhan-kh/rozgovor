// Mavjud transkripsiyalarda Menejer↔Mijoz almashib ketganini avtomatik
// aniqlaydi va to'g'rilaydi. Heuristika: agar "Mijoz:" qatorida menejer
// o'zini tanishtirayotgan bo'lsa ("ismim Visola"), barcha rollarni
// shu transkripsiyada almashtiramiz.
//
// Ishlatish:
//   DATABASE_URL=... npx ts-node scripts/fix-swapped-roles.ts [--dry]

import * as dotenv from "dotenv";
dotenv.config();

import { prisma } from "../src/utils/prisma";

const DRY = process.argv.includes("--dry");

function detectSwap(transcription: string, managerName: string): boolean {
  if (!managerName) return false;
  const firstName = managerName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!firstName || firstName.length < 2) return false;

  const introPatterns: RegExp[] = [
    new RegExp(`\\bismim\\s+${firstName}\\b`, "i"),
    new RegExp(`\\bmen\\s+${firstName}\\b`, "i"),
    new RegExp(`\\bmen\\s+\\w+\\s+${firstName}\\b`, "i"),
    new RegExp(`\\b${firstName}\\b.{0,40}(tanish|kompaniya|bo['’]limidan)`, "i"),
  ];

  let clientHits = 0;
  let managerHits = 0;
  for (const raw of transcription.split("\n")) {
    const m = raw.match(/^\[\d{1,2}:\d{2}\]\s+(Menejer|Mijoz):\s*(.*)$/i);
    if (!m) continue;
    const role = m[1];
    const text = m[2];
    const hit = introPatterns.some((re) => re.test(text));
    if (!hit) continue;
    if (/Mijoz/i.test(role)) clientHits += 1;
    else managerHits += 1;
  }
  return clientHits > managerHits;
}

function swapRoles(transcription: string): string {
  return transcription
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\[\d{1,2}:\d{2}\]\s+)(Menejer|Mijoz)(:.*)$/i);
      if (!m) return line;
      const before = m[1];
      const role = m[2];
      const after = m[3];
      const newRole = /Menejer/i.test(role) ? "Mijoz" : "Menejer";
      return `${before}${newRole}${after}`;
    })
    .join("\n");
}

(async () => {
  const all = await prisma.audioFile.findMany({
    where: { transcription: { not: null } },
    select: {
      id: true,
      fileName: true,
      transcription: true,
      manager: { select: { name: true } },
    },
  });

  console.log(`Tekshirilmoqda: ${all.length} ta audio`);
  let swapped = 0;
  let skipped = 0;
  for (const a of all) {
    const mgrName = a.manager?.name || "";
    if (!a.transcription) {
      skipped++;
      continue;
    }
    if (!detectSwap(a.transcription, mgrName)) continue;

    const fixed = swapRoles(a.transcription);
    console.log(
      `  ${swapped + 1}. ${a.fileName} (manager: ${mgrName}) — swap aniqlandi`,
    );
    if (!DRY) {
      await prisma.audioFile.update({
        where: { id: a.id },
        data: { transcription: fixed },
      });
    }
    swapped++;
  }

  console.log(
    `\n${DRY ? "[DRY] " : ""}Yakun: ${swapped} ta swap topildi, ${skipped} skip`,
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
