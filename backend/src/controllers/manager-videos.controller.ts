// Wave 4 — Manager Celebration Videos controller.
// Routes (see ../routes/manager-videos.ts):
//   POST   /api/managers/:id/photo              — multipart photo upload
//   POST   /api/managers/:id/generate-videos    — submit 5 VEO 3 operations
//   GET    /api/managers/:id/videos             — list this manager's videos
//   GET    /api/manager-videos/:videoId         — detail
//   POST   /api/manager-videos/:videoId/music   — multipart music upload
//   PUT    /api/manager-videos/:videoId/music   — set trim start/end/volume
//   POST   /api/manager-videos/:videoId/render  — ffmpeg mix → finalVideoUrl
//   DELETE /api/manager-videos/:videoId
//
// Permissions:
//   - Company (admin) login — to'liq huquq.
//   - Manager login — faqat o'z id'si bilan ishlay oladi
//     (req.managerId === :id yoki video.managerId === req.managerId).
//   - Aks holda requirePermission("managers","edit") kerak.

import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import {
  uploadManagerPhoto,
  startVideoGeneration,
  uploadVideoMusic,
  updateMusicTrim,
  mixVideoWithMusic,
  pollVideoOperations,
} from "../services/manager-videos";

function isOwnManager(req: Request, managerId: string): boolean {
  return req.userRole === "manager" && req.managerId === managerId;
}

async function canEditManager(req: Request, managerId: string): Promise<boolean> {
  if (req.userRole === "company") {
    // company login — managerId kompaniyaga tegishli bo'lsa OK
    const m = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { companyId: true },
    });
    return !!m && m.companyId === req.companyId;
  }
  return isOwnManager(req, managerId);
}

async function canAccessVideo(
  req: Request,
  videoId: string,
): Promise<{ ok: boolean; managerId?: string }> {
  const v = await prisma.managerVideo.findUnique({
    where: { id: videoId },
    select: { managerId: true, manager: { select: { companyId: true } } },
  });
  if (!v) return { ok: false };
  if (req.userRole === "company" && v.manager.companyId === req.companyId) {
    return { ok: true, managerId: v.managerId };
  }
  if (isOwnManager(req, v.managerId)) return { ok: true, managerId: v.managerId };
  return { ok: false };
}

// ─── Photo ───────────────────────────────────────────────────────────────

export async function postManagerPhoto(req: Request, res: Response): Promise<void> {
  const managerId = req.params.id;
  if (!(await canEditManager(req, managerId))) {
    error(res, "Ruxsat yo'q", 403);
    return;
  }
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !file.buffer) {
    error(res, "Rasm fayli yuklanmagan (field: photo)", 400);
    return;
  }
  if (!file.mimetype?.startsWith("image/")) {
    error(res, "Faqat rasm fayl qabul qilinadi", 400);
    return;
  }
  const url = await uploadManagerPhoto(managerId, file.buffer, file.mimetype);
  success(res, { customPhotoUrl: url });
}

// ─── Generate 5 videos ───────────────────────────────────────────────────

export async function postGenerateVideos(req: Request, res: Response): Promise<void> {
  const managerId = req.params.id;
  if (!(await canEditManager(req, managerId))) {
    error(res, "Ruxsat yo'q", 403);
    return;
  }
  try {
    const extraPrompt = typeof req.body?.extraPrompt === "string" ? req.body.extraPrompt : undefined;
    const videos = await startVideoGeneration(managerId, extraPrompt);
    success(res, {
      submitted: videos.length,
      videos: videos.map((v) => ({
        id: v.id,
        scenarioId: v.scenarioId,
        scenarioName: v.scenarioName,
        status: v.status,
        operationId: v.operationId,
        errorMessage: v.errorMessage,
      })),
    });
  } catch (e: any) {
    error(res, e?.message || "Generatsiya boshlanmadi", 500);
  }
}

// ─── List videos for a manager ───────────────────────────────────────────

export async function listManagerVideos(req: Request, res: Response): Promise<void> {
  const managerId = req.params.id;
  if (!(await canEditManager(req, managerId))) {
    error(res, "Ruxsat yo'q", 403);
    return;
  }
  const videos = await prisma.managerVideo.findMany({
    where: { managerId },
    orderBy: { scenarioId: "asc" },
  });
  success(res, videos);
}

// ─── Video detail ────────────────────────────────────────────────────────

export async function getVideoDetail(req: Request, res: Response): Promise<void> {
  const { videoId } = req.params;
  const access = await canAccessVideo(req, videoId);
  if (!access.ok) {
    error(res, "Topilmadi yoki ruxsat yo'q", 404);
    return;
  }
  const video = await prisma.managerVideo.findUnique({ where: { id: videoId } });
  success(res, video);
}

// ─── Music upload ────────────────────────────────────────────────────────

export async function postVideoMusic(req: Request, res: Response): Promise<void> {
  const { videoId } = req.params;
  const track = req.query.track === "2" ? 2 : 1;
  const access = await canAccessVideo(req, videoId);
  if (!access.ok) {
    error(res, "Topilmadi yoki ruxsat yo'q", 404);
    return;
  }
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file || !file.buffer) {
    error(res, "Musiqa fayli yuklanmagan (field: music)", 400);
    return;
  }
  if (!file.mimetype?.startsWith("audio/") && !file.mimetype?.startsWith("video/")) {
    error(res, "Faqat audio fayl qabul qilinadi", 400);
    return;
  }
  const updated = await uploadVideoMusic(
    videoId,
    file.buffer,
    file.mimetype,
    file.originalname,
    track as 1 | 2,
  );
  success(res, updated);
}

// ─── Music trim update ───────────────────────────────────────────────────

export async function putVideoMusic(req: Request, res: Response): Promise<void> {
  const { videoId } = req.params;
  const track = req.query.track === "2" ? 2 : 1;
  const access = await canAccessVideo(req, videoId);
  if (!access.ok) {
    error(res, "Topilmadi yoki ruxsat yo'q", 404);
    return;
  }
  const { musicStartSec, musicEndSec, volume } = req.body as {
    musicStartSec?: number;
    musicEndSec?: number;
    volume?: number;
  };
  const updated = await updateMusicTrim(videoId, {
    startSec: musicStartSec,
    endSec: musicEndSec,
    volume,
    track: track as 1 | 2,
  });
  success(res, updated);
}

// ─── Render (mix) ────────────────────────────────────────────────────────

export async function postVideoRender(req: Request, res: Response): Promise<void> {
  const { videoId } = req.params;
  const access = await canAccessVideo(req, videoId);
  if (!access.ok) {
    error(res, "Topilmadi yoki ruxsat yo'q", 404);
    return;
  }
  try {
    const finalUrl = await mixVideoWithMusic(videoId);
    success(res, { finalVideoUrl: finalUrl });
  } catch (e: any) {
    error(res, e?.message || "Render muvaffaqiyatsiz", 500);
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────

export async function deleteVideo(req: Request, res: Response): Promise<void> {
  const { videoId } = req.params;
  const access = await canAccessVideo(req, videoId);
  if (!access.ok) {
    error(res, "Topilmadi yoki ruxsat yo'q", 404);
    return;
  }
  await prisma.managerVideo.delete({ where: { id: videoId } });
  success(res, { ok: true });
}

// ─── Manual poll trigger (admin) ─────────────────────────────────────────

export async function postPollNow(req: Request, res: Response): Promise<void> {
  if (req.userRole !== "company") {
    error(res, "Faqat admin", 403);
    return;
  }
  const result = await pollVideoOperations();
  success(res, result);
}
