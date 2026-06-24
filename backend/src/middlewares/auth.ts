import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../utils/prisma";

declare global {
  namespace Express {
    interface Request {
      companyId?: string;
      managerId?: string;
      userRole?: "company" | "manager";
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string | undefined;

    let token: string | undefined;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (queryToken) {
      token = queryToken;
    }

    if (!token) {
      res.status(401).json({ success: false, error: "Token topilmadi" });
      return;
    }
    const decoded = verifyToken(token);

    if (decoded.role === "manager") {
      const manager = await prisma.manager.findUnique({
        where: { id: decoded.id },
        include: { company: true },
      });

      if (!manager) {
        res.status(401).json({ success: false, error: "Manager topilmadi" });
        return;
      }

      if (!manager.isActive) {
        res.status(403).json({ success: false, error: "Manager faol emas" });
        return;
      }

      req.companyId = manager.companyId;
      req.managerId = manager.id;
      req.userRole = "manager";
    } else {
      const company = await prisma.company.findUnique({
        where: { id: decoded.id },
      });

      if (!company) {
        res.status(401).json({ success: false, error: "Kompaniya topilmadi" });
        return;
      }

      req.companyId = company.id;
      req.userRole = "company";
    }

    next();
  } catch (err) {
    res.status(401).json({ success: false, error: "Yaroqsiz token" });
  }
};
