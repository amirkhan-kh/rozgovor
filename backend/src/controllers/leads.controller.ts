/**
 * Lead-level endpoints:
 *   GET /api/leads/:leadId/journey  — full journey timeline + AI summary
 *   GET /api/leads/search?phone=... — find leads by phone
 */

import { Request, Response } from "express";
import { success, error } from "../utils/response";
import { prisma } from "../utils/prisma";
import { getLeadJourney } from "../services/lead-journey";

export const getJourney = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const leadId = parseInt(req.params.leadId);
  if (isNaN(leadId)) {
    error(res, "leadId noto'g'ri", 400);
    return;
  }

  const journey = await getLeadJourney(companyId, leadId);
  if (!journey) {
    error(res, "Lead topilmadi yoki qo'ng'iroqlar yo'q", 404);
    return;
  }

  success(res, journey);
};

export const searchLeads = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const phone = (req.query.phone as string || "").trim();
  const query = (req.query.q as string || "").trim();

  if (!phone && !query) {
    error(res, "phone yoki q parametri kerak", 400);
    return;
  }

  const leads = await prisma.audioFile.findMany({
    where: {
      companyId,
      leadId: { not: null },
      ...(phone ? { phoneNumber: { contains: phone } } : {}),
    },
    select: {
      leadId: true,
      phoneNumber: true,
      statusName: true,
      pipelineName: true,
      manager: { select: { name: true } },
      callDate: true,
      isSale: true,
    },
    orderBy: { callDate: "desc" },
    take: 50,
    distinct: ["leadId"],
  });

  success(res, {
    count: leads.length,
    leads: leads.map((l) => ({
      leadId: l.leadId,
      phoneNumber: l.phoneNumber,
      statusName: l.statusName,
      pipelineName: l.pipelineName,
      managerName: l.manager?.name || null,
      lastCallAt: l.callDate?.toISOString() || null,
      isSale: l.isSale,
    })),
  });
};
