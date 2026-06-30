// Bitrix24 userlarini Manager jadvaliga sinxronlash.
// scripts/sync-bitrix-users.js'ning HTTP-friendly varianti — managers UI'dan
// "Sinxronlash" tugmasi bosilganda chaqiriladi.

import axios from "axios";
import { prisma } from "../utils/prisma";
import { BITRIX_WEBHOOK_URL as BITRIX_WEBHOOK } from "../utils/bitrix-config";

interface BitrixUser {
  ID: string;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: string;
  ACTIVE?: boolean | string;
  PERSONAL_PHOTO?: string;
  UF_DEPARTMENT?: number[] | string[];
}

async function bitrixCall<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<{ result?: T[]; next?: number; total?: number; error?: string }> {
  const resp = await axios.post(
    `${BITRIX_WEBHOOK}/${method}.json`,
    payload,
    {
      headers: { "Content-Type": "application/json" },
      validateStatus: (s) => s < 500,
      timeout: 30_000,
    },
  );
  return resp.data;
}

async function fetchAllUsers(): Promise<BitrixUser[]> {
  const all: BitrixUser[] = [];
  let start = 0;
  while (true) {
    const resp = await bitrixCall<BitrixUser>("user.get", { start });
    const batch = resp.result || [];
    all.push(...batch);
    if (resp.next === undefined || batch.length === 0) break;
    start = resp.next;
    if (start >= (resp.total || 0)) break;
  }
  return all;
}

function formatName(u: BitrixUser): string {
  const name = [u.NAME, u.LAST_NAME].filter(Boolean).join(" ").trim();
  return name || u.EMAIL || `User ${u.ID}`;
}

export interface SyncResult {
  fetched: number;
  used: number;
  upserted: number;
  reactivated: number;
  deactivated: number;
}

export async function syncBitrixManagers(
  companyId: string,
): Promise<SyncResult> {
  const users = await fetchAllUsers();

  // SalesLead'da uchragan Bitrix user ID'lar — faqat ularni Manager qilamiz
  const usedRows = await prisma.salesLead.groupBy({
    by: ["amocrmUserId"],
    where: { companyId, amocrmUserId: { not: null } },
  });
  const usedSet = new Set(usedRows.map((u) => u.amocrmUserId).filter(Boolean));

  // Mavjud department ID'lari
  const depRows = await prisma.department.findMany({
    where: { companyId },
    select: { id: true },
  });
  const depSet = new Set(depRows.map((d) => d.id));

  // Hozirgi DB managerlarini olamiz — kelgan ro'yxatda yo'q bo'lganlarni
  // deaktivatsiya qilish uchun
  const existingManagers = await prisma.manager.findMany({
    where: { companyId },
    select: { id: true, isActive: true },
  });
  const existingMap = new Map(existingManagers.map((m) => [m.id, m]));

  let upserted = 0;
  let reactivated = 0;
  const seenManagerIds = new Set<string>();

  for (const u of users) {
    const bitrixId = String(u.ID);
    if (!usedSet.has(bitrixId)) continue;

    const managerId = `bitrix_${bitrixId}`;
    seenManagerIds.add(managerId);

    const email = u.EMAIL || `bitrix_${bitrixId}@prosales.local`;
    const name = formatName(u);
    const isActive = u.ACTIVE === true || u.ACTIVE === "Y";

    let departmentId: string | null = null;
    const deptArr = Array.isArray(u.UF_DEPARTMENT) ? u.UF_DEPARTMENT : [];
    for (const did of deptArr) {
      const ds = String(did);
      if (depSet.has(ds)) {
        departmentId = ds;
        break;
      }
    }

    const photoUrl = u.PERSONAL_PHOTO || null;

    const prev = existingMap.get(managerId);
    await prisma.manager.upsert({
      where: { id: managerId },
      create: {
        id: managerId,
        name,
        email,
        photoUrl,
        companyId,
        isActive,
        role: "sotuvchi",
        canViewAll: false,
        ...(departmentId ? { departmentId } : {}),
      },
      update: {
        name,
        email,
        photoUrl,
        isActive,
        ...(departmentId ? { departmentId } : {}),
      },
    });

    if (prev && !prev.isActive && isActive) reactivated += 1;
    upserted += 1;
  }

  // Bitrixda yo'q bo'lgan (yoki yangi sync'ga tushmagan) managerlarni
  // o'chirib tashlamaymiz — faqat isActive=false qilamiz, tahlil tarixi
  // saqlanib qolsin.
  let deactivated = 0;
  for (const m of existingManagers) {
    if (!seenManagerIds.has(m.id) && m.isActive) {
      await prisma.manager.update({
        where: { id: m.id },
        data: { isActive: false },
      });
      deactivated += 1;
    }
  }

  return {
    fetched: users.length,
    used: usedSet.size,
    upserted,
    reactivated,
    deactivated,
  };
}
