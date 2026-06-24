import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { voronkaService, PipelineStats } from "../../services/voronka.service";
import { audioService } from "../../services/audio.service";
import { SkeletonCardGrid } from "../../components/ui/Skeleton";
import Badge from "../../components/ui/Badge";
import { GitBranch, Archive, RefreshCw, LayoutGrid, List, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../store/authStore";
import toast from "react-hot-toast";

type FilterType = "active" | "archived" | "all";
type ViewType = "card" | "table";

const scoreColor = (score: number): string => {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
};

const scoreBgColor = (score: number): string => {
  if (score >= 80) return "bg-green-400";
  if (score >= 50) return "bg-yellow-400";
  return "bg-red-400";
};

/* ---- Card View ---- */
const PipelineCard: React.FC<{
  pipeline: PipelineStats;
  onArchiveToggle: (name: string) => void;
  archiving: boolean;
}> = ({ pipeline, onArchiveToggle, archiving }) => {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAdmin = userRole === "company";
  const [showAmt, setShowAmt] = useState(false);
  const conversion = pipeline.totalCalls > 0
    ? ((pipeline.sotuv / pipeline.totalCalls) * 100).toFixed(1)
    : "0.0";

  return (
    <div
      className={`bg-card border border-border rounded-xl p-3 md:p-5 transition-all duration-200 hover:shadow-lg hover:shadow-accent/5 ${
        pipeline.isArchived ? "opacity-50" : "hover:border-accent/50"
      }`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center cursor-pointer"
          onClick={() => navigate(`/voronka/${encodeURIComponent(pipeline.name)}`)}
        >
          <GitBranch size={20} className="text-accent" />
        </div>
        <h3
          className="text-lg font-bold text-white truncate flex-1 cursor-pointer"
          onClick={() => navigate(`/voronka/${encodeURIComponent(pipeline.name)}`)}
        >
          {pipeline.name}
        </h3>
        {pipeline.isArchived && (
          <Badge variant="warning" size="sm">Arxiv</Badge>
        )}
      </div>

      {pipeline.totalCalls === 0 ? (
        <div
          className="flex items-center justify-center py-8 mb-4 cursor-pointer"
          onClick={() => navigate(`/voronka/${encodeURIComponent(pipeline.name)}`)}
        >
          <p className="text-secondary text-sm text-center">Bu voronkada hali leadlar yo'q</p>
        </div>
      ) : (
        <>
          <div
            className="grid grid-cols-3 gap-3 mb-4 cursor-pointer"
            onClick={() => navigate(`/voronka/${encodeURIComponent(pipeline.name)}`)}
          >
            <StatItem label="Jami" value={pipeline.totalCalls} />
            <StatItem label="Tahlil" value={pipeline.analyzedCalls} />
            <StatItem label="1-Qo'ng'iroq" value={pipeline.birinchiQongiroq} />
            <StatItem label="Qayta" value={pipeline.qayta} />
            <StatItem label="Sotuv" value={pipeline.sotuv} />
            <StatItem label="Boshqa" value={pipeline.boshqa} />
          </div>

          <div
            className="flex items-center justify-between mb-3 cursor-pointer"
            onClick={() => navigate(`/voronka/${encodeURIComponent(pipeline.name)}`)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-secondary">Ball:</span>
              <span className={`text-lg font-bold ${scoreColor(pipeline.avgScore)}`}>
                {pipeline.avgScore.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-secondary">Konversiya:</span>
              <span className="text-lg font-bold text-white">{conversion}%</span>
            </div>
          </div>

          <div
            className="w-full h-2 rounded-full bg-primary overflow-hidden mb-3 cursor-pointer"
            onClick={() => navigate(`/voronka/${encodeURIComponent(pipeline.name)}`)}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${scoreBgColor(pipeline.avgScore)}`}
              style={{ width: `${Math.min(parseFloat(conversion), 100)}%` }}
            />
          </div>
          {/* Sotuv summasi */}
          {(pipeline as any).saleAmount > 0 && (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-xs text-secondary">Summa:</span>
              <button onClick={(e) => { e.stopPropagation(); setShowAmt(!showAmt); }} className="hover:opacity-70">
                {showAmt ? <EyeOff size={12} className="text-secondary" /> : <Eye size={12} className="text-secondary" />}
              </button>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                {showAmt ? `${((pipeline as any).saleAmount || 0).toLocaleString()} so'm` : "••••••"}
              </span>
            </div>
          )}
        </>
      )}

      {isAdmin && (
        <div className="flex items-center pt-3 border-t border-border">
          <button
            onClick={(e) => { e.stopPropagation(); onArchiveToggle(pipeline.name); }}
            disabled={archiving}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-warning/10 text-warning hover:bg-warning/20 border border-warning/20 transition-colors flex items-center gap-1.5"
          >
            <Archive size={12} />
            {pipeline.isArchived ? "Faollashtirish" : "Arxivlash"}
          </button>
        </div>
      )}
    </div>
  );
};

const StatItem: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="bg-primary/50 rounded-lg px-3 py-2 text-center">
    <p className="text-xs text-secondary mb-0.5">{label}</p>
    <p className="text-sm font-semibold text-white">{value}</p>
  </div>
);

/* ---- Table View ---- */
const PipelineTable: React.FC<{
  pipelines: PipelineStats[];
  onArchiveToggle: (name: string) => void;
  archiving: boolean;
}> = ({ pipelines, onArchiveToggle, archiving }) => {
  const navigate = useNavigate();

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-xs text-secondary font-medium uppercase">Nomi</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">Jami</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">Tahlil</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">1-Qo'ng'iroq</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">Qayta</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">Sotuv</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">Ball</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">Konversiya</th>
              <th className="text-center py-3 px-4 text-xs text-secondary font-medium uppercase">Holat</th>
              <th className="text-right py-3 px-4 text-xs text-secondary font-medium uppercase"></th>
            </tr>
          </thead>
          <tbody>
            {pipelines.map((p) => {
              const conversion = p.totalCalls > 0
                ? ((p.sotuv / p.totalCalls) * 100).toFixed(1)
                : "0.0";

              return (
                <tr
                  key={p.name}
                  className={`border-b border-border/50 hover:bg-primary/30 transition-colors cursor-pointer ${
                    p.isArchived ? "opacity-50" : ""
                  }`}
                  onClick={() => navigate(`/voronka/${encodeURIComponent(p.name)}`)}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <GitBranch size={16} className="text-accent shrink-0" />
                      <span className="text-sm text-white font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-white">{p.totalCalls}</td>
                  <td className="py-3 px-4 text-center text-sm text-secondary">{p.analyzedCalls}</td>
                  <td className="py-3 px-4 text-center text-sm text-secondary">{p.birinchiQongiroq}</td>
                  <td className="py-3 px-4 text-center text-sm text-secondary">{p.qayta}</td>
                  <td className="py-3 px-4 text-center text-sm text-white font-medium">{p.sotuv}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-sm font-bold ${scoreColor(p.avgScore)}`}>
                      {p.avgScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-sm text-white">{conversion}%</td>
                  <td className="py-3 px-4 text-center">
                    <Badge variant={p.isArchived ? "warning" : "success"} size="sm">
                      {p.isArchived ? "Arxiv" : "Faol"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchiveToggle(p.name); }}
                      disabled={archiving}
                      className="px-2 py-1 text-xs text-secondary hover:text-warning transition-colors flex items-center gap-1"
                    >
                      <Archive size={12} />
                      {p.isArchived ? "Faol" : "Arxiv"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ---- Main Page ---- */
const VoronkalarPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>("active");
  const [viewType, setViewType] = useState<ViewType>(() => {
    return (localStorage.getItem("voronka_view") as ViewType) || "card";
  });

  const setView = (v: ViewType) => {
    setViewType(v);
    localStorage.setItem("voronka_view", v);
  };

  const { data: pipelines, isLoading, error } = useQuery<PipelineStats[]>({
    queryKey: ["voronkalar", true],
    queryFn: () => voronkaService.getAll(true),
  });

  const syncMutation = useMutation({
    mutationFn: () => audioService.syncAmoCrm(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voronkalar"] });
      toast.success("AmoCRM sinhronlashtirildi");
    },
    onError: (err: any) => {
      if (err?.response?.status === 409) {
        toast("Sinhronlash allaqachon ishlayapti");
      } else {
        toast.error("Sinhronlashda xatolik");
      }
    },
  });

  const archiveMutation = useMutation({
    mutationFn: voronkaService.toggleArchive,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["voronkalar"] });
      toast.success(result.isArchived ? "Voronka arxivlandi" : "Voronka faollashtirildi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const filterButtons: { key: FilterType; label: string }[] = [
    { key: "all", label: "Barchasi" },
    { key: "active", label: "Faol" },
    { key: "archived", label: "Arxivlangan" },
  ];

  const filteredPipelines = pipelines?.filter((p) => {
    if (filter === "active") return !p.isArchived;
    if (filter === "archived") return p.isArchived;
    return true;
  });

  if (isLoading) {
    return <SkeletonCardGrid count={6} />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Xatolik yuz berdi</p>
          <p className="text-secondary text-sm">Ma'lumotlarni yuklab bo'lmadi</p>
        </div>
      </div>
    );
  }

  if (!pipelines || pipelines.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <GitBranch size={48} className="text-secondary mx-auto mb-4" />
          <p className="text-white text-lg mb-2">Voronkalar topilmadi</p>
          <p className="text-secondary text-sm">Hozircha hech qanday pipeline mavjud emas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-hidden pb-8">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Filter tabs */}
        <div className="flex items-center gap-2">
          {filterButtons.map((fb) => (
            <button
              key={fb.key}
              onClick={() => setFilter(fb.key)}
              className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                filter === fb.key
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "bg-card border border-border text-secondary hover:text-white"
              }`}
            >
              {fb.label}
            </button>
          ))}
          <span className="text-xs text-secondary ml-2">
            {filteredPipelines?.length || 0} ta
          </span>
        </div>

        {/* Right: View toggle + Sync */}
        <div className="flex items-center gap-2">
          <div className="flex bg-card border border-border rounded-lg p-0.5">
            <button
              onClick={() => setView("card")}
              className={`p-1.5 rounded-md transition-colors ${
                viewType === "card" ? "bg-accent/10 text-accent" : "text-secondary hover:text-white"
              }`}
              title="Kartalar"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setView("table")}
              className={`p-1.5 rounded-md transition-colors ${
                viewType === "table" ? "bg-accent/10 text-accent" : "text-secondary hover:text-white"
              }`}
              title="Jadval"
            >
              <List size={16} />
            </button>
          </div>

          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-accent hover:bg-accent/80 transition-colors flex items-center gap-2 disabled:opacity-50"
            style={{ color: "#ffffff" }}
          >
            <RefreshCw size={14} className={syncMutation.isPending ? "animate-spin" : ""} />
            Sinhronlash
          </button>
        </div>
      </div>

      {/* Content */}
      {viewType === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPipelines?.map((pipeline) => (
            <PipelineCard
              key={pipeline.name}
              pipeline={pipeline}
              onArchiveToggle={(name) => archiveMutation.mutate(name)}
              archiving={archiveMutation.isPending}
            />
          ))}
          {(!filteredPipelines || filteredPipelines.length === 0) && (
            <div className="col-span-full py-12 text-center text-secondary">
              {filter === "archived"
                ? "Arxivlangan voronkalar yo'q"
                : filter === "active"
                ? "Faol voronkalar yo'q"
                : "Voronkalar topilmadi"}
            </div>
          )}
        </div>
      ) : (
        <>
          {filteredPipelines && filteredPipelines.length > 0 ? (
            <PipelineTable
              pipelines={filteredPipelines}
              onArchiveToggle={(name) => archiveMutation.mutate(name)}
              archiving={archiveMutation.isPending}
            />
          ) : (
            <div className="py-12 text-center text-secondary">
              {filter === "archived"
                ? "Arxivlangan voronkalar yo'q"
                : filter === "active"
                ? "Faol voronkalar yo'q"
                : "Voronkalar topilmadi"}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default VoronkalarPage;
