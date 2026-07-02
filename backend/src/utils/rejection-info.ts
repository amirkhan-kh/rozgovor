import { prisma } from "./prisma";

// ─────────────────────────────────────────────────────────────────────────────
// "Yo'qotilgan lidlar" 🚩 + manager haq/noxaq verdict (InterWork forkidan ko'chirilgan)
// "Lost" ta'rifi (Bitrix): SalesLead.closeReasonName belgilangan bo'lsa = yo'qotilgan.
// semanticId="F" ishlatilmaydi — bu portalda sabab NEW/P bosqich deal'larga qo'yiladi.
//
// ⚠️ Bu helperlar audio.controller (per-audio rejectionInfo) va audit.controller
// (lost-verdicts aggregate) tomonidan ulashiladi — duplicate qilmaslik uchun umumiy.
//
// VERDIKT MODELI (2026-07-02 qayta loyiha): e'tiroz-korzina taqqoslashi EMAS.
// Portalda CRM close reason faqat 4 ta operatsion teg ("Noto'g'ri raqam", "Chet el
// raqami", "Ariza qoldirmagan", "Bepul xohladi") — hammasi "bu lid mazmunli emas edi"
// deb da'vo qiladi. Yagona savol: transkriptda HAQIQIY MAZMUNLI SUHBAT bo'lganmi?
// Bo'lgan bo'lsa → teg NOTO'G'RI (mis-tag). Bo'lmagan bo'lsa → teg TO'G'RI. Chegaraviy /
// telefon-join / kuchsiz signal → "Aniqlab bo'lmadi" (abstain). Vertex/LLM ISHLATILMAYDI —
// faqat mavjud Analysis + AudioFile maydonlari (deterministik heuristika).
// ─────────────────────────────────────────────────────────────────────────────
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
  followupReason: true,
  followupPhrase: true,
  lossPoints: true,
  clientSpeech: true,
  managerSpeech: true,
  requiresFollowup: true,
  closeReasonVerdict: true,   // v3 — LLM hukmi
};

export const compactText = (value: any): string => {
  return String(value || "").replace(/\s+/g, " ").trim();
};

// "Lost" = Bitrix CRM yopish sababi belgilangan (A usul, semanticId filtrisiz).
// ⚠️ Faqat SABAB bor lidlar verdiktga kiradi — bare JUNK/statusId (sababsiz) shovqinini
// olib tashlaymiz (aks holda "unknown" verdikt paydo bo'ladi).
export const hasLostLeadSignal = (analysis: any, audio: any = {}): boolean => {
  if (!analysis || audio?.isSale === true) return false;
  return !!(audio?.closeReasonName || audio?.leadRejectReasonName);
};

// Transkript "mazmunlilik" signallari — hammasi mavjud maydonlardan (Vertex'siz).
export const conversationSubstance = (analysis: any, audio: any = {}) => {
  const an = analysis || {};
  const status = String(audio?.status || "").toLowerCase();
  const duration = Number(audio?.duration || 0);
  const clientSpeech = Number(an?.clientSpeech || 0);
  const objections = Array.isArray(an?.objections) ? an.objections : [];
  const leadQuality = String(an?.leadQuality || "").toLowerCase();
  const overallScore = Number(an?.overallScore || 0);
  const summary = String(an?.summary || "");

  const done = status === "done";
  const longCall = duration >= 90; // ≥1.5 daqiqa
  const clientEngaged = clientSpeech >= 12; // mijoz ≥12% gapirgan
  const hasObjections = objections.length > 0;
  const warmLead = ["iliq", "issiq"].includes(leadQuality) || overallScore >= 40;
  const wantsFollowup = an?.requiresFollowup === true;
  const richSummary = summary.length >= 120;

  // realConversation — faqat xulosa matnini boyitish uchun (verdikt EMAS).
  const realConversation =
    done && (clientEngaged || hasObjections || warmLead || longCall || wantsFollowup);

  // emptyCall — teg to'g'ri (suhbat bo'lmagan).
  const emptyCall =
    ["no_conversation", "too_short"].includes(status) ||
    duration < 30 ||
    clientSpeech < 4;

  // strongConversation — KONSERVATIV: "wrong" faqat shu sharti bajarilganda chiqadi.
  const strongConversation =
    done &&
    clientSpeech >= 15 &&
    (hasObjections || ["iliq", "issiq"].includes(leadQuality) || duration >= 120);

  return {
    done, longCall, clientEngaged, hasObjections, warmLead, wantsFollowup, richSummary,
    realConversation, emptyCall, strongConversation,
    duration, clientSpeech, leadQuality, objections, overallScore, summary,
  };
};

export const getRejectionInfo = (analysis: any, audio: any = {}) => {
  if (!hasLostLeadSignal(analysis, audio)) return null;
  const an = analysis || {};
  const reason: string | null = audio?.leadRejectReasonName || audio?.closeReasonName || null;
  if (!reason) return null;
  const s = conversationSubstance(an, audio);
  // Ulanish ishonchi: exact leadId → "id" (ishonchli), faqat telefon → "phone" (past).
  const matchConfidence: "id" | "phone" = audio?.matchConfidence === "id" ? "id" : "phone";
  // Reason manbasi: "deal" = SalesLead.closeReasonName (contemporaneous deal-close),
  // "lead" = Lead.rejectReasonName (intake JUNK teg, ko'pincha qo'ng'iroqdan oldin qo'yilgan).
  const reasonSource: "deal" | "lead" = audio?.reasonSource === "deal" ? "deal" : "lead";

  // ── Verdikt qarori ────────────────────────────────────────────────────────
  // v3 (COUPLED): agar Gemini closeReasonVerdict qaytargan bo'lsa — TO'G'RIDAN-TO'G'RI
  // map (haq→right, noxaq→wrong, noaniq→unclear), conclusion = verdict.reason.
  // Yo'q bo'lsa (eski analiz / sabab analiz vaqtida yo'q) — v2 heuristika (O'ZGARMAYDI).
  const v = an?.closeReasonVerdict as { status?: "haq" | "noxaq" | "noaniq"; reason?: string } | null | undefined;
  const hasVerdict = !!v && typeof v.status === "string" && ["haq", "noxaq", "noaniq"].includes(v.status);

  let status: "right" | "wrong" | "unclear";
  let conclusion: string;

  if (hasVerdict) {
    // ── LLM YO'LI (v3, COUPLED) — to'g'ridan-to'g'ri map ──────────────
    // Eslatma: bu yo'lda matchConfidence/reasonSource GATE emas — Gemini transkript +
    // sababni bevosita baholagan. Ular obyektda saqlanadi (frontend/insight uchun).
    status = v!.status === "haq" ? "right" : v!.status === "noxaq" ? "wrong" : "unclear";
    conclusion = String(v!.reason || "").replace(/\s+/g, " ").trim()
      || `"${reason}" sababi bo'yicha LLM hukmi: ${v!.status}.`;
  } else {
    // ── HEURISTIK FALLBACK (v2 — O'ZGARMAYDI) ──────────────────────
    // "wrong" (Manager noxaq) FAQAT real deal-close sababida chiqadi; intake JUNK
    // teglar (reasonSource="lead") hech qachon "wrong" emas → "Aniqlab bo'lmadi".
    if (s.emptyCall) {
      status = "right"; // suhbat bo'lmagan → teg to'g'ri (manager haq)
    } else if (reasonSource === "deal" && s.strongConversation && matchConfidence === "id") {
      status = "wrong"; // FAQAT real deal-close sababida noxaq bo'lishi mumkin
    } else {
      status = "unclear"; // intake teg + real suhbat / chegaraviy → Aniqlab bo'lmadi
    }

    // ── Jonli, har-audioga-xos xulosa — haqiqiy analiz matnidan ───────────────
    const compact = (val: any, n = 220) => String(val || "").replace(/\s+/g, " ").trim().slice(0, n);
    const lossPoints = Array.isArray(an.lossPoints) ? an.lossPoints : [];
    const objTypes = (Array.isArray(an.objections) ? an.objections : [])
      .map((o: any) => o?.type).filter(Boolean).join(", ");
    const durMin = Math.round((Number(audio?.duration) || 0) / 60);

    // Har audioning O'ZIGA XOS kontekst iboralari (bo'sh bo'lmaganlarini yig'amiz):
    const ctxBits: string[] = [];
    if (an.followupReason) ctxBits.push(`yo'qotish sababi — ${compact(an.followupReason)}`);
    if (an.followupPhrase) ctxBits.push(`mijoz iborasi: "${compact(an.followupPhrase, 160)}"`);
    if (lossPoints[0]?.description) ctxBits.push(`kritik nuqta — ${compact(lossPoints[0].description)}`);
    if (objTypes) ctxBits.push(`e'tirozlar: ${objTypes}`);
    const ctxText = ctxBits.slice(0, 2).join("; "); // 1-2 ta eng muhim, jonli qism

    if (status === "wrong") {
      conclusion =
        `Manager dealni "${reason}" sababi bilan yopgan, lekin ${durMin} daqiqalik suhbat mazmunli ` +
        `(lid sifati "${an.leadQuality || "-"}", mijoz nutqi ${an.clientSpeech || 0}%)` +
        (ctxText ? `: ${ctxText}` : ``) + `. Yopilish sababi suhbatga mos kelmaydi.`;
    } else if (status === "right") {
      conclusion =
        `"${reason}" to'g'ri qo'yilgan: mazmunli suhbat aniqlanmadi ` +
        `(${audio?.status || "-"}, ${Number(audio?.duration) || 0}s, mijoz nutqi ${an.clientSpeech || 0}%).`;
    } else {
      // unclear
      if (reasonSource === "lead" && s.realConversation) {
        // intake JUNK teg + real suhbat — foydali insight, ayblovsiz
        conclusion =
          `"${reason}" — lid kiritish bosqichida qo'yilgan teg (JUNK), aniq shu qo'ng'iroqning ` +
          `yopilish sababi emas, shuning uchun managerni haq/noxaq deb baholab bo'lmaydi. ` +
          `Ammo suhbat mazmunli edi (lid sifati "${an.leadQuality || "-"}"` +
          (ctxText ? `; ${ctxText}` : ``) + `) — bu lid qayta ishlanishi mumkin edi.`;
      } else if (matchConfidence === "phone") {
        conclusion =
          `"${reason}" sababi qo'ng'iroqqa telefon raqami bo'yicha bog'landi — bog'lanish aniq ` +
          `emasligi uchun baholab bo'lmadi.`;
      } else {
        conclusion =
          `"${reason}" sababini suhbat bilan aniq tasdiqlab yoki rad etib bo'lmadi` +
          (ctxText ? ` (${ctxText})` : ``) + `.`;
      }
    }
  }

  const verdictLabel =
    status === "wrong" ? "Manager noxaq" :
    status === "right" ? "Manager haq" :
    "Aniqlab bo'lmadi";

  return { reason, reasonSource, status, verdictLabel, conclusion, matchConfidence };
};

export const phoneKey = (phone: any): string | null => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-9) : null;
};

const numericLeadId = (value: any): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = parseInt(String(value), 10);
  return Number.isNaN(n) ? null : n;
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
  const leadIds = [
    ...new Set(
      audios
        .flatMap((a) => [numericLeadId(a.leadId), numericLeadId(a.crmLeadId)])
        .filter((v): v is number => v != null)
    ),
  ];
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

  const leadSelect = {
    bitrixLeadId: true,
    clientPhone: true,
    statusId: true,
    statusName: true,
    rejectReasonName: true,
    dateCreate: true,
  };
  const fetchCrmLeads = async (OR: any[]) => {
    if (!OR.length) return [];
    return prisma.lead.findMany({
      where: { companyId, OR },
      select: leadSelect,
      orderBy: { dateCreate: "desc" },
    });
  };
  const crmLeads: any[] = [];
  const crmLeadOr: any[] = [];
  if (leadIds.length) crmLeadOr.push({ bitrixLeadId: { in: leadIds } });
  crmLeads.push(...await fetchCrmLeads(crmLeadOr));
  for (const chunk of chunkArray(phones, 50)) {
    crmLeads.push(...await fetchCrmLeads(chunk.map((p) => ({ clientPhone: { contains: p } }))));
  }
  crmLeads.sort((a, b) => new Date(b.dateCreate || 0).getTime() - new Date(a.dateCreate || 0).getTime());
  const crmByLead = new Map<number, any>();
  const crmByPhone = new Map<string, any>();
  for (const l of crmLeads) {
    if (l.bitrixLeadId != null && !crmByLead.has(l.bitrixLeadId)) crmByLead.set(l.bitrixLeadId, l);
    const p = phoneKey(l.clientPhone);
    if (p && !crmByPhone.has(p)) crmByPhone.set(p, l);
  }

  return audios.map((a) => {
    const audioLeadIds = [numericLeadId(a.leadId), numericLeadId(a.crmLeadId)].filter(
      (v): v is number => v != null
    );
    const dealById = audioLeadIds.map((id) => byLead.get(id) || byOriginal.get(id)).find(Boolean);
    const crmById = audioLeadIds.map((id) => crmByLead.get(id)).find(Boolean);
    const dealLead = dealById || byPhone.get(phoneKey(a.phoneNumber) as string);
    const crmLead = crmById || crmByPhone.get(phoneKey(a.phoneNumber) as string);
    if (!dealLead && !crmLead) return a;
    // matchConfidence — sabab qaysi record'dan kelsa, o'shaning ulanish turiga qarab.
    // Reason ustuvorligi getRejectionInfo bilan bir xil: rejectReasonName → closeReasonName.
    const matchConfidence: "id" | "phone" =
      crmLead?.rejectReasonName ? (crmById ? "id" : "phone") :
      dealLead?.closeReasonName ? (dealById ? "id" : "phone") :
      "phone";
    // reasonSource — sabab qaysi manbadan keldi: intake Lead (JUNK) yoki deal-close.
    // Reason ustuvorligi getRejectionInfo bilan bir xil: rejectReasonName → closeReasonName.
    const reasonSource: "deal" | "lead" | null =
      crmLead?.rejectReasonName ? "lead" :
      dealLead?.closeReasonName ? "deal" : null;
    return {
      ...a,
      matchConfidence,
      reasonSource,
      closeReasonName: dealLead?.closeReasonName || null,
      leadRejectReasonName: crmLead?.rejectReasonName || null,
      leadStatusId: crmLead?.statusId || null,
      isJunkLead: crmLead?.statusId === "JUNK",
      leadSemanticId: dealLead?.semanticId || null,
      leadStatusName: crmLead?.statusName || dealLead?.statusName || null,
      leadClosedAt: dealLead?.closedAt || crmLead?.dateCreate || null,
      leadTags: a.leadTags || dealLead?.leadTags || null,
      pipelineName: a.pipelineName || dealLead?.pipelineName || null,
      lostSource: [
        dealLead?.closeReasonName ? "deal" : null,
        crmLead?.rejectReasonName || crmLead?.statusId === "JUNK" ? "lead" : null,
      ].filter(Boolean).join("+") || null,
    };
  });
};
