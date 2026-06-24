import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ArrowLeft, Upload, Download, Play, Pause,
  Volume2, VolumeX, Save, Sparkles, Loader2,
  Music2, CheckCircle2, AlertCircle, RefreshCw,
} from "lucide-react";
import {
  managerVideosService,
  ManagerVideo,
} from "../../services/manager-videos.service";
import MusicWaveform from "../../components/video/MusicWaveform";

const SCENARIO_LABELS: Record<string, string> = {
  "arms-crossing-in": "Qo'l chalishtirib kirish",
  "walk-in-confetti": "Konfetti bilan kirish",
  "celebration-jump": "Sakrash bilan nishonlash",
  "handshake-deal": "Bitim qo'l berish",
  "trophy-raise": "Sovrin ko'tarish",
};

const ACCENT = "#818cf8";

const scenarioLabel = (v: ManagerVideo) =>
  SCENARIO_LABELS[v.scenarioName] ||
  v.scenarioName.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

interface MusicState {
  url: string | null;
  audioDuration: number;
  startSec: number;
  endSec: number;
  volume: number;
  dirty: boolean;
  uploading: boolean;
  saving: boolean;
}

const ManagerVideoDetailPage: React.FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrent, setVideoCurrent] = useState(0);

  const [music, setMusic] = useState<MusicState>({
    url: null,
    audioDuration: 0,
    startSec: 0,
    endSec: 0,
    volume: 1,
    dirty: false,
    uploading: false,
    saving: false,
  });

  const { data: video, isLoading } = useQuery({
    queryKey: ["manager-video", videoId],
    queryFn: () => managerVideosService.getVideo(videoId!),
    enabled: !!videoId,
    refetchInterval: () => false,
  });

  // Server → local sync
  useEffect(() => {
    if (!video) return;
    setMusic((prev) => ({
      ...prev,
      url: video.musicUrl,
      startSec: video.musicStartSec ?? 0,
      endSec: video.musicEndSec ?? prev.endSec,
      volume: video.musicVolume ?? 1,
      dirty: false,
    }));
  }, [video?.id, video?.musicUrl, video?.musicStartSec, video?.musicEndSec, video?.musicVolume]);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, music.volume));
    }
  }, [music.volume]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const play = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      await v.play();
      const a = audioRef.current;
      if (a && music.url) {
        a.currentTime = music.startSec;
        a.volume = Math.max(0, Math.min(1, music.volume));
        await a.play().catch(() => {});
      }
      setIsPlaying(true);
    } catch { /* noop */ }
  }, [music.url, music.startSec, music.volume]);

  const onVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    setVideoCurrent(v.currentTime);
    const a = audioRef.current;
    if (a && music.url && (a.currentTime >= music.endSec || a.currentTime < music.startSec)) {
      a.currentTime = music.startSec;
    }
  };

  const handleAudioMetadata = (dur: number) => {
    setMusic((prev) => {
      const maxRange = videoDuration > 0 ? videoDuration : 8;
      const defaultEnd = prev.endSec > 0 ? prev.endSec : Math.min(dur, maxRange);
      return { ...prev, audioDuration: dur, endSec: defaultEnd };
    });
  };

  // Mutations
  const uploadMutation = useMutation({
    mutationFn: (file: File) => managerVideosService.uploadMusic(videoId!, file, 1),
    onMutate: () => setMusic((p) => ({ ...p, uploading: true })),
    onSuccess: (updated) => {
      queryClient.setQueryData(["manager-video", videoId], updated);
      toast.success("Musiqa yuklandi");
    },
    onError: () => {
      toast.error("Yuklashda xatolik");
      setMusic((p) => ({ ...p, uploading: false }));
    },
    onSettled: () => setMusic((p) => ({ ...p, uploading: false })),
  });

  const saveMutation = useMutation({
    mutationFn: ({ s, e, v }: { s: number; e: number; v: number }) =>
      managerVideosService.setMusicTrim(videoId!, { startSec: s, endSec: e, volume: v }, 1),
    onMutate: () => setMusic((p) => ({ ...p, saving: true })),
    onSuccess: (updated) => {
      queryClient.setQueryData(["manager-video", videoId], updated);
      toast.success("Saqlandi");
      setMusic((p) => ({ ...p, dirty: false, saving: false }));
    },
    onError: () => {
      toast.error("Saqlashda xatolik");
      setMusic((p) => ({ ...p, saving: false }));
    },
  });

  const renderMut = useMutation({
    mutationFn: () => managerVideosService.renderFinal(videoId!),
    onSuccess: (u) => {
      queryClient.setQueryData(["manager-video", videoId], u);
      toast.success("Yakuniy video tayyor!");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || "Render xatosi"),
  });

  const handleFileSelect = useCallback((file: File) => {
    const ok = file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg)$/i.test(file.name);
    if (!ok) { toast.error("Faqat audio fayl"); return; }
    if (file.size > 50 * 1024 * 1024) { toast.error("Maksimal hajm: 50MB"); return; }
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const handleRangeChange = useCallback(({ startSec, endSec }: { startSec: number; endSec: number }) => {
    setMusic((p) => ({ ...p, startSec, endSec, dirty: true }));
  }, []);

  const handleVolumeChange = (vol: number) => {
    setMusic((p) => ({ ...p, volume: vol, dirty: true }));
  };

  const handleSave = () => {
    if (!music.dirty || music.saving) return;
    saveMutation.mutate({ s: music.startSec, e: music.endSec, v: music.volume });
  };

  if (isLoading) return (
    <div className="py-20 flex flex-col items-center gap-3">
      <Loader2 size={28} className="animate-spin" style={{ color: ACCENT }} />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Yuklanmoqda...</p>
    </div>
  );
  if (!video) return (
    <div className="py-20 text-center">
      <AlertCircle size={36} className="mx-auto mb-3" style={{ color: "var(--text-secondary)" }} />
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Video topilmadi</p>
    </div>
  );

  const downloadUrl = video.finalVideoUrl || video.videoUrl;
  const maxRange = videoDuration > 0 ? videoDuration : 8;
  const volPct = Math.round(music.volume * 100);
  const canSave = !!music.url && music.dirty && !music.saving;

  return (
    <div className="space-y-5 pb-12 max-w-4xl mx-auto">

      {/* hidden audio element for preview */}
      {music.url && (
        <audio
          key={music.url}
          ref={audioRef}
          src={music.url}
          onLoadedMetadata={(e) => handleAudioMetadata((e.target as HTMLAudioElement).duration || 0)}
          preload="auto"
          style={{ display: "none" }}
        />
      )}

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFileSelect(f);
          e.target.value = "";
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl"
            style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-border)", color: "var(--text-secondary)" }}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "linear-gradient(135deg,#818cf8,#a78bfa)" }} />
              <h1 className="text-base font-bold truncate" style={{ color: "var(--text-primary)" }}>
                {scenarioLabel(video)}
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Ssenariy #{video.scenarioId}</p>
          </div>
        </div>
        {downloadUrl && (
          <a href={downloadUrl} download target="_blank" rel="noreferrer">
            <button
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-border)", color: "var(--text-primary)" }}
            >
              <Download size={14} /> Yuklab olish
            </button>
          </a>
        )}
      </div>

      {/* Video */}
      <div className="w-full rounded-2xl overflow-hidden" style={{ background: "#000", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
        <video
          key={video.videoUrl || "no-src"}
          ref={videoRef}
          src={video.videoUrl || undefined}
          muted={!!music.url}
          playsInline
          onLoadedMetadata={(e) => setVideoDuration((e.target as HTMLVideoElement).duration || 0)}
          onTimeUpdate={onVideoTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => pause()}
          onEnded={() => pause()}
          className="w-full"
          style={{ maxHeight: "58vh", display: "block" }}
          controls
        />
      </div>

      {/* Final video card */}
      {video.finalVideoUrl && (
        <div
          className="rounded-2xl p-4 flex items-center justify-between gap-3"
          style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.04))", border: "1px solid rgba(16,185,129,0.25)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(16,185,129,0.15)" }}>
              <CheckCircle2 size={16} style={{ color: "#10b981" }} />
            </div>
            <div>
              <div className="text-sm font-semibold" style={{ color: "#10b981" }}>Yakuniy video tayyor</div>
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {video.finalMixedAt ? new Date(video.finalMixedAt).toLocaleString() : "Mix qilingan"}
              </div>
            </div>
          </div>
          <a href={video.finalVideoUrl} download target="_blank" rel="noreferrer">
            <button className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold"
              style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
              <Download size={13} /> Yuklab olish
            </button>
          </a>
        </div>
      )}

      {/* Music editor card */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-border)" }}>

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
            <Music2 size={13} color="#fff" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Musiqa</div>
            <div className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
              Audio yuklang · trim handlerlari bilan kerakli qismni ajratib oling
            </div>
          </div>

          {music.url && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={music.uploading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                backgroundColor: "var(--color-card-bg)",
                border: "1px solid var(--color-border)",
                color: "var(--text-secondary)",
                opacity: music.uploading ? 0.5 : 1,
              }}
              title="Boshqa musiqa yuklash"
            >
              {music.uploading
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              Almashtirish
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4">
          {!music.url ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={music.uploading}
              className="w-full flex flex-col items-center justify-center gap-2 py-12 rounded-xl"
              style={{
                border: `1.5px dashed ${ACCENT}55`,
                background: `${ACCENT}06`,
                color: ACCENT,
                cursor: music.uploading ? "wait" : "pointer",
              }}
            >
              {music.uploading ? (
                <>
                  <Loader2 size={28} className="animate-spin" />
                  <span className="text-sm font-medium">Yuklanmoqda...</span>
                </>
              ) : (
                <>
                  <Upload size={28} />
                  <span className="text-sm font-semibold">Musiqa yuklash</span>
                  <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    mp3, m4a, wav, ogg · 50MB gacha
                  </span>
                </>
              )}
            </button>
          ) : (
            <div className="space-y-4">
              {/* Waveform with trim */}
              <MusicWaveform
                musicUrl={music.url}
                duration={music.audioDuration || 0}
                startSec={music.startSec}
                endSec={music.endSec}
                currentTimeSec={isPlaying ? videoCurrent + music.startSec : null}
                onChange={handleRangeChange}
                maxRangeSec={maxRange}
                accentColor={ACCENT}
              />

              {/* Volume + actions row */}
              <div className="flex items-center gap-3">
                {/* Volume */}
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-border)" }}>
                  <button
                    onClick={() => handleVolumeChange(music.volume > 0 ? 0 : 1)}
                    style={{ color: music.volume === 0 ? "#f87171" : ACCENT }}
                  >
                    {music.volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                  <div className="flex-1 relative h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${volPct}%`, background: ACCENT }} />
                    <input
                      type="range" min={0} max={1} step={0.01} value={music.volume}
                      onChange={(e) => handleVolumeChange(+e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-xs font-mono tabular-nums w-10 text-right"
                    style={{ color: ACCENT }}>
                    {volPct}%
                  </span>
                </div>

                {/* Preview */}
                <button
                  onClick={isPlaying ? pause : play}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                  style={{
                    background: isPlaying ? "rgba(239,68,68,0.15)" : `${ACCENT}26`,
                    color: isPlaying ? "#f87171" : ACCENT,
                    border: `1px solid ${isPlaying ? "rgba(239,68,68,0.3)" : `${ACCENT}55`}`,
                  }}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                  {isPlaying ? "To'xtatish" : "Preview"}
                </button>

                {/* Save trim */}
                {canSave && (
                  <button
                    onClick={handleSave}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
                    style={{
                      background: `${ACCENT}26`,
                      color: ACCENT,
                      border: `1px solid ${ACCENT}55`,
                    }}
                  >
                    {music.saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    Saqlash
                  </button>
                )}
              </div>

              {/* Render row */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Yakuniy video: musiqa + ism + “+1 SOTUV”
                </div>
                <button
                  onClick={() => renderMut.mutate()}
                  disabled={renderMut.isPending || music.dirty}
                  title={music.dirty ? "Avval saqlang" : "Final video yasash"}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold"
                  style={{
                    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                    color: "#fff",
                    boxShadow: "0 2px 12px rgba(79,70,229,0.35)",
                    opacity: renderMut.isPending || music.dirty ? 0.6 : 1,
                  }}
                >
                  {renderMut.isPending
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Sparkles size={13} />}
                  {renderMut.isPending ? "Render..." : "Yakuniy video yasash"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Video progress */}
      {videoDuration > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs"
          style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-border)", color: "var(--text-secondary)" }}>
          <div className="flex-1 h-1 rounded-full" style={{ backgroundColor: "var(--color-border)" }}>
            <div className="h-full rounded-full" style={{ width: `${(videoCurrent / videoDuration) * 100}%`, background: "linear-gradient(90deg,#818cf8,#a78bfa)" }} />
          </div>
          <span className="tabular-nums font-medium">{fmt(videoCurrent)} / {fmt(videoDuration)}</span>
        </div>
      )}

    </div>
  );
};

export default ManagerVideoDetailPage;
