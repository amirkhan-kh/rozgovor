import { useCallback, useEffect, useRef, useState } from "react";
import { voiceExamService } from "../services/voice-exam.service";
import { GeminiLiveExamClient } from "../services/gemini-live-exam.client";
import { createWorkletBlobUrl } from "../components/exam/audio-capture-worklet";

type Status = "idle" | "connecting" | "listening" | "speaking";

interface UseGeminiLiveExamArgs {
  sessionId: string | undefined;
  enabled: boolean;
}

interface TurnMessage {
  role: "salesperson" | "client";
  text: string;
  ts: number;
}

export interface UseGeminiLiveExamReturn {
  status: Status;
  micLevel: number;
  aiLevel: number;
  frequencyData: Uint8Array;
  lastUserText: string;
  lastAiText: string;
  messages: TurnMessage[];
  error: string | null;
  muted: boolean;
  toggleMute: () => void;
  disconnect: () => void;
}

const OUTPUT_SAMPLE_RATE = 24000;

export function useGeminiLiveExam({ sessionId, enabled }: UseGeminiLiveExamArgs): UseGeminiLiveExamReturn {
  const [status, setStatus] = useState<Status>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [aiLevel, setAiLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(() => new Uint8Array(64));
  const [lastUserText, setLastUserText] = useState("");
  const [lastAiText, setLastAiText] = useState("");
  const [messages, setMessages] = useState<TurnMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const clientRef = useRef<GeminiLiveExamClient | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserInRef = useRef<AnalyserNode | null>(null);
  const analyserOutRef = useRef<AnalyserNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);
  const playbackTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const disposedRef = useRef(false);
  const workletUrlRef = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    disposedRef.current = true;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try { workletNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { sourceNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { analyserInRef.current?.disconnect(); } catch { /* noop */ }
    try { analyserOutRef.current?.disconnect(); } catch { /* noop */ }
    try { outGainRef.current?.disconnect(); } catch { /* noop */ }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current && inputCtxRef.current.state !== "closed") {
      inputCtxRef.current.close().catch(() => {});
    }
    if (outputCtxRef.current && outputCtxRef.current.state !== "closed") {
      outputCtxRef.current.close().catch(() => {});
    }
    inputCtxRef.current = null;
    outputCtxRef.current = null;
    workletNodeRef.current = null;
    sourceNodeRef.current = null;
    analyserInRef.current = null;
    analyserOutRef.current = null;
    outGainRef.current = null;
    if (clientRef.current) {
      try { clientRef.current.close(); } catch { /* noop */ }
      clientRef.current = null;
    }
    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }
    setStatus("idle");
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      workletNodeRef.current?.port.postMessage({ type: "mute", muted: next });
      return next;
    });
  }, []);

  // Enqueue a chunk of PCM 24kHz for playback in sequence
  const enqueueAiAudio = useCallback((pcm: Int16Array) => {
    const ctx = outputCtxRef.current;
    const gain = outGainRef.current;
    if (!ctx || !gain) return;
    const float = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      float[i] = pcm[i] / 0x8000;
    }
    const buffer = ctx.createBuffer(1, float.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    const now = ctx.currentTime;
    const startAt = Math.max(now, playbackTimeRef.current);
    src.start(startAt);
    playbackTimeRef.current = startAt + buffer.duration;
  }, []);

  // Main setup effect
  useEffect(() => {
    if (!enabled || !sessionId) return;
    disposedRef.current = false;
    let cancelled = false;

    (async () => {
      try {
        setStatus("connecting");
        setError(null);

        const liveInfo = await voiceExamService.getLiveToken(sessionId);
        if (cancelled || disposedRef.current) return;

        // Backend proxy: wsPath + JWT token
        // Frontend → wss://<host>/api/voice-exam/:id/live-ws?token=<jwt>
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsPath = (liveInfo as any).wsPath as string | undefined;
        const tokenForWs = (liveInfo as any).token as string;
        const wsUrl = wsPath
          ? `${proto}//${window.location.host}${wsPath}?token=${encodeURIComponent(tokenForWs)}`
          : "";

        // Output audio context (24k for Gemini playback)
        const outCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
          sampleRate: OUTPUT_SAMPLE_RATE,
        });
        outputCtxRef.current = outCtx;
        const gain = outCtx.createGain();
        gain.gain.value = 1;
        const analyserOut = outCtx.createAnalyser();
        analyserOut.fftSize = 128;
        gain.connect(analyserOut);
        analyserOut.connect(outCtx.destination);
        outGainRef.current = gain;
        analyserOutRef.current = analyserOut;
        playbackTimeRef.current = outCtx.currentTime;

        // Build the Gemini client (backend proxy WS)
        const client = new GeminiLiveExamClient(wsUrl, "proxy", {
          onOpen: () => {
            if (!disposedRef.current) setStatus("listening");
          },
          onClose: () => {
            if (!disposedRef.current) setStatus("idle");
          },
          onError: (err) => {
            if (!disposedRef.current) setError(err.message || "Bog'lanishda xatolik");
          },
          onAiAudio: (pcm) => {
            if (!disposedRef.current) enqueueAiAudio(pcm);
          },
          onAiTranscript: (text) => {
            if (!disposedRef.current) setLastAiText(text);
          },
          onUserTranscript: (text) => {
            if (!disposedRef.current) setLastUserText(text);
          },
          onTurnComplete: (userText, aiText) => {
            if (disposedRef.current) return;
            const now = Date.now();
            const next: TurnMessage[] = [];
            if (userText) next.push({ role: "salesperson", text: userText, ts: now });
            if (aiText) next.push({ role: "client", text: aiText, ts: now + 1 });
            if (next.length) {
              setMessages((prev) => [...prev, ...next]);
            }
            // Persist asynchronously, sequentially — fire and forget
            (async () => {
              for (const m of next) {
                try {
                  await voiceExamService.saveLiveTurn(sessionId, m.role, m.text);
                } catch {
                  // swallow — saving is best-effort
                }
              }
            })();
            setLastUserText("");
            setLastAiText("");
          },
        });
        clientRef.current = client;
        await client.connect();
        if (cancelled || disposedRef.current) return;

        // Mic stream
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 16000,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        if (cancelled || disposedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const inCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        inputCtxRef.current = inCtx;

        const url = createWorkletBlobUrl();
        workletUrlRef.current = url;
        await inCtx.audioWorklet.addModule(url);
        if (cancelled || disposedRef.current) return;

        const source = inCtx.createMediaStreamSource(stream);
        const analyserIn = inCtx.createAnalyser();
        analyserIn.fftSize = 256;
        const node = new AudioWorkletNode(inCtx, "exam-capture-processor");
        node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (mutedRef.current) return;
          const ab = e.data;
          if (ab instanceof ArrayBuffer) {
            clientRef.current?.sendAudio(ab);
          }
        };
        source.connect(analyserIn);
        source.connect(node);
        // Do NOT connect node to destination — we don't want to hear ourselves.
        sourceNodeRef.current = source;
        analyserInRef.current = analyserIn;
        workletNodeRef.current = node;

        // RAF for levels + frequency data
        const inBufLen = analyserIn.fftSize;
        const inTimeBuf = new Uint8Array(inBufLen);
        const outFreqLen = analyserOut.frequencyBinCount;
        const outFreqBuf = new Uint8Array(outFreqLen);
        const outTimeBuf = new Uint8Array(analyserOut.fftSize);

        const tick = () => {
          if (disposedRef.current) return;
          // Mic RMS
          analyserIn.getByteTimeDomainData(inTimeBuf);
          let sumIn = 0;
          for (let i = 0; i < inBufLen; i++) {
            const v = (inTimeBuf[i] - 128) / 128;
            sumIn += v * v;
          }
          const rmsIn = Math.sqrt(sumIn / inBufLen);

          // AI output RMS + frequency
          analyserOut.getByteTimeDomainData(outTimeBuf);
          analyserOut.getByteFrequencyData(outFreqBuf);
          let sumOut = 0;
          for (let i = 0; i < outTimeBuf.length; i++) {
            const v = (outTimeBuf[i] - 128) / 128;
            sumOut += v * v;
          }
          const rmsOut = Math.sqrt(sumOut / outTimeBuf.length);

          setMicLevel(rmsIn);
          setAiLevel(rmsOut);
          setFrequencyData(new Uint8Array(outFreqBuf));

          // Status hint: speaking if AI talking, listening otherwise
          if (rmsOut > 0.02) {
            setStatus("speaking");
          } else {
            setStatus("listening");
          }

          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err: unknown) {
        if (disposedRef.current) return;
        const msg =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Bog'lanib bo'lmadi";
        setError(msg);
        setStatus("idle");
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, sessionId]);

  return {
    status,
    micLevel,
    aiLevel,
    frequencyData,
    lastUserText,
    lastAiText,
    messages,
    error,
    muted,
    toggleMute,
    disconnect,
  };
}
