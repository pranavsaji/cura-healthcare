/**
 * Telephony behind one interface. Twilio, LiveKit, or a mock all satisfy the
 * same {@link TelephonyProvider} + {@link CallHandle} shape (Phase 17 mandate),
 * so the voice pipeline + orchestrator never import a vendor SDK (CONVENTIONS §2).
 * Media flows as opaque {@link AudioFrame}s in both directions; the mock uses a
 * text payload so tests are deterministic, while a real adapter carries codec
 * bytes — the interface is identical.
 */

/** One chunk of audio in either direction. `data` is opaque to telephony. */
export interface AudioFrame {
  seq: number;
  /** Opaque payload — text for the mock, base64 codec bytes for real adapters. */
  data: string;
  /** True on the frame that ends a caller utterance (endpointing hint). */
  endOfUtterance?: boolean;
}

/** An inbound call, always tagged with the tenant it belongs to. */
export interface InboundCall {
  id: string;
  orgId: string;
  from: string;
  to: string;
}

/** A live, bidirectional call channel. */
export interface CallHandle {
  readonly call: InboundCall;
  readonly answered: boolean;
  /** Pick up the call. The orchestrator measures answer latency (< 2s SLO). */
  answer(): Promise<void>;
  /** Subscribe to inbound caller audio frames. */
  onCallerFrame(cb: (frame: AudioFrame) => void): void;
  /** Send an outbound audio frame (TTS). */
  sendFrame(frame: AudioFrame): void;
  onHangup(cb: () => void): void;
  hangup(): Promise<void>;
}

/** A telephony carrier. Registers a handler invoked for every inbound call. */
export interface TelephonyProvider {
  readonly name: string;
  onInboundCall(handler: (handle: CallHandle) => void | Promise<void>): void;
}
