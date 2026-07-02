import { NotFoundError } from "@cura/shared";
import { FallbackConnector } from "./adapters/fallback.js";
import { type HttpClient, SimplePracticeConnector } from "./adapters/simplepractice.js";
import type { EhrConnector } from "./types.js";

/**
 * Vendor → connector factory. Adding a vendor is registering a factory here — no
 * caller changes (CONVENTIONS §2). The `fallback` connector is always present so
 * every org has a working "Super Fill" path even before any API integration.
 */
export interface RegistryDeps {
  /** HTTP client used by API-backed adapters (injected for testability). */
  http?: HttpClient;
}

export type ConnectorFactory = (deps: RegistryDeps) => EhrConnector;

/** The known vendors (from the product brief). Not all have API-backed adapters yet. */
export const KNOWN_VENDORS = [
  "simplepractice",
  "therapynotes",
  "valant",
  "kipu",
  "ensora",
  "qualifacts",
  "nextgen",
  "advancedmd",
  "bestnotes",
  "sigmund",
  "athena",
  "cerner",
] as const;

export class EhrRegistry {
  private readonly factories = new Map<string, ConnectorFactory>();

  constructor(private readonly deps: RegistryDeps = {}) {
    // Always-available fallback.
    this.register("fallback", () => new FallbackConnector());
    // The one deep adapter (needs an HTTP client).
    this.register("simplepractice", (d) => {
      if (!d.http) throw new NotFoundError("http client for simplepractice");
      return new SimplePracticeConnector(d.http);
    });
  }

  register(vendor: string, factory: ConnectorFactory): void {
    this.factories.set(vendor, factory);
  }

  has(vendor: string): boolean {
    return this.factories.has(vendor);
  }

  /** Resolve a connector, or throw NotFoundError if the vendor is unregistered. */
  get(vendor: string): EhrConnector {
    const factory = this.factories.get(vendor);
    if (!factory) throw new NotFoundError(`EHR connector for "${vendor}"`);
    return factory(this.deps);
  }

  /** Resolve a connector, falling back to the assisted-paste connector. */
  getOrFallback(vendor: string): EhrConnector {
    return this.factories.has(vendor) ? this.get(vendor) : new FallbackConnector();
  }

  vendors(): string[] {
    return [...this.factories.keys()];
  }
}
