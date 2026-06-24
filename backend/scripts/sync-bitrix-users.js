// Bitrix24 userlarini Manager jadvaliga sinxronlash va SalesLead'ni bog'lash

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(method, payload = {}) {
  const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
    headers: { "Content-Type": "application/json" },
    validateStatus: (s) => s < 500,
  });
  return resp.data;
}

async function fetchAllUsers() {
  const all = [];
  let start = 0;
  // user.get default'da UF_DEPARTMENT ni qaytaradi — explicit select kerak emas
  while (true) {
    const resp = await bitrixCall("user.get", { start });
    const batch = resp.result || [];
    all.push(...batch);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= (resp.total || 0)) break;
  }
  return all;
}

function formatName(u) {
  const name = [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim();
  return name || u.EMAIL || `User ${u.ID}`;
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Company topilmadi");
    process.exit(1);
  }
  console.log(`Company: ${company.name}`);

  console.log("\n1) Bitrix userlar yuklanmoqda...");
  const users = await fetchAllUsers();
  console.log(`   ${users.length} ta user keldi`);

  // Faqat SalesLead ishlatilgan userlar + hammasi (admin/RDO ham bor)
  const usedUserIds = await prisma.salesLead.groupBy({
    by: ["amocrmUserId"],
    where: { companyId: company.id, amocrmUserId: { not: null } },
  });
  const usedSet = new Set(usedUserIds.map((u) => u.amocrmUserId));
  console.log(`   SalesLead'da foydalanilgan: ${usedSet.size}`);

  let upserted = 0;
  let linked = 0;

  // Department lookup: kerakli Department jadvaliga bog'lash uchun
  // mavjud department ID to'plamini olamiz.
  const depRows = await prisma.department.findMany({
    where: { companyId: company.id },
    select: { id: true },
  });
  const depSet = new Set(depRows.map((d) => d.id));

  for (const u of users) {
    const bitrixId = String(u.ID);
    const managerId = `bitrix_${bitrixId}`;
    const email = u.EMAIL || `bitrix_${bitrixId}@prosales.local`;
    const name = formatName(u);
    const isActive = u.ACTIVE === true || u.ACTIVE === "Y";
    // Faqat SalesLead'da uchraydiganlarni yozamiz — qolganlari kerak emas
    if (!usedSet.has(bitrixId)) continue;

    // UF_DEPARTMENT — massiv, birinchi elementini olamiz (asosiy bo'lim)
    const deptArr = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : [];
    let departmentId = null;
    for (const did of deptArr) {
      const ds = String(did);
      if (depSet.has(ds)) {
        departmentId = ds;
        break;
      }
    }

    const photoUrl = u.PERSONAL_PHOTO || null;
    await prisma.manager.upsert({
      where: { id: managerId },
      create: {
        id: managerId,
        name,
        email,
        photoUrl,
        companyId: company.id,
        isActive,
        role: "sotuvchi",
        canViewAll: false,
        canViewDashboard: false,
        canViewRating: true,
        departmentId,
      },
      update: {
        name,
        email,
        photoUrl,
        isActive,
        departmentId,
      },
    });
    upserted += 1;

    // SalesLead.responsibleManagerId ni yangilash
    const res = await prisma.salesLead.updateMany({
      where: { companyId: company.id, amocrmUserId: bitrixId },
      data: { responsibleManagerId: managerId },
    });
    linked += res.count;
  }

  console.log(`\n=== RESULT ===`);
  console.log(`Upserted managers: ${upserted}`);
  console.log(`Linked SalesLead rows: ${linked}`);

  // Nameless managerlar (SalesLead'da user_id bor, lekin user.get qaytarmagan)
  const orphanUserIds = [...usedSet].filter(
    (id) => !users.some((u) => String(u.ID) === id)
  );
  if (orphanUserIds.length > 0) {
    console.log(`\nOrphan userlar (topilmadi): ${orphanUserIds.length}`);
    for (const uid of orphanUserIds) {
      const mid = `bitrix_${uid}`;
      await prisma.manager.upsert({
        where: { id: mid },
        create: {
          id: mid,
          name: `User #${uid}`,
          email: `bitrix_${uid}@prosales.local`,
          companyId: company.id,
          isActive: false,
          role: "sotuvchi",
        },
        update: { name: `User #${uid}` },
      });
      await prisma.salesLead.updateMany({
        where: { companyId: company.id, amocrmUserId: uid },
        data: { responsibleManagerId: mid },
      });
      console.log(`  orphan manager yaratildi: ${mid}`);
    }
  }

  // Final verify
  const totalMgr = await prisma.manager.count({ where: { companyId: company.id } });
  const activeMgr = await prisma.manager.count({
    where: { companyId: company.id, isActive: true },
  });
  const unlinked = await prisma.salesLead.count({
    where: {
      companyId: company.id,
      responsibleManagerId: null,
      amocrmUserId: { not: null },
    },
  });
  console.log(`\nDB:`);
  console.log(`  Managers: ${totalMgr} (${activeMgr} faol)`);
  console.log(`  SalesLead responsibleManagerId null (user_id bor lekin): ${unlinked}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
