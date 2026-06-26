import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText } from "lucide-react";
import { audioService } from "../../services/audio.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

const PublicTranscriptionPage: React.FC = () => {
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
          <FileText size={20} style={{ color: "#2fcc6e" }} />
          <span className="font-semibold" style={{ color: "var(--text-primary, #fff)" }}>
            Transkript
          </span>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-4xl mx-auto space-y-4">
        <Link
          to={`/shared/audio/${token}`}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
        >
          <ArrowLeft size={15} /> Audioga qaytish
        </Link>

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
          <Card title={file.fileName}>
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
    </div>
  );
};

export default PublicTranscriptionPage;
