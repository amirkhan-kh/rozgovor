// Vertex AI Live Exam — backend proxy WebSocket client.
//
// Browser to'g'ridan-to'g'ri Vertex Live'ga ulanolmaydi (Bearer header brauzerda
// yo'q). Shuning uchun backend proxy. Bu klient backend WS bilan JSON xabarlar
// almashadi:
//   send → { type: "audio", data: base64, mimeType }
//   recv → { type: "open" | "ai_audio" | "user_transcript" | "ai_transcript" | "turn_complete" | "error" | "close" }

export type LiveExamEvents = {
  onAiAudio: (pcm: Int16Array) => void;     // 24kHz PCM
  onAiTranscript: (text: string) => void;
  onUserTranscript: (text: string) => void;
  onTurnComplete: (userText: string, aiText: string) => void;
  onError: (err: Error) => void;
  onOpen: () => void;
  onClose: () => void;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}

function base64ToInt16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
}

export class GeminiLiveExamClient {
  private wsUrl: string;
  private events: LiveExamEvents;
  private ws: WebSocket | null = null;
  private closed = false;

  /**
   * @param wsUrl Backend proxy WebSocket URL (ws:// yoki wss://) — token query bilan
   */
  constructor(wsUrl: string, _model: string, events: LiveExamEvents) {
    this.wsUrl = wsUrl;
    this.events = events;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        // Server "open" xabari kelsa onOpen events bilan trigger qilinadi.
        // Connect promise faqat ws shartlilik o'rnatilganida resolve qilinadi.
        // Ammo ba'zi serverlar darhol "open" yubormaydi — shuning uchun
        // ws.onopen darhol resolve qilamiz, qolgan tarafni server xabarida hal qilamiz.
        opened = true;
        resolve();
      };

      ws.onmessage = (e: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(typeof e.data === "string" ? e.data : "");
          this.handleMessage(msg);
        } catch (err) {
          this.events.onError(err instanceof Error ? err : new Error(String(err)));
        }
      };

      ws.onerror = () => {
        if (!opened) {
          reject(new Error("WebSocket ulanishida xatolik"));
        }
        this.events.onError(new Error("WebSocket error"));
      };

      ws.onclose = () => {
        if (!this.closed) this.events.onClose();
      };
    });
  }

  private handleMessage(msg: { type: string; [k: string]: any }) {
    switch (msg.type) {
      case "open":
        this.events.onOpen();
        break;
      case "ai_audio":
        if (typeof msg.data === "string") {
          this.events.onAiAudio(base64ToInt16(msg.data));
        }
        break;
      case "user_transcript":
        if (typeof msg.text === "string") this.events.onUserTranscript(msg.text);
        break;
      case "ai_transcript":
        if (typeof msg.text === "string") this.events.onAiTranscript(msg.text);
        break;
      case "turn_complete":
        this.events.onTurnComplete(
          typeof msg.userText === "string" ? msg.userText : "",
          typeof msg.aiText === "string" ? msg.aiText : "",
        );
        break;
      case "error":
        this.events.onError(new Error(typeof msg.message === "string" ? msg.message : "Vertex Live xatolik"));
        break;
      case "close":
        this.close();
        break;
    }
  }

  sendAudio(pcm16kMono: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.closed) return;
    try {
      this.ws.send(JSON.stringify({
        type: "audio",
        data: arrayBufferToBase64(pcm16kMono),
        mimeType: "audio/pcm;rate=16000",
      }));
    } catch (err) {
      this.events.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws?.send(JSON.stringify({ type: "close" }));
    } catch { /* noop */ }
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
  }
}
