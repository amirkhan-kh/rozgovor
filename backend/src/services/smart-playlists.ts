/**
 * Smart Playlists (B3-6)
 *
 * Predefined "playlist" filtrlar — menejer va sotuvchilar uchun coaching kolleksiyalari.
 *
 * Misol playlistlar:
 *  - "Eng yaxshi discovery qo'ng'iroqlari" — overallScore>=80 + criteria.Ehtiyoj>=85
 *  - "E'tiroz bilan g'alaba" — isSale=true + objections.length>=1
 *  - "Muammoli qo'ng'iroqlar" — errors.length>=3
 *  - "Issiq lidlar" — leadHeatScore>=80
 *  - "Nutq nisbati xatosi" — managerSpeech>70
 *  - "Qisqa tugagan" — openEnding=true
 *  - "O'ylayman e'tirozi" — requiresFollowup + thinking
 *
 * Har menejerga "o'z" playlisti — faqat o'ziniki callarni ko'rsatadi.
 */

import { prisma } from "../utils/prisma";

export type PlaylistKey =
  | "best_discovery"
  | "objection_wins"
  | "problem_calls"
  | "hot_leads"
  | "speech_violations"
  | "open_endings"
  | "thinking_objections"
  | "top_performer_calls"
  | "won_this_week"
  | "lost_this_week";

export interface PlaylistDefinition {
  key: PlaylistKey;
  name: string;
  description: string;
  emoji: string;
}

export const PLAYLIST_DEFINITIONS: PlaylistDefinition[] = [
  {
    key: "best_discovery",
    name: "Eng yaxshi kashfiyot qo'ng'iroqlari",
    description: "Yuqori ball + ehtiyoj aniqlash yaxshi bajarilgan",
    emoji: "🎯",
  },
  {
    key: "objection_wins",
    name: "E'tiroz bilan g'alaba",
    description: "E'tiroz kelib ham sotuv yopilgan qo'ng'iroqlar",
    emoji: "🏆",
  },
  {
    key: "problem_calls",
    name: "Muammoli qo'ng'iroqlar",
    description: "3+ xato bo'lgan — o'rganish uchun",
    emoji: "⚠️",
  },
  {
    key: "hot_leads",
    name: "Issiq lidlar",
    description: "Lead heat score 75+",
    emoji: "🔥",
  },
  {
    key: "speech_violations",
    name: "Nutq nisbati xatosi",
    description: "Menejer 70%+ gapirgan qo'ng'iroqlar",
    emoji: "🔇",
  },
  {
    key: "open_endings",
    name: "Ochiq yakunlangan",
    description: "Keyingi qadam belgilanmagan — o'rganish uchun",
    emoji: "🌀",
  },
  {
    key: "thinking_objections",
    name: "'O'ylayman' e'tirozi",
    description: "Mijoz 'keyin aytaman' dedi — qayta ishlash kerak",
    emoji: "🤔",
  },
  {
    key: "top_performer_calls",
    name: "Top performer qo'ng'iroqlari",
    description: "Kompaniyaning eng yaxshi sotuvchisining so'nggi qo'ng'iroqlari",
    emoji: "⭐",
  },
  {
    key: "won_this_week",
    name: "Bu hafta yutilgan",
    description: "Oxirgi 7 kun ichida yopilgan sotuvlar",
    emoji: "✅",
  },
  {
    key: "lost_this_week",
    name: "Bu hafta yo'qotilgan",
    description: "Oxirgi 7 kun ichida — nimada xato qilindi",
    emoji: "❌",
  },
];

export interface PlaylistItem {
  audioFileId: string;
  callDate: string | null;
  managerName: string | null;
  phoneNumber: string | null;
  duration: number | null;
  score: number | null;
  summary: string | null;
  isSale: boolean;
  topObjection: string | null;
}

/**
 * Playlist natijalarini olish.
 */
export async function getPlaylist(
  companyId: string,
  key: PlaylistKey,
  options: { managerId?: string; limit?: number } = {}
): Promise<{ key: PlaylistKey; items: PlaylistItem[]; total: number }> {
  const limit = Math.min(100, options.limit || 30);
  const managerFilter = options.managerId ? { managerId: options.managerId } : {};

  const common = {
    companyId,
    status: "done",
    ...managerFilter,
  };

  let where: any = common;

  switch (key) {
    case "best_discovery":
      where = {
        ...common,
        analysis: { overallScore: { gte: 80 } },
      };
      break;

    case "objection_wins":
      where = {
        ...common,
        isSale: true,
      };
      break;

    case "problem_calls":
      where = {
        ...common,
        // errors array 3+ — Prisma Json filter
      };
      break;

    case "hot_leads":
      where = {
        ...common,
        analysis: { leadHeatScore: { gte: 75 } },
      };
      break;

    case "speech_violations":
      where = {
        ...common,
        analysis: { managerSpeech: { gt: 70 } },
      };
      break;

    case "thinking_objections":
      where = {
        ...common,
        analysis: {
          requiresFollowup: true,
          followupReason: "thinking",
        },
      };
      break;

    case "won_this_week": {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      where = { ...common, isSale: true, saleClosedAt: { gte: since } };
      break;
    }

    case "lost_this_week": {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      where = {
        ...common,
        createdAt: { gte: since },
        isSale: false,
        analysis: { overallScore: { lt: 50 } },
      };
      break;
    }

    case "top_performer_calls": {
      // Company top performer'ni topamiz
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { topPerformerPlaybook: true },
      });
      const playbook = company?.topPerformerPlaybook as Record<string, any> | null;
      const topId = playbook?.managerId as string | undefined;
      if (!topId) return { key, items: [], total: 0 };
      where = { ...common, managerId: topId, isSale: true };
      break;
    }

    case "open_endings":
    default:
      where = common;
  }

  const raw = await prisma.audioFile.findMany({
    where,
    orderBy: { callDate: "desc" },
    take: limit,
    include: {
      manager: { select: { name: true } },
      analysis: {
        select: {
          overallScore: true,
          summary: true,
          objections: true,
          errors: true,
        },
      },
    },
  });

  // Post-filter for keys that need in-JSON filtering
  let filtered = raw;

  if (key === "problem_calls") {
    filtered = raw.filter((r) => {
      const errs = (r.analysis?.errors as unknown[]) || [];
      return errs.length >= 3;
    });
  }

  if (key === "open_endings") {
    filtered = raw.filter((r) => {
      const errs = (r.analysis?.errors as Array<{ type: string }>) || [];
      return errs.some((e) => e.type === "Yakunlash zaif");
    });
  }

  const items: PlaylistItem[] = filtered.map((r) => {
    const objs = (r.analysis?.objections as Array<{ type: string; count: number }>) || [];
    const topObjection = objs.sort((a, b) => b.count - a.count)[0]?.type || null;
    return {
      audioFileId: r.id,
      callDate: r.callDate?.toISOString() || null,
      managerName: r.manager?.name || null,
      phoneNumber: r.phoneNumber,
      duration: r.duration,
      score: r.analysis?.overallScore ?? null,
      summary: r.analysis?.summary?.slice(0, 200) || null,
      isSale: r.isSale || false,
      topObjection,
    };
  });

  return { key, items, total: items.length };
}
