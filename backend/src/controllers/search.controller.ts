import { Request, Response } from "express";
import { success, error } from "../utils/response";
import { searchConversations } from "../services/conversation-search";

// Tashkent TZ (UTC+5) — dateFrom/dateTo oraliq local kun bo'yicha
const TZ = 5;
const tashkentStartOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, -TZ, 0, 0));
const tashkentEndOfDay = (y: number, m: number, d: number): Date =>
  new Date(Date.UTC(y, m - 1, d, 23 - TZ, 59, 59, 999));

const parseLocalDate = (
  raw: string | undefined,
  endOfDay: boolean
): Date | undefined => {
  if (!raw) return undefined;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return endOfDay ? tashkentEndOfDay(y, m, d) : tashkentStartOfDay(y, m, d);
};

export const searchHandler = async (req: Request, res: Response) => {
  const companyId = req.companyId;
  if (!companyId) {
    error(res, "Kompaniya aniqlanmadi", 401);
    return;
  }

  const question = (
    (req.body?.question as string) ||
    (req.query.q as string) ||
    ""
  ).trim();
  if (!question || question.length < 3) {
    error(res, "Savol kiriting (kamida 3 harf)", 400);
    return;
  }

  const dateFromStr =
    (req.query.dateFrom as string) ||
    (req.body?.dateFrom as string) ||
    undefined;
  const dateToStr =
    (req.query.dateTo as string) || (req.body?.dateTo as string) || undefined;
  const daysWindow = Math.max(
    1,
    Math.min(365, parseInt((req.query.days as string) || "") || 0)
  );
  const limit = Math.max(
    5,
    Math.min(50, parseInt((req.query.limit as string) || "") || 20)
  );

  const dateFrom = parseLocalDate(dateFromStr, false);
  const dateTo = parseLocalDate(dateToStr, true);

  const result = await searchConversations(companyId, question, {
    dateFrom,
    dateTo,
    daysWindow: daysWindow > 0 ? daysWindow : 30,
    limit,
  });
  success(res, result);
};
