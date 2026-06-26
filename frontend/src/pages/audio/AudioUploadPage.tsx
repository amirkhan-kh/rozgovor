import React, { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Upload, FileAudio, X } from "lucide-react";
import { audioService } from "../../services/audio.service";
import SectionHeader from "../../components/ui/stats/SectionHeader";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";

const MAX_MB = 500;

const AudioUploadPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (formData: FormData) => audioService.upload(formData, setProgress),
    onSuccess: (uploaded) => {
      toast.success("Audio yuklandi");
      navigate(`/audio/${uploaded.id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || "Yuklashda xatolik";
      setError(msg);
      toast.error(msg);
      setProgress(0);
    },
  });

  const pickFile = (f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Fayl ${MAX_MB} MB dan oshmasligi kerak`);
      return;
    }
    if (!f.type.startsWith("audio/")) {
      setError("Faqat audio fayllar qabul qilinadi");
      return;
    }
    setError(null);
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  };

  const submit = () => {
    if (!file) {
      setError("Audio faylni tanlang");
      return;
    }
    const fd = new FormData();
    fd.append("audio", file); // backend: upload.single("audio")
    mutation.mutate(fd);
  };

  const uploading = mutation.isPending;

  return (
    <div className="px-4 md:px-6 py-4 max-w-2xl mx-auto">
      <SectionHeader title="Audio yuklash" icon={<Upload size={20} />} />

      <Card className="mt-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => !uploading && fileInput.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
            dragActive ? "border-accent bg-accent/5" : "border-border"
          }`}
        >
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileAudio size={28} style={{ color: "var(--text-primary, #fff)" }} />
              <div className="text-left">
                <p className="font-medium text-sm" style={{ color: "var(--text-primary, #fff)" }}>
                  {file.name}
                </p>
                <p className="text-xs" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              {!uploading && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    setProgress(0);
                  }}
                  className="p-1 rounded-lg hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ) : (
            <>
              <Upload size={32} className="mx-auto mb-2" style={{ color: "var(--text-secondary, #94a3b8)" }} />
              <p className="font-medium" style={{ color: "var(--text-primary, #fff)" }}>
                Audio faylni shu yerga olib keling
              </p>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary, #94a3b8)" }}>
                yoki bosib tanlang · maksimum {MAX_MB} MB
              </p>
            </>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])}
          />
        </div>

        {uploading && (
          <div className="mt-4">
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--color-border, #1f1f2a)" }}>
              <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: "#22c55e" }} />
            </div>
            <p className="text-xs text-center mt-2" style={{ color: "var(--text-secondary, #94a3b8)" }}>
              {progress}%
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "#ef444420", color: "#ef4444" }}>
            {error}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <Button variant="primary" loading={uploading} disabled={!file || uploading} onClick={submit}>
            Yuklash
          </Button>
          <Button variant="secondary" disabled={uploading} onClick={() => navigate("/audio")}>
            Bekor qilish
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default AudioUploadPage;
