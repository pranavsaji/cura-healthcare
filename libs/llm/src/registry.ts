import { ConflictError, NotFoundError } from "@cura/shared";

/**
 * Versioned prompt registry. Every prompt the platform sends is registered here
 * with a stable `id@version`, so a generation can record exactly which prompt
 * produced it (reproducibility + audit, Phase 14) and so changing a prompt is a
 * deliberate, reviewable version bump — never a silent edit (CONVENTIONS §2).
 */

export interface PromptTemplate<V = Record<string, unknown>> {
  id: string;
  version: number;
  description: string;
  /** Render the final prompt text from typed variables. */
  render: (vars: V) => string;
  /** Optional system prompt paired with this template. */
  system?: string;
}

export interface RegisteredPrompt<V = Record<string, unknown>> extends PromptTemplate<V> {
  /** Stable identifier `id@version` recorded in Usage. */
  ref: string;
}

export class PromptRegistry {
  // id → (version → template)
  private readonly byId = new Map<string, Map<number, RegisteredPrompt>>();

  /** Register a prompt version. Re-registering the same id@version is rejected. */
  register<V>(template: PromptTemplate<V>): RegisteredPrompt<V> {
    const versions = this.byId.get(template.id) ?? new Map<number, RegisteredPrompt>();
    if (versions.has(template.version)) {
      throw new ConflictError(
        `prompt ${template.id}@${template.version} already registered — bump the version to change it`,
      );
    }
    const registered: RegisteredPrompt<V> = {
      ...template,
      ref: `${template.id}@${template.version}`,
    };
    versions.set(template.version, registered as RegisteredPrompt);
    this.byId.set(template.id, versions);
    return registered;
  }

  /** Look up a prompt by id (latest version) or a specific `id`+`version`. */
  get<V = Record<string, unknown>>(id: string, version?: number): RegisteredPrompt<V> {
    const versions = this.byId.get(id);
    if (!versions || versions.size === 0) throw new NotFoundError(`prompt ${id}`);
    const v = version ?? Math.max(...versions.keys());
    const found = versions.get(v);
    if (!found) throw new NotFoundError(`prompt ${id}@${version}`);
    return found as RegisteredPrompt<V>;
  }

  /** Highest registered version number for an id (0 if unknown). */
  latestVersion(id: string): number {
    const versions = this.byId.get(id);
    return versions && versions.size ? Math.max(...versions.keys()) : 0;
  }

  list(): RegisteredPrompt[] {
    return [...this.byId.values()].flatMap((m) => [...m.values()]);
  }
}
