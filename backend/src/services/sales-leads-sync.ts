// SalesLead jadvalini AmoCRM'dan sinxronlash.
// Oxirgi 3 oy davomida yaratilgan yoki yopilgan lidlarni upsert qiladi.

import axios from "axios";
import { prisma } from "../utils/prisma";

const ALLOWED_PIPELINES = [9714418, 10084494, 10552282, 10648034, 10801830];

async function fetchLeadsFiltered(
  domain: string,
  token: string,
  pipelineId: number,
  filterField: "created_at" | "closed_at",
  fromTs: number,
  toTs: number
): Promise<any[]> {
  let leads: any[] = [];
  let page = 1;
  while (true) {
    const url = `https://${domain}/api/v4/leads?filter[pipeline_id]=${pipelineId}&filter[${filterField}][from]=${fromTs}&filter[${filterField}][to]=${toTs}&limit=250&page=${page}`;
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: (s) => s < 500,
    });
    if (resp.status === 204 || !resp.data?._embedded?.leads?.length) break;
    leads = leads.concat(resp.data._embedded.leads);
    if (!resp.data._links?.next) break;
    page += 1;
    if (page > 100) break;
  }
  return leads;
}

async function getPipelineStatusMaps(domain: string, token: string) {
  const resp = await axios.get(`https://${domain}/api/v4/leads/pipelines`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pipelineMap = new Map<number, string>();
  const statusMap = new Map<string, string>();
  for (const pipe of (resp.data as any)._embedded.pipelines) {
    pipelineMap.set(pipe.id, pipe.name);
    for (const st of pipe._embedded.statuses || []) {
      statusMap.set(`${pipe.id}_${st.id}`, st.name);
      statusMap.set(`${st.id}`, st.name);
    }
  }
  return { pipelineMap, statusMap };
}

async function getManagerMap(companyId: string): Promise<Map<string, string>> {
  const managers = await prisma.manager.findMany({
    where: { companyId },
    select: { id: true },
  });
  const map = new Map<string, string>();
  for (const m of managers) {
    const amoUserId = m.id.replace("amo_", "");
    map.set(amoUserId, m.id);
  }
  return map;
}

export async function syncSalesLeadsForCompany(
  companyId: string,
  monthsBack = 3
): Promise<{ upserted: number; total: number }> {
  const cred = await prisma.amoCredential.findUnique({ where: { companyId } });
  if (!cred) return { upserted: 0, total: 0 };

  const now = new Date();
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - monthsBack,
      now.getUTCDate(),
      -5,
      0,
      0
    )
  );
  const fromTs = Math.floor(start.getTime() / 1000);
  const toTs = Math.floor(Date.now() / 1000);

  const { pipelineMap, statusMap } = await getPipelineStatusMaps(
    cred.domain,
    cred.accessToken
  );
  const mgrMap = await getManagerMap(companyId);

  const all = new Map<number, any>();
  for (const pid of ALLOWED_PIPELINES) {
    const created = await fetchLeadsFiltered(
      cred.domain,
      cred.accessToken,
      pid,
      "created_at",
      fromTs,
      toTs
    );
    const closed = await fetchLeadsFiltered(
      cred.domain,
      cred.accessToken,
      pid,
      "closed_at",
      fromTs,
      toTs
    );
    for (const l of [...created, ...closed]) all.set(l.id, l);
  }

  let upserted = 0;
  for (const [leadId, l] of all) {
    const statusName =
      statusMap.get(`${l.pipeline_id}_${l.status_id}`) ||
      statusMap.get(`${l.status_id}`) ||
      null;
    const isSale = l.status_id === 142;
    const amoUserId = l.responsible_user_id ? String(l.responsible_user_id) : null;
    const responsibleManagerId = amoUserId ? mgrMap.get(amoUserId) || null : null;

    await prisma.salesLead.upsert({
      where: { companyId_leadId: { companyId, leadId } },
      create: {
        companyId,
        leadId,
        pipelineId: l.pipeline_id || null,
        pipelineName: pipelineMap.get(l.pipeline_id) || null,
        statusId: l.status_id || null,
        statusName,
        price: l.price || 0,
        responsibleManagerId,
        amocrmUserId: amoUserId,
        leadCreatedAt: new Date(l.created_at * 1000),
        closedAt: l.closed_at ? new Date(l.closed_at * 1000) : null,
        isSale,
      },
      update: {
        pipelineId: l.pipeline_id || null,
        pipelineName: pipelineMap.get(l.pipeline_id) || null,
        statusId: l.status_id || null,
        statusName,
        price: l.price || 0,
        responsibleManagerId,
        amocrmUserId: amoUserId,
        leadCreatedAt: new Date(l.created_at * 1000),
        closedAt: l.closed_at ? new Date(l.closed_at * 1000) : null,
        isSale,
      },
    });
    upserted += 1;
  }

  // 3 oydan eski SalesLead'larni o'chirib tashlash (scope tashqari)
  await prisma.salesLead.deleteMany({
    where: {
      companyId,
      leadCreatedAt: { lt: start },
      closedAt: null,
    },
  });

  return { upserted, total: all.size };
}

export async function syncAllCompaniesSalesLeads(): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { isActive: true, amocrm: { isNot: null } },
    select: { id: true, name: true },
  });
  for (const c of companies) {
    try {
      const res = await syncSalesLeadsForCompany(c.id, 3);
      console.log(`[SalesLeadsSync] ${c.name}: ${res.upserted} upserted`);
    } catch (err) {
      console.error(`[SalesLeadsSync] ${c.name}:`, err);
    }
  }
}
