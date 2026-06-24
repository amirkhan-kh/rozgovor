/**
 * Client Profiler Service
 *
 * Analysis.clientProfile (AI aniqlagan mijoz ma'lumotlari) ni Client jadvaliga
 * aggregate qiladi. Bir mijoz bir nechta qo'ng'iroq qiladi — har qo'ng'iroqdan
 * keyin Client profili kengaytiriladi:
 *   - age/gender/region/name — oxirgi non-null qiymat
 *   - interests/fears — unique union (dublikatsiz to'plam)
 *   - topQuestions/topObjections — running counter (JSON map)
 *   - decisionTimeDays — running average
 *   - pipelineId/pipelineName/sourceId — oxirgi CRM holati
 */

import { prisma } from "../utils/prisma";

interface AIClientProfile {
  age?: number | null;
  gender?: string | null;
  region?: string | null;
  interests?: string[] | null;
  fears?: string[] | null;
  mainQuestion?: string | null;
  mainObjection?: string | null;
  decisionTimeDays?: number | null;
  decisionSignals?: string | null;
}

interface CounterItem {
  value: string;
  count: number;
}

// Telefon raqamni standart formatga keltirish: faqat raqamlar, 998 prefiksi.
// "+998 90 123-45-67" → "998901234567"
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;
  // Agar 9 raqam bo'lsa (o'zbek local number), 998 qo'shamiz
  if (digits.length === 9) return `998${digits}`;
  // 12 raqam va 998 bilan bosh → to'liq
  if (digits.length === 12 && digits.startsWith("998")) return digits;
  // Boshqa holatlar — mavjud holida
  return digits;
}

// Json counter'ga bitta item qo'shish (count += 1, yo'q bo'lsa yaratish)
function addToCounter(
  existing: CounterItem[] | undefined | null,
  value: string | null | undefined
): CounterItem[] {
  const list: CounterItem[] = Array.isArray(existing) ? existing.slice() : [];
  if (!value) return list;
  const trimmed = String(value).trim().toLowerCase();
  if (!trimmed) return list;
  const found = list.find((x) => x.value.toLowerCase() === trimmed);
  if (found) found.count += 1;
  else list.push({ value: String(value).trim(), count: 1 });
  // Top 10 gacha saqlaymiz (keng bo'lib ketmasligi uchun)
  return list.sort((a, b) => b.count - a.count).slice(0, 10);
}

function unionArray(
  existing: string[] | undefined | null,
  incoming: string[] | undefined | null
): string[] {
  const set = new Set<string>((existing || []).map((s) => s.trim()));
  for (const item of incoming || []) {
    const t = String(item).trim();
    if (t) set.add(t);
  }
  return [...set].slice(0, 15); // Top 15 ta element saqlaymiz
}

// Running average (oldingi callsCount bilan yangi qiymat)
function runningAvg(
  oldAvg: number | null | undefined,
  oldCount: number,
  newValue: number | null | undefined
): number | null {
  if (newValue == null) return oldAvg ?? null;
  if (oldAvg == null || oldCount === 0) return newValue;
  return Math.round((oldAvg * oldCount + newValue) / (oldCount + 1));
}

/**
 * Berilgan AudioFile (tahlil qilingan) uchun Client jadvalini yangilaydi.
 */
export async function aggregateClientFromAnalysis(
  audioFileId: string
): Promise<void> {
  const audio = await prisma.audioFile.findUnique({
    where: { id: audioFileId },
    include: { analysis: true },
  });
  if (!audio) return;

  const phone = normalizePhone(audio.phoneNumber);
  if (!phone) return; // Telefonsiz yoza olmaymiz

  const profile = (audio.analysis?.clientProfile as AIClientProfile) || {};

  // Mavjud Client yoki yangi
  const existing = await prisma.client.findUnique({
    where: { companyId_phoneNumber: { companyId: audio.companyId, phoneNumber: phone } },
  });

  const callsAnalyzed = (existing?.callsAnalyzed || 0) + 1;

  // Aggregated fields
  const age = profile.age ?? existing?.age ?? null;
  const gender = profile.gender ?? existing?.gender ?? null;
  const region = profile.region ?? existing?.region ?? null;
  const name = existing?.name || null; // ism Bitrix'dan keladi, AI hozircha qaytarmaydi

  const interests = unionArray(existing?.interests, profile.interests);
  const fears = unionArray(existing?.fears, profile.fears);

  const existingQuestions =
    (existing?.topQuestions as unknown as CounterItem[] | null) || [];
  const existingObjections =
    (existing?.topObjections as unknown as CounterItem[] | null) || [];
  const topQuestions = addToCounter(existingQuestions, profile.mainQuestion);
  const topObjections = addToCounter(existingObjections, profile.mainObjection);

  const decisionTimeDays = runningAvg(
    existing?.decisionTimeDays,
    existing?.callsAnalyzed || 0,
    profile.decisionTimeDays
  );

  // Bitrix lead ID (agar audio'da leadId bo'lsa, bitrixLeadIds ga qo'shamiz)
  const existingLeadIds = existing?.bitrixLeadIds || [];
  const bitrixLeadIds = audio.leadId
    ? [...new Set([...existingLeadIds, audio.leadId])]
    : existingLeadIds;

  // Bitrix'dan so'ngi CRM holatini olish (Lead jadvali)
  let pipelineId: number | null = existing?.pipelineId ?? null;
  let pipelineName: string | null = existing?.pipelineName ?? null;
  let sourceId: string | null = existing?.sourceId ?? null;
  let sourceName: string | null = existing?.sourceName ?? null;

  if (audio.leadId) {
    try {
      const lead = await prisma.lead.findFirst({
        where: { companyId: audio.companyId, bitrixLeadId: audio.leadId },
        select: { sourceId: true, statusName: true, responsibleManagerId: true },
      });
      if (lead?.sourceId) sourceId = lead.sourceId;
    } catch {}

    // SalesLead dan pipelineId/Name (eng so'nggi deal)
    try {
      const deal = await prisma.salesLead.findFirst({
        where: { companyId: audio.companyId, originalLeadId: audio.leadId },
        orderBy: { leadCreatedAt: "desc" },
        select: { pipelineId: true, pipelineName: true },
      });
      if (deal?.pipelineId != null) {
        pipelineId = deal.pipelineId;
        pipelineName = deal.pipelineName || null;
      }
    } catch {}
  }

  // AudioFile.pipelineName ham mavjud — fallback
  if (!pipelineName && audio.pipelineName) pipelineName = audio.pipelineName;

  // Hech qaysi manbada pipeline topilmagan bo'lsa — "Yangi lid" (deal bo'lmagan lid)
  if (!pipelineName) {
    pipelineName = "Yangi lid";
    pipelineId = -1;
  }

  await prisma.client.upsert({
    where: {
      companyId_phoneNumber: {
        companyId: audio.companyId,
        phoneNumber: phone,
      },
    },
    create: {
      companyId: audio.companyId,
      phoneNumber: phone,
      name,
      age,
      gender,
      region,
      bitrixLeadIds,
      interests,
      fears,
      topQuestions: topQuestions as unknown as object,
      topObjections: topObjections as unknown as object,
      decisionTimeDays,
      pipelineId,
      pipelineName,
      sourceId,
      sourceName,
      lastCallAt: audio.callDate || audio.createdAt,
      callsAnalyzed,
    },
    update: {
      age,
      gender,
      region,
      bitrixLeadIds,
      interests,
      fears,
      topQuestions: topQuestions as unknown as object,
      topObjections: topObjections as unknown as object,
      decisionTimeDays,
      pipelineId,
      pipelineName,
      sourceId,
      sourceName,
      lastCallAt: audio.callDate || audio.createdAt,
      callsAnalyzed,
    },
  });
}
