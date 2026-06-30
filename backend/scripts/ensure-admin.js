// Lokal dev: admin login akkaunti doim mavjud bo'lishini kafolatlaydi.
// `predev` hook orqali har `npm run dev` da ishlaydi (idempotent).
//   - Company yo'q bo'lsa → admin/admin123 bilan yaratadi
//   - bor, lekin parol mos kelmasa → parolni admin123 ga tiklaydi
//   - bor va parol to'g'ri → tegmaydi (boshqa sozlamalar saqlanadi)
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const NAME = process.env.COMPANY_NAME || "Rozgovor";
const USERNAME = process.env.COMPANY_USERNAME || "admin";
const PASSWORD = process.env.COMPANY_PASSWORD || "admin123";

(async () => {
  const existing = await prisma.company.findUnique({ where: { username: USERNAME } });

  if (!existing) {
    const hash = await bcrypt.hash(PASSWORD, 10);
    await prisma.company.create({ data: { name: NAME, username: USERNAME, password: hash } });
    console.log(`[ensure-admin] Company yaratildi: ${USERNAME} / ${PASSWORD}`);
  } else {
    const ok = existing.password && (await bcrypt.compare(PASSWORD, existing.password));
    if (!ok) {
      const hash = await bcrypt.hash(PASSWORD, 10);
      await prisma.company.update({ where: { username: USERNAME }, data: { password: hash } });
      console.log(`[ensure-admin] Parol tiklandi: ${USERNAME} / ${PASSWORD}`);
    } else {
      console.log(`[ensure-admin] OK: ${USERNAME} login tayyor`);
    }
  }
  await prisma.$disconnect();
})().catch((e) => {
  // Dev start'ni bloklamaslik uchun xato bo'lsa ham 0 bilan chiqamiz, faqat ogohlantiramiz.
  console.error("[ensure-admin] Ogohlantirish:", e.message);
  process.exit(0);
});
