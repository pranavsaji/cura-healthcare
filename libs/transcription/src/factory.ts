import { AssemblyAiProvider } from "./assemblyai.js";
import { DeepgramProvider } from "./deepgram.js";
import { MockAsrProvider } from "./mock.js";
import type { AsrConfig, AsrProvider } from "./types.js";

/**
 * Select an {@link AsrProvider} from config (CONVENTIONS §2). The mock is the
 * default and the safe fallback: a real provider selected without its API key
 * transparently degrades to the mock so dev/CI never break and no PHI is sent to
 * a subprocessor before a BAA + key are in place. `onFallback` surfaces the
 * downgrade for logging (never logs the key).
 */
export function createAsrProvider(
  config: AsrConfig,
  hooks?: { onFallback?: (reason: string) => void },
): AsrProvider {
  switch (config.provider) {
    case "deepgram": {
      if (!config.apiKey) {
        hooks?.onFallback?.("ASR_PROVIDER=deepgram but no API key — using mock");
        return new MockAsrProvider();
      }
      return new DeepgramProvider(config.apiKey, config.model ?? "nova-2-medical");
    }
    case "assemblyai": {
      if (!config.apiKey) {
        hooks?.onFallback?.("ASR_PROVIDER=assemblyai but no API key — using mock");
        return new MockAsrProvider();
      }
      return new AssemblyAiProvider(config.apiKey);
    }
    case "mock":
    default:
      return new MockAsrProvider();
  }
}
