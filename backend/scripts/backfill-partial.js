const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const all = await prisma.salesLead.findMany({
    select: { id: true, statusName: true, isPartialPayment: true },
  });
  let updated = 0, alreadySet = 0;
  for (const r of all) {
    const isPartial = !!r.statusName && (/qisman\s*to.?lov/i.test(r.statusName) || /частичн\w*\s*оплат/i.test(r.statusName));
    if (isPartial && !r.isPartialPayment) {
      await prisma.salesLead.update({ where: { id: r.id }, data: { isPartialPayment: true } });
      updated++;
    } else if (isPartial) {
      alreadySet++;
    }
  }
  console.log("scanned:", all.length, "updated:", updated, "already:", alreadySet);
  await prisma.$disconnect();
})();
