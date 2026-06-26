// Bitrix24 crm.activity.list dan Activity jadvalini to'ldirish
// OWNER_TYPE_ID: 1=LEAD, 2=DEAL, 3=CONTACT, 4=COMPANY
// TYPE_ID: 1=call, 2=meeting, 3=task, 4=email
//
// Ishga tushirish:
//   DATABASE_URL="..." node scripts/sync-bitrix-activities.js [days=30]

const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const BITRIX_WEBHOOK =
  process.env.BITRIX_WEBHOOK_URL ||
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

async function fetchAllActivities(dateFromISO, limit) {
  const all = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall("crm.activity.list", {
      filter: {
        ">=CREATED": dateFromISO,
      },
      select: [
        "ID",
        "OWNER_ID",
        "OWNER_TYPE_ID",
        "TYPE_ID",
        "SUBJECT",
        "DIRECTION",
        "PRIORITY",
        "RESPONSIBLE_ID",
        "DEADLINE",
        "START_TIME",
        "END_TIME",
        "COMPLETED",
        "STATUS",
        "CREATED",
        "LAST_UPDATED",
      ],
      order: { CREATED: "DESC" },
      start,
    });
    const batch = resp.result || [];
    all.push(...batch);
    process.stdout.write(`  fetched ${all.length}/${resp.total || "?"}\r`);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (resp.total !== undefined && start >= resp.total) break;
    if (limit && all.length >= limit) {
      console.log(`\n  reached --limit=${limit}, stopping`);
      break;
    }
  }
  console.log("");
  return all;
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const daysArg = parseInt(process.argv[2] || "30", 10);
  const limitArg = parseInt(process.argv[3] || "0", 10) || null;
  const days = Number.isFinite(daysArg) && daysArg > 0 ? daysArg : 30;

  const company = await prisma.company.findFirst();
  if (!company) {
    console.error("Company topilmadi");
    process.exit(1);
  }
  console.log(`Company: ${company.name}`);

  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const dateFromISO = since.toISOString();
  console.log(`Sync window: ${dateFromISO} → now${limitArg ? ` (limit=${limitArg})` : ""}\n`);

  console.log("1) Activity'lar yuklanmoqda (crm.activity.list)...");
  const activities = await fetchAllActivities(dateFromISO, limitArg);
  console.log(`   ${activities.length} ta activity keldi`);

  // Manager map — bitrix user id -> local manager id
  const managers = await prisma.manager.findMany({
    where: { companyId: company.id },
    select: { id: true },
  });
  const managerIdSet = new Set(managers.map((m) => m.id));

  let upserted = 0;
  let skipped = 0;
  for (const a of activities) {
    const bitrixId = String(a.ID);
    if (!bitrixId) {
      skipped += 1;
      continue;
    }
    const ownerType = toNum(a.OWNER_TYPE_ID);
    const ownerId = a.OWNER_ID ? String(a.OWNER_ID) : null;
    const leadId = ownerType === 1 ? toNum(a.OWNER_ID) : null;
    const dealId = ownerType === 2 ? toNum(a.OWNER_ID) : null;
    const respBitrix = a.RESPONSIBLE_ID ? String(a.RESPONSIBLE_ID) : null;
    const mappedManager = respBitrix && managerIdSet.has(`bitrix_${respBitrix}`)
      ? `bitrix_${respBitrix}`
      : null;

    const data = {
      companyId: company.id,
      bitrixId,
      ownerType,
      ownerId,
      leadId,
      dealId,
      typeId: toNum(a.TYPE_ID),
      subject: a.SUBJECT || null,
      direction: toNum(a.DIRECTION),
      priority: toNum(a.PRIORITY),
      responsibleId: respBitrix,
      managerId: mappedManager,
      deadline: toDate(a.DEADLINE),
      startTime: toDate(a.START_TIME),
      endTime: toDate(a.END_TIME),
      completed: a.COMPLETED === "Y" || a.COMPLETED === true,
      status: toNum(a.STATUS),
      createdBitrix: toDate(a.CREATED),
      updatedBitrix: toDate(a.LAST_UPDATED),
    };

    await prisma.activity.upsert({
      where: { bitrixId },
      create: data,
      update: data,
    });
    upserted += 1;
    if (upserted % 100 === 0) {
      process.stdout.write(`  upserted ${upserted}/${activities.length}\r`);
    }
  }
  console.log(`\n✓ ${upserted} ta activity yozildi (${skipped} skip)`);

  // Stats
  const totalDB = await prisma.activity.count({ where: { companyId: company.id } });
  const openDB = await prisma.activity.count({
    where: { companyId: company.id, completed: false },
  });
  console.log(`\n=== DB natijasi ===`);
  console.log(`  total: ${totalDB}`);
  console.log(`  open: ${openDB}`);

  // WebSocket notifier — agar server ishlayotgan bo'lsa, boshqa agent
  // emitActivityUpdate() helperi ichida websocket broadcast qiladi.
  // Bu skript standalone CLI — o'zi broadcast qilmaydi (server kerak).

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err && err.message);
  process.exit(1);
});
