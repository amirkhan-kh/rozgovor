// Celebration "recent sale" replay store + disk-persist snapshot.
// sale-watcher va websocket o'rtasida circular import bo'lmasligi uchun
// alohida modul.

import { promises as fs } from "fs";
import path from "path";

export interface SaleEvent {
  type: "sale";
  companyId: string;
  managerId: string;
  managerName: string;
  videoUrl: string;
  // websocket WsMessage bilan strukturaviy moslik uchun
  [key: string]: unknown;
}

// ── Recent sale (replay) ──────────────────────────────────────────────
// TV ekran sotuvdan bir necha soniya keyin ochilsa ham celebration chiqsin.
const recent = new Map<string, { ev: SaleEvent; ts: number }>();

export function setRecentSale(ev: SaleEvent): void {
  recent.set(ev.companyId, { ev, ts: Date.now() });
}

export function getFreshSale(
  companyId: string | undefined,
  maxAgeMs = 120_000
): SaleEvent | null {
  if (!companyId) return null;
  const r = recent.get(companyId);
  if (!r) return null;
  return Date.now() - r.ts <= maxAgeMs ? r.ev : null;
}

// ── Snapshot persist (PM2 restart/deploy'da yo'qolmasligi uchun) ───────
// {date, sales:{...}, partials:{...}} — faqat o'sha kun (Tashkent)
// uchun. Boshqa kun bo'lsa — bekor (kun boshida sanoq 0 dan boshlanadi).
// Eski format (data:{...}) ham qabul qilinadi — migratsiya.
const SNAPSHOT_FILE =
  process.env.SALE_WATCHER_SNAPSHOT ||
  path.join(__dirname, "../../.cache/sale-watcher-snapshot.json");

type Plain = Record<string, Record<string, number>>;

function plainToMap(p: Plain | undefined): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>();
  for (const [cid, mgrs] of Object.entries(p || {})) {
    map.set(cid, new Map(Object.entries(mgrs)));
  }
  return map;
}

function mapToPlain(m: Map<string, Map<string, number>>): Plain {
  const out: Plain = {};
  for (const [cid, mgrs] of m) out[cid] = Object.fromEntries(mgrs);
  return out;
}

export async function loadSnapshot(
  todayKey: string,
): Promise<{
  sales: Map<string, Map<string, number>>;
  partials: Map<string, Map<string, number>>;
} | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_FILE, "utf8");
    const parsed = JSON.parse(raw) as {
      date: string;
      sales?: Plain;
      partials?: Plain;
      data?: Plain; // eski format
    };
    if (parsed.date !== todayKey) return null; // boshqa kun → baseline qayta
    return {
      sales: plainToMap(parsed.sales ?? parsed.data),
      partials: plainToMap(parsed.partials),
    };
  } catch {
    return null; // fayl yo'q yoki buzuq
  }
}

export async function saveSnapshot(
  todayKey: string,
  sales: Map<string, Map<string, number>>,
  partials: Map<string, Map<string, number>>,
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(SNAPSHOT_FILE), { recursive: true });
    const tmp = `${SNAPSHOT_FILE}.tmp`;
    await fs.writeFile(
      tmp,
      JSON.stringify({
        date: todayKey,
        sales: mapToPlain(sales),
        partials: mapToPlain(partials),
      }),
    );
    await fs.rename(tmp, SNAPSHOT_FILE);
  } catch (e) {
    console.error("[sale-state] saveSnapshot:", (e as Error).message);
  }
}
