import { useCallback, useEffect, useRef, useState } from "react";
import { voiceExamService } from "../services/voice-exam.service";
import { GeminiLiveExamClient } from "../services/gemini-live-exam.client";
import { createWorkletBlobUrl } from "../components/exam/audio-capture-worklet";
import { WS_BASE_URL } from "../services/apiBase";

type Status = "idle" | "connecting" | "listening" | "speaking";

interface UseGeminiLiveExamArgs {
  sessionId: string | undefined;
  enabled: boolean;
  /** Tanlangan mikrofon deviceId (ixtiyoriy). Bo'sh bo'lsa — brauzer standarti. */
  deviceId?: string;
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
  /** Mikrofon ulandi-yu, lekin boshida umuman signal kelmadi (qurilma muammosi belgisi). */
  micSilent: boolean;
  /** Matn (chat) javobini yuborish — AI ovoz + transkript bilan javob beradi. */
  sendText: (text: string) => void;
  toggleMute: () => void;
  disconnect: () => void;
}

const OUTPUT_SAMPLE_RATE = 24000;
const MIC_SIGNAL_PEAK_THRESHOLD = 200;
const INITIAL_MIC_SIGNAL_GRACE_MS = 12000;
const SERVER_OPEN_TIMEOUT_MS = 25000;
// HALF-DUPLEX: AI (mijoz) ovozi tugagach mikrofonni shu qadar (sekund) yopiq
// ushlaymiz — dinamikdan qaytgan echo/reverb tinishi uchun.
const AI_SPEAK_TAIL_GUARD_SEC = 0.4;

export function useGeminiLiveExam({ sessionId, enabled, deviceId }: UseGeminiLiveExamArgs): UseGeminiLiveExamReturn {
  const [status, setStatus] = useState<Status>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [aiLevel, setAiLevel] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array>(() => new Uint8Array(64));
  const [lastUserText, setLastUserText] = useState("");
  const [lastAiText, setLastAiText] = useState("");
  const [messages, setMessages] = useState<TurnMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [micSilent, setMicSilent] = useState(false);
  // Mic muammosini aniqlash: faqat sessiya boshida umuman signal kelmasa ogohlantiramiz.
  const micStartedAtRef = useRef<number>(0);
  const hasInputSignalRef = useRef(false);
  const lastSoundAtRef = useRef<number>(0);
  const workletPeakRef = useRef<number>(0);

  const clientRef = useRef<GeminiLiveExamClient | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micSinkRef = useRef<GainNode | null>(null);
  const analyserInRef = useRef<AnalyserNode | null>(null);
  const analyserOutRef = useRef<AnalyserNode | null>(null);
  const outGainRef = useRef<GainNode | null>(null);
  const playbackTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const disposedRef = useRef(false);
  const workletUrlRef = useRef<string | null>(null);
  const openTimeoutRef = useRef<number | null>(null);

  const clearOpenTimeout = useCallback(() => {
    if (openTimeoutRef.current !== null) {
      window.clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    disposedRef.current = true;
    clearOpenTimeout();
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try { workletNodeRef.current?.disconnect(); } catch { /* noop */ }
    try { micSinkRef.current?.disconnect(); } catch { /* noop */ }
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
    micSinkRef.current = null;
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
  }, [clearOpenTimeout]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      workletNodeRef.current?.port.postMessage({ type: "mute", muted: next });
      return next;
    });
  }, []);

  // Matn (chat) yuborish: foydalanuvchi xabarini darhol chatga qo'shamiz,
  // saqlaymiz va backend orqali Gemini'ga uzatamiz. AI javobi ovoz + transkript
  // bilan odatdagi handlerlar orqali keladi.
  const sendText = useCallback((text: string) => {
    const t = text.trim();
    if (!t || !clientRef.current) return;
    setMessages((prev) => [...prev, { role: "salesperson", text: t, ts: Date.now() }]);
    if (sessionId) {
      voiceExamService.saveLiveTurn(sessionId, "salesperson", t).catch(() => {});
    }
    clientRef.current.sendText(t);
  }, [sessionId]);

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
        const wsPath = (liveInfo as any).wsPath as string | undefined;
        const tokenForWs = (liveInfo as any).token as string;
        const wsUrl = wsPath
          ? `${WS_BASE_URL}${wsPath}?token=${encodeURIComponent(tokenForWs)}`
          : "";

        // Output audio context (24k for Gemini playback)
        const outCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
          sampleRate: OUTPUT_SAMPLE_RATE,
        });
        outputCtxRef.current = outCtx;
        if (outCtx.state === "suspended") {
          try { await outCtx.resume(); } catch { /* noop */ }
        }
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
            clearOpenTimeout();
            if (!disposedRef.current) setStatus("listening");
          },
          onClose: () => {
            clearOpenTimeout();
            if (!disposedRef.current) setStatus("idle");
          },
          onError: (err) => {
            clearOpenTimeout();
            if (!disposedRef.current) {
              setError(err.message || "Bog'lanishda xatolik");
              setStatus("idle");
            }
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
        clearOpenTimeout();
        openTimeoutRef.current = window.setTimeout(() => {
          if (cancelled || disposedRef.current) return;
          setError("AI mijozga ulanish 25 sekunddan oshdi. Sahifani yangilang yoki qayta urinib ko'ring.");
          disconnect();
        }, SERVER_OPEN_TIMEOUT_MS);
        await client.connect();
        if (cancelled || disposedRef.current) return;

        // Mic stream
        // MUHIM: `sampleRate: 16000` ni getUserMedia constraint sifatida BERMAYMIZ.
        // Chrome (ayniqsa Windows)da track sample-rate'i (16k) AudioContext rate'i
        // (odatda 48k) bilan mos kelmasa, createMediaStreamSource JIMLIK chiqaradi
        // (RMS=0, peak=0 → Vertex hech narsa eshitmaydi). Track'ni qurilmaning tabiiy
        // rate'ida olamiz va downsampling'ni worklet (haqiqiy `sampleRate`'dan ratio)
        // bajaradi.
        // MUHIM #2: echoCancellation/noiseSuppression/autoGainControl'ni O'CHIRAMIZ.
        // Bular yoqilganda Chrome mikrofonni WebRTC audio-processing moduli (APM)
        // orqali o'tkazadi. Windows'da APM render-reference topolmasa mikrofonni
        // QATTIQ nolga aylantiradi (peak=0 → Vertex hech narsa eshitmaydi). Ularni
        // o'chirib xom mikrofon audiosini olamiz. (Imtihonda quloqchin tavsiya etiladi.)
        const audioConstraints: MediaTrackConstraints = {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        };
        if (deviceId) {
          audioConstraints.deviceId = { exact: deviceId };
        }
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        if (cancelled || disposedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const inCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        inputCtxRef.current = inCtx;
        // Chrome AudioContext'ni ba'zan "suspended" holatda yaratadi — process() ishlamaydi.
        if (inCtx.state === "suspended") {
          try { await inCtx.resume(); } catch { /* noop */ }
        }
        try {
          const micTrack = stream.getAudioTracks()[0];
          // eslint-disable-next-line no-console
          console.info("[voice-exam] mic track settings:", micTrack?.getSettings?.(), "| inCtx.sampleRate:", inCtx.sampleRate, "| inCtx.state:", inCtx.state);
        } catch { /* noop */ }

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
          if (!(ab instanceof ArrayBuffer)) return;

          // HALF-DUPLEX (echo/feedback guard) — ENG MUHIM:
          // AI (mijoz) ovozi dinamikdan chiqayotgan paytda mikrofon audiosini
          // Vertex'ga UMUMAN yubormaymiz. Aks holda quloqchinsiz ishlaganda AI o'z
          // ovozini mikrofon orqali qayta eshitadi, uni "sotuvchi gapirdi" deb
          // transkript qiladi (ko'pincha buzuq — xitoy/hind/koreys belgilari) va
          // o'zi bilan o'zi suhbatlashib ketadi. Bu menejer AYTMAGAN gaplar uchun
          // baholanishiga olib keladi — adolatsiz. Shuning uchun AI gapirayotganda
          // mikrofon yopiq.
          const outCtx = outputCtxRef.current;
          const aiSpeaking =
            !!outCtx &&
            outCtx.currentTime < playbackTimeRef.current + AI_SPEAK_TAIL_GUARD_SEC;
          if (aiSpeaking) return;

          // Haqiqiy yozilgan signal darajasini worklet chunk'idan o'lchaymiz
          // (analyser emas — bu mikrofon CHIN ovoz yuboryaptimi yo'qmi aniq ko'rsatadi).
          try {
            const pcm = new Int16Array(ab);
            let peak = 0;
            for (let i = 0; i < pcm.length; i++) {
              const v = pcm[i] < 0 ? -pcm[i] : pcm[i];
              if (v > peak) peak = v;
            }
            workletPeakRef.current = peak;
            if (peak > MIC_SIGNAL_PEAK_THRESHOLD) {
              hasInputSignalRef.current = true;
              lastSoundAtRef.current = Date.now();
              setMicSilent(false);
            }
          } catch { /* noop */ }
          clientRef.current?.sendAudio(ab);
        };
        source.connect(analyserIn);
        source.connect(node);
        // MUHIM: AudioWorkletNode destination'ga ulanmasa, Chrome grafni "tortmaydi"
        // va worklet'ga JIMLIK keladi (process() chaqiriladi-yu, kirish nol → RMS=0,
        // Vertex hech narsa eshitmaydi). Shuning uchun worklet'ni gain=0 (ovozsiz)
        // tugun orqali destination'ga ulaymiz — o'zimizni eshitmaymiz, lekin mikrofon
        // audiosi graf bo'ylab oqadi.
        const muteSink = inCtx.createGain();
        muteSink.gain.value = 0;
        node.connect(muteSink);
        muteSink.connect(inCtx.destination);
        sourceNodeRef.current = source;
        analyserInRef.current = analyserIn;
        workletNodeRef.current = node;
        micSinkRef.current = muteSink;
        micStartedAtRef.current = Date.now();
        lastSoundAtRef.current = micStartedAtRef.current;
        hasInputSignalRef.current = false;
        workletPeakRef.current = 0;
        setMicSilent(false);

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

          // Ogohlantirish faqat boshida umuman signal kelmasa chiqadi. Keyingi sukutlar
          // normal holat: foydalanuvchi o'ylashi yoki mijoz javobini tinglashi mumkin.
          if (!mutedRef.current) {
            const silent =
              !hasInputSignalRef.current &&
              Date.now() - micStartedAtRef.current > INITIAL_MIC_SIGNAL_GRACE_MS;
            setMicSilent((prev) => (prev !== silent ? silent : prev));
          } else {
            setMicSilent(false);
          }

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
        clearOpenTimeout();
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
  }, [enabled, sessionId, deviceId]);

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
    micSilent,
    sendText,
    toggleMute,
    disconnect,
  };
}
