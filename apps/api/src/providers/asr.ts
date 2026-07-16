import { createAsrProvider, type AsrProvider } from "@cura/transcription";
import type { AsrCallbacks, AsrOptions, AsrStream } from "@cura/transcription";
import { env } from "../env.js";

/**
 * Streaming ASR for live capture, delegated to `@cura/transcription` — the one
 * provider abstraction (mock/Deepgram/AssemblyAI) also used by the batch re-pass
 * (CONVENTIONS §2). The mock is the keyless fallback: it ignores raw audio and
 * relies on `pushText` (the "simulate"/dictation WS path) so the whole pipeline
 * stays demoable offline. With a Deepgram/AssemblyAI key, `pushAudio` streams
 * browser PCM16@16k straight to the vendor and real segments come back.
 */

export type { AsrCallbacks, AsrStream } from "@cura/transcription";

let providerSingleton: AsrProvider | undefined;

function provider(): AsrProvider {
  if (!providerSingleton) {
    const apiKey =
      env.asrProvider === "deepgram"
        ? env.deepgramApiKey
        : env.asrProvider === "assemblyai"
          ? env.assemblyaiApiKey
          : "";
    providerSingleton = createAsrProvider(
      { provider: env.asrProvider, apiKey: apiKey || undefined },
      { onFallback: (reason) => console.warn(`[asr] ${reason}`) },
    );
  }
  return providerSingleton;
}

/** Test seam: override the provider (mirrors notegen's __setNoteEngine). */
export function __setAsrProvider(p: AsrProvider | undefined): void {
  providerSingleton = p;
}

/** Effective provider name after key-fallback ("mock" when keyless) — advertised
 * to the client in the `ready` frame so it can pick mic streaming vs dictation. */
export function asrName(): string {
  return provider().name;
}

export function createAsrStream(cb: AsrCallbacks, options: AsrOptions = {}): AsrStream {
  return provider().openStream(cb, { sampleRate: 16000, diarize: true, ...options });
}
