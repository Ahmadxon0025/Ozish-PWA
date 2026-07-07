// ─────────────────────────────────────────────────────────────────────────────
// Voice capture for Tier 3. Records mono PCM via WebAudio, downsamples to
// 16 kHz and returns base64 LPCM16 — a format both Yandex SpeechKit and
// Google Cloud Speech accept directly, and it works on Chrome AND Safari
// (unlike container formats from MediaRecorder, which differ per browser).
// ─────────────────────────────────────────────────────────────────────────────

export const TARGET_SAMPLE_RATE = 16000;
export const MAX_RECORD_SECONDS = 25; // Yandex v1 limit is 30 s / 1 MB

export interface Recorder {
  stop(): Promise<{ pcmBase64: string; seconds: number }>;
  cancel(): void;
}

export async function startRecording(onLevel?: (rms: number) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let stopped = false;

  processor.onaudioprocess = (e) => {
    if (stopped) return;
    const data = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    if (onLevel) {
      let sum = 0;
      for (let i = 0; i < data.length; i += 16) sum += data[i] * data[i];
      onLevel(Math.sqrt(sum / (data.length / 16)));
    }
    const seconds = (chunks.length * 4096) / ctx.sampleRate;
    if (seconds > MAX_RECORD_SECONDS) stopped = true;
  };
  source.connect(processor);
  processor.connect(ctx.destination);

  const cleanup = () => {
    stopped = true;
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
  };

  return {
    async stop() {
      cleanup();
      const inputRate = ctx.sampleRate;
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const merged = new Float32Array(total);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.length;
      }
      const down = downsample(merged, inputRate, TARGET_SAMPLE_RATE);
      const pcm = floatToPCM16(down);
      return {
        pcmBase64: bytesToBase64(new Uint8Array(pcm.buffer)),
        seconds: down.length / TARGET_SAMPLE_RATE,
      };
    },
    cancel: cleanup,
  };
}

function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

function floatToPCM16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function voiceSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof AudioContext !== 'undefined'
  );
}
