import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  FileAudio,
  BarChart3,
  MessageSquare,
  Sparkles,
  Share2,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { audioService } from "../../services/audio.service";
import { usePermissions } from "../../hooks/usePermissions";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ScoreBadge from "../../components/ui/stats/ScoreBadge";
import AudioPlayer from "../../components/audio/AudioPlayer";
import AnalysisPanel from "../../components/audio/AnalysisPanel";
import AudioStatusBadge from "../../components/audio/AudioStatusBadge";

type Tab = "overview" | "analysis" | "transcript";

function formatDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const InfoRow: React.FC<{ label: string; value?: string | null }> = ({ label, value }) =>
  value ? (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span style={{ color: "var(--text-secondary, #94a3b8)" }}>{label}</span>
      <span className="text-right" style={{ color: "var(--text-primary, #e2e8f0)" }}>{value}</span>
    </div>
  ) : null;

const AudioDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>("overview");

  const { data: file, isLoading } = useQuery({
    queryKey: ["audio-detail", id],
    queryFn: () => audioService.getOne(id!),
    enabled: !!id,
  });

  const analyzeMut = useMutation({
    mutationFn: () => audioService.analyzeOne(id!),
    onSuccess: () => {
      toast.success("Tahlil navbatga qo'shildi");
      queryClient.invalidateQueries({ queryKey: ["audio-detail", id] });
    },
    onError: () => toast.error("Tahlilni boshlashda xatolik"),
  });

  const deleteMut = useMutation({
    mutationFn: () => audioService.remove(id!),
    onSuccess: () => {
      toast.success("Audio o'chirildi");
      queryClient.invalidateQueries({ queryKey: ["audio-files"] });
      navigate("/audio");
    },
    onError: () => toast.error("O'chirishda xatolik"),
  });

  const shareMut = useMutation({
    mutationFn: () => audioService.createShareLink(id!),
    onSuccess: ({ token }) => {
      const url = `${window.location.origin}/shared/audio/${token}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Ulashish havolasi nusxalandi");
      queryClient.invalidateQueries({ queryKey: ["audio-detail", id] });
    },
    onError: () => toast.error("Havola yaratishda xatolik"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!file) {
    return (
      <div className="px-4 md:px-6 py-10 text-center" style={{ color: "var(--text-secondary, #94a3b8)" }}>
        Audio topilmadi.{" "}
        <Link to="/audio" className="text-accent">
          Ro'yxatga qaytish
        </Link>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Umumiy", icon: <FileAudio size={16} /> },
    { key: "analysis", label: "Tahlil", icon: <BarChart3 size={16} /> },
    { key: "transcript", label: "Transkript", icon: <MessageSquare size={16} /> },
  ];

  return (
    <div className="px-4 md:px-6 py-4 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/5">
          <ArrowLeft size={18} />
        </button>
        <Link to="/audio" className="hover:text-white">
          Audio
        </Link>
        <span>/</span>
        <span className="truncate" style={{ color: "var(--text-primary, #fff)" }}>
          {file.fileName}
        </span>
      </div>

      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ color: "var(--text-primary, #fff)" }}>
              {file.fileName}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <AudioStatusBadge status={file.status} />
              <span className="text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                {formatDuration(file.duration)}
              </span>
            </div>
          </div>
          {file.analysis && <ScoreBadge score={file.analysis.overallScore} size="lg" />}
        </div>

        <div className="mt-4">
          <AudioPlayer src={audioService.streamUrl(file.id)} />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {can("audio", "upload_audio") && (
            <Button
              variant="primary"
              size="sm"
              loading={analyzeMut.isPending}
              onClick={() => analyzeMut.mutate()}
            >
              <Sparkles size={15} /> {file.analysis ? "Qayta tahlil" : "Tahlil qilish"}
            </Button>
          )}
          {can("audio", "upload_audio") && (
            <Button variant="secondary" size="sm" loading={shareMut.isPending} onClick={() => shareMut.mutate()}>
              <Share2 size={15} /> Ulashish
            </Button>
          )}
          <Link to={`/audio/${file.id}/transcription`}>
            <Button variant="secondary" size="sm">
              <ExternalLink size={15} /> Transkript
            </Button>
          </Link>
          {can("audio", "delete") && (
            <Button
              variant="danger"
              size="sm"
              loading={deleteMut.isPending}
              onClick={() => {
                if (window.confirm("Audioni o'chirishni tasdiqlaysizmi?")) deleteMut.mutate();
              }}
            >
              <Trash2 size={15} /> O'chirish
            </Button>
          )}
        </div>
      </Card>

      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-card border border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? "bg-accent text-white" : "text-secondary hover:text-white"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Card>
          <InfoRow label="Menejer" value={file.manager?.name} />
          <InfoRow label="Telefon" value={file.phoneNumber} />
          <InfoRow label="Voronka" value={file.pipelineName} />
          <InfoRow label="Status (CRM)" value={file.statusName} />
          <InfoRow label="Manba" value={file.sourceName} />
          <InfoRow
            label="Qo'ng'iroq sanasi"
            value={file.callDate ? new Date(file.callDate).toLocaleString("uz-UZ") : null}
          />
          <InfoRow label="Sotuv" value={file.isSale ? "Ha" : "Yo'q"} />
        </Card>
      )}

      {tab === "analysis" &&
        (file.analysis ? (
          <AnalysisPanel analysis={file.analysis} />
        ) : (
          <Card>
            <p className="text-sm text-center py-4" style={{ color: "var(--text-secondary, #94a3b8)" }}>
              Bu qo'ng'iroq hali tahlil qilinmagan.
            </p>
          </Card>
        ))}

      {tab === "transcript" && (
        <Card>
          {file.transcription ? (
            <pre
              className="whitespace-pre-wrap text-sm font-sans leading-relaxed"
              style={{ color: "var(--text-secondary, #cbd5e1)" }}
            >
              {file.transcription}
            </pre>
          ) : (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-secondary, #94a3b8)" }}>
              Transkript mavjud emas.
            </p>
          )}
        </Card>
      )}
    </div>
  );
};

export default AudioDetailPage;
