import { AnthropicProvider } from "./anthropic.js";
import { LlmGateway, type GatewayOptions } from "./gateway.js";
import { MockLlmProvider } from "./mock.js";
import type { LlmConfig, LlmProvider } from "./types.js";

/**
 * Build the LLM the app uses, selected by config (CONVENTIONS §2). Always
 * returns a {@link LlmGateway} (retry/fallback/usage) wrapping the concrete
 * provider. The mock is the default and the safe fallback: selecting `anthropic`
 * without a key transparently degrades to the mock so dev/CI never break and no
 * PHI reaches Anthropic before a BAA + key exist.
 */
export function createLlm(
  config: LlmConfig,
  hooks?: { onFallback?: (reason: string) => void; gateway?: GatewayOptions },
): LlmGateway {
  const provider = selectProvider(config, hooks?.onFallback);
  const gatewayOptions: GatewayOptions = {
    ...(config.retryAttempts !== undefined ? { retryAttempts: config.retryAttempts } : {}),
    ...(config.fallbackModel ? { fallbackModel: config.fallbackModel } : {}),
    ...hooks?.gateway,
  };
  return new LlmGateway(provider, gatewayOptions);
}

function selectProvider(config: LlmConfig, onFallback?: (reason: string) => void): LlmProvider {
  if (config.provider === "anthropic") {
    if (!config.apiKey) {
      onFallback?.("LLM_PROVIDER=anthropic but no API key — using mock");
      return new MockLlmProvider({ ...(config.model ? { model: config.model } : {}) });
    }
    return new AnthropicProvider({
      apiKey: config.apiKey,
      ...(config.model ? { model: config.model } : {}),
    });
  }
  return new MockLlmProvider({ ...(config.model ? { model: config.model } : {}) });
}
