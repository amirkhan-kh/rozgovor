import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, AlertTriangle, CheckCircle2, RefreshCw, Loader2 } from "lucide-react";

// Imtihondan OLDIN mikrofonni tekshirish bosqichi.
// Foydalanuvchi qurilmani tanlaydi, gapiradi va daraja chizig'i harakatlanishini
// ko'radi — shundan keyingina imtihon boshlanadi. Bu Chrome noto'g'ri/jim qurilmani
// tanlab qo'yishi muammosini barcha foydalanuvchilar uchun hal qiladi.

interface MicCheckProps {
  initialDeviceId?: string;
  onConfirm: (deviceId: string | undefined) => void;
  onCancel: () => void;
}

const RAW_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

// Virtual / soxta audio qurilmalari — bular ko'pincha JIMLIK chiqaradi (telefon-webcam,
// OBS, ovoz kabellari). Chrome ba'zan shularni standart qilib tanlaydi → mikrofon
// "ishlamayotgandek" ko'rinadi. Standart tanlovda bularni chetlab o'tamiz.
const VIRTUAL_HINTS = [
  "iriun", "droidcam", "obs", "vb-audio", "vb-cable", "cable", "virtual",
  "voicemeeter", "ndi", "screen", "stereo mix", "what u hear", "wave out", "mix",
];

function isVirtualLabel(label: string): boolean {
  const l = (label || "").toLowerCase();
  return VIRTUAL_HINTS.some((h) => l.includes(h));
}

// Eng yaxshi HAQIQIY mikrofonni tanlash: virtual bo'lmaganlar orasidan
// "default" yorlig'ini, keyin garnitura/array'ni afzal ko'ramiz.
function pickBestDevice(inputs: MediaDeviceInfo[]): string | undefined {
  const real = inputs.filter((d) => d.deviceId && !isVirtualLabel(d.label));
  if (real.length === 0) return inputs.find((d) => d.deviceId)?.deviceId;
  const byDefault = real.find((d) => /default/i.test(d.label));
  if (byDefault) return byDefault.deviceId;
  const byPreferred = real.find((d) => /(headset|array|realtek|microphone)/i.test(d.label));
  return (byPreferred || real[0]).deviceId;
}

export const MicCheck: React.FC<MicCheckProps> = ({ initialDeviceId, onConfirm, onCancel }) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(initialDeviceId);
  const [permState, setPermState] = useState<"requesting" | "granted" | "denied">("requesting");
  const [level, setLevel] = useState(0); // 0..1
  const [peak, setPeak] = useState(0); // 16-bit peak ~0..32767
  const [heardSound, setHeardSound] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopAll = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      ctxRef.current.close().catch(() => {});
    }
    ctxRef.current = null;
  }, []);

  // Tanlangan qurilma uchun jonli daraja o'lchovini ishga tushiramiz.
  const startMeter = useCallback(async (deviceId?: string) => {
    stopAll();
    setErrMsg(null);
    setHeardSound(false);
    setPeak(0);
    setLevel(0);
    try {
      const constraints: MediaTrackConstraints = { ...RAW_CONSTRAINTS };
      if (deviceId) constraints.deviceId = { exact: deviceId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      streamRef.current = stream;
      setPermState("granted");

      // Endi label'lar ko'rinadi — qurilmalar ro'yxatini yangilaymiz.
      let inputs: MediaDeviceInfo[] = [];
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        inputs = list.filter((d) => d.kind === "audioinput");
        setDevices(inputs);
      } catch { /* noop */ }

      const currentTrackId = stream.getAudioTracks()[0]?.getSettings().deviceId;
      // Agar qurilma aniq tanlanmagan bo'lsa-yu, brauzer VIRTUAL (jim) qurilmani
      // tanlagan bo'lsa — avtomatik ravishda eng yaxshi HAQIQIY mikrofonga o'tamiz.
      if (!deviceId) {
        const currentLabel = inputs.find((d) => d.deviceId === currentTrackId)?.label || "";
        const best = pickBestDevice(inputs);
        if (best && best !== currentTrackId && isVirtualLabel(currentLabel)) {
          setSelectedId(best);
          // Joriy (virtual) oqimni to'xtatib, haqiqiy qurilmaga qayta ulanamiz.
          startMeter(best);
          return;
        }
        if (currentTrackId) setSelectedId(currentTrackId);
      }

      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* noop */ } }
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);

      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        let p = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
          const av = Math.abs(v);
          if (av > p) p = av;
        }
        const rms = Math.sqrt(sum / buf.length);
        const peak16 = Math.round(p * 32767);
        setLevel(Math.min(1, rms * 4));
        setPeak(peak16);
        if (peak16 > 400) setHeardSound(true);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: unknown) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermState("denied");
        setErrMsg("Mikrofonga ruxsat berilmadi. Brauzer manzil panelidagi qulf belgisidan ruxsat bering.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setErrMsg("Mikrofon topilmadi. Qurilma ulanganini tekshiring.");
      } else {
        setErrMsg("Mikrofonni ochib bo'lmadi. Boshqa qurilma tanlab ko'ring.");
      }
    }
  }, [stopAll]);

  useEffect(() => {
    startMeter(initialDeviceId);
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    startMeter(id);
  };

  const handleConfirm = () => {
    stopAll();
    onConfirm(selectedId);
  };

  // Daraja chizig'i uchun segmentlar
  const bars = 28;
  const activeBars = Math.round(level * bars);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-indigo-950 p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-2">
          <div className="w-14 h-14 rounded-full bg-violet-500/20 border border-violet-400/30 flex items-center justify-center">
            <Mic size={26} className="text-violet-300" />
          </div>
          <h3 className="text-lg font-semibold text-white">Mikrofonni tekshirish</h3>
          <p className="text-sm text-white/60">
            Imtihondan oldin mikrofoningizga <b>gapiring</b> — quyidagi chiziq harakatlansa, hammasi tayyor.
          </p>
        </div>

        {/* Qurilma tanlash */}
        <div className="mt-5">
          <label className="text-xs text-white/50 mb-1.5 block">Mikrofon qurilmasi</label>
          <select
            value={selectedId || ""}
            onChange={(e) => handleSelect(e.target.value)}
            disabled={permState !== "granted"}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400/50 disabled:opacity-50"
          >
            {devices.length === 0 && <option value="">Standart mikrofon</option>}
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId} className="bg-slate-900">
                {d.label || `Mikrofon ${i + 1}`}
              </option>
            ))}
          </select>
        </div>

        {/* Jonli daraja chizig'i */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white/50">Ovoz darajasi</span>
            <span className={`text-xs font-mono ${heardSound ? "text-emerald-300" : "text-white/40"}`}>
              peak: {peak}
            </span>
          </div>
          <div className="flex items-end gap-[3px] h-12">
            {Array.from({ length: bars }).map((_, i) => {
              const on = i < activeBars;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-sm transition-all duration-75 ${
                    on
                      ? i > bars * 0.8
                        ? "bg-rose-400"
                        : i > bars * 0.55
                        ? "bg-amber-300"
                        : "bg-emerald-400"
                      : "bg-white/10"
                  }`}
                  style={{ height: `${20 + (i / bars) * 80}%` }}
                />
              );
            })}
          </div>
        </div>

        {/* Holat / xato */}
        {permState === "requesting" && (
          <div className="mt-4 flex items-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" /> Mikrofonga ruxsat so'ralmoqda...
          </div>
        )}
        {errMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/15 border border-amber-400/30 px-3 py-2.5 text-sm text-amber-100">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-300" />
            <span>{errMsg}</span>
          </div>
        )}
        {permState === "granted" && !heardSound && !errMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white/60">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-300" />
            <span>Hali ovoz aniqlanmadi. Gapiring yoki yuqoridan boshqa mikrofon tanlang.</span>
          </div>
        )}
        {heardSound && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-3 py-2.5 text-sm text-emerald-100">
            <CheckCircle2 size={16} className="text-emerald-300" />
            <span>Mikrofon ishlayapti! Endi imtihonni boshlashingiz mumkin.</span>
          </div>
        )}

        {/* Tugmalar */}
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => startMeter(selectedId)}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition-all"
            title="Qayta tekshirish"
          >
            <RefreshCw size={15} />
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 transition-all"
          >
            Bekor qilish
          </button>
          <button
            onClick={handleConfirm}
            disabled={permState !== "granted"}
            className={`flex-1 px-4 py-2.5 rounded-full text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
              heardSound
                ? "bg-gradient-to-r from-emerald-500 to-emerald-400 text-white hover:from-emerald-400 hover:to-emerald-300"
                : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500"
            }`}
          >
            Boshlash
          </button>
        </div>
      </div>
    </div>
  );
};

export default MicCheck;
