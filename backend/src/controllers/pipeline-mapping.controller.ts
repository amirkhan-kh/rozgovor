import { Request, Response } from "express";
import "../middlewares/auth";
import { prisma } from "../utils/prisma";
import { success, error } from "../utils/response";
import { makeRequest } from "../services/amocrm";

// AmoCRM'dan voronka ustunlarini va tag'larni olish
export const syncPipelineStages = async (req: Request, res: Response): Promise<void> => {
  try {
    const pipelines = (await makeRequest(req.companyId!, "get", "/leads/pipelines")) as any;
    const result: Array<{ name: string; stages: string[] }> = [];

    for (const p of pipelines?._embedded?.pipelines || []) {
      const stages = (p._embedded?.statuses || [])
        .filter((s: any) => s.id !== 142 && s.id !== 143)
        .map((s: any) => s.name);
      result.push({ name: p.name, stages });
    }

    // Tag'larni ham olish
    let tags: string[] = [];
    try {
      const tagsResponse = (await makeRequest(req.companyId!, "get", "/leads/tags?limit=250")) as any;
      tags = (tagsResponse?._embedded?.tags || []).map((t: any) => t.name);
    } catch { /* tags API mavjud bo'lmasa ham davom etish */ }

    success(res, { pipelines: result, tags });
  } catch (err) {
    console.error("Sync pipeline stages error:", err);
    error(res, "AmoCRM ma'lumotlarini olishda xatolik");
  }
};

// Mapping olish
export const getMappings = async (req: Request, res: Response): Promise<void> => {
  try {
    const mappings = await prisma.pipelineStageMapping.findMany({
      where: { companyId: req.companyId },
    });
    success(res, mappings);
  } catch (err) {
    error(res, "Mapping olishda xatolik");
  }
};

// Mapping saqlash
export const saveMapping = async (req: Request, res: Response): Promise<void> => {
  try {
    const { pipelineName, stages } = req.body;
    // stages: [{name: "В ПРОЦЕССЕ", type: "first_call"}, {name: "НЕДОЗВОН", type: "repeat"}, ...]

    await prisma.pipelineStageMapping.upsert({
      where: {
        companyId_pipelineName: {
          companyId: req.companyId!,
          pipelineName,
        },
      },
      create: {
        companyId: req.companyId!,
        pipelineName,
        stages: JSON.stringify(stages),
      },
      update: {
        stages: JSON.stringify(stages),
      },
    });

    success(res, { message: "Mapping saqlandi" });
  } catch (err) {
    error(res, "Mapping saqlashda xatolik");
  }
};

// Mapping bo'yicha kategoriya aniqlash (sync uchun export)
// Logika (tartib bilan):
// 1. Agar pipeline mapping mavjud va status'ga aniq "first_call"/"repeat" berilgan → shuni qabul qilamiz
// 2. Aks holda — shu leadga oldingi qo'ng'iroqlar borligini tekshiramiz (callDate < thisCallDate)
//    - Oldin qo'ng'iroq bor bo'lsa → "qayta"
//    - Yo'q bo'lsa → "sotuv"
// 3. Agar callDate yetkazilmasa, faqat soni bo'yicha tekshiradi (kuchsizroq fallback)
export const getCategoryByStage = async (
  companyId: string,
  pipelineName: string | null,
  statusName: string | null,
  leadId: number,
  thisCallDate?: Date
): Promise<string> => {
  try {
    // 1. Pipeline mapping — agar sozlangan bo'lsa, override sifatida ishlatamiz
    if (pipelineName && statusName) {
      const mapping = await prisma.pipelineStageMapping.findUnique({
        where: { companyId_pipelineName: { companyId, pipelineName } },
      });
      if (mapping) {
        const stages = typeof mapping.stages === "string" ? JSON.parse(mapping.stages) : mapping.stages;
        const stageConfig = stages.find((s: any) => s.name === statusName);
        if (stageConfig?.type === "first_call") return "sotuv";
        if (stageConfig?.type === "repeat") return "qayta";
      }
    }

    // 2. Avtomatik aniqlash — shu leadga callDate'dan oldin boshqa qo'ng'iroq bo'lganmi?
    if (!leadId) return "sotuv";

    const earlierCallWhere: any = { companyId, leadId };
    if (thisCallDate) {
      // Shu qo'ng'iroqdan oldingilarini sanaymiz (timestamp mos bo'lsa, o'zini hisobga olmaymiz)
      earlierCallWhere.callDate = { lt: thisCallDate };
    }
    const earlierCount = await prisma.audioFile.count({ where: earlierCallWhere });
    return earlierCount > 0 ? "qayta" : "sotuv";
  } catch {
    return "sotuv";
  }
};
