import type { Redis } from "ioredis";

/**
 * Pub/sub is the realtime fan-out substrate (CONVENTIONS §2). A socket subscribes
 * to its session's channel; producers publish there. There is **no in-memory
 * socket registry as the source of truth** — any replica can serve any socket
 * because delivery goes through the shared broker. Two impls satisfy the port:
 * Redis (multi-replica prod) and an in-memory broker (dev/tests/offline).
 */
export interface Subscription {
  unsubscribe(): Promise<void>;
}

export interface PubSub {
  publish(channel: string, message: string): Promise<void>;
  subscribe(channel: string, handler: (message: string) => void): Promise<Subscription>;
  close(): Promise<void>;
}

/**
 * A process-local broker. Multiple {@link InMemoryPubSub} instances constructed
 * with the *same* broker fan messages out to each other — which is how the
 * multi-replica test simulates two hubs sharing one Redis without Docker.
 */
export class InMemoryBroker {
  private readonly channels = new Map<string, Set<(m: string) => void>>();

  publish(channel: string, message: string): void {
    // Copy to a snapshot so a handler that unsubscribes mid-dispatch is safe.
    const handlers = this.channels.get(channel);
    if (!handlers) return;
    for (const handler of [...handlers]) handler(message);
  }

  subscribe(channel: string, handler: (m: string) => void): () => void {
    let set = this.channels.get(channel);
    if (!set) {
      set = new Set();
      this.channels.set(channel, set);
    }
    set.add(handler);
    return () => {
      const current = this.channels.get(channel);
      current?.delete(handler);
      if (current && current.size === 0) this.channels.delete(channel);
    };
  }
}

/** In-memory {@link PubSub} over an {@link InMemoryBroker} (shared or private). */
export class InMemoryPubSub implements PubSub {
  constructor(private readonly broker: InMemoryBroker = new InMemoryBroker()) {}

  async publish(channel: string, message: string): Promise<void> {
    this.broker.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<Subscription> {
    const off = this.broker.subscribe(channel, handler);
    return { unsubscribe: async () => off() };
  }

  async close(): Promise<void> {
    /* nothing to release */
  }
}

/**
 * Redis-backed {@link PubSub}. Uses a dedicated subscriber connection (a Redis
 * connection in subscribe mode can't issue normal commands) and a publisher
 * connection. Channels are multiplexed on the one subscriber via a local
 * handler map, so N sessions share one connection.
 */
export class RedisPubSub implements PubSub {
  private readonly handlers = new Map<string, Set<(m: string) => void>>();
  private wired = false;

  constructor(
    private readonly pub: Redis,
    private readonly sub: Redis,
  ) {}

  private ensureWired(): void {
    if (this.wired) return;
    this.wired = true;
    this.sub.on("message", (channel: string, message: string) => {
      const set = this.handlers.get(channel);
      if (!set) return;
      for (const handler of [...set]) handler(message);
    });
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.pub.publish(channel, message);
  }

  async subscribe(channel: string, handler: (message: string) => void): Promise<Subscription> {
    this.ensureWired();
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      await this.sub.subscribe(channel);
    }
    set.add(handler);
    return {
      unsubscribe: async () => {
        const current = this.handlers.get(channel);
        current?.delete(handler);
        if (current && current.size === 0) {
          this.handlers.delete(channel);
          await this.sub.unsubscribe(channel);
        }
      },
    };
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.sub.quit(), this.pub.quit()]);
  }
}
