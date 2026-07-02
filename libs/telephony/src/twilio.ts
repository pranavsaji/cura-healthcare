import { BaseCallHandle } from "./call-handle.js";
import type { AudioFrame, InboundCall, TelephonyProvider } from "./types.js";

/**
 * A media transport a real carrier adapter binds to. Twilio's `<Stream>` and
 * LiveKit's rooms both reduce to: "here is an inbound call and a duplex audio
 * channel." Abstracting it this way keeps {@link TwilioTelephony} tiny and lets
 * it be contract-tested with a fake transport (no live socket in CI).
 */
export interface TransportChannel {
  send(frame: AudioFrame): void;
  onFrame(cb: (frame: AudioFrame) => void): void;
  onClose(cb: () => void): void;
  close(): void;
  /** Notify the carrier the call was answered (e.g. accept the Twilio stream). */
  answered(): void;
}

export interface MediaTransport {
  readonly name: string;
  onInbound(cb: (call: InboundCall, channel: TransportChannel) => void): void;
}

/**
 * Real carrier adapter (Twilio Media Streams / LiveKit). Implements the SAME
 * {@link TelephonyProvider} interface as the mock by binding to an injected
 * {@link MediaTransport}. Because the transport is injected, this adapter is unit-
 * and contract-testable without any network.
 */
export class TwilioTelephony implements TelephonyProvider {
  readonly name: string;

  constructor(
    private readonly transport: MediaTransport,
    name = "twilio",
  ) {
    this.name = name;
  }

  onInboundCall(handler: (handle: BaseCallHandle) => void | Promise<void>): void {
    this.transport.onInbound((call, channel) => {
      const handle = new BaseCallHandle(
        call,
        (frame) => channel.send(frame),
        () => channel.answered(),
      );
      channel.onFrame((frame) => handle.emitCallerFrame(frame));
      channel.onClose(() => void handle.hangup());
      void handler(handle);
    });
  }
}
