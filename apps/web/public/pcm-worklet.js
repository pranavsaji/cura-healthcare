/**
 * AudioWorkletProcessor: Float32 @ the context's native rate → PCM16LE @ 16 kHz,
 * posted to the main thread in ~250 ms frames (zero-copy transfer). Resampling
 * happens HERE, not via `AudioContext({sampleRate})` — forcing the context rate
 * throws on some browsers. Linear interpolation is adequate for 16 kHz ASR; the
 * per-block seam (readPos reset) is inaudible at 128-frame blocks.
 */
const TARGET_RATE = 16000;
const FRAME_SAMPLES = 4000; // 250 ms @ 16 kHz → 8000 bytes per post

class Pcm16Worklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = [];
    this.readPos = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch || ch.length === 0) return true;

    // `sampleRate` is the worklet-global context rate (e.g. 48000).
    const ratio = sampleRate / TARGET_RATE;
    while (this.readPos < ch.length) {
      const i = Math.floor(this.readPos);
      const frac = this.readPos - i;
      const a = ch[i];
      const b = i + 1 < ch.length ? ch[i + 1] : a;
      this.buf.push(a + (b - a) * frac);
      this.readPos += ratio;
    }
    this.readPos -= ch.length;

    while (this.buf.length >= FRAME_SAMPLES) {
      const frame = this.buf.splice(0, FRAME_SAMPLES);
      const pcm = new Int16Array(FRAME_SAMPLES);
      for (let j = 0; j < FRAME_SAMPLES; j++) {
        const s = Math.max(-1, Math.min(1, frame[j]));
        pcm[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm16-worklet", Pcm16Worklet);
