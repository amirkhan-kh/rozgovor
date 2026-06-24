import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pipelineMappingService, StageMapping } from "../../services/pipeline-mapping.service";
import Button from "../../components/ui/Button";
import { RefreshCw, Check } from "lucide-react";
import toast from "react-hot-toast";

interface Props {
  pipelineName: string;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  first_call: { label: "1-Qo'ng'iroq", color: "#3b5ef5" },
  repeat: { label: "Qayta", color: "#e6a020" },
  other: { label: "Boshqa", color: "#7c7c9a" },
};

const PipelineSettingsTab: React.FC<Props> = ({ pipelineName }) => {
  const queryClient = useQueryClient();
  const [stages, setStages] = useState<StageMapping[]>([]);
  const [, setTags] = useState<string[]>([]);
  const [synced, setSynced] = useState(false);

  const { data: mappings } = useQuery({
    queryKey: ["pipeline-mappings"],
    queryFn: pipelineMappingService.getMappings,
  });

  // AmoCRM'dan sinhronlash
  const syncMutation = useMutation({
    mutationFn: pipelineMappingService.syncStages,
    onSuccess: (data) => {
      const pipeline = data.pipelines.find((p) => p.name === pipelineName);
      if (pipeline) {
        // Mavjud mapping bilan birlashtirish
        const existing = mappings?.find((m) => m.pipelineName === pipelineName);
        let existingStages: StageMapping[] = [];
        if (existing) {
          try { existingStages = typeof existing.stages === "string" ? JSON.parse(existing.stages) : existing.stages; } catch {}
        }

        const newStages: StageMapping[] = pipeline.stages.map((name) => {
          const e = existingStages.find((s) => s.name === name);
          return e || { name, type: "repeat" };
        });
        setStages(newStages);
      }
      setTags(data.tags || []);
      setSynced(true);
      toast.success("AmoCRM bilan sinhronlandi");
    },
    onError: () => toast.error("AmoCRM bilan bog'lanishda xatolik"),
  });

  const saveMutation = useMutation({
    mutationFn: () => pipelineMappingService.saveMapping(pipelineName, stages),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline-mappings"] });
      toast.success("Saqlandi");
    },
    onError: () => toast.error("Xatolik"),
  });

  useEffect(() => {
    if (mappings) {
      const existing = mappings.find((m) => m.pipelineName === pipelineName);
      if (existing) {
        try {
          setStages(typeof existing.stages === "string" ? JSON.parse(existing.stages) : existing.stages);
          setSynced(true);
        } catch {}
      }
    }
  }, [mappings, pipelineName]);

  const updateType = (i: number, type: "first_call" | "repeat" | "other") => {
    setStages((prev) => prev.map((s, idx) => idx === i ? { ...s, type } : s));
  };

  return (
    <div className="space-y-6">
      {/* Sinhronlash */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Qo'ng'iroq turi sozlamalari</h3>
            <p className="text-xs text-secondary mt-1">
              AmoCRM ustunlariga qarab qo'ng'iroq turini avtomatik aniqlash
            </p>
          </div>
          <Button onClick={() => syncMutation.mutate()} loading={syncMutation.isPending} size="sm">
            <RefreshCw size={14} />
            AmoCRM dan sinhronlash
          </Button>
        </div>

        {!synced && stages.length === 0 && (
          <div className="text-center py-8">
            <RefreshCw size={28} className="text-secondary/30 mx-auto mb-3" />
            <p className="text-sm text-secondary">
              "AmoCRM dan sinhronlash" tugmasini bosing
            </p>
          </div>
        )}
      </div>

      {/* Ustunlar */}
      {stages.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h4 className="text-sm font-semibold text-white mb-1">Voronka ustunlari</h4>
          <p className="text-xs text-secondary mb-4">Har bir ustun uchun qo'ng'iroq turini belgilang</p>

          <div className="space-y-1.5">
            {stages.map((stage, i) => (
              <div key={stage.name} className="flex items-center justify-between p-3 rounded-xl border border-border hover:bg-primary/30 transition-colors gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1 h-6 rounded-full shrink-0" style={{ backgroundColor: TYPE_LABELS[stage.type]?.color }} />
                  <span className="text-sm text-white truncate">{stage.name}</span>
                </div>
                <div className="flex gap-1 shrink-0">
                  {(["first_call", "repeat", "other"] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => updateType(i, type)}
                      className={`px-2 sm:px-3 py-1 text-[10px] sm:text-xs rounded-lg border transition-colors ${
                        stage.type === type
                          ? "border-accent/50 bg-accent/10 text-accent font-medium"
                          : "border-border text-secondary hover:text-white"
                      }`}
                    >
                      {stage.type === type && <Check size={10} className="inline mr-0.5" />}
                      {TYPE_LABELS[type].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end mt-4 pt-3 border-t border-border">
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Saqlash</Button>
          </div>
        </div>
      )}


      {/* Tushuntirish */}
      {synced && (
        <div className="p-4 bg-primary/30 rounded-xl">
          <p className="text-xs text-secondary leading-relaxed">
            <strong className="text-white">Qanday ishlaydi:</strong> Audio sinxronlanganda lead qaysi ustunda
            turganiga qarab kategoriya aniqlanadi. Shuningdek, lead'ning tag'lari ham saqlanadi.
            Agar bitta lead'ga oldin qo'ng'iroq qilingan bo'lsa — avtomatik "Qayta" deb belgilanadi.
          </p>
        </div>
      )}
    </div>
  );
};

export default PipelineSettingsTab;
