import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../utils/prisma";

declare global {
  namespace Express {
    interface Request {
      adminId?: string;
    }
  }
}

export const adminAuthMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: "Token topilmadi" });
      return;
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    if (decoded.role !== "admin") {
      res.status(403).json({ success: false, error: "Admin huquqi kerak" });
      return;
    }

    const admin = await prisma.superAdmin.findUnique({ where: { id: decoded.id } });
    if (!admin) {
      res.status(401).json({ success: false, error: "Admin topilmadi" });
      return;
    }

    req.adminId = admin.id;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Yaroqsiz token" });
  }
};
