import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface SaleEvent {
  managerId: string;
  managerName: string;
  videoUrl: string;
}

const WS_BASE = (() => {
  const api = import.meta.env.VITE_API_URL as string || "http://localhost:5002/api";
  return api.replace(/^http/, "ws").replace(/\/api$/, "");
})();

export function useLeaderboardWS(
  companyId: string | undefined,
  onSale: (e: SaleEvent) => void,
  enabled: boolean
) {
  const qc = useQueryClient();
  const onSaleRef = useRef(onSale);
  onSaleRef.current = onSale;

  useEffect(() => {
    if (!enabled || !companyId) return;

    const token = localStorage.getItem("token") ?? "";
    const url = `${WS_BASE}/ws?token=${token}`;
    let ws: WebSocket;
    let dead = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (dead) return;
      ws = new WebSocket(url);

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.companyId !== companyId) return;
          if (msg.type === "sale") {
            onSaleRef.current({ managerId: msg.managerId, managerName: msg.managerName, videoUrl: msg.videoUrl });
          } else if (msg.type === "refresh") {
            // Bitrix real-time o'zgarishi — barcha bog'liq sotuv ko'rsatkichlari
            qc.invalidateQueries({ queryKey: ["sales-leaderboard"] });
            qc.invalidateQueries({ queryKey: ["sales-overview"] });
            qc.invalidateQueries({ queryKey: ["sales-kelishilgan-tolov"] });
            qc.invalidateQueries({ queryKey: ["sales-task-stats"] });
            qc.invalidateQueries({ queryKey: ["managers-sales"] });
          }
        } catch {}
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (!dead) retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      dead = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [companyId, enabled]);
}
