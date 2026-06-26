// Company (login akkaunt) yaratish/yangilash.
//   node scripts/create-company.js [name] [username] [password]
// yoki env: COMPANY_NAME, COMPANY_USERNAME, COMPANY_PASSWORD, EXCLUDED_PIPELINES
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const name = process.env.COMPANY_NAME || process.argv[2] || "Rozgovor";
const username = process.env.COMPANY_USERNAME || process.argv[3] || "admin";
const password = process.env.COMPANY_PASSWORD || process.argv[4] || "admin123";
const excluded = (process.env.EXCLUDED_PIPELINES || "Naym")
  .split(",").map((s) => s.trim()).filter(Boolean);

(async () => {
  const hash = await bcrypt.hash(password, 10);
  const existing = await prisma.company.findUnique({ where: { username } });
  const data = { name, password: hash, excludedPipelines: excluded };
  const company = existing
    ? await prisma.company.update({ where: { username }, data })
    : await prisma.company.create({ data: { username, ...data } });

  console.log(existing ? "Company yangilandi:" : "Company yaratildi:", company.id);
  console.log(`  name=${company.name}`);
  console.log(`  username=${username}`);
  console.log(`  password=${password}`);
  console.log(`  excludedPipelines=${JSON.stringify(company.excludedPipelines)}`);
  await prisma.$disconnect();
})().catch((e) => { console.error("Xato:", e.message); process.exit(1); });
