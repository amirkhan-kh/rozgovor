import { prisma } from "../utils/prisma";
import { broadcast } from "./websocket";
import {
  setRecentSale,
  loadSnapshot,
  saveSnapshot,
  type SaleEvent,
} from "./sale-state";

const TZ = 5; // Tashkent UTC+5

const FALLBACK_VIDEOS = [
  "v1-arms-crossing-in-final.mp4",
  "v2-walk-in-confetti-final.mp4",
  "v3-open-arms-wide-final.mp4",
  "v4-cyan-thumbs-up-final.mp4",
  "v5-side-entry-golden-final.mp4",
];

// companyId → Map<managerId, count>
//   sales:    bugun yopilgan to'liq sotuv (isSale=true, closedAt=bugun)
//   partials: hozir ochiq qisman to'lov (isPartialPayment=true, semanticId not S/F)
//             — bugun yopilishi shart emas; new partial appearance → celebration
const snapshot = new Map<string, Map<string, number>>();         // sales
const partialSnapshot = new Map<string, Map<string, number>>();  // partials

function tashkentNow() {
  const now = new Date();
  const t = new Date(now.getTime() + TZ * 3600 * 1000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function todayKey() {
  const { y, m, d } = tashkentNow();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function todayRange() {
  const { y, m, d } = tashkentNow();
  return {
    gte: new Date(Date.UTC(y, m - 1, d, -TZ, 0, 0)),
    lte: new Date(Date.UTC(y, m - 1, d, 24 - TZ, 59, 59, 999)),
  };
}

function fallbackVideo() {
  return `/videos/${FALLBACK_VIDEOS[Math.floor(Math.random() * FALLBACK_VIDEOS.length)]}`;
}

// Menejerning tayyor shaxsiy videosini tanlaydi (random — finalVideoUrl bor
// senariyalaridan). Bo'lmasa — generic fallback videoga qaytadi.
async function pickPersonalVideo(managerId: string): Promise<string> {
  try {
    const personal = await prisma.managerVideo.findMany({
      where: { managerId, finalVideoUrl: { not: null } },
      select: { finalVideoUrl: true },
    });
    if (personal.length > 0) {
      const pick = personal[Math.floor(Math.random() * personal.length)];
      if (pick.finalVideoUrl) return pick.finalVideoUrl;
    }
  } catch (e) {
    console.error("[sale-watcher] pickPersonalVideo:", (e as Error).message);
  }
  return fallbackVideo();
}

async function fireCelebration(
  companyId: string,
  managerId: string,
): Promise<void> {
  const mgr = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { name: true },
  });
  const videoUrl = await pickPersonalVideo(managerId);
  const ev: SaleEvent = {
    type: "sale",
    companyId,
    managerId,
    managerName: mgr?.name ?? "Menejer",
    videoUrl,
  };
  setRecentSale(ev); // kech ulangan TV uchun replay
  broadcast(ev);
}

async function tick() {
  try {
    const companies = await prisma.company.findMany({ select: { id: true } });
    const range = todayRange();

    for (const { id: companyId } of companies) {
      // 1) Bugun yopilgan to'liq sotuvlar (isSale=true, closedAt=bugun)
      const grouped = await prisma.salesLead.groupBy({
        by: ["responsibleManagerId"],
        where: { companyId, isSale: true, closedAt: range },
        _count: { id: true },
      });
      const current = new Map<string, number>();
      for (const row of grouped) {
        if (row.responsibleManagerId) {
          current.set(row.responsibleManagerId, row._count.id);
        }
      }

      // 2) Hozirda ochiq qisman to'lovlar (isPartialPayment=true, semantic not
      //    S/F). Bu hammavaqtli ochiq partial bo'lim — yangi partial paydo
      //    bo'lganda count o'sadi → celebration. Partial→Won o'tgani uchun
      //    count kamaysa, fire qilmaymiz (sotuv branch'i o'sha vaqtda fire qiladi).
      const partialGrouped = await prisma.salesLead.groupBy({
        by: ["responsibleManagerId"],
        where: {
          companyId,
          isPartialPayment: true,
          semanticId: { notIn: ["S", "F"] },
        },
        _count: { id: true },
      });
      const currentPartials = new Map<string, number>();
      for (const row of partialGrouped) {
        if (row.responsibleManagerId) {
          currentPartials.set(row.responsibleManagerId, row._count.id);
        }
      }

      const prev = snapshot.get(companyId);
      const prevPartials = partialSnapshot.get(companyId);

      if (prev || prevPartials) {
        const firedManagers = new Set<string>();

        // To'liq sotuv — count o'sgan menejerlar
        if (prev) {
          for (const [managerId, count] of current) {
            const was = prev.get(managerId) ?? 0;
            if (count > was) {
              await fireCelebration(companyId, managerId);
              firedManagers.add(managerId);
            }
          }
        }

        // Qisman to'lov — ochiq partial count o'sgan menejerlar.
        // Bir tick'da ham sale, ham partial fire qilmaslik uchun firedManagers'ni
        // tekshirib qo'yamiz (sale ustun: ovoz ikki marta kelmasin).
        if (prevPartials) {
          for (const [managerId, count] of currentPartials) {
            if (firedManagers.has(managerId)) continue;
            const was = prevPartials.get(managerId) ?? 0;
            if (count > was) {
              await fireCelebration(companyId, managerId);
              firedManagers.add(managerId);
            }
          }
        }

        // broadcast refresh so all TVs refetch leaderboard
        broadcast({ type: "refresh", companyId });
      }

      snapshot.set(companyId, current);
      partialSnapshot.set(companyId, currentPartials);
    }

    // har tickda diskka yozamiz — restart/deploy'da baseline yo'qolmaydi
    await saveSnapshot(todayKey(), snapshot, partialSnapshot);
  } catch (e) {
    console.error("[sale-watcher]", e);
  }
}

export function initSaleWatcher() {
  // Diskdagi bugungi snapshotni tiklaymiz → restartdan keyin birinchi tick
  // prev'ga ega bo'ladi va ish to'xtagan paytdagi sotuvlar ham celebrate
  // qilinadi (oldin RAM'da edi — har restartda yo'qolardi).
  void (async () => {
    try {
      const restored = await loadSnapshot(todayKey());
      if (restored) {
        for (const [cid, mgrs] of restored.sales) snapshot.set(cid, mgrs);
        for (const [cid, mgrs] of restored.partials)
          partialSnapshot.set(cid, mgrs);
        console.log(
          `[sale-watcher] snapshot tiklandi (sales=${restored.sales.size}, partials=${restored.partials.size})`
        );
      }
    } catch (e) {
      console.error("[sale-watcher] loadSnapshot:", (e as Error).message);
    }
    setTimeout(() => {
      tick();
      setInterval(tick, 10_000);
    }, 3000);
    console.log("[sale-watcher] started (10s interval, disk-persisted)");
  })();
}
