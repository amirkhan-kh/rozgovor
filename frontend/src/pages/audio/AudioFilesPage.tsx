import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Headphones,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
} from "lucide-react";
import { audioService } from "../../services/audio.service";
import { AudioFile } from "../../types";
import { usePermissions } from "../../hooks/usePermissions";
import SectionHeader from "../../components/ui/stats/SectionHeader";
import EmptyState from "../../components/ui/stats/EmptyState";
import ScoreBadge from "../../components/ui/stats/ScoreBadge";
import { SkeletonCard } from "../../components/ui/Skeleton";
import Button from "../../components/ui/Button";
import AudioStatusBadge from "../../components/audio/AudioStatusBadge";

type Period = "month" | "week" | "today";

const PERIODS: { key: Period; label: string }[] = [
  { key: "month", label: "Bu oy" },
  { key: "week", label: "Bu hafta" },
  { key: "today", label: "Bugun" },
];

const LIMIT = 24;

function formatDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("uz-UZ", { day: "2-digit", month: "short" });
}

const AudioFileCard: React.FC<{ file: AudioFile; onClick: () => void }> = ({ file, onClick }) => (
  <div
    onClick={onClick}
    className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-accent/50 transition-colors"
  >
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="min-w-0">
        <p className="font-medium text-sm truncate" style={{ color: "var(--text-primary, #fff)" }}>
          {file.fileName}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-secondary, #94a3b8)" }}>
          {file.manager?.name || "Menejer biriktirilmagan"}
        </p>
      </div>
      {file.analysis?.overallScore !== undefined && (
        <ScoreBadge score={file.analysis.overallScore} size="sm" showLabel={false} />
      )}
    </div>
    <div className="flex items-center justify-between">
      <AudioStatusBadge status={file.status} />
      <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary, #94a3b8)" }}>
        <span className="inline-flex items-center gap-1">
          <Clock size={12} /> {formatDuration(file.duration)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Phone size={12} /> {formatDate(file.callDate || file.createdAt)}
        </span>
      </div>
    </div>
  </div>
);

interface AudioFilesPageProps {
  forceManagerIds?: string[];
  embedded?: boolean;
}

const AudioFilesPage: React.FC<AudioFilesPageProps> = ({ forceManagerIds, embedded }) => {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);

  const managerIds =
    forceManagerIds && forceManagerIds.length > 0 ? forceManagerIds.join(",") : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["audio-files", { period, search, page, managerIds }],
    queryFn: () =>
      audioService.getAll({
        page,
        limit: LIMIT,
        period,
        search: search || undefined,
        managerIds,
      }),
  });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const files = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className={embedded ? "space-y-5" : "px-4 md:px-6 py-4 space-y-5 max-w-7xl mx-auto"}>
      {!embedded && (
        <SectionHeader
          title="Audio"
          icon={<Headphones size={20} />}
          subtitle="Qo'ng'iroq yozuvlari va AI tahlil"
          actions={
            can("audio", "upload_audio") ? (
              <Button variant="primary" size="md" onClick={() => navigate("/audio/upload")}>
                <Upload size={16} /> Yuklash
              </Button>
            ) : undefined
          }
        />
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-card border border-border">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setPeriod(p.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                period === p.key ? "bg-accent text-white" : "text-secondary hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSearch} className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-secondary, #94a3b8)" }}
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Fayl yoki telefon..."
            className="pl-9 pr-3 py-2 rounded-xl bg-card border border-border text-sm w-56 focus:outline-none focus:border-accent"
            style={{ color: "var(--text-primary, #fff)" }}
          />
        </form>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          title="Audio topilmadi"
          message={
            can("audio", "upload_audio")
              ? "Hali qo'ng'iroq yuklanmagan — birinchi audioni yuklang"
              : "Tanlangan davr uchun qo'ng'iroq yozuvlari yo'q"
          }
          action={
            can("audio", "upload_audio")
              ? { label: "Audio yuklash", onClick: () => navigate("/audio/upload") }
              : undefined
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((f) => (
              <AudioFileCard key={f.id} file={f} onClick={() => navigate(`/audio/${f.id}`)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg bg-card border border-border disabled:opacity-40"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-lg bg-card border border-border disabled:opacity-40"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AudioFilesPage;
