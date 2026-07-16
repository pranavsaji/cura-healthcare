/**
 * Real microphone capture: getUserMedia → AudioWorklet (`/pcm-worklet.js`
 * resamples to PCM16 @ 16 kHz) → base64 chunks for the WS `audio` frames. The
 * AudioContext is created inside the user's click (autoplay policy), and the
 * returned MediaStream also feeds `useAudioAnalyser` so the orb/waveform react
 * to real voice. Pure helpers are exported for tests (jsdom has no AudioContext).
 */

/** Base64-encode a PCM16 buffer, chunked to dodge call-arg limits. */
export function pcm16ToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export interface MicCapture {
  stream: MediaStream;
  stop(): Promise<void>;
}

export async function startMicCapture(onChunk: (base64: string) => void): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const ctx = new AudioContext(); // native rate; the worklet resamples to 16 kHz
  try {
    await ctx.audioWorklet.addModule("/pcm-worklet.js");
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm16-worklet");
    node.port.onmessage = (ev) => onChunk(pcm16ToBase64(ev.data as ArrayBuffer));
    src.connect(node); // worklet output stays unconnected — no monitoring echo

    return {
      stream,
      stop: async () => {
        node.port.onmessage = null;
        src.disconnect();
        stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
      },
    };
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
    throw err;
  }
}
