import { Request, Response, NextFunction } from "express";
import { prisma } from "../utils/prisma";

export const dailyLimitMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
    });

    if (!company) {
      res.status(404).json({ success: false, error: "Kompaniya topilmadi" });
      return;
    }

    // Count total usage across all time (transcription + analysis both count toward limit)
    const allAudioFiles = await prisma.audioFile.findMany({
      where: { companyId: req.companyId },
      select: { duration: true },
    });

    const usedSeconds = allAudioFiles.reduce(
      (sum, f) => sum + (f.duration || 0),
      0
    );
    const usedHours = usedSeconds / 3600;
    const limitHours = company.totalLimitHours;

    if (usedHours >= limitHours) {
      res.status(429).json({
        success: false,
        error: "Umumiy limit tugadi",
        usedHours: Math.round(usedHours * 100) / 100,
        limitHours,
      });
      return;
    }

    next();
  } catch (err) {
    console.error("Daily limit check error:", err);
    next();
  }
};
