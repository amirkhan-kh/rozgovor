import axios from "axios";
import { prisma } from "../utils/prisma";
import { makeRequest } from "./amocrm";
import { getCategoryByStage } from "../controllers/pipeline-mapping.controller";
import { uploadFile } from "./storage";
import { syncProgress } from "../controllers/amocrm.controller";
import { processAudioFile } from "./processor";

interface AmoNote {
  id: number;
  entity_id: number;
  note_type: string;
  responsible_user_id: number;
  created_at: number;
  params: {
    uniq?: string;
    duration?: number;
    source?: string;
    link?: string;
    phone?: string;
  };
}

interface AmoLead {
  id: number;
  name: string;
  responsible_user_id: number;
  created_at: number;
  updated_at: number;
  closed_at: number;
  status_id: number;
  pipeline_id: number;
  price?: number;
  _embedded?: {
    tags?: Array<{ id: number; name: string }>;
  };
}

export const syncCalls = async (
  companyId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ synced: number; total: number; errors: number }> => {
  let synced = 0;
  let total = 0;
  let errors = 0;

  try {
    // 1. AmoCRM credential + company sozlamalari
    const cred = await prisma.amoCredential.findUnique({ where: { companyId } });
    if (!cred) throw new Error("AmoCRM ulanmagan");

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { excludedPipelines: true, salePaymentFieldId: true },
    });
    const excludedPipelines = new Set(company?.excludedPipelines || []);
    const salePaymentFieldId = company?.salePaymentFieldId || null;

    // "Дата платежа" custom field'dan sana olish (agar field ID sozlangan bo'lsa).
    // Fallback: lead.closed_at
    const extractPaymentDate = (lead: any): Date | null => {
      if (salePaymentFieldId) {
        const cfvs = lead.custom_fields_values || [];
        for (const cf of cfvs) {
          if (cf.field_id === salePaymentFieldId) {
            const v = cf.values?.[0]?.value;
            if (v) return new Date(Number(v) * 1000);
          }
        }
      }
      if (lead.closed_at) return new Date(lead.closed_at * 1000);
      return null;
    };

    // 2. Menejerlar ro'yxatini olish (amo user ID → manager ID mapping)
    const managers = await prisma.manager.findMany({
      where: { companyId },
    });
    const managerMap = new Map<string, string>();
    for (const m of managers) {
      // amo_12602870 formatdagi id dan user_id ni olish
      const amoUserId = m.id.replace("amo_", "");
      managerMap.set(amoUserId, m.id);
    }

    // 3. Pipeline va status nomlarini olish
    const pipelineMap = new Map<number, string>();
    const statusMap = new Map<number, string>();
    try {
      const pipelines = (await makeRequest(companyId, "get", "/leads/pipelines")) as any;
      for (const p of pipelines?._embedded?.pipelines || []) {
        pipelineMap.set(p.id, p.name);
        for (const s of p._embedded?.statuses || []) {
          statusMap.set(s.id, s.name);
        }
      }
    } catch { /* ignore */ }

    // 4. Leadlarni sahifama-sahifa olish
    let page = 1;
    let hasMore = true;

    const updateProgress = () => {
      const current = syncProgress.get(companyId);
      if (current) {
        syncProgress.set(companyId, { ...current, page, synced, total, errors });
      }
    };

    while (hasMore) {
      console.log(`Syncing page ${page}...`);

      // Faqat dateFrom dan keyingi leadlarni olish
      let filterParam = dateFrom
        ? `&filter[created_at][from]=${Math.floor(new Date(dateFrom).getTime() / 1000)}`
        : "";
      if (dateTo) {
        filterParam += `&filter[created_at][to]=${Math.floor(new Date(dateTo).getTime() / 1000)}`;
      }

      const leadsResponse = (await makeRequest(
        companyId,
        "get",
        `/leads?limit=50&page=${page}&with=tags,custom_fields_values${filterParam}`
      )) as { _embedded?: { leads?: AmoLead[] } };

      const leads = leadsResponse?._embedded?.leads || [];
      if (leads.length === 0) {
        hasMore = false;
        break;
      }

      // 4. Har lead uchun call notelarni tekshirish
      for (const lead of leads) {
        try {
          const notesResponse = (await makeRequest(
            companyId,
            "get",
            `/leads/${lead.id}/notes?limit=100`
          )) as { _embedded?: { notes?: AmoNote[] } };

          const notes = notesResponse?._embedded?.notes || [];
          // Sotuv lidlar uchun barcha qo'ng'iroqlarni olish, boshqalar uchun 50s+ filter
          const pName = pipelineMap.get(lead.pipeline_id) || "";
          const isSaleLead = (lead.status_id === 142 || (statusMap.get(lead.status_id)?.toLowerCase().includes("оплат") ?? false)) && !excludedPipelines.has(pName);
          const callNotes = notes.filter(
            (n) =>
              (n.note_type === "call_in" || n.note_type === "call_out") &&
              n.params?.link &&
              n.params?.duration &&
              (isSaleLead ? n.params.duration > 10 : n.params.duration > 50)
          );

          for (const note of callNotes) {
            total++;

            // Allaqachon DB da bormi tekshirish
            const existingFile = await prisma.audioFile.findFirst({
              where: {
                companyId,
                crmLeadId: String(note.id),
              },
            });

            if (existingFile) continue;

            try {
              // Audio faylni yuklab olish
              console.log(`Downloading audio: note=${note.id}, dur=${note.params.duration}s`);
              const audioResponse = await axios.get(note.params.link!, {
                responseType: "arraybuffer",
                timeout: 30000,
              });
              const buffer = Buffer.from(audioResponse.data);

              if (buffer.length < 1000) {
                console.log(`Skipping note ${note.id}: file too small (${buffer.length} bytes)`);
                continue;
              }

              // S3 (Wasabi) ga yuklash
              const { url } = await uploadFile(buffer, companyId, "audio/mpeg");

              // Menejer topish
              const amoUserId = String(note.responsible_user_id);
              const managerId = managerMap.get(amoUserId) || null;

              // Lead ma'lumotlari
              const pipelineName = pipelineMap.get(lead.pipeline_id) || null;
              const statusName = statusMap.get(lead.status_id) || null;
              // Excluded pipeline dan kelgan leadlar sotuv emas
              const isSuccessStatus = lead.status_id === 142 || (statusName?.toLowerCase().includes("оплат") ?? false);
              const isSale = isSuccessStatus && !excludedPipelines.has(pipelineName || "");
              const leadCreatedAt = new Date(lead.created_at * 1000);
              const firstContactAt = new Date(note.created_at * 1000);
              const leadTags = (lead._embedded?.tags || []).map((t) => t.name).join(", ") || null;
              // Sotuv uchun "haqiqiy egasi" — lead.responsible_user_id (har audio'ning managerId'si emas)
              const saleResponsibleManagerId = isSale
                ? managerMap.get(String((lead as any).responsible_user_id)) || null
                : null;

              // AudioFile yaratish
              const audioFile = await prisma.audioFile.create({
                data: {
                  fileName: `call_${note.id}_${note.params.phone || "unknown"}.mp3`,
                  fileUrl: url,
                  managerId,
                  companyId,
                  phoneNumber: note.params.phone
                    ? (note.params.phone.startsWith("998") ? `+${note.params.phone}` : `+998${note.params.phone}`)
                    : null,
                  duration: note.params.duration,
                  category: await getCategoryByStage(companyId, pipelineName, statusName, lead.id, firstContactAt),
                  status: "pending",
                  crmLeadId: String(note.id),
                  callDate: firstContactAt,
                  isSale,
                  saleAmount: isSale ? (lead.price || 0) : 0,
                  saleClosedAt: isSale ? extractPaymentDate(lead) : null,
                  saleResponsibleManagerId,
                  pipelineName,
                  statusName,
                  leadTags,
                  leadCreatedAt,
                  firstContactAt,
                  leadId: lead.id,
                },
              });

              // Faqat yuklash, tahlil keyinroq qilinadi
              synced++;
              updateProgress();
              console.log(`Synced: note=${note.id}, audioFile=${audioFile.id}`);
            } catch (dlErr) {
              errors++;
              updateProgress();
              console.error(`Error downloading note ${note.id}:`, dlErr);
            }
          }
        } catch (noteErr) {
          console.error(`Error getting notes for lead ${lead.id}:`, noteErr);
        }
      }

      // Keyingi sahifa
      if (leads.length < 50) {
        hasMore = false;
      } else {
        page++;
        // Rate limit uchun kutish
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // 50 sahifagacha ko'rib chiqamiz (2500 lead)
      if (page > 50) hasMore = false;
    }

    // === Sotuv lidlarni alohida sync (audio bo'lmasa ham) ===
    // "Успешно реализовано" statusidagi lidlar — updated_at bo'yicha filtr
    // Sabab: lid mart oyida yaratilgan, aprelda sotuv bo'lishi mumkin
    try {
      const allPipelineIds = [...pipelineMap.keys()];
      for (const pipId of allPipelineIds) {
        const pipName = pipelineMap.get(pipId) || "";
        if (excludedPipelines.has(pipName)) continue;

        let salePage = 1;
        let saleHasMore = true;

        while (saleHasMore) {
          // closed_at bo'yicha filtr — bu oyda YOPILGAN sotuvlarni olish
          // CRM dagi "Дата платежа" = closed_at (qachon Успешно реализовано ga o'tgani)
          let saleFilter = `&filter[statuses][0][pipeline_id]=${pipId}&filter[statuses][0][status_id]=142`;
          if (dateFrom) saleFilter += `&filter[closed_at][from]=${Math.floor(new Date(dateFrom).getTime() / 1000)}`;
          if (dateTo) saleFilter += `&filter[closed_at][to]=${Math.floor(new Date(dateTo).getTime() / 1000)}`;

          const saleResp = (await makeRequest(companyId, "get", `/leads?limit=50&page=${salePage}&with=tags,custom_fields_values${saleFilter}`)) as { _embedded?: { leads?: AmoLead[] } };
          const saleLeads = saleResp?._embedded?.leads || [];
          if (saleLeads.length === 0) { saleHasMore = false; break; }

          for (const lead of saleLeads) {
            // Sotuv sanasi = "Дата платежа" custom field (yoki closed_at, agar field yo'q bo'lsa)
            const saleDate = extractPaymentDate(lead) || new Date(((lead as any).closed_at || (lead as any).updated_at) * 1000);
            const salePrice = lead.price || 0;
            const amoUserId = String((lead as any).responsible_user_id);
            const responsibleManagerId = managerMap.get(amoUserId) || null;

            // Bu lead DB da bormi
            const existing = await prisma.audioFile.findFirst({
              where: { companyId, leadId: lead.id },
            });
            if (existing) {
              // Barcha recordlarni yangilash — isSale, saleAmount, saleClosedAt, responsible manager
              await prisma.audioFile.updateMany({
                where: { companyId, leadId: lead.id },
                data: {
                  isSale: true,
                  saleAmount: salePrice,
                  saleClosedAt: saleDate,
                  saleResponsibleManagerId: responsibleManagerId,
                },
              });
              console.log(`Updated lead ${lead.id} → isSale=true, amount=${salePrice}, closedAt=${saleDate.toISOString().split("T")[0]}`);
              continue;
            }

            // Audio yo'q — lekin sotuv lid, DB ga qo'shish
            const statusName = statusMap.get(lead.status_id) || null;
            const leadTags = (lead._embedded?.tags || []).map((t) => t.name).join(", ") || null;

            await prisma.audioFile.create({
              data: {
                fileName: `sale_lead_${lead.id}.mp3`,
                fileUrl: "",
                managerId: responsibleManagerId,
                companyId,
                phoneNumber: null,
                duration: 0,
                category: "sotuv",
                status: "no_audio",
                crmLeadId: `sale_${lead.id}`,
                callDate: saleDate,
                isSale: true,
                saleAmount: salePrice,
                saleClosedAt: saleDate,
                saleResponsibleManagerId: responsibleManagerId,
                pipelineName: pipName,
                statusName,
                leadTags,
                leadCreatedAt: new Date(lead.created_at * 1000),
                firstContactAt: saleDate,
                leadId: lead.id,
              },
            });
            synced++;
            console.log(`Synced sale lead (no audio): lead=${lead.id}, pipeline=${pipName}`);
          }

          if (saleLeads.length < 50) saleHasMore = false;
          else { salePage++; await new Promise((r) => setTimeout(r, 500)); }
          if (salePage > 10) saleHasMore = false;
        }
      }
    } catch (saleErr) {
      console.error("Sale leads sync error:", saleErr);
    }

    console.log(`Sync completed: synced=${synced}, total=${total}, errors=${errors}`);
    return { synced, total, errors };
  } catch (err) {
    console.error("Sync calls error:", err);
    throw new Error("Qo'ng'iroqlarni sync qilishda xatolik");
  }
};
