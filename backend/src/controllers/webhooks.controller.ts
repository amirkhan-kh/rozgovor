// Bitrix24 outbound webhook handler — sotuv/lid o'zgarishini real-time qayta ishlaydi.

import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { upsertDealById, upsertLeadById } from "../services/bitrix-sync";
import { broadcast } from "../services/websocket";

const EXPECTED_TOKEN = process.env.BITRIX_WEBHOOK_TOKEN || "";

const FALLBACK_VIDEOS = [
  "v1-arms-crossing-in-final.mp4",
  "v2-walk-in-confetti-final.mp4",
  "v3-open-arms-wide-final.mp4",
  "v4-cyan-thumbs-up-final.mp4",
  "v5-side-entry-golden-final.mp4",
];

function pickId(body: Record<string, unknown>): number | null {
  const data = body.data as Record<string, unknown> | undefined;
  const fields = data?.FIELDS as Record<string, unknown> | undefined;
  const raw = fields?.ID ?? body.ID;
  if (!raw) return null;
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? null : n;
}

async function pickVideoUrl(managerId: string): Promise<string> {
  const personal = await prisma.managerVideo.findMany({
    where: { managerId, finalVideoUrl: { not: null } },
    select: { finalVideoUrl: true },
  });
  if (personal.length > 0) {
    const pick = personal[Math.floor(Math.random() * personal.length)];
    if (pick.finalVideoUrl) return pick.finalVideoUrl;
  }
  return `/videos/${FALLBACK_VIDEOS[Math.floor(Math.random() * FALLBACK_VIDEOS.length)]}`;
}

export const bitrixWebhook = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ ok: true });

  try {
    const body = req.body as Record<string, unknown>;
    if (!body || typeof body !== "object") return;

    if (EXPECTED_TOKEN) {
      const auth = body.auth as Record<string, unknown> | undefined;
      const token = (auth?.application_token as string) || (req.query.token as string) || "";
      if (token !== EXPECTED_TOKEN) {
        console.warn("[bitrix-webhook] invalid token");
        return;
      }
    }

    const event = String(body.event || "").toUpperCase();
    const id = pickId(body);
    if (!id) {
      console.warn("[bitrix-webhook] no id in payload");
      return;
    }

    const company = await prisma.company.findFirst({ select: { id: true } });
    if (!company) return;
    const companyId = company.id;

    if (event.startsWith("ONCRMDEAL")) {
      const result = await upsertDealById(companyId, id);
      if (!result) return;

      broadcast({ type: "refresh", companyId });

      if (result.isSale && !result.wasSale && result.managerId) {
        const mgr = await prisma.manager.findUnique({
          where: { id: result.managerId },
          select: { name: true },
        });
        const videoUrl = await pickVideoUrl(result.managerId);
        broadcast({
          type: "sale",
          companyId,
          managerId: result.managerId,
          managerName: mgr?.name ?? "Menejer",
          videoUrl,
        });
      }

      console.log(`[bitrix-webhook] ${event} deal=${id} sale=${result.isSale} wasSale=${result.wasSale}`);
      return;
    }

    if (event.startsWith("ONCRMLEAD")) {
      const ok = await upsertLeadById(companyId, id);
      if (ok) broadcast({ type: "refresh", companyId });
      console.log(`[bitrix-webhook] ${event} lead=${id} ok=${ok}`);
      return;
    }

    console.log(`[bitrix-webhook] ignored event ${event}`);
  } catch (e) {
    console.error("[bitrix-webhook]", (e as Error).message);
  }
};
