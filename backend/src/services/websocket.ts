import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { URL } from "url";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../utils/prisma";
import { getFreshSale } from "./sale-state";

interface TaggedWs extends WebSocket {
  companyId?: string;
}

let wss: WebSocketServer | null = null;

export interface WsMessage {
  type: string;
  companyId?: string;
  [key: string]: unknown;
}

export function initWebSocket(httpServer: Server) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req, socket, head) => {
    if (!req.url) return;
    const u = new URL(req.url, `ws://${req.headers.host}`);
    if (u.pathname !== "/ws") return;

    wss?.handleUpgrade(req, socket, head, (ws) => {
      wss?.emit("connection", ws, req);
    });
  });

  wss.on("connection", async (ws: TaggedWs, req) => {
    try {
      const u = new URL(req.url!, `ws://${req.headers.host}`);
      const token = u.searchParams.get("token");
      if (!token) { ws.close(4001, "no token"); return; }

      const decoded = verifyToken(token);
      if (decoded.role === "manager") {
        const mgr = await prisma.manager.findUnique({ where: { id: decoded.id }, select: { companyId: true } });
        ws.companyId = mgr?.companyId;
      } else {
        ws.companyId = decoded.id;
      }
    } catch {
      ws.close(4001, "invalid token");
      return;
    }

    // Replay: TV ekran sotuvdan keyin kech ulansa ham celebration chiqsin
    // (oxirgi 2 daqiqadagi sotuv).
    const fresh = getFreshSale(ws.companyId);
    if (fresh) {
      try {
        ws.send(JSON.stringify(fresh));
      } catch {
        /* ignore */
      }
    }

    ws.on("error", () => {});
  });

  console.log("[ws] WebSocket server ready on /ws");
}

export function broadcast(msg: WsMessage) {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    const tagged = client as TaggedWs;
    if (client.readyState === WebSocket.OPEN && tagged.companyId === msg.companyId) {
      client.send(payload);
    }
  });
}

// Activity sync natijasini companyga real-time push qiladi.
// Payload — sync summary yoki bitta yangilangan activity.
export function emitActivityUpdate(
  companyId: string,
  payload: Record<string, unknown>
): void {
  broadcast({
    type: "activity:update",
    companyId,
    ...payload,
  });
}
