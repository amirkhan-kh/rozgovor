import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  Upload,
  Sparkles,
  Video as VideoIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  Play,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import {
  managerVideosService,
  ManagerVideo,
  ManagerVideoStatus,
} from "../../../services/manager-videos.service";
import { useAuth } from "../../../store/authStore";

const SCENARIO_LABELS: Record<string, string> = {
  "arms-crossing-in": "Qo'l chalishtirib kirish",
  "walk-in-confetti": "Konfetti bilan kirish",
  "celebration-jump": "Sakrash bilan nishonlash",
  "handshake-deal": "Bitim qo'l berish",
  "trophy-raise": "Sovrin ko'tarish",
};

const scenarioLabel = (v: ManagerVideo): string => {
  if (SCENARIO_LABELS[v.scenarioName]) return SCENARIO_LABELS[v.scenarioName];
  // Fallback — chiroyli formatlash
  const txt = v.scenarioName.replace(/-/g, " ").replace(/_/g, " ");
  return txt.charAt(0).toUpperCase() + txt.slice(1);
};

const StatusBadge: React.FC<{ status: ManagerVideoStatus }> = ({ status }) => {
  if (status === "ready") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium"
        style={{ backgroundColor: "#10b98122", color: "#10b981" }}
      >
        <CheckCircle2 size={12} /> Tayyor
      </span>
    );
  }
  if (status === "generating") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium"
        style={{ backgroundColor: "#3b82f622", color: "#3b82f6" }}
      >
        <Loader2 size={12} className="animate-spin" /> Tayyorlanmoqda
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium"
        style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
      >
        <AlertCircle size={12} /> Xatolik
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium"
      style={{ backgroundColor: "var(--color-border)", color: "var(--text-secondary)" }}
    >
      Kutilmoqda
    </span>
  );
};

const VideosTab: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { managerUser } = useAuth();
  const managerId = managerUser?.id || "";

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [extraPrompt, setExtraPrompt] = useState("");

  // ─── Queries ──────────────────────────────────────────────────────
  const { data: videos = [], isLoading } = useQuery({
    queryKey: ["manager-videos", managerId],
    queryFn: () => managerVideosService.listVideos(managerId),
    enabled: !!managerId,
    // Any video generating? → poll every 30s
    refetchInterval: (query) => {
      const list = query.state.data as ManagerVideo[] | undefined;
      if (!list) return false;
      return list.some((v) => v.status === "generating" || v.status === "pending")
        ? 30_000
        : false;
    },
  });

  // ─── Mutations ────────────────────────────────────────────────────
  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => managerVideosService.uploadPhoto(managerId, file),
    onSuccess: (data) => {
      setUploadedPhotoUrl(data.photoUrl);
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Rasm yuklandi");
    },
    onError: () => toast.error("Rasm yuklashda xatolik"),
  });

  const generateMutation = useMutation({
    mutationFn: () => managerVideosService.generateVideos(managerId, extraPrompt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-videos", managerId] });
      toast.success("5 ta video tayyorlanmoqda — ~5 daqiqa");
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || "Video yaratishda xatolik");
    },
  });

  // ─── Handlers ─────────────────────────────────────────────────────
  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Faqat rasm fayli (jpg/png)");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("Fayl juda katta (max 20MB)");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
      uploadPhotoMutation.mutate(file);
    },
    [uploadPhotoMutation]
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ─── Derived state ────────────────────────────────────────────────
  const hasPhotoSession = !!uploadedPhotoUrl || !!photoPreview;
  // Agar menejer avval rasm yuklab, video yaratgan bo'lsa — shu sessiyada rasm yo'q bo'lsa ham
  const hasAnyNonFailedVideo = videos.some((v) => v.status !== "failed");
  const hasPhoto = hasPhotoSession || hasAnyNonFailedVideo;
  const hasAnyVideo = videos.length > 0;
  const anyGenerating = videos.some((v) => v.status === "generating" || v.status === "pending");

  if (!managerId) {
    return (
      <div className="py-12 text-center text-secondary text-sm">
        Manager profil topilmadi
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Photo upload card ──────────────────────────────────── */}
      <div
        className="border rounded-xl p-6"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        <h3
          className="text-base font-medium mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Nishonlash videolari
        </h3>
        <p className="text-sm text-secondary mb-4">
          O'z rasmingizni yuklang — AI sizning 5 ta nishonlash videongizni yaratadi.
        </p>

        <div className="flex flex-col md:flex-row gap-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 border-2 border-dashed rounded-xl p-8 cursor-pointer text-center transition-colors"
            style={{
              borderColor: isDragging ? "var(--color-accent)" : "var(--color-border)",
              backgroundColor: isDragging
                ? "rgba(79, 70, 229, 0.05)"
                : "transparent",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
            {uploadPhotoMutation.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={28} className="animate-spin text-accent" />
                <p className="text-sm text-secondary">Yuklanmoqda...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={28} className="text-accent" />
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Rasm yuklash
                </p>
                <p className="text-xs text-secondary">
                  Drag-drop yoki bosing · JPG/PNG, max 20MB
                </p>
              </div>
            )}
          </div>

          {/* Preview */}
          <div
            className="w-full md:w-48 aspect-square rounded-xl overflow-hidden border flex items-center justify-center shrink-0"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
            }}
          >
            {photoPreview ? (
              <img
                src={photoPreview}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon size={40} className="text-secondary opacity-40" />
            )}
          </div>
        </div>

        {/* Extra prompt */}
        <div className="mt-4">
          <label
            className="block text-xs font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Qo'shimcha ko'rsatma (ixtiyoriy) — yuzni o'zgartirmaslik saqlanadi
          </label>
          <textarea
            value={extraPrompt}
            onChange={(e) => setExtraPrompt(e.target.value)}
            placeholder="Masalan: wearing a white shirt, background with office..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl text-sm resize-none focus:outline-none"
            style={{
              backgroundColor: "var(--ds-bg-overlay, rgba(0,0,0,0.03))",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>

        {/* Generate button */}
        <div className="mt-3 flex items-center gap-3">
          <Button
            onClick={() => generateMutation.mutate()}
            loading={generateMutation.isPending}
            disabled={!hasPhoto || anyGenerating}
          >
            <Sparkles size={14} />
            {hasAnyVideo ? "Qayta yaratish" : "5 ta video yaratish"}
          </Button>
          {anyGenerating && (
            <span className="text-xs text-secondary">
              Tayyorlanmoqda ~5 daqiqa. Sahifani yopib qo'ysangiz ham davom etadi.
            </span>
          )}
          {!hasPhoto && !hasAnyVideo && (
            <span className="text-xs text-secondary">
              Avval rasm yuklang
            </span>
          )}
        </div>
      </div>

      {/* ─── Video grid ───────────────────────────────────────────── */}
      <div>
        <h3
          className="text-base font-medium mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Videolar
        </h3>

        {isLoading ? (
          <div className="py-12 text-center text-secondary text-sm">
            Yuklanmoqda...
          </div>
        ) : !hasAnyVideo ? (
          <div
            className="py-12 text-center rounded-xl border"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
            }}
          >
            <VideoIcon
              size={40}
              className="mx-auto mb-2 text-secondary opacity-50"
            />
            <p className="text-sm text-secondary">
              Hali video yaratilmagan
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {videos
              .slice()
              .sort((a, b) => a.scenarioId - b.scenarioId)
              .map((v) => {
                const clickable = v.status === "ready" && !!v.videoUrl;
                return (
                  <div
                    key={v.id}
                    onClick={() =>
                      clickable && navigate(`/manager-videos/${v.id}`)
                    }
                    className={`group rounded-xl border overflow-hidden transition-all ${
                      clickable
                        ? "cursor-pointer hover:border-accent"
                        : "cursor-default opacity-80"
                    }`}
                    style={{
                      backgroundColor: "var(--color-card-bg)",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    {/* Thumbnail / video area */}
                    <div
                      className="aspect-video w-full relative flex items-center justify-center bg-black/70"
                      style={{ backgroundColor: "#0a0a0f" }}
                    >
                      {v.thumbnailUrl ? (
                        <img
                          src={v.thumbnailUrl}
                          alt={scenarioLabel(v)}
                          className="w-full h-full object-cover"
                        />
                      ) : v.status === "generating" ? (
                        <Loader2
                          size={32}
                          className="animate-spin"
                          style={{ color: "#3b82f6" }}
                        />
                      ) : v.status === "failed" ? (
                        <AlertCircle size={32} style={{ color: "#ef4444" }} />
                      ) : (
                        <VideoIcon size={32} className="text-white/50" />
                      )}
                      {clickable && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: "rgba(255,255,255,0.92)",
                              boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
                            }}
                          >
                            <Play
                              size={26}
                              style={{ color: "#1f2937", fill: "#1f2937" }}
                            />
                          </div>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <StatusBadge status={v.status} />
                      </div>
                      {v.finalVideoUrl && (
                        <div
                          className="absolute bottom-2 left-2 text-xs px-2 py-0.5 rounded-md font-medium"
                          style={{
                            backgroundColor: "#10b98122",
                            color: "#10b981",
                          }}
                        >
                          Musiqa qo'shilgan
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-3">
                      <div
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--text-primary)" }}
                        title={scenarioLabel(v)}
                      >
                        {scenarioLabel(v)}
                      </div>
                      <div className="text-xs text-secondary mt-0.5">
                        Ssenariy #{v.scenarioId}
                      </div>
                      {v.status === "failed" && v.errorMessage && (
                        <div
                          className="text-xs mt-1 truncate"
                          style={{ color: "#ef4444" }}
                          title={v.errorMessage}
                        >
                          {v.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideosTab;
