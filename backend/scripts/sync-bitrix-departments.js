// Bitrix24 bo'limlarini Department jadvaliga sinxronlash
//
// MUHIM: Joriy webhook (bi48ru99uyeu7dag)'da `department.get` scope'i yo'q
// (insufficient_scope). Shuning uchun departmentlarni user.get'dan derive qilamiz —
// UF_DEPARTMENT massivida kelgan ID'lardan bo'lim royxatini tuzamiz.
// Bo'lim NOMI esa webhook'dan olinmaydi, shuning uchun default ravishda
// "Bo'lim #<ID>" beriladi — keyin qo'lda yangilash mumkin (yoki admin user
// ochib qo'shadi). Joriy foydalanuvchi aniq aytsa: Pre Sale = <ID>, Otdel Prodaja = <ID>.
//
// Ishga tushirish:
//   DATABASE_URL="..." node scripts/sync-bitrix-departments.js

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(method, payload = {}, attempt = 1) {
  try {
    const resp = await axios.post(
      `${BITRIX_WEBHOOK}/${method}.json`,
      payload,
      {
        headers: { "Content-Type": "application/json" },
        validateStatus: (s) => s < 500,
        timeout: 30000,
      }
    );
    return resp.data;
  } catch (err) {
    if (attempt <= 3) {
      console.log(`\n  retry ${attempt}/3 for ${method}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return bitrixCall(method, payload, attempt + 1);
    }
    throw err;
  }
}

// department.get — Agar webhook'da scope bor bo'lsa, to'g'ridan-to'g'ri olamiz
async function fetchDepartmentGet() {
  const all = [];
  let start = 0;
  try {
    while (true) {
      const resp = await bitrixCall("department.get", { start });
      if (resp.error) {
        console.log(`  department.get: ${resp.error} — fallback to user.get derivation`);
        return null;
      }
      const batch = resp.result || [];
      all.push(...batch);
      if (resp.next === undefined || batch.length === 0) break;
      start = resp.next;
      if (resp.total !== undefined && start >= resp.total) break;
    }
    return all;
  } catch (err) {
    console.log(`  department.get failed: ${err.message} — fallback`);
    return null;
  }
}

// Fallback: user.get dagi UF_DEPARTMENT ID'laridan derive qilamiz
async function deriveFromUsers() {
  const users = [];
  let start = 0;
  while (true) {
    const r = await bitrixCall("user.get", { start });
    const batch = r.result || [];
    users.push(...batch);
    if (r.next === undefined || batch.length === 0) break;
    start = r.next;
    if (start >= (r.total || 0)) break;
  }
  const depSet = new Set();
  for (const u of users) {
    const arr = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : [];
    for (const d of arr) depSet.add(String(d));
  }
  // Har ID uchun placeholder name
  return [...depSet].map((id) => ({
    ID: id,
    NAME: `Bo'lim #${id}`,
    PARENT: null,
  }));
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Company topilmadi");
    process.exit(1);
  }
  console.log(`Company: ${company.name}\n`);

  console.log("1) department.get urinilmoqda...");
  let deps = await fetchDepartmentGet();
  if (!deps) {
    console.log("2) Fallback: user.get dan derive qilinyapti...");
    deps = await deriveFromUsers();
  }
  console.log(`   ${deps.length} ta bo'lim topildi`);

  let upserted = 0;
  for (const d of deps) {
    const id = String(d.ID);
    const name = d.NAME || `Bo'lim #${id}`;
    const parentId = d.PARENT ? String(d.PARENT) : null;

    const existing = await prisma.department.findUnique({ where: { id } });
    // Agar joriy name placeholder bo'lsa (user qo'shgan real name) — uni sochlamaymiz
    const shouldUpdateName =
      !existing ||
      existing.name.startsWith("Bo'lim #") ||
      existing.name === `Bo'lim #${id}`;

    await prisma.department.upsert({
      where: { id },
      create: {
        id,
        companyId: company.id,
        name,
        parentId,
      },
      update: {
        ...(shouldUpdateName ? { name } : {}),
        parentId,
      },
    });
    upserted += 1;
  }
  console.log(`✓ ${upserted} ta bo'lim yozildi\n`);

  const allDeps = await prisma.department.findMany({
    where: { companyId: company.id },
    orderBy: { id: "asc" },
  });
  console.log("=== Barcha departmentlar ===");
  for (const d of allDeps) {
    console.log(`  [${d.id}] ${d.name} (parent=${d.parentId || "-"})`);
  }

  console.log("\nESLATMA: webhook'da department.get scope'i yo'q bo'lsa, bo'lim");
  console.log("nomlari 'Bo'lim #<ID>' default ravishda qo'yiladi. Ularni");
  console.log("DB'da qo'lda o'zgartirish mumkin yoki admin panel orqali yangilash.");
  console.log("Masalan:");
  console.log("  UPDATE \"Department\" SET name='Otdel prodaja' WHERE id='1';");
  console.log("  UPDATE \"Department\" SET name='Pre Sale' WHERE id='12';");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err && err.message);
  process.exit(1);
});
