/**
 * Permissions service — rol defaultlari + har menejer uchun override.
 *
 * Rollar:
 *   - boss    — to'liq ruxsat + admin actions (kompaniya hisobidan keyingi eng yuqori)
 *   - rop     — Regional/Otdel Prodaja boshlig'i — to'liq ko'rish + boshqarish, lekin
 *                ruxsat tahriri/huquq berish qobiliyati yo'q
 *   - manager — o'z ma'lumotlarini ko'radi (audio/lessons/rating), boshqa menejerlarnikini emas
 *
 * Eski "sotuvchi" qiymati "manager" bilan bir xil deb hisoblanadi (orqa muvofiqlik).
 *
 * Pages (pageKey) — sidebar elementlariga mos keladi:
 *   sales, audit, clients, managers, rating, lessons, audio, custdev,
 *   scenario, rivals, profile
 *
 * Actions (actionKey) — null bo'lsa "view" nazarda tutiladi.
 *   view, edit, delete, export, edit_plan, upload_audio, assign, manage
 *
 * Override mantig'i: agar Permission jadvalida pageKey+actionKey yozuvi bo'lsa,
 * uning qiymati default ustida ishlatiladi. Yozuv yo'q → default qo'llanadi.
 *
 * MUHIM: Company login (super admin) har doim hamma narsaga ruxsatli —
 * bu tekshiruv controller va middleware darajasida bajariladi.
 */

import { prisma } from "../utils/prisma";

// Rol nomi normalize qilish (eski "sotuvchi" ham mavjud)
export function normalizeRole(role?: string | null): "boss" | "rop" | "manager" {
  if (!role) return "manager";
  const r = role.toLowerCase();
  if (r === "boss" || r === "admin") return "boss";
  if (r === "rop") return "rop";
  // "manager" | "sotuvchi" | boshqa — default manager
  return "manager";
}

// Qo'llab-quvvatlanadigan sahifalar (sidebar'dagi barcha yirik bo'limlar)
export const PAGE_KEYS = [
  "sales",
  "audit",
  "clients",
  "managers",
  "rating",
  "lessons",
  "audio",
  "custdev",
  "scenario",
  "rivals",
  "profile",
] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

// Har sahifa uchun qo'llab-quvvatlanadigan action'lar
export const PAGE_ACTIONS: Record<PageKey, readonly string[]> = {
  sales: ["view", "edit_plan", "export"],
  audit: ["view", "edit", "delete", "export"],
  clients: ["view", "edit", "export"],
  managers: ["view", "edit", "delete", "assign"],
  rating: ["view", "export"],
  lessons: ["view", "upload", "edit", "delete", "assign"],
  audio: ["view", "upload_audio", "delete"],
  custdev: ["view", "create", "edit", "delete"],
  scenario: ["view", "edit", "upload"],
  rivals: ["view", "edit"],
  profile: ["view"],
};

// Rol default matritsasi. true = ruxsat, false = taqiq.
// "view" — umumiy sahifa ko'rinishi. Boshqa action'lar alohida.
type ActionMap = Record<string, boolean>;
type RoleMatrix = Record<PageKey, ActionMap>;

function allTrue(page: PageKey): ActionMap {
  const map: ActionMap = { view: true };
  for (const a of PAGE_ACTIONS[page]) map[a] = true;
  return map;
}

function allFalse(page: PageKey): ActionMap {
  const map: ActionMap = { view: false };
  for (const a of PAGE_ACTIONS[page]) map[a] = false;
  return map;
}

function onlyView(page: PageKey): ActionMap {
  const map = allFalse(page);
  map.view = true;
  return map;
}

// BOSS — kompaniya egasi darajasida. Hamma narsa ochiq.
const BOSS_DEFAULTS: RoleMatrix = PAGE_KEYS.reduce((acc, p) => {
  acc[p] = allTrue(p);
  return acc;
}, {} as RoleMatrix);

// ROP — kundalik boshqaruv. Hamma narsaga kirishi, lekin destructive action'lar
// (delete) faqat ba'zi sahifalarda.
const ROP_DEFAULTS: RoleMatrix = {
  sales: { view: true, edit_plan: true, export: true },
  audit: { view: true, edit: true, delete: false, export: true },
  clients: { view: true, edit: true, export: true },
  managers: { view: true, edit: true, delete: false, assign: true },
  rating: { view: true, export: true },
  lessons: { view: true, upload: true, edit: true, delete: false, assign: true },
  audio: { view: true, upload_audio: true, delete: false },
  custdev: { view: true, create: true, edit: true, delete: false },
  scenario: { view: true, edit: true, upload: true },
  rivals: { view: true, edit: true },
  profile: { view: true },
};

// MANAGER (sotuvchi) — faqat o'z ma'lumotlari. Umumiy sahifalar yopiq.
const MANAGER_DEFAULTS: RoleMatrix = {
  sales: allFalse("sales"),
  audit: allFalse("audit"),
  clients: allFalse("clients"),
  managers: allFalse("managers"),
  rating: onlyView("rating"), // o'zini reytingda ko'rish
  lessons: onlyView("lessons"), // tayinlangan darslar
  audio: { view: true, upload_audio: false, delete: false }, // o'z audiosi
  custdev: allFalse("custdev"),
  scenario: onlyView("scenario"),
  rivals: allFalse("rivals"),
  profile: { view: true }, // o'z profili
};

export const ROLE_DEFAULTS: Record<"boss" | "rop" | "manager", RoleMatrix> = {
  boss: BOSS_DEFAULTS,
  rop: ROP_DEFAULTS,
  manager: MANAGER_DEFAULTS,
};

// ─── Helpers ───────────────────────────────────────────────────────────

interface PermissionRow {
  pageKey: string;
  actionKey: string | null;
  allowed: boolean;
}

/**
 * Menejer uchun effektiv ruxsat matritsasini qaytaradi (rol default + override).
 * Company login uchun har doim to'liq ruxsat beriladi — bu funksiya faqat
 * Manager uchun ishlaydi.
 */
export async function getEffectivePermissions(
  managerId: string
): Promise<{ role: "boss" | "rop" | "manager"; matrix: RoleMatrix }> {
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { role: true },
  });
  const role = normalizeRole(manager?.role);
  // Oddiy shallow clone — har sahifa uchun yangi object
  const matrix: RoleMatrix = PAGE_KEYS.reduce((acc, p) => {
    acc[p] = { ...ROLE_DEFAULTS[role][p] };
    return acc;
  }, {} as RoleMatrix);

  // Override'larni qo'llash
  const overrides = await getOverrides(managerId);
  for (const row of overrides) {
    if (!(PAGE_KEYS as readonly string[]).includes(row.pageKey)) continue;
    const page = row.pageKey as PageKey;
    const action = row.actionKey ?? "view";
    matrix[page][action] = row.allowed;
  }

  return { role, matrix };
}

async function getOverrides(managerId: string): Promise<PermissionRow[]> {
  // Permission modeli keyingi migratsiyadan so'ng to'liq typed bo'ladi,
  // hozircha `any` orqali chaqiramiz.
  const rows = (await (prisma as unknown as {
    permission: {
      findMany: (args: { where: { managerId: string } }) => Promise<PermissionRow[]>;
    };
  }).permission.findMany({ where: { managerId } })) as PermissionRow[];
  return rows;
}

/**
 * Bitta ruxsatni tekshirish — middleware ishlatadi.
 * actionKey berilmasa "view" hisoblanadi.
 */
export async function hasPermission(
  managerId: string,
  pageKey: string,
  actionKey?: string | null
): Promise<boolean> {
  if (!(PAGE_KEYS as readonly string[]).includes(pageKey)) return false;
  const page = pageKey as PageKey;
  const action = actionKey ?? "view";
  const { matrix } = await getEffectivePermissions(managerId);
  return matrix[page]?.[action] === true;
}

/**
 * Override yozuvlari ro'yxati (UI uchun — qaysi sozlamalar custom qilingan).
 */
export async function getOverridesList(managerId: string): Promise<PermissionRow[]> {
  return await getOverrides(managerId);
}

/**
 * Override'larni batch tarzda saqlash. Har entry: { pageKey, actionKey, allowed }.
 * allowed === null bo'lsa → override olib tashlanadi (default'ga qaytadi).
 */
export async function setOverrides(
  managerId: string,
  entries: Array<{ pageKey: string; actionKey?: string | null; allowed: boolean | null }>
): Promise<void> {
  const client = prisma as unknown as {
    permission: {
      create: (args: {
        data: { managerId: string; pageKey: string; actionKey: string | null; allowed: boolean };
      }) => Promise<unknown>;
      deleteMany: (args: {
        where: { managerId: string; pageKey: string; actionKey: string | null };
      }) => Promise<unknown>;
    };
  };

  for (const e of entries) {
    if (!(PAGE_KEYS as readonly string[]).includes(e.pageKey)) continue;
    const actionKey = e.actionKey ?? null;

    // Qo'lda upsert: Prisma compound unique (managerId,pageKey,actionKey)
    // actionKey=null bo'lganda upsert/findUnique ishlamaydi (SQL NULL != NULL).
    // Shuning uchun avval o'chiramiz, keyin (allowed != null bo'lsa) qaytadan
    // yaratamiz. allowed=null → faqat o'chirish (default'ga qaytadi).
    await client.permission.deleteMany({
      where: { managerId, pageKey: e.pageKey, actionKey },
    });

    if (e.allowed === null) continue;

    await client.permission.create({
      data: {
        managerId,
        pageKey: e.pageKey,
        actionKey,
        allowed: e.allowed,
      },
    });
  }
}

/**
 * Rol default'larini JSON sifatida qaytaradi — frontend UI uchun.
 */
export function getRoleDefaults(): Record<string, RoleMatrix> {
  return ROLE_DEFAULTS;
}

/**
 * Kompaniya admini (company login) har doim true qaytaradi —
 * middleware'da maxsus yo'l bilan tekshirilsa ham bu yerda foydalanish uchun.
 */
export function isCompanyAdmin(userRole?: string | null): boolean {
  return userRole === "company";
}
