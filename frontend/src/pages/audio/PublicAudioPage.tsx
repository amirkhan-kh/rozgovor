import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { Headphones, FileText } from "lucide-react";
import { audioService } from "../../services/audio.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import AudioPlayer from "../../components/audio/AudioPlayer";
import AnalysisPanel from "../../components/audio/AnalysisPanel";

function formatDuration(sec: number | null): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const PublicAudioPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const { data: file, isLoading, isError } = useQuery({
    queryKey: ["shared-audio", token],
    queryFn: () => audioService.getSharedAudio(token!),
    enabled: !!token,
    retry: false,
  });

  return (
    <div className="min-h-screen bg-primary">
      <div className="border-b border-border">
        <div className="px-4 md:px-6 py-3 max-w-4xl mx-auto flex items-center gap-2">
          <Headphones size={20} style={{ color: "#2fcc6e" }} />
          <span className="font-semibold" style={{ color: "var(--text-primary, #fff)" }}>
            Qo'ng'iroq tahlili
          </span>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : isError || !file ? (
          <Card>
            <p className="text-center py-6 text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
              Havola faol emas yoki bekor qilingan.
            </p>
          </Card>
        ) : (
          <>
            <Card>
              <h1 className="text-lg font-bold truncate" style={{ color: "var(--text-primary, #fff)" }}>
                {file.fileName}
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                {file.manager?.name ? `${file.manager.name} · ` : ""}
                {formatDuration(file.duration)}
              </p>
              <div className="mt-4">
                <AudioPlayer src={audioService.publicStreamUrl(token!)} />
              </div>
              {file.transcription && (
                <Link
                  to={`/shared/audio/${token}/transcription`}
                  className="inline-flex items-center gap-1.5 mt-4 text-sm text-accent hover:underline"
                >
                  <FileText size={15} /> Transkriptni ko'rish
                </Link>
              )}
            </Card>

            {file.analysis && <AnalysisPanel analysis={file.analysis} />}
          </>
        )}
      </div>
    </div>
  );
};

export default PublicAudioPage;
