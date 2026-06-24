import api from "./api";
import { ApiResponse } from "../types";

interface PipelineStages {
  name: string;
  stages: string[];
}

interface SyncResult {
  pipelines: PipelineStages[];
  tags: string[];
}

interface StageMapping {
  name: string;
  type: "first_call" | "repeat" | "other";
}

interface PipelineMappingData {
  id: string;
  pipelineName: string;
  stages: string; // JSON string
}

export const pipelineMappingService = {
  async syncStages(): Promise<SyncResult> {
    const { data } = await api.get<ApiResponse<SyncResult>>("/pipeline-mapping/sync-stages");
    return data.data;
  },

  async getMappings(): Promise<PipelineMappingData[]> {
    const { data } = await api.get<ApiResponse<PipelineMappingData[]>>("/pipeline-mapping/mappings");
    return data.data;
  },

  async saveMapping(pipelineName: string, stages: StageMapping[]): Promise<void> {
    await api.put("/pipeline-mapping/mappings", { pipelineName, stages });
  },
};

export type { PipelineStages, StageMapping, PipelineMappingData };
