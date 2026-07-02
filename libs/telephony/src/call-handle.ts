import type { AudioFrame, CallHandle, InboundCall } from "./types.js";

/**
 * Base call-channel mechanics shared by every adapter: subscriber lists, the
 * answered flag, hangup fan-out. Adapters supply how an OUTBOUND frame actually
 * leaves the process (in-memory queue for the mock; a media socket for Twilio/
 * LiveKit) via {@link onSend}. This keeps the vendor adapters tiny + uniform.
 */
export class BaseCallHandle implements CallHandle {
  private callerCbs: ((f: AudioFrame) => void)[] = [];
  private hangupCbs: (() => void)[] = [];
  private _answered = false;
  private _ended = false;

  constructor(
    readonly call: InboundCall,
    /** How an outbound frame leaves this process (transport-specific). */
    private readonly onSend: (frame: AudioFrame) => void,
    /** Called once when the call is answered (transport may notify the carrier). */
    private readonly onAnswer: () => void | Promise<void> = () => {},
  ) {}

  get answered(): boolean {
    return this._answered;
  }

  async answer(): Promise<void> {
    if (this._answered) return;
    this._answered = true;
    await this.onAnswer();
  }

  onCallerFrame(cb: (frame: AudioFrame) => void): void {
    this.callerCbs.push(cb);
  }

  /** Adapter → pipeline: deliver an inbound caller frame to subscribers. */
  emitCallerFrame(frame: AudioFrame): void {
    if (this._ended) return;
    for (const cb of this.callerCbs) cb(frame);
  }

  sendFrame(frame: AudioFrame): void {
    if (this._ended) return;
    this.onSend(frame);
  }

  onHangup(cb: () => void): void {
    this.hangupCbs.push(cb);
  }

  async hangup(): Promise<void> {
    if (this._ended) return;
    this._ended = true;
    for (const cb of this.hangupCbs) cb();
  }
}
