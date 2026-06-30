import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Pause, User, Bot, Phone, Download, FileText, FileType, Music, ChevronDown } from "lucide-react";
import EditIcon from "../../components/icons/EditIcon";
// jsPDF dynamic import — crash oldini olish
const getJsPDF = () => import("jspdf").then(m => m.default);
import Skeleton from "../../components/ui/Skeleton";
import { audioService } from "../../services/audio.service";
import { useAuth } from "../../store/authStore";
import AIChat from "../../components/audio/AIChat";

interface Message {
  speaker: string;
  text: string;
  time: string;
  seconds: number;
}

const parseTime = (timeStr: string): number => {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
};

const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const parseTranscription = (text: string | null): Message[] => {
  if (!text) return [];
  const lines = text.split("\n").filter((l) => l.trim());
  return lines
    .map((line, idx) => {
      // [[00:15]] Menejer: text  YOKI  [00:15] Menejer: text  (har ikki qavs formati)
      const timedMatch = line.match(/^\[{1,2}(\d{1,2}:\d{2}(?::\d{2})?)\]{1,2}\s*(Menejer|Mijoz|Tizim|Manager|Client|System)[\s:]+(.+)/i);
      if (timedMatch) {
        return {
          speaker: timedMatch[2],
          text: timedMatch[3].trim(),
          time: timedMatch[1],
          seconds: parseTime(timedMatch[1]),
        };
      }
      // Menejer: text (timestamp yo'q)
      const match = line.match(/^(Menejer|Mijoz|Tizim|Manager|Client|System)[\s:]+(.+)/i);
      if (match) {
        return { speaker: match[1], text: match[2].trim(), time: "00:00", seconds: 0 };
      }
      // Noma'lum format — default qilib "Menejer" qo'ymaymiz (bu bug'ga olib keladi).
      // O'rniga avvalgi xabar speaker'ini kengaytiramiz (oddiy davom sifatida).
      return { speaker: "__UNKNOWN__", text: line.trim(), time: "00:00", seconds: 0, _idx: idx };
    })
    // Tizim/System xabarlari va noma'lum format qatorlarini chiqarib tashlash
    .filter((msg) => {
      const s = msg.speaker.toLowerCase();
      if (s === "__unknown__") return false;
      return !s.includes("tizim") && !s.includes("system");
    });
};

const messagesToTranscriptionText = (messages: Message[]): string => {
  return messages.map((msg) => `[${msg.time}] ${msg.speaker}: ${msg.text}`).join("\n");
};

// ── Waveform komponent — vertikal barlar, voice-line uslubi ───
// Deterministik pattern (seeded) — har render bir xil ko'rinadi
const BAR_COUNT = 96;
const WAVE_BARS = (() => {
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    // Bir nechta sinus + noise bilan tabiiy ko'rinadigan naqsh
    const s1 = Math.sin(i * 0.35) * 0.35;
    const s2 = Math.sin(i * 0.12 + 1.1) * 0.25;
    const s3 = Math.sin(i * 0.87 + 0.4) * 0.15;
    const base = 0.4 + (s1 + s2 + s3);
    // [0.15..1] oralig'ida
    bars.push(Math.max(0.15, Math.min(1, base)));
  }
  return bars;
})();

const Waveform: React.FC<{
  currentTime: number;
  duration: number;
  onSeek: (t: number) => void;
}> = ({ currentTime, duration, onSeek }) => {
  const progress = duration > 0 ? currentTime / duration : 0;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    onSeek(percent * duration);
  };

  return (
    <div
      className="relative w-full flex items-center gap-[2px] h-10 cursor-pointer select-none"
      onClick={handleClick}
    >
      {WAVE_BARS.map((h, i) => {
        const barProgress = i / BAR_COUNT;
        const played = barProgress <= progress;
        return (
          <div
            key={i}
            className="flex-1 rounded-[2px] transition-colors"
            style={{
              height: `${Math.round(h * 100)}%`,
              backgroundColor: played ? "#3b5ef5" : "rgba(59,94,245,0.25)",
              minHeight: 3,
            }}
          />
        );
      })}
    </div>
  );
};

const TranscriptionPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const startTime = searchParams.get("t");
  const audioRef = useRef<HTMLAudioElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const downloadRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioBuffering, setAudioBuffering] = useState(!!startTime);
  // User chat panelda qo'lda scroll qilsa avtomatik scroll vaqtincha o'chadi
  const userScrolledAtRef = useRef<number>(0);
  const [activeMessageIndex, setActiveMessageIndex] = useState(-1);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editSpeaker, setEditSpeaker] = useState("");
  const [editTime, setEditTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[] | null>(null);

  const { isAuthenticated } = useAuth();

  const { data: transcriptionData, isLoading: transLoading } = useQuery({
    queryKey: ["transcription", id],
    queryFn: () => audioService.getTranscription(id!),
    enabled: !!id,
  });

  const { data: audioFile, isLoading: audioLoading } = useQuery({
    queryKey: ["audio", id],
    queryFn: () => audioService.getOne(id!),
    enabled: !!id,
  });

  const parsedMessages = parseTranscription(transcriptionData?.transcription || null);
  const messages = localMessages || parsedMessages;

  // Sync localMessages when transcriptionData changes and we're not editing
  useEffect(() => {
    if (editingIndex === null) {
      setLocalMessages(null);
    }
  }, [transcriptionData]);

  // Close download menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(e.target as Node)) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Audio URL'ni faqat id o'zgarganda qayta hisoblaymiz — render'da yangi reference
  // bo'lib audio element reload bo'lmasligi uchun.
  const audioUrl = useMemo(() => audioService.streamUrl(id!), [id]);

  // Faqat chat panelni scroll qiladi — sahifaning o'zi qimirlamaydi.
  // offsetTop static container'da noto'g'ri natija beradi, shuning uchun
  // getBoundingClientRect orqali container'ga nisbatan haqiqiy offset olamiz.
  const scrollChatToMessage = useCallback(
    (idx: number, smooth: boolean = true) => {
      const container = chatContainerRef.current;
      const el = messageRefs.current.get(idx);
      if (!container || !el) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const offsetWithinContainer =
        eRect.top - cRect.top + container.scrollTop;
      const target =
        offsetWithinContainer - container.clientHeight / 2 + el.clientHeight / 2;
      container.scrollTo({
        top: Math.max(0, target),
        behavior: smooth ? "smooth" : "auto",
      });
    },
    []
  );

  // Audio time update — active message ni aniqlash
  const handleTimeUpdate = useCallback(() => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    setCurrentTime(time);

    // Hozirgi vaqtga mos xabarni topish
    let activeIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].seconds <= time) {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx !== activeMessageIndex) {
      setActiveMessageIndex(activeIdx);
      // Foydalanuvchi qo'lda scroll qilgan bo'lsa, 4 soniya tinch qoldiramiz.
      // isPlaying React state'ini emas, audio.paused ni tekshiramiz — state batching
      // tufayli closure eski qiymatni ushlab qolishi mumkin.
      const since = Date.now() - userScrolledAtRef.current;
      const playing = audioRef.current ? !audioRef.current.paused : false;
      if (playing && since > 4000) {
        scrollChatToMessage(activeIdx, true);
      }
    }
  }, [messages, activeMessageIndex, scrollChatToMessage]);

  // Xabarga bosilganda audio shu vaqtga o'tadi (Prosales uslubida)
  const seekToMessage = (seconds: number, idx?: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      if (!isPlaying) {
        audioRef.current.play();
        setIsPlaying(true);
      }
      if (typeof idx === "number") {
        userScrolledAtRef.current = 0;
        requestAnimationFrame(() => scrollChatToMessage(idx, true));
      }
    }
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (isPlaying) {
      a.pause();
      setIsPlaying(false);
    } else {
      a.play();
      setIsPlaying(true);
    }
  };

  const changeSpeed = () => {
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const newRate = speeds[nextIdx];
    setPlaybackRate(newRate);
    if (audioRef.current) audioRef.current.playbackRate = newRate;
  };

  const isManager = (speaker: string): boolean => {
    const s = speaker.toLowerCase();
    return s.includes("menejer") || s.includes("manager") || s.includes("elyor") || s.includes("sotuvchi");
  };

  const isSystem = (speaker: string): boolean => {
    const s = speaker.toLowerCase();
    return s.includes("tizim") || s.includes("system");
  };

  const getSpeakerColor = (speaker: string): string => {
    if (isManager(speaker)) return "#3b5ef5";
    if (isSystem(speaker)) return "#7c7c9a";
    return "#2fcc6e";
  };

  // ===== EDIT FUNCTIONALITY =====
  const startEditing = (index: number) => {
    const msg = messages[index];
    setEditingIndex(index);
    setEditText(msg.text);
    setEditSpeaker(msg.speaker);
    setEditTime(msg.time);
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditText("");
    setEditSpeaker("");
    setEditTime("");
  };

  const saveEdit = async () => {
    if (editingIndex === null || !id) return;
    setSaving(true);
    try {
      const updatedMessages = messages.map((msg, i) => {
        if (i === editingIndex) {
          return {
            speaker: editSpeaker,
            text: editText,
            time: editTime,
            seconds: parseTime(editTime),
          };
        }
        return msg;
      });
      const fullText = messagesToTranscriptionText(updatedMessages);
      await audioService.updateTranscription(id, fullText);
      setLocalMessages(updatedMessages);
      queryClient.invalidateQueries({ queryKey: ["transcription", id] });
      cancelEditing();
    } catch (err) {
      console.error("Saqlashda xatolik:", err);
    } finally {
      setSaving(false);
    }
  };

  // ===== DOWNLOAD FUNCTIONALITY =====
  const getDocumentHeader = (): string => {
    const fileName = audioFile?.fileName || "Audio";
    const manager = audioFile?.manager?.name || "Menejer";
    const phone = audioFile?.phoneNumber || "-";
    const dur = audioFile?.duration ? formatTime(audioFile.duration) : "-";
    const date = audioFile?.createdAt
      ? new Date(audioFile.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "-";
    return `Audio Fayl: ${fileName}\nMenejer: ${manager}\nTelefon: ${phone}\nDavomiyligi: ${dur}\nSana: ${date}`;
  };

  const getTranscriptionBody = (): string => {
    return messages.map((msg) => `[${msg.time}] ${msg.speaker}: ${msg.text}`).join("\n");
  };

  const downloadPDF = async () => {
    const jsPDF = await getJsPDF();
    const doc = new jsPDF();
    const headerText = getDocumentHeader();
    const bodyText = getTranscriptionBody();

    // Header
    doc.setFontSize(16);
    doc.text("Suhbat transkripsiyasi", 14, 20);

    doc.setFontSize(10);
    const headerLines = headerText.split("\n");
    let y = 32;
    headerLines.forEach((line) => {
      doc.text(line, 14, y);
      y += 6;
    });

    // Separator
    y += 4;
    doc.setDrawColor(200);
    doc.line(14, y, 196, y);
    y += 8;

    // Body
    doc.setFontSize(10);
    const bodyLines = bodyText.split("\n");
    bodyLines.forEach((line) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      // Wrap long lines
      const splitLines = doc.splitTextToSize(line, 175);
      splitLines.forEach((sl: string) => {
        if (y > 280) {
          doc.addPage();
          y = 20;
        }
        doc.text(sl, 14, y);
        y += 5;
      });
    });

    const safeName = (audioFile?.fileName || "transcription").replace(/\.[^.]+$/, "");
    doc.save(`${safeName}.pdf`);
    setShowDownloadMenu(false);
  };

  const downloadWord = () => {
    const headerText = getDocumentHeader();
    const bodyText = getTranscriptionBody();

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office'
            xmlns:w='urn:schemas-microsoft-com:office:word'
            xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; font-size: 12pt; }
          h1 { font-size: 18pt; color: #333; }
          .header { margin-bottom: 16px; color: #555; font-size: 11pt; }
          .header p { margin: 2px 0; }
          hr { border: 1px solid #ccc; margin: 16px 0; }
          .line { margin: 4px 0; font-size: 11pt; }
          .time { color: #888; }
          .speaker { font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Suhbat transkripsiyasi</h1>
        <div class="header">
          ${headerText.split("\n").map((l) => `<p>${l}</p>`).join("")}
        </div>
        <hr/>
        ${bodyText.split("\n").map((line) => {
          const match = line.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.+)/);
          if (match) {
            return `<div class="line"><span class="time">[${match[1]}]</span> <span class="speaker">${match[2]}:</span> ${match[3]}</div>`;
          }
          return `<div class="line">${line}</div>`;
        }).join("")}
      </body>
      </html>
    `;

    const blob = new Blob(["﻿", htmlContent], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (audioFile?.fileName || "transcription").replace(/\.[^.]+$/, "");
    a.href = url;
    a.download = `${safeName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setShowDownloadMenu(false);
  };

  const downloadAudio = () => {
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = audioFile?.fileName || "audio.mp3";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowDownloadMenu(false);
  };

  if (transLoading || audioLoading) {
    return (
      <div className="space-y-4">
        {/* Header: back button + title | download button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" rounded="lg" />
            <Skeleton className="h-6 w-24" />
          </div>
          <Skeleton className="h-9 w-36" rounded="xl" />
        </div>
        {/* Metadata card with 5 items */}
        <div className="border rounded-xl p-3 md:p-5" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
          <Skeleton className="h-4 w-32 mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-x-3 md:gap-x-6 gap-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-16 mb-1" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        {/* Audio player bar */}
        <div className="border rounded-xl p-3 md:p-5" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
          <Skeleton className="h-4 w-16 mb-4" />
          <div className="border rounded-xl p-4" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <Skeleton className="w-12 h-12" rounded="full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-1.5 w-full" rounded="full" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
              <Skeleton className="h-8 w-12" rounded="lg" />
            </div>
          </div>
          {/* Chat messages - alternating left/right */}
          <div className="space-y-4 mt-6">
            {Array.from({ length: 6 }).map((_, i) => {
              const isRight = i % 2 === 0;
              return (
                <div key={i}>
                  <div className={`flex items-center gap-2 mb-1.5 ${isRight ? "justify-end" : ""}`}>
                    {!isRight && <Skeleton className="w-7 h-7" rounded="full" />}
                    <Skeleton className="h-3 w-16" />
                    {isRight && <Skeleton className="w-7 h-7" rounded="full" />}
                  </div>
                  <div className={`flex ${isRight ? "justify-end" : ""}`}>
                    <Skeleton className={`h-16 ${isRight ? "w-3/5" : "w-2/3"}`} rounded="xl" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const managerName = audioFile?.manager?.name || "Menejer";

  return (
    <div className="space-y-4 overflow-hidden pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => navigate(`/audio/${id}`)}
            className="p-1.5 sm:p-2 text-secondary hover:text-white transition-colors shrink-0"
            aria-label="Ortga"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-base sm:text-lg font-semibold text-white truncate">Suhbat</h2>
        </div>

        {/* Download Dropdown */}
        <div className="relative shrink-0" ref={downloadRef}>
          <button
            onClick={() => setShowDownloadMenu(!showDownloadMenu)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-accent rounded-lg hover:bg-accent/80 transition-colors text-xs sm:text-sm font-medium"
            style={{ color: "#ffffff" }}
          >
            <Download size={14} />
            <span className="inline">Yuklab olish</span>
            <span className="sm:hidden">PDF/Word</span>
            <ChevronDown size={12} className={`transition-transform ${showDownloadMenu ? "rotate-180" : ""}`} />
          </button>

          {showDownloadMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
              <button
                onClick={downloadPDF}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-primary transition-colors"
              >
                <FileText size={16} className="text-red-400" />
                PDF
              </button>
              <button
                onClick={downloadWord}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-primary transition-colors"
              >
                <FileType size={16} className="text-blue-400" />
                Word
              </button>
              <button
                onClick={downloadAudio}
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-primary transition-colors"
              >
                <Music size={16} className="text-green-400" />
                Audio
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Audio ma'lumotlari */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Audio ma'lumotlari</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-x-3 md:gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="text-xs text-secondary mb-1">Audio Fayl</div>
            <div className="text-sm truncate" style={{ color: "var(--text-primary, #fff)" }} title={audioFile?.fileName}>{audioFile?.fileName || "—"}</div>
          </div>
          <div className="min-w-0">
            <div className="text-xs text-secondary mb-1">Menejer</div>
            <div className="text-sm" style={{ color: "var(--text-primary, #fff)" }}>{managerName}</div>
          </div>
          <div>
            <div className="text-xs text-secondary mb-1">Telefon raqami</div>
            <div className="text-sm text-white">{audioFile?.phoneNumber || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-secondary mb-1">Davomiyligi</div>
            <div className="text-sm text-white">{audioFile?.duration ? formatTime(audioFile.duration) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-secondary mb-1">Sana</div>
            <div className="text-sm text-white">
              {audioFile?.createdAt ? new Date(audioFile.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Suhbat */}
      <div className="bg-card border border-border rounded-xl p-3 md:p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Suhbat</h3>

        {/* Audio Player — sticky */}
        <div className="bg-primary border border-border rounded-xl p-3 md:p-4 mb-4 sticky top-14 md:top-16 z-20">
          <audio
            ref={audioRef}
            src={audioUrl}
            preload="metadata"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={() => {
              if (audioRef.current) {
                setDuration(audioRef.current.duration);
                setAudioBuffering(false);
                if (startTime) {
                  const t = parseFloat(startTime);
                  if (!isNaN(t) && t > 0) {
                    audioRef.current.currentTime = t;
                    audioRef.current.play();
                    setIsPlaying(true);
                  }
                }
              }
            }}
            onWaiting={() => setAudioBuffering(true)}
            onCanPlay={() => setAudioBuffering(false)}
            onCanPlayThrough={() => setAudioBuffering(false)}
            onLoadedData={() => setAudioBuffering(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onPlaying={() => { setIsPlaying(true); setAudioBuffering(false); }}
            onError={(e) => {
              const a = e.currentTarget as HTMLAudioElement;
              console.error("Audio load error:", a.error?.code, a.error?.message, a.src);
              setAudioBuffering(false);
            }}
            onEnded={() => setIsPlaying(false)}
          />

          {/* Audio loading */}
          {audioBuffering && (
            <div className="flex items-center justify-center py-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-secondary">Audio yuklanmoqda...</span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 md:gap-4">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-accent flex items-center justify-center text-white hover:bg-accent/80 transition-colors shrink-0"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
            </button>

            {/* Waveform — vertikal barlar, voiceline uslubi */}
            <div className="flex-1">
              <Waveform
                currentTime={currentTime}
                duration={duration}
                onSeek={(t) => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = t;
                    setCurrentTime(t);
                  }
                }}
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-secondary">{formatTime(currentTime)}</span>
                <span className="text-xs text-secondary">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Speed */}
            <button
              onClick={changeSpeed}
              className="px-2 md:px-3 py-1.5 bg-card border border-border rounded-lg text-xs md:text-sm text-white hover:bg-border transition-colors shrink-0"
            >
              {playbackRate}x
            </button>
          </div>
        </div>

        {/* Chat Transcription */}
        <div
          ref={chatContainerRef}
          className="space-y-4 max-h-[55vh] overflow-y-auto pr-2"
          onWheel={() => { userScrolledAtRef.current = Date.now(); }}
          onTouchMove={() => { userScrolledAtRef.current = Date.now(); }}
        >
          {messages.length > 0 ? (
            messages.map((msg, i) => {
              const manager = isManager(msg.speaker);
              const system = isSystem(msg.speaker);
              const isActive = i === activeMessageIndex;
              const speakerName = manager ? managerName : msg.speaker;
              const isEditing = editingIndex === i;

              return (
                <div
                  key={i}
                  ref={(el) => { if (el) messageRefs.current.set(i, el); }}
                  className={`transition-all duration-300 ${isActive ? "scale-[1.01]" : ""}`}
                >
                  {/* Speaker label */}
                  <div className={`flex items-center gap-2 mb-1.5 ${manager ? "justify-end" : ""}`}>
                    {!manager && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: getSpeakerColor(msg.speaker) + "20" }}
                      >
                        {system ? (
                          <Bot size={14} style={{ color: getSpeakerColor(msg.speaker) }} />
                        ) : (
                          <User size={14} style={{ color: getSpeakerColor(msg.speaker) }} />
                        )}
                      </div>
                    )}
                    <span
                      className="text-xs font-semibold"
                      style={{ color: getSpeakerColor(msg.speaker) }}
                    >
                      {speakerName}
                    </span>
                    {manager && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: getSpeakerColor(msg.speaker) + "20" }}
                      >
                        <Phone size={14} style={{ color: getSpeakerColor(msg.speaker) }} />
                      </div>
                    )}
                  </div>

                  {/* Message bubble or Edit form */}
                  <div className={`flex ${manager ? "justify-end" : ""}`}>
                    {isEditing ? (
                      <div className="max-w-[75%] w-full bg-primary border border-border rounded-2xl p-4 space-y-3">
                        {/* Edit textarea */}
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                        />

                        {/* Speaker and Timestamp */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-secondary">So'zlovchi:</span>
                            <select
                              value={editSpeaker}
                              onChange={(e) => setEditSpeaker(e.target.value)}
                              className="bg-card border border-border rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
                            >
                              <option value="Menejer">Menejer</option>
                              <option value="Mijoz">Mijoz</option>
                              <option value="Tizim">Tizim</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-secondary">Timestamp:</span>
                            <input
                              type="text"
                              value={editTime}
                              onChange={(e) => setEditTime(e.target.value)}
                              placeholder="00:00"
                              className="w-20 bg-card border border-border rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent"
                            />
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={cancelEditing}
                            className="px-4 py-1.5 text-sm text-secondary hover:text-white border border-border rounded-lg transition-colors"
                          >
                            Bekor qilish
                          </button>
                          <button
                            onClick={saveEdit}
                            disabled={saving}
                            className="px-4 py-1.5 text-sm text-white bg-accent rounded-lg hover:bg-accent/80 transition-colors disabled:opacity-50"
                          >
                            {saving ? "Saqlanmoqda..." : "Tayyor"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`flex items-center gap-2 group max-w-[75%] ${manager ? "flex-row-reverse" : ""}`}>
                        <div
                          ref={(el) => {
                            if (el && manager) {
                              el.style.cssText += "color: #ffffff !important;";
                              el.querySelectorAll("*").forEach((child) => {
                                (child as HTMLElement).style.cssText += "color: #ffffff !important;";
                              });
                            }
                          }}
                          className={`text-left px-4 py-3 rounded-2xl transition-all ${
                            manager
                              ? "bg-accent rounded-tr-sm"
                              : system
                              ? "bg-border/50 text-secondary rounded-tl-sm italic"
                              : "bg-primary border border-border rounded-tl-sm"
                          } ${isActive ? "ring-2 ring-accent/50 shadow-lg shadow-accent/10" : ""}`}
                        >
                          <div className="text-sm leading-relaxed">{msg.text}</div>
                          <div
                            className="flex items-center gap-1.5 mt-1.5 cursor-pointer hover:opacity-80"
                            onClick={() => seekToMessage(msg.seconds, i)}
                          >
                            <Play size={10} style={{ opacity: manager ? 0.7 : 0.5 }} />
                            <span style={{ fontSize: "10px", opacity: manager ? 0.7 : 0.5 }}>
                              {msg.time.length <= 5 ? `00:${msg.time}` : msg.time}
                            </span>
                          </div>
                        </div>
                        {isAuthenticated && (
                          <button
                            onClick={() => startEditing(i)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 bg-card border border-border rounded-lg text-secondary hover:text-white hover:bg-accent/20 transition-all shrink-0"
                            title="Tahrirlash"
                          >
                            <EditIcon size={13} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center">
              <p className="text-secondary">
                {transcriptionData?.transcription
                  ? transcriptionData.transcription
                  : "Transkripsiya mavjud emas"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* AI Chat */}
      {id && isAuthenticated && <AIChat audioId={id} />}
    </div>
  );
};

export default TranscriptionPage;
