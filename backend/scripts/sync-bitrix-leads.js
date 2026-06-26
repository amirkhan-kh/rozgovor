// Bitrix lead'larni Lead jadvaliga sinxronlash (oxirgi 3 oy)
// Kval lid = STATUS_ID === 'CONVERTED' (deal'ga o'tgan)

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
  "https://psg.bitrix24.uz/rest/21/90iekiqrlfpqkgnu";

async function bitrixCall(method, payload = {}, attempt = 1) {
  try {
    const resp = await axios.post(`${BITRIX_WEBHOOK}/${method}.json`, payload, {
      headers: { "Content-Type": "application/json" },
      validateStatus: (s) => s < 500,
      timeout: 30000,
    });
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

// Lead'da "Rad etish sabablari" custom field (enumeration)
const REJECT_REASON_FIELD = "UF_CRM_1755759759770";

async function fetchAllLeads(dateFromISO) {
  const all = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall("crm.lead.list", {
      filter: { ">=DATE_CREATE": dateFromISO },
      select: [
        "ID",
        "TITLE",
        "PHONE",
        "STATUS_ID",
        "STATUS_DESCRIPTION",
        "SOURCE_ID",
        "OPPORTUNITY",
        "ASSIGNED_BY_ID",
        "DATE_CREATE",
        REJECT_REASON_FIELD,
      ],
      order: { DATE_CREATE: "ASC" },
      start,
    });
    const batch = resp.result || [];
    all.push(...batch);
    process.stdout.write(`  fetched ${all.length}/${resp.total}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= (resp.total || 0)) break;
  }
  console.log("");
  return all;
}

async function getStatusMap() {
  const resp = await bitrixCall("crm.status.list", {
    filter: { ENTITY_ID: "STATUS" },
  });
  const map = new Map();
  for (const s of resp.result || []) {
    map.set(s.STATUS_ID, s.NAME);
  }
  return map;
}

// Rad etish sabablari enumeration: ID → label
async function getRejectReasonMap() {
  const resp = await bitrixCall("crm.lead.fields", {});
  const field = (resp.result || {})[REJECT_REASON_FIELD];
  const items = (field && field.items) || [];
  const map = new Map();
  for (const it of items) {
    map.set(String(it.ID), it.VALUE);
  }
  return map;
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Company topilmadi");
    process.exit(1);
  }

  const now = new Date();
  const threeMoAgo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, now.getUTCDate(), -5, 0, 0)
  );
  const dateFromISO = threeMoAgo.toISOString();
  console.log(`Sync window: ${dateFromISO}\n`);

  console.log("1) Status map...");
  const statusMap = await getStatusMap();
  console.log(`   ${statusMap.size} ta status`);

  console.log("2) Rad etish sabablari enum map...");
  const rejectMap = await getRejectReasonMap();
  console.log(`   ${rejectMap.size} ta sabab`);

  console.log("3) Leadlar yuklanmoqda...");
  const leads = await fetchAllLeads(dateFromISO);
  console.log(`   ${leads.length} ta lead`);

  // Mavjud manager IDlarini olamiz — FK buzilmasin uchun
  const existingManagers = await prisma.manager.findMany({
    where: { companyId: company.id },
    select: { id: true },
  });
  const managerIdSet = new Set(existingManagers.map((m) => m.id));
  console.log(`   Mavjud managerlar: ${managerIdSet.size}`);

  // Lead'larda uchrayotgan, lekin manager jadvalida yo'q userlarni yaratish
  const neededUserIds = new Set();
  for (const l of leads) {
    if (l.ASSIGNED_BY_ID) neededUserIds.add(String(l.ASSIGNED_BY_ID));
  }
  let newMgr = 0;
  for (const uid of neededUserIds) {
    const mid = `bitrix_${uid}`;
    if (managerIdSet.has(mid)) continue;
    await prisma.manager.create({
      data: {
        id: mid,
        name: `User #${uid}`,
        email: `bitrix_${uid}@prosales.local`,
        companyId: company.id,
        isActive: false,
        role: "sotuvchi",
      },
    });
    managerIdSet.add(mid);
    newMgr += 1;
  }
  if (newMgr > 0) console.log(`   ${newMgr} ta qo'shimcha manager yaratildi (placeholder)`);

  let upserted = 0;
  for (const l of leads) {
    const bitrixLeadId = parseInt(l.ID, 10);
    if (isNaN(bitrixLeadId)) continue;
    const bitrixUserId = l.ASSIGNED_BY_ID ? String(l.ASSIGNED_BY_ID) : null;
    const managerId = bitrixUserId && managerIdSet.has(`bitrix_${bitrixUserId}`)
      ? `bitrix_${bitrixUserId}`
      : null;
    const isConverted = l.STATUS_ID === "CONVERTED";
    const rejectId = l[REJECT_REASON_FIELD]
      ? String(l[REJECT_REASON_FIELD])
      : null;
    const rejectName = rejectId ? rejectMap.get(rejectId) || null : null;
    const phoneArr = Array.isArray(l.PHONE) ? l.PHONE : [];
    const clientPhone =
      phoneArr.length > 0 && phoneArr[0] && phoneArr[0].VALUE
        ? String(phoneArr[0].VALUE).trim() || null
        : null;

    await prisma.lead.upsert({
      where: { companyId_bitrixLeadId: { companyId: company.id, bitrixLeadId } },
      create: {
        companyId: company.id,
        bitrixLeadId,
        title: l.TITLE || null,
        clientPhone,
        statusId: l.STATUS_ID || null,
        statusName: statusMap.get(l.STATUS_ID) || null,
        sourceId: l.SOURCE_ID || null,
        opportunity: parseFloat(l.OPPORTUNITY) || 0,
        responsibleManagerId: managerId,
        bitrixUserId,
        dateCreate: new Date(l.DATE_CREATE),
        isConverted,
        rejectReasonId: rejectId,
        rejectReasonName: rejectName,
      },
      update: {
        title: l.TITLE || null,
        clientPhone,
        statusId: l.STATUS_ID || null,
        statusName: statusMap.get(l.STATUS_ID) || null,
        sourceId: l.SOURCE_ID || null,
        opportunity: parseFloat(l.OPPORTUNITY) || 0,
        responsibleManagerId: managerId,
        bitrixUserId,
        isConverted,
        rejectReasonId: rejectId,
        rejectReasonName: rejectName,
      },
    });
    upserted += 1;
    if (upserted % 200 === 0) {
      process.stdout.write(`  upserted ${upserted}/${leads.length}\r`);
    }
  }
  console.log(`\n✓ ${upserted} ta lead yozildi`);

  // Statistika
  const total = await prisma.lead.count({ where: { companyId: company.id } });
  const converted = await prisma.lead.count({
    where: { companyId: company.id, isConverted: true },
  });
  console.log(`\nDB: ${total} lead, ${converted} kval (${((converted / total) * 100).toFixed(1)}%)`);

  // Status bo'yicha taqsimot
  const byStatus = await prisma.lead.groupBy({
    by: ["statusName"],
    where: { companyId: company.id },
    _count: { bitrixLeadId: true },
    orderBy: { _count: { bitrixLeadId: "desc" } },
  });
  console.log("\nStatus bo'yicha:");
  for (const s of byStatus) {
    console.log(`  ${(s.statusName || "?").padEnd(35)} ${s._count.bitrixLeadId}`);
  }

  // Rad etish sabablari taqsimoti (faqat JUNK)
  const byReject = await prisma.lead.groupBy({
    by: ["rejectReasonName"],
    where: { companyId: company.id, statusId: "JUNK" },
    _count: { bitrixLeadId: true },
    orderBy: { _count: { bitrixLeadId: "desc" } },
  });
  console.log("\nRad etish sabablari (JUNK):");
  for (const r of byReject) {
    console.log(
      `  ${(r.rejectReasonName || "— sabab yo'q").padEnd(35)} ${r._count.bitrixLeadId}`
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
