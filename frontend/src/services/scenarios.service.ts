import api from "./api";
import { ApiResponse } from "../types";

export type ScenarioCategory = "presale" | "qayta" | "sotuv" | "aftersale";

export interface ScenarioBranch {
  clientResponse: string;
  managerReply: string;
}

export interface ScenarioSection {
  id: string;
  title: string;
  managerScript: string;
  branches?: ScenarioBranch[];
  note?: string;
}

export interface Scenario {
  id: string;
  companyId: string;
  category: ScenarioCategory;
  title: string;
  sections: ScenarioSection[];
  generatedAt: string;
  updatedAt: string;
  isEdited: boolean;
}

export interface GenerateResult {
  generated: number;
  failed: number;
  errors: string[];
}

export const scenariosService = {
  async list(): Promise<Scenario[]> {
    const { data } = await api.get<ApiResponse<Scenario[]>>("/scenarios");
    return data.data;
  },
  async generateAll(): Promise<GenerateResult> {
    const { data } = await api.post<ApiResponse<GenerateResult>>(
      "/scenarios/generate"
    );
    return data.data;
  },
  async update(
    id: string,
    patch: { title?: string; sections?: ScenarioSection[] }
  ): Promise<Scenario> {
    const { data } = await api.put<ApiResponse<Scenario>>(
      `/scenarios/${id}`,
      patch
    );
    return data.data;
  },
  /** Serverda .docx fayl yaratib brauzerda yuklab olish */
  async downloadDocx(id: string, fallbackName: string): Promise<void> {
    const response = await api.get(`/scenarios/${id}/export-docx`, {
      responseType: "blob",
    });
    const blob = new Blob([response.data], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    // Content-Disposition'dan fayl nomini o'qib olishga harakat qilamiz
    let fileName = `${fallbackName}.docx`;
    const cd = (response.headers?.["content-disposition"] as string) || "";
    const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    const plainMatch = /filename="([^"]+)"/i.exec(cd);
    if (utfMatch?.[1]) {
      try {
        fileName = decodeURIComponent(utfMatch[1]);
      } catch {
        /* noop */
      }
    } else if (plainMatch?.[1]) {
      fileName = plainMatch[1];
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
