import React, { useEffect, useState } from "react";
import { X, Sparkles, Heart, Trophy, Megaphone } from "lucide-react";
import { announcementsService } from "../services/announcements.service";
import { renderTelegramMarkdown } from "./TelegramEditor";

const KIND_STYLE: Record<string, { gradient: string; icon: React.ReactNode; title: string }> = {
  motivation: {
    gradient: "from-amber-500 via-orange-500 to-rose-500",
    icon: <Sparkles size={48} className="text-white" />,
    title: "MOTIVATSIYA",
  },
  encouragement: {
    gradient: "from-blue-500 via-indigo-500 to-purple-500",
    icon: <Heart size={48} className="text-white" />,
    title: "RAG'BAT",
  },
  celebration: {
    gradient: "from-emerald-400 via-teal-500 to-cyan-500",
    icon: <Trophy size={48} className="text-white" />,
    title: "TABRIK",
  },
  announcement: {
    gradient: "from-slate-700 via-slate-600 to-slate-500",
    icon: <Megaphone size={48} className="text-white" />,
    title: "E'LON",
  },
};

/**
 * Manager site'ga kirgan zahoti hali ko'rsatilmagan habar bo'lsa, katta ekran
 * modal sifatida chiqaradi. Habar turi (motivation/encouragement/celebration/announcement)
 * ga qarab rang va stili o'zgaradi.
 */
const AnnouncementBigScreen: React.FC = () => {
  const [item, setItem] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  const fetchUnshown = async () => {
    try {
      const it = await announcementsService.getUnshown();
      if (it) setItem(it);
    } catch {}
  };

  useEffect(() => {
    fetchUnshown().finally(() => setLoaded(true));
    const t = setInterval(fetchUnshown, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!item) return;
    announcementsService.markShown(item.id).catch(() => {});
  }, [item?.id]);

  if (!loaded || !item) return null;

  const style = KIND_STYLE[item.kind] || KIND_STYLE.announcement;

  const close = async () => {
    try {
      await announcementsService.markRead(item.id);
    } catch {}
    setItem(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md bg-black/60 animate-fade-in">
      <div className={`relative w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden bg-gradient-to-br ${style.gradient} text-white`}>
        <button
          onClick={close}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"
        >
          <X size={20} />
        </button>

        <div className="p-10 md:p-14 text-center">
          <div className="flex justify-center mb-6 animate-bounce-slow">
            <div className="w-24 h-24 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              {style.icon}
            </div>
          </div>
          <div className="text-[10px] tracking-[0.3em] font-bold text-white/70 mb-2">
            {style.title}
          </div>
          {item.title && (
            <h2 className="text-3xl md:text-4xl font-bold mb-4 drop-shadow-md">{item.title}</h2>
          )}
          <div
            className="text-lg md:text-xl leading-relaxed text-white/95 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: renderTelegramMarkdown(item.body) }}
          />
          {item.isAI && (
            <div className="mt-6 text-xs text-white/70 inline-flex items-center gap-1.5 bg-white/10 px-3 py-1 rounded-full">
              <Sparkles size={12} />
              AI tomonidan tayyorlangan
            </div>
          )}
          <div className="mt-8">
            <button
              onClick={close}
              className="px-8 py-3 rounded-xl bg-white text-slate-900 font-semibold hover:opacity-90 shadow-lg"
            >
              Tushundim — davom etish
            </button>
          </div>
        </div>

        <div className="px-6 py-2 text-center text-[11px] text-white/60 bg-black/10">
          Bu habar siz uchun katta ekranda chiqarildi · Profil → Habarlar bo'limida saqlanadi
        </div>
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
        .animate-fade-in { animation: fade-in 0.25s ease-out }
        @keyframes bounce-slow { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
        .animate-bounce-slow { animation: bounce-slow 2.5s ease-in-out infinite }
      `}</style>
    </div>
  );
};

export default AnnouncementBigScreen;
