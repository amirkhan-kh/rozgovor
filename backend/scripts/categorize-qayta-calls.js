// Qayta qo'ng'iroqlarni aniqlash: bir xil leadId yoki phoneNumber bo'yicha
// birinchi (callDate bo'yicha eng erta) — "sotuv", qolganlari — "qayta"
//
// Ishga tushirish:
//   DATABASE_URL=postgresql://... node scripts/categorize-qayta-calls.js

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Kompaniya topilmadi");
    process.exit(1);
  }
  console.log(`Kompaniya: ${company.name}`);

  // Boshqa kategoriyaga tegmaslik — faqat sotuv va qayta ni qayta hisoblaymiz
  const audios = await prisma.audioFile.findMany({
    where: {
      companyId: company.id,
      category: { in: ["sotuv", "qayta"] },
    },
    select: { id: true, leadId: true, phoneNumber: true, callDate: true, createdAt: true, category: true },
    orderBy: { callDate: "asc" },
  });

  console.log(`Jami audio: ${audios.length}`);

  // Key bo'yicha guruhlash: leadId bor bo'lsa L:, aks holda P:telefon
  const keyFor = (a) => {
    if (a.leadId != null) return `L:${a.leadId}`;
    if (a.phoneNumber) return `P:${a.phoneNumber.replace(/\D/g, "")}`;
    return null;
  };

  const firstSeen = new Map();
  for (const a of audios) {
    const k = keyFor(a);
    if (!k) continue;
    const t = (a.callDate || a.createdAt).getTime();
    const prev = firstSeen.get(k);
    if (!prev || t < prev.t) {
      firstSeen.set(k, { t, id: a.id });
    }
  }

  let toSotuv = 0;
  let toQayta = 0;
  let skippedNoKey = 0;

  for (const a of audios) {
    const k = keyFor(a);
    if (!k) {
      skippedNoKey++;
      continue;
    }
    const first = firstSeen.get(k);
    const isFirst = first.id === a.id;
    const desired = isFirst ? "sotuv" : "qayta";

    if (a.category !== desired) {
      await prisma.audioFile.update({
        where: { id: a.id },
        data: { category: desired },
      });
      if (desired === "sotuv") toSotuv++;
      else toQayta++;
    }
  }

  console.log(`\nNatija:`);
  console.log(`  sotuv → qayta: ${toQayta}`);
  console.log(`  qayta → sotuv: ${toSotuv}`);
  console.log(`  kaliti yo'q (o'zgartirilmadi): ${skippedNoKey}`);

  // Yakuniy holat
  const byCategory = await prisma.audioFile.groupBy({
    by: ["category"],
    where: { companyId: company.id },
    _count: { id: true },
  });
  console.log(`\nYakuniy kategoriya taqsimoti:`);
  for (const g of byCategory) {
    console.log(`  ${g.category}: ${g._count.id}`);
  }

  await prisma.$disconnect();
  console.log(`\nTayyor ✅`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
