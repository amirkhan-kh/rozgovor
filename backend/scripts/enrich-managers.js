// Nomsiz / to'liqsiz menejerlarni Bitrix user.get {ID} bilan to'ldirish.
// Bulk user.get nofaol/eski userlarni qaytarmaydi → "User #N" placeholderlar
// qoladi (deal va qo'ng'iroq orphanlari). Bu skript ularni individual ID
// bo'yicha so'rab haqiqiy ism/bo'lim/holat/foto bilan yangilaydi.
//
//   node scripts/enrich-managers.js
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function userGetById(id) {
  const resp = await axios.post(
    `${BITRIX_WEBHOOK}/user.get.json`,
    { ID: id, ADMIN_MODE: true },
    { headers: { "Content-Type": "application/json" }, validateStatus: (s) => s < 500 }
  );
  return (resp.data.result || [])[0] || null;
}

function formatName(u) {
  return [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim();
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) { console.log("Company yo'q"); process.exit(1); }
  console.log(`Company: ${company.name}`);

  const depRows = await prisma.department.findMany({
    where: { companyId: company.id },
    select: { id: true },
  });
  const depSet = new Set(depRows.map((d) => d.id));

  // To'liqsiz menejerlar: "User #" nomli YOKI bitrix_ ID lik nofaol/bo'limsiz
  const candidates = await prisma.manager.findMany({
    where: {
      companyId: company.id,
      id: { startsWith: "bitrix_" },
      OR: [
        { name: { startsWith: "User #" } },
        { name: "" },
        { AND: [{ isActive: false }, { departmentId: null }] },
      ],
    },
    select: { id: true, name: true },
  });
  console.log(`To'ldiriladigan menejerlar: ${candidates.length}`);

  let fixed = 0, missing = 0;
  for (const m of candidates) {
    const uid = m.id.replace("bitrix_", "");
    let u = null;
    try { u = await userGetById(uid); } catch (e) { /* skip */ }
    if (!u) { missing += 1; continue; }

    const name = formatName(u) || m.name;
    const isActive = u.ACTIVE === true || u.ACTIVE === "Y";
    const deptArr = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : [];
    let departmentId = null;
    for (const did of deptArr) {
      if (depSet.has(String(did))) { departmentId = String(did); break; }
    }
    await prisma.manager.update({
      where: { id: m.id },
      data: {
        name,
        email: u.EMAIL || undefined,
        photoUrl: u.PERSONAL_PHOTO || undefined,
        isActive,
        departmentId: departmentId || undefined,
      },
    });
    fixed += 1;
    console.log(`  ✓ ${m.id}: "${m.name}" → "${name}" (active=${isActive}, dept=${departmentId || "-"})`);
  }

  console.log(`\n=== Natija ===`);
  console.log(`  To'ldirildi: ${fixed}`);
  console.log(`  Bitrix'da topilmadi (haqiqatan o'chirilgan): ${missing}`);
  const active = await prisma.manager.count({ where: { companyId: company.id, isActive: true } });
  const total = await prisma.manager.count({ where: { companyId: company.id } });
  console.log(`  Menejerlar: ${total} (${active} faol)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error("Fatal:", e.message); process.exit(1); });
