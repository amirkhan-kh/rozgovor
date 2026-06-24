import axios from "axios";
import { prisma } from "../utils/prisma";

// Per-company refresh mutex — parallel so'rovlar ham bitta refreshni kutadi.
// AmoCRM refresh_tokenni bir martalik qiladi: ikkita parallel refresh → butun zanjir revoke bo'ladi.
const refreshLocks = new Map<string, Promise<string>>();

// Expiry'dan 5 daqiqa oldin refresh qilamiz — tarmoq kechikishi/soat siljishi uchun buffer.
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export const getAuthUrl = async (companyId: string, domain: string): Promise<string> => {
  const cred = await prisma.amoCredential.findUnique({ where: { companyId } });
  if (!cred) throw new Error("AmoCRM credential topilmadi");
  return `https://${domain}/oauth?client_id=${cred.clientId}&redirect_uri=${cred.redirectUri}&state=${companyId}&mode=post_message`;
};

export const exchangeCode = async (
  code: string,
  companyId: string,
  domain: string
): Promise<void> => {
  try {
    const cred = await prisma.amoCredential.findUnique({ where: { companyId } });
    if (!cred) throw new Error("AmoCRM credential topilmadi");

    const { data } = await axios.post(`https://${domain}/oauth2/access_token`, {
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: cred.redirectUri,
    });

    const expiresAt = new Date(Date.now() + data.expires_in * 1000);

    await prisma.amoCredential.update({
      where: { companyId },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        domain,
        expiresAt,
      },
    });
  } catch (err) {
    console.error("AmoCRM exchange code error:", err);
    throw new Error("AmoCRM autentifikatsiyada xatolik");
  }
};

export const refreshToken = async (companyId: string): Promise<string> => {
  const existing = refreshLocks.get(companyId);
  if (existing) return existing;

  const task = (async (): Promise<string> => {
    try {
      const cred = await prisma.amoCredential.findUnique({ where: { companyId } });
      if (!cred) throw new Error("AmoCRM credential topilmadi");

      const { data } = await axios.post(`https://${cred.domain}/oauth2/access_token`, {
        client_id: cred.clientId,
        client_secret: cred.clientSecret,
        grant_type: "refresh_token",
        refresh_token: cred.refreshToken,
        redirect_uri: cred.redirectUri,
      });

      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      await prisma.amoCredential.update({
        where: { companyId },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt,
        },
      });

      console.log(`[AmoCRM] Token refreshed for ${companyId}, expires ${expiresAt.toISOString()}`);
      return data.access_token;
    } catch (err: any) {
      const amoError = err?.response?.data;
      console.error(
        `[AmoCRM] Refresh failed for ${companyId}:`,
        amoError || err?.message || err
      );
      throw new Error("AmoCRM token yangilashda xatolik");
    }
  })();

  refreshLocks.set(companyId, task);
  try {
    return await task;
  } finally {
    refreshLocks.delete(companyId);
  }
};

// Proactive refresh — agar expiresAt yaqin bo'lsa (buffer ichida yoki o'tgan), yangilaydi.
export const ensureFreshToken = async (companyId: string): Promise<string> => {
  const cred = await prisma.amoCredential.findUnique({ where: { companyId } });
  if (!cred) throw new Error("AmoCRM ulanmagan");

  if (Date.now() + EXPIRY_BUFFER_MS >= cred.expiresAt.getTime()) {
    return refreshToken(companyId);
  }
  return cred.accessToken;
};

export const makeRequest = async (
  companyId: string,
  method: "get" | "post" | "patch" | "delete",
  path: string,
  reqData?: unknown
): Promise<unknown> => {
  try {
    const cred = await prisma.amoCredential.findUnique({ where: { companyId } });
    if (!cred) throw new Error("AmoCRM ulanmagan");

    const accessToken = await ensureFreshToken(companyId);

    const response = await axios({
      method,
      url: `https://${cred.domain}/api/v4${path}`,
      data: reqData,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (err: any) {
    const amoError = err?.response?.data;
    console.error("AmoCRM request error:", amoError || err?.message || err);
    throw new Error("AmoCRM so'rovda xatolik");
  }
};

export const getLeads = async (
  companyId: string,
  filter?: Record<string, string>
): Promise<unknown> => {
  try {
    const params = filter ? `?${new URLSearchParams(filter).toString()}` : "";
    return await makeRequest(companyId, "get", `/leads${params}`);
  } catch (err) {
    console.error("AmoCRM get leads error:", err);
    throw new Error("Lidlarni olishda xatolik");
  }
};

export const getCalls = async (
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<unknown> => {
  try {
    return await makeRequest(
      companyId,
      "get",
      `/calls?filter[created_at][from]=${dateFrom}&filter[created_at][to]=${dateTo}`
    );
  } catch (err) {
    console.error("AmoCRM get calls error:", err);
    throw new Error("Qo'ng'iroqlarni olishda xatolik");
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Task auto-creation (B3-3)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateLeadTaskParams {
  leadId: number;
  text: string;                    // vazifa matni
  completeTillDays: number;        // qancha kundan keyin bajarilishi kerak
  responsibleUserId?: number;      // agar menejer uchun bo'lsa (AmoCRM user id)
  taskTypeId?: number;             // 1 = FOLLOW_UP, 2 = MEETING (default 1)
}

/**
 * AmoCRM'da leadga task yaratadi.
 * Odatda: har qo'ng'iroqdan keyin "next step" task, yoki overdue follow-up uchun.
 */
export const createLeadTask = async (
  companyId: string,
  params: CreateLeadTaskParams
): Promise<boolean> => {
  try {
    const completeTill = Math.floor(Date.now() / 1000) + params.completeTillDays * 86400;
    const body: Record<string, unknown> = {
      entity_id: params.leadId,
      entity_type: "leads",
      text: params.text.slice(0, 500),
      complete_till: completeTill,
      task_type_id: params.taskTypeId || 1,
    };
    if (params.responsibleUserId) body.responsible_user_id = params.responsibleUserId;

    await makeRequest(companyId, "post", "/tasks", [body]);
    return true;
  } catch (err) {
    console.error("[AmoCRM] createLeadTask error:", (err as Error).message);
    return false;
  }
};

/**
 * Lead ga custom field qiymatlarini yozish.
 * MEDDIC fieldlari uchun ishlatiladi (B3-4).
 */
export const updateLeadCustomFields = async (
  companyId: string,
  leadId: number,
  fields: Array<{ field_id: number; value: string | number }>
): Promise<boolean> => {
  try {
    const body = {
      custom_fields_values: fields.map((f) => ({
        field_id: f.field_id,
        values: [{ value: f.value }],
      })),
    };
    await makeRequest(companyId, "patch", `/leads/${leadId}`, body);
    return true;
  } catch (err) {
    console.error("[AmoCRM] updateLeadCustomFields error:", (err as Error).message);
    return false;
  }
};
