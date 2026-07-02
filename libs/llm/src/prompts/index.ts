import { PromptRegistry } from "../registry.js";
import { noteGenPrompt } from "./note-gen.js";
import { riskScanPrompt } from "./risk-scan.js";

export * from "./note-gen.js";
export * from "./risk-scan.js";

/**
 * Build a registry pre-loaded with the platform's shipped prompts. Callers get a
 * fresh instance (no shared mutable global) so tests are isolated and a vertical
 * can register its own prompts on top.
 */
export function defaultPromptRegistry(): PromptRegistry {
  const registry = new PromptRegistry();
  registry.register(noteGenPrompt);
  registry.register(riskScanPrompt);
  return registry;
}
