import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Save } from "lucide-react";
import { audioService } from "../../services/audio.service";
import { usePermissions } from "../../hooks/usePermissions";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import LoadingSpinner from "../../components/ui/LoadingSpinner";

const TranscriptionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const editable = can("audio", "upload_audio");
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audio-transcription", id],
    queryFn: () => audioService.getTranscription(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (data?.transcription !== undefined) setText(data.transcription || "");
  }, [data?.transcription]);

  const saveMut = useMutation({
    mutationFn: () => audioService.updateTranscription(id!, text),
    onSuccess: () => toast.success("Transkript saqlandi"),
    onError: () => toast.error("Saqlashda xatolik"),
  });

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary, #94a3b8)" }}>
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/5">
          <ArrowLeft size={18} />
        </button>
        <Link to="/audio" className="hover:text-white">
          Audio
        </Link>
        <span>/</span>
        <span className="truncate" style={{ color: "var(--text-primary, #fff)" }}>
          {data?.fileName || "Transkript"}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <Card>
          {editable ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={20}
                className="w-full p-3 rounded-lg bg-primary border border-border text-sm font-sans leading-relaxed resize-y focus:outline-none focus:border-accent"
                style={{ color: "var(--text-primary, #e2e8f0)" }}
                placeholder="Transkript matni..."
              />
              <div className="mt-3">
                <Button variant="primary" size="sm" loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
                  <Save size={15} /> Saqlash
                </Button>
              </div>
            </>
          ) : text ? (
            <pre
              className="whitespace-pre-wrap text-sm font-sans leading-relaxed"
              style={{ color: "var(--text-secondary, #cbd5e1)" }}
            >
              {text}
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

export default TranscriptionPage;
