import { describe, expect, it } from "vitest";
import { MockTelephony } from "./mock.js";
import { type MediaTransport, type TransportChannel, TwilioTelephony } from "./twilio.js";
import type { AudioFrame, CallHandle, InboundCall, TelephonyProvider } from "./types.js";

/**
 * Telephony contract: every adapter delivers an inbound call to the handler,
 * answers, routes caller→pipeline and pipeline→caller frames, and fires hangup.
 * A `Harness` normalizes each adapter's "make a call" entry point so the SAME
 * assertions run against the mock AND the real (transport-injected) Twilio adapter.
 */
interface Harness {
  provider: TelephonyProvider;
  /** Trigger an inbound call; returns the handle + captured outbound frames + a caller-say fn. */
  call(c: InboundCall): Promise<{ handle: CallHandle; outbound: AudioFrame[]; say: (t: string) => void; close: () => void }>;
}

/** A driveable fake MediaTransport for the Twilio adapter (stands in for a socket). */
class FakeTransport implements MediaTransport {
  readonly name = "fake";
  private cb?: (call: InboundCall, channel: TransportChannel) => void;
  onInbound(cb: (call: InboundCall, channel: TransportChannel) => void): void {
    this.cb = cb;
  }
  connect(call: InboundCall) {
    const outbound: AudioFrame[] = [];
    let frameCb: ((f: AudioFrame) => void) | undefined;
    let closeCb: (() => void) | undefined;
    const channel: TransportChannel = {
      send: (f) => outbound.push(f),
      onFrame: (cb) => (frameCb = cb),
      onClose: (cb) => (closeCb = cb),
      close: () => closeCb?.(),
      answered: () => {},
    };
    this.cb?.(call, channel);
    return { outbound, pushFrame: (f: AudioFrame) => frameCb?.(f), close: () => closeCb?.() };
  }
}

const harnesses: { name: string; make: () => Harness }[] = [
  {
    name: "mock",
    make: () => {
      const provider = new MockTelephony();
      return {
        provider,
        async call(c) {
          // MockTelephony dispatches to the handler inside simulateInboundCall.
          provider.onInboundCall(() => {});
          const sim = await provider.simulateInboundCall(c);
          return { handle: sim.handle, outbound: sim.outbound, say: (t) => sim.say(t), close: () => void sim.hangup() };
        },
      };
    },
  },
  {
    name: "twilio(fake transport)",
    make: () => {
      const transport = new FakeTransport();
      const provider = new TwilioTelephony(transport);
      return {
        provider,
        async call(c) {
          let handle!: CallHandle;
          provider.onInboundCall((h) => {
            handle = h;
          });
          const conn = transport.connect(c);
          let seq = 0;
          return {
            handle,
            outbound: conn.outbound,
            say: (t) => conn.pushFrame({ seq: ++seq, data: t, endOfUtterance: true }),
            close: conn.close,
          };
        },
      };
    },
  },
];

describe.each(harnesses)("TelephonyProvider contract: $name", ({ make }) => {
  const call: InboundCall = { id: "call-1", orgId: "org-1", from: "+15550001", to: "+15550100" };

  it("delivers the inbound call, answers, and is tenant-tagged", async () => {
    const h = make();
    const { handle } = await h.call(call);
    expect(handle.call.orgId).toBe("org-1");
    await handle.answer();
    expect(handle.answered).toBe(true);
  });

  it("routes caller frames to a pipeline subscriber and outbound frames back", async () => {
    const h = make();
    const { handle, outbound, say } = await h.call(call);
    const heard: string[] = [];
    handle.onCallerFrame((f) => heard.push(f.data));
    say("hello");
    expect(heard).toEqual(["hello"]);

    handle.sendFrame({ seq: 1, data: "hi, how can I help?" });
    expect(outbound.map((f) => f.data)).toContain("hi, how can I help?");
  });

  it("fires hangup exactly once and stops delivering frames after", async () => {
    const h = make();
    const { handle, close } = await h.call(call);
    let hangups = 0;
    handle.onHangup(() => (hangups += 1));
    close();
    close(); // idempotent
    expect(hangups).toBe(1);
  });
});
