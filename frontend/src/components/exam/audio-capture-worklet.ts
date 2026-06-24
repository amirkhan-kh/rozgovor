// AudioWorklet processor source.
// Vite imports the .ts file as raw text via `?raw` and we register it via Blob URL.
// Downsamples Float32 mic input (typically 48kHz) to 16kHz Int16 PCM and posts
// ~50ms chunks to the main thread as ArrayBuffer transferables.

export const AUDIO_CAPTURE_WORKLET_SOURCE = /* js */ `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.ratio = sampleRate / this.targetSampleRate; // e.g. 48000/16000 = 3
    this.chunkSamples = Math.floor(this.targetSampleRate * 0.05); // ~50ms @ 16k = 800 samples
    this.buffer = new Int16Array(this.chunkSamples);
    this.bufferIndex = 0;
    this.acc = 0;
    this.accCount = 0;
    this.sampleCursor = 0;
    this.muted = false;
    this.port.onmessage = (e) => {
      const msg = e.data;
      if (msg && msg.type === 'mute') {
        this.muted = !!msg.muted;
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel) return true;
    if (this.muted) return true;

    for (let i = 0; i < channel.length; i++) {
      this.acc += channel[i];
      this.accCount += 1;
      this.sampleCursor += 1;
      // emit one downsampled sample whenever we cross a ratio boundary
      if (this.sampleCursor >= this.ratio) {
        this.sampleCursor -= this.ratio;
        const avg = this.acc / Math.max(1, this.accCount);
        this.acc = 0;
        this.accCount = 0;
        // clamp and convert to int16
        const clamped = Math.max(-1, Math.min(1, avg));
        const s = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        this.buffer[this.bufferIndex++] = s | 0;
        if (this.bufferIndex >= this.chunkSamples) {
          const out = this.buffer.slice(0);
          this.bufferIndex = 0;
          this.port.postMessage(out.buffer, [out.buffer]);
        }
      }
    }
    return true;
  }
}

registerProcessor('exam-capture-processor', CaptureProcessor);
`;

export function createWorkletBlobUrl(): string {
  const blob = new Blob([AUDIO_CAPTURE_WORKLET_SOURCE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}
