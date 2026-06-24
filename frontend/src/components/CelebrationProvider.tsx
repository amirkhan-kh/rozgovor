import React, { useCallback, useRef, useState } from "react";
import { useAuth } from "../store/authStore";
import { useLeaderboardWS, SaleEvent } from "../hooks/useLeaderboardWS";
import { CelebrationOverlay } from "./CelebrationOverlay";

// Global celebration — TV rejimga bog'liq emas. Tizimga kirgan har bir
// foydalanuvchida, qaysi sahifada bo'lishidan qat'i nazar, yangi sotuvda
// video chiqadi. MainLayout'ga bir marta mount qilinadi.
//
// Dedupe: backend'da WS qayta ulanganda `getFreshSale` 120s oyna ichidagi
// oxirgi sotuvni qayta yuboradi (kech ulangan TV uchun). Shu sababli bitta
// sotuv jonli broadcast + replay sifatida 2 marta kelishi mumkin. Quyidagi
// guard'lar:
//   1) Hozir celebration ko'rsatilayotgan bo'lsa — yangi event'ni tushiramiz.
//   2) Oxirgi 3 daqiqa ichida shu managerId+videoUrl juftligi ko'rsatilgan
//      bo'lsa — qayta ko'rsatmaymiz.
const DEDUPE_WINDOW_MS = 3 * 60_000;

const CelebrationProvider: React.FC = () => {
  const { user, managerUser } = useAuth();
  const companyId = user?.id ?? (managerUser as any)?.companyId;
  const [celebration, setCelebration] = useState<{ videoPath: string } | null>(
    null
  );
  const playingRef = useRef(false);
  const seenRef = useRef<Map<string, number>>(new Map());

  const handleSale = useCallback((e: SaleEvent) => {
    const key = `${e.managerId}|${e.videoUrl}`;
    const now = Date.now();
    const last = seenRef.current.get(key) ?? 0;
    if (playingRef.current) return; // overlap'ga yo'l qo'ymaymiz
    if (now - last < DEDUPE_WINDOW_MS) return; // replay (qayta ulanish)
    seenRef.current.set(key, now);
    // eski yozuvlarni tozalab turamiz (xotira oshib ketmasin)
    for (const [k, ts] of seenRef.current) {
      if (now - ts > DEDUPE_WINDOW_MS) seenRef.current.delete(k);
    }
    playingRef.current = true;
    setCelebration({ videoPath: e.videoUrl });
  }, []);

  // enabled = true → WS doim ulanadi (tvMode shart emas)
  useLeaderboardWS(companyId, handleSale, !!companyId);

  if (!celebration) return null;
  return (
    <CelebrationOverlay
      videoPath={celebration.videoPath}
      onEnd={() => {
        playingRef.current = false;
        setCelebration(null);
      }}
    />
  );
};

export default CelebrationProvider;
