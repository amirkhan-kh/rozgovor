// Productlar — kompaniya mahsulotlari (Pro ROP, Seminar, Konsultatsiya va h.k.).
// Har biri alohida knowledgeBase + documents bilan; audio AI tahlilida kontekst
// sifatida inject qilinadi.
import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";

export const listProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const products = await prisma.product.findMany({
      where: { companyId: req.companyId },
      select: {
        id: true,
        name: true,
        bitrixEnumId: true,
        description: true,
        knowledgeBase: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            documents: true,
            leads: true,
            salesLeads: true,
            audioFiles: true,
          },
        },
      },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    success(res, products);
  } catch (err) {
    console.error("listProducts:", err);
    error(res, "Mahsulotlar ro'yxatini olishda xatolik");
  }
};

export const getProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findFirst({
      where: { id, companyId: req.companyId },
      include: {
        documents: {
          select: {
            id: true,
            filename: true,
            fileType: true,
            size: true,
            summary: true,
            createdAt: true,
            reportStatus: true,
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { leads: true, salesLeads: true, audioFiles: true },
        },
      },
    });
    if (!product) {
      error(res, "Mahsulot topilmadi", 404);
      return;
    }
    success(res, product);
  } catch (err) {
    console.error("getProduct:", err);
    error(res, "Mahsulotni olishda xatolik");
  }
};

/**
 * GET /api/products/with-stats?period=today|week|month|all
 * Har product uchun Sotuv + Audit aggregat statistika + mini chart data.
 * ProductsPage Vision-style kartochkalar uchun.
 */
export const listProductsWithStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const period = (req.query.period as string) || "month";

    // Tashkent UTC+5
    const toTashkent = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, -5, 0, 0));
    const now = new Date();
    let dateGte: Date | undefined;
    if (period === "today") {
      dateGte = toTashkent(now.getFullYear(), now.getMonth() + 1, now.getDate());
    } else if (period === "week") {
      const d = new Date(now);
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      dateGte = toTashkent(d.getFullYear(), d.getMonth() + 1, d.getDate());
    } else if (period === "month") {
      dateGte = toTashkent(now.getFullYear(), now.getMonth() + 1, 1);
    }

    const products = await prisma.product.findMany({
      where: { companyId, isActive: true },
      select: { id: true, name: true, bitrixEnumId: true },
      orderBy: { name: "asc" },
    });

    // Bir vaqtning o'zida hammasini olamiz
    const result = await Promise.all(products.map(async (p) => {
      const leadsWhere: Record<string, unknown> = { companyId, productId: p.id };
      if (dateGte) leadsWhere.leadCreatedAt = { gte: dateGte };

      const [leadCount, salesLeads, audioStats] = await Promise.all([
        prisma.lead.count({ where: { companyId, productId: p.id, ...(dateGte ? { dateCreate: { gte: dateGte } } : {}) } }),
        prisma.salesLead.findMany({
          where: leadsWhere,
          select: { isSale: true, price: true, closedAt: true, leadCreatedAt: true },
        }),
        prisma.audioFile.findMany({
          where: { companyId, productId: p.id, status: "done", ...(dateGte ? { callDate: { gte: dateGte } } : {}) },
          select: {
            duration: true,
            category: true,
            analysis: { select: { overallScore: true, criteria: true } },
          },
        }),
      ]);

      // Sotuv KPIlar
      const won = salesLeads.filter((s) => s.isSale && s.closedAt);
      const sotuv = won.length;
      const summa = won.reduce((sum, s) => sum + (s.price || 0), 0);
      const totalLeads = leadCount + salesLeads.length;
      const konv = totalLeads > 0 ? (sotuv / totalLeads) * 100 : 0;

      // Mini kunlik trend — 14 kun
      const trendBuckets: Record<string, number> = {};
      for (const s of won) {
        const d = s.closedAt!;
        const key = d.toISOString().slice(0, 10);
        trendBuckets[key] = (trendBuckets[key] || 0) + 1;
      }
      const dailyTrend = Object.entries(trendBuckets)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([date, count]) => ({ date, count }));

      // Audit
      const totalDuration = audioStats.reduce((sum, a) => sum + (a.duration || 0), 0);
      const avgDuration = audioStats.length > 0 ? Math.round(totalDuration / audioStats.length) : 0;
      const scores = audioStats.map((a) => a.analysis?.overallScore || 0).filter((s) => s > 0);
      const score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

      // Mezonlar (radar)
      const criteriaSum: Record<string, number[]> = {};
      for (const a of audioStats) {
        const c = a.analysis?.criteria as Record<string, { score?: unknown }> | null;
        if (!c) continue;
        for (const [k, v] of Object.entries(c)) {
          if (v && typeof v === "object" && typeof (v as { score?: unknown }).score === "number") {
            if (!criteriaSum[k]) criteriaSum[k] = [];
            criteriaSum[k].push((v as { score: number }).score);
          }
        }
      }
      const criteria: Record<string, number> = {};
      for (const [k, arr] of Object.entries(criteriaSum)) {
        criteria[k] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
      }

      return {
        id: p.id,
        name: p.name,
        sales: {
          lid: totalLeads,
          konv: Number(konv.toFixed(1)),
          sotuv,
          summa,
          dailyTrend,
        },
        audit: {
          score,
          totalDuration,
          avgDuration,
          audioCount: audioStats.length,
          deals: `${sotuv}/${audioStats.length}`,
          criteria,
        },
      };
    }));

    success(res, result);
  } catch (err) {
    console.error("listProductsWithStats:", err);
    error(res, "Mahsulot statistikasini olishda xatolik");
  }
};

export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, knowledgeBase, isActive } = req.body || {};
    const existing = await prisma.product.findFirst({
      where: { id, companyId: req.companyId },
      select: { id: true },
    });
    if (!existing) {
      error(res, "Mahsulot topilmadi", 404);
      return;
    }
    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(typeof name === "string" && name.trim() ? { name: name.trim() } : {}),
        ...(typeof description === "string" ? { description } : {}),
        ...(typeof knowledgeBase === "string" ? { knowledgeBase } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
      },
    });
    success(res, updated);
  } catch (err: any) {
    if (err?.code === "P2002") {
      error(res, "Shu nomli mahsulot allaqachon mavjud", 409);
      return;
    }
    console.error("updateProduct:", err);
    error(res, "Mahsulotni yangilashda xatolik");
  }
};
