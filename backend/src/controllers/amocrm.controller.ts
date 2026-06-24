import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { getAuthUrl, exchangeCode, makeRequest } from "../services/amocrm";
import { syncCalls } from "../services/amocrm-sync";

export const getStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const cred = await prisma.amoCredential.findUnique({
      where: { companyId: req.companyId },
      select: { domain: true, expiresAt: true },
    });

    success(res, {
      connected: !!cred,
      domain: cred?.domain || null,
      expiresAt: cred?.expiresAt || null,
    });
  } catch (err) {
    console.error("AmoCRM status error:", err);
    error(res, "AmoCRM holat olishda xatolik");
  }
};

export const auth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { domain } = req.query;

    if (!domain) {
      error(res, "Domain kiritilishi shart", 400);
      return;
    }

    const url = await getAuthUrl(req.companyId!, domain as string);
    success(res, { url });
  } catch (err) {
    console.error("AmoCRM auth error:", err);
    error(res, "AmoCRM auth URL olishda xatolik");
  }
};

export const callback = async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state: companyId, referer } = req.query;

    if (!code || !companyId) {
      error(res, "Code yoki companyId topilmadi", 400);
      return;
    }

    // Domain ni referer dan olish
    const domain = referer
      ? (referer as string).replace("https://", "").replace(".amocrm.ru", "").split("/")[0]
      : "";

    await exchangeCode(code as string, companyId as string, domain);

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/profile?amocrm=success`);
  } catch (err) {
    console.error("AmoCRM callback error:", err);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${frontendUrl}/profile?amocrm=error`);
  }
};

// In-memory sync progress tracking per company
interface SyncProgress {
  running: boolean;
  page: number;
  synced: number;
  total: number;
  errors: number;
}
export const syncProgress = new Map<string, SyncProgress>();

export const sync = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const { dateFrom, dateTo } = req.body;

    const current = syncProgress.get(companyId);
    if (current?.running) {
      error(res, "Sync allaqachon ishlayapti", 409);
      return;
    }

    const effectiveDateFrom = dateFrom || new Date().toISOString().split("T")[0];

    syncProgress.set(companyId, { running: true, page: 0, synced: 0, total: 0, errors: 0 });

    // Background da sync qilish — response darhol qaytadi
    syncCalls(companyId, effectiveDateFrom, dateTo)
      .then((result) => {
        syncProgress.set(companyId, {
          running: false,
          page: 0,
          synced: result.synced,
          total: result.total,
          errors: result.errors,
        });
      })
      .catch((err) => {
        console.error("Sync error:", err);
        syncProgress.set(companyId, { running: false, page: 0, synced: 0, total: 0, errors: 1 });
      });

    success(res, { message: "Sinhronlash boshlandi" });
  } catch (err) {
    console.error("AmoCRM sync error:", err);
    error(res, "Sync qilishda xatolik");
  }
};

export const getSyncStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.companyId!;
    const progress = syncProgress.get(companyId) || { running: false, page: 0, synced: 0, total: 0, errors: 0 };
    success(res, progress);
  } catch (err) {
    console.error("AmoCRM sync-status error:", err);
    error(res, "Sync holat olishda xatolik");
  }
};

export const getPipelines = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await makeRequest(req.companyId!, "get", "/leads/pipelines") as any;
    const pipelines = (result?._embedded?.pipelines || []).map((p: any) => ({
      id: p.id,
      name: p.name,
    }));
    success(res, { pipelines });
  } catch (err) {
    console.error("Get pipelines error:", err);
    error(res, "Voronkalar olishda xatolik");
  }
};

export const disconnect = async (req: Request, res: Response): Promise<void> => {
  try {
    await prisma.amoCredential.deleteMany({
      where: { companyId: req.companyId },
    });
    success(res, { message: "AmoCRM uzildi" });
  } catch (err) {
    console.error("AmoCRM disconnect error:", err);
    error(res, "AmoCRM uzishda xatolik");
  }
};
