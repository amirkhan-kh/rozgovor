/**
 * requirePermission — route-level ruxsat tekshiruvi.
 *
 * Misol:
 *   router.get("/sales", authMiddleware, requirePermission("sales"), handler);
 *   router.post("/audio", authMiddleware, requirePermission("audio", "upload_audio"), handler);
 *
 * Company login (userRole === "company") har doim o'tadi.
 * Manager login — Permission service orqali tekshiriladi.
 */

import { Request, Response, NextFunction } from "express";
import { hasPermission } from "../services/permissions";

export function requirePermission(pageKey: string, actionKey?: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Company login — to'liq ruxsat
      if (req.userRole === "company") {
        next();
        return;
      }

      if (!req.managerId) {
        res.status(401).json({ success: false, error: "Avtorizatsiya kerak" });
        return;
      }

      const ok = await hasPermission(req.managerId, pageKey, actionKey);
      if (!ok) {
        res.status(403).json({
          success: false,
          error: "Bu amalga sizda ruxsat yo'q",
          code: "PERMISSION_DENIED",
          pageKey,
          actionKey: actionKey || "view",
        });
        return;
      }
      next();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[requirePermission]", msg);
      res.status(500).json({ success: false, error: "Ruxsat tekshirishda xatolik" });
    }
  };
}
