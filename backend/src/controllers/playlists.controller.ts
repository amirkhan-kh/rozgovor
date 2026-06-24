import { Request, Response } from "express";
import { success, error } from "../utils/response";
import { getPlaylist, PLAYLIST_DEFINITIONS, PlaylistKey } from "../services/smart-playlists";

export const getDefinitions = async (_req: Request, res: Response) => {
  success(res, { playlists: PLAYLIST_DEFINITIONS });
};

export const getPlaylistItems = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const key = req.params.key as PlaylistKey;
  const valid = PLAYLIST_DEFINITIONS.some((p) => p.key === key);
  if (!valid) {
    error(res, "Noma'lum playlist", 400);
    return;
  }

  const managerId = (req.query.managerId as string) || undefined;
  const limit = parseInt(req.query.limit as string) || 30;

  const result = await getPlaylist(companyId, key, { managerId, limit });
  success(res, result);
};
