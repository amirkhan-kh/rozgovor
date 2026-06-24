/**
 * Knowledge base endpoints:
 *   GET  /api/knowledge/objections            — current objection library
 *   POST /api/knowledge/objections/refresh    — force refresh (admin)
 *   GET  /api/knowledge/trackers              — smart trackers list
 *   POST /api/knowledge/trackers              — create tracker
 *   DELETE /api/knowledge/trackers/:id        — delete tracker
 */

import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { refreshObjectionLibrary } from "../services/objection-library";

export const getObjectionLibrary = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { objectionLibrary: true, objectionLibraryUpdatedAt: true },
  });

  success(res, {
    library: company?.objectionLibrary || null,
    updatedAt: company?.objectionLibraryUpdatedAt?.toISOString() || null,
  });
};

export const refreshObjectionLibraryHandler = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  // Async — start in background, reply immediately
  refreshObjectionLibrary(companyId).catch((err) =>
    console.error("[ObjectionLib] manual refresh error:", err)
  );

  success(res, { message: "Library fon rejimida yangilanmoqda, 1-2 daqiqada tugaydi" });
};

// ─── Smart Trackers (B3-5) ───────────────────────────────────────────────

interface SmartTracker {
  id: string;
  name: string;
  description: string;           // natural language: "mijoz narx haqida shubha bildirganda"
  createdAt: string;
  hitCount?: number;             // qancha marta topilgan
}

export const getTrackers = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { smartTrackers: true },
  });

  const trackers = (company?.smartTrackers as SmartTracker[] | null) || [];
  success(res, { trackers });
};

export const createTracker = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const { name, description } = req.body as { name?: string; description?: string };
  if (!name || !description) {
    error(res, "name va description shart", 400);
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { smartTrackers: true },
  });

  const existing = (company?.smartTrackers as SmartTracker[] | null) || [];
  const newTracker: SmartTracker = {
    id: `tr_${Date.now()}`,
    name: name.slice(0, 80),
    description: description.slice(0, 500),
    createdAt: new Date().toISOString(),
    hitCount: 0,
  };
  existing.push(newTracker);

  await prisma.company.update({
    where: { id: companyId },
    data: { smartTrackers: existing as any },
  });

  success(res, newTracker, 201);
};

export const deleteTracker = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const { id } = req.params;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { smartTrackers: true },
  });

  const existing = (company?.smartTrackers as SmartTracker[] | null) || [];
  const filtered = existing.filter((t) => t.id !== id);

  await prisma.company.update({
    where: { id: companyId },
    data: { smartTrackers: filtered as any },
  });

  success(res, { deleted: existing.length - filtered.length });
};
