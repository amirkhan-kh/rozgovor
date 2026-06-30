import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────────────────────
// "Yo'qotilgan lidlar" 🚩 + manager haq/noxaq verdict (InterWork forkidan ko'chirilgan)
// "Lost" ta'rifi (Bitrix): SalesLead.closeReasonName belgilangan bo'lsa = yo'qotilgan.
// semanticId="F" ishlatilmaydi — bu portalda sabab NEW/P bosqich deal'larga qo'yiladi.
//
// ⚠️ Bu helperlar audio.controller (per-audio rejectionInfo) va audit.controller
// (lost-verdicts aggregate) tomonidan ulashiladi — duplicate qilmaslik uchun umumiy.
// ─────────────────────────────────────────────────────────────────────────────
export const REJECTION_REASON_META: Record<string, { label: string; keywords: string[] }> = {
  price: { label: "Narx", keywords: ["narx", "qimmat", "pul", "to'lov", "tolov", "chegirma", "byudjet", "budget", "price", "arzon", "dorogo", "дорого", "дорогой", "цена", "денег нет"] },
  timing: { label: "Vaqt", keywords: ["vaqt", "keyin", "hozir emas", "band", "ertaga", "hafta", "oy", "muddat", "timing", "позже", "потом", "не сейчас", "занят"] },
  competitor: { label: "Raqobatchi", keywords: ["boshqa", "raqobatchi", "competitor", "alternativ", "variant", "ko'rib", "korib", "другой", "конкурент", "посмотрим"] },
  authority: { label: "Qaror qiluvchi", keywords: ["rahbar", "boshliq", "direktor", "sherik", "ota", "ona", "turmush", "oila", "maslahat", "посоветуюсь", "муж", "жена", "родител"] },
  need: { label: "Ehtiyoj yo'q", keywords: ["kerak emas", "qiziq emas", "zarur emas", "ehtiyoj", "hojat", "xohlamayman", "hohlamayman", "ne nado", "ne interesno", "не надо", "не интересно", "не нужно"] },
  trust: { label: "Ishonch", keywords: ["ishon", "kafolat", "natija", "aldan", "shubha", "risk", "qo'rq", "qorq", "доверя", "гаранти", "обман", "сомнева"] },
  fit: { label: "Mos emas", keywords: ["mos emas", "to'g'ri kelmaydi", "togri kelmaydi", "boshqa soha", "format", "joy", "не подходит", "не то"] },
  other: { label: "Boshqa sabab", keywords: [] },
};

export const textOf = (value: any): string => {
  if (!value) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

export const rejectionAnalysisSelect = {
  overallScore: true,
  leadQuality: true,
  summary: true,
  objections: true,
  lossPoints: true,
  followupReason: true,
  followupPhrase: true,
  voiceOfCustomer: true,
  judgeReason: true,
  judgeSkipped: true,
};

// Verdict kontekstida CRM `closeReasonName` BO'LMASLIGI kerak — aks holda
// managerVerdictFor `textSupport` doim TRUE bo'lib qoladi (manager sababini o'z-o'zi
// bilan solishtiradi → har doim "Tasdiqlandi"). Faqat transkript/AI signallari.
export const verdictContextText = (analysis: any): string => {
  const objections = Array.isArray(analysis?.objections) ? analysis.objections : [];
  const lossPoints = Array.isArray(analysis?.lossPoints) ? analysis.lossPoints : [];
  const voice = analysis?.voiceOfCustomer || {};
  return [
    analysis?.summary,
    analysis?.followupReason,
    analysis?.followupPhrase,
    objections.length ? textOf(objections) : null,
    lossPoints.length ? textOf(lossPoints) : null,
    voice.mainPain ? textOf(voice.mainPain) : null,
    voice.expectations ? textOf(voice.expectations) : null,
    voice.buyingCriteria ? textOf(voice.buyingCriteria) : null,
    analysis?.judgeReason,
  ].filter(Boolean).join(" ").toLowerCase();
};

export const detectReasonType = (text: string): string => {
  for (const [key, meta] of Object.entries(REJECTION_REASON_META)) {
    if (key !== "other" && meta.keywords.some((kw) => text.includes(kw))) return key;
  }
  return "other";
};

export const managerVerdictFor = (managerReason: any, aiType: string, contextText: string) => {
  if (!managerReason) {
    return { status: "unknown", label: "Sabab yo'q", short: "CRMda manager yopish sababi topilmadi.", detail: "Manager qo'ygan yopish sababi bo'lmasa, haq/nohaq deb baholab bo'lmaydi." };
  }
  const managerText = String(managerReason).toLowerCase();
  const managerType = detectReasonType(managerText);
  const exactSupport = managerType !== "other" && managerType === aiType;
  const textSupport = managerText.split(/\s+/).filter((w) => w.length >= 4).some((w) => contextText.includes(w));
  if (exactSupport || textSupport) {
    return { status: "right", label: "Tasdiqlandi", short: "CRMdagi yopish sababi suhbat konteksti bilan mos.", detail: `CRM sababi: ${managerReason}\nSuhbatda shu sababni tasdiqlovchi dalillar bor.` };
  }
  if (aiType !== "other") {
    return { status: "wrong", label: "Mos emas", short: "CRMdagi sabab suhbatdagi asosiy sababga mos emas.", detail: `CRM sababi: ${managerReason}\nSuhbatdagi asosiy sabab: ${REJECTION_REASON_META[aiType]?.label || "Boshqa sabab"}.` };
  }
  return { status: "unclear", label: "Aniq emas", short: "Suhbat kontekstidan CRM sababini tasdiqlash qiyin.", detail: `CRM sababi: ${managerReason}\nSuhbat konteksti noaniq yoki boshqa sababga ishora qiladi.` };
};

export const compactText = (value: any): string => {
  return String(value || "").replace(/\s+/g, " ").trim();
};

// "Lost" = Bitrix CRM yopish sababi belgilangan (A usul, semanticId filtrisiz).
// InterWork AmoCRM "закрыто реализовано" mantig'i bu portalga mos emas — closeReasonName'ga tayanamiz.
export const hasLostLeadSignal = (analysis: any, audio: any = {}): boolean => {
  if (!analysis || audio?.isSale === true) return false;
  return !!audio?.closeReasonName;
};

export const getRejectionInfo = (analysis: any, audio: any = {}) => {
  if (!hasLostLeadSignal(analysis, audio)) return null;
  const objections = Array.isArray(analysis?.objections) ? analysis.objections : [];
  const lossPoints = Array.isArray(analysis?.lossPoints) ? analysis.lossPoints : [];
  // AI signal konteksti — CRM close reason BO'LMAGAN (circular bo'lmasligi uchun).
  const aiText = verdictContextText(analysis);
  let type = "other";
  for (const [key, meta] of Object.entries(REJECTION_REASON_META)) {
    if (key !== "other" && meta.keywords.some((kw) => aiText.includes(kw))) {
      type = key;
      break;
    }
  }
  const primaryObjection = objections[0]?.type || objections[0]?.description || objections[0]?.text || null;
  const primaryLoss = lossPoints[0]?.description || null;
  const managerReason = audio?.closeReasonName || null;
  const managerVerdict = managerVerdictFor(managerReason, type, aiText);
  const reasonLabel = managerVerdict?.status === "right" && managerReason
    ? managerReason
    : REJECTION_REASON_META[type]?.label || REJECTION_REASON_META.other.label;
  const short = managerVerdict?.status === "right" && managerReason
    ? `CRMdagi sabab tasdiqlandi: ${managerReason}.`
    : compactText(primaryLoss || analysis?.followupReason || analysis?.followupPhrase || analysis?.summary || "Yo'qotilgan lid sababi suhbat kontekstidan aniqlangan");
  const evidence = [
    managerVerdict?.short,
    analysis?.followupReason ? `Follow-up sababi: ${compactText(analysis.followupReason)}` : null,
    analysis?.followupPhrase ? `Mijoz iborasi: ${compactText(analysis.followupPhrase)}` : null,
    primaryLoss ? `Yo'qotish nuqtasi: ${compactText(primaryLoss)}` : null,
    primaryObjection ? `E'tiroz: ${compactText(primaryObjection)}` : null,
  ].filter(Boolean).slice(0, 4);
  const detail = [
    managerReason ? `CRM sababi: ${managerReason}` : null,
    `Xulosa: ${managerVerdict?.short || short}`,
    ...evidence.filter((line) => line !== managerVerdict?.short),
  ].filter(Boolean).join("\n");
  return {
    type,
    label: reasonLabel,
    short: String(short),
    detail,
    managerReason,
    managerVerdict,
    evidence,
  };
};

export const phoneKey = (phone: any): string | null => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : null;
};

export const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

// Query-time join: SalesLead.closeReasonName → AudioFile. Yangi DB ustun YO'Q.
// ⚠️ closedAtRange ishlatilmaydi (B1a) — bu portalda closedAt ishonchsiz.
export const attachLeadCloseReasons = async (companyId: string, audios: any[]): Promise<any[]> => {
  if (!audios?.length) return audios;
  const leadIds = [...new Set(audios.map((a) => a.leadId).filter((v) => v != null))];
  const phones = [...new Set(audios.map((a) => phoneKey(a.phoneNumber)).filter(Boolean))] as string[];
  if (!leadIds.length && !phones.length) return audios;
  const select = {
    leadId: true,
    originalLeadId: true,
    closeReasonName: true,
    statusName: true,
    semanticId: true,
    contactPhone: true,
    leadTags: true,
    closedAt: true,
    isSale: true,
    pipelineName: true,
    pipelineId: true,
  };
  const fetchLeads = async (OR: any[]) => {
    if (!OR.length) return [];
    return prisma.salesLead.findMany({
      where: { companyId, OR },
      select,
      orderBy: { closedAt: "desc" },
    });
  };
  const leads: any[] = [];
  const leadOr: any[] = [];
  if (leadIds.length) {
    leadOr.push({ leadId: { in: leadIds } });
    leadOr.push({ originalLeadId: { in: leadIds } });
  }
  leads.push(...await fetchLeads(leadOr));
  for (const chunk of chunkArray(phones, 50)) {
    leads.push(...await fetchLeads(chunk.map((p) => ({ contactPhone: { contains: p } }))));
  }
  leads.sort((a, b) => new Date(b.closedAt || 0).getTime() - new Date(a.closedAt || 0).getTime());
  const byLead = new Map<number, any>();
  const byOriginal = new Map<number, any>();
  const byPhone = new Map<string, any>();
  for (const l of leads) {
    if (l.leadId != null && !byLead.has(l.leadId)) byLead.set(l.leadId, l);
    if (l.originalLeadId != null && !byOriginal.has(l.originalLeadId)) byOriginal.set(l.originalLeadId, l);
    const p = phoneKey(l.contactPhone);
    if (p && !byPhone.has(p)) byPhone.set(p, l);
  }
  return audios.map((a) => {
    const lead = (a.leadId != null ? byLead.get(a.leadId) || byOriginal.get(a.leadId) : null) || byPhone.get(phoneKey(a.phoneNumber) as string);
    return lead ? {
      ...a,
      closeReasonName: lead.closeReasonName || null,
      leadSemanticId: lead.semanticId || null,
      leadStatusName: lead.statusName || null,
      leadClosedAt: lead.closedAt || null,
      leadTags: a.leadTags || lead.leadTags || null,
      pipelineName: a.pipelineName || lead.pipelineName || null,
    } : a;
  });
};
