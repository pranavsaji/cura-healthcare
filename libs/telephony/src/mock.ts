import { BaseCallHandle } from "./call-handle.js";
import type { AudioFrame, InboundCall, TelephonyProvider } from "./types.js";

/**
 * In-memory telephony for offline dev/tests. `simulateInboundCall` creates a
 * call, dispatches it to the registered handler, and returns a {@link CallSim}
 * the test drives: push caller utterances, observe the agent's outbound frames,
 * hang up. Deterministic — no network, no timers.
 */
export interface CallSim {
  handle: BaseCallHandle;
  /** The agent's outbound frames (TTS), in order — what the caller "hears". */
  outbound: AudioFrame[];
  /** Push a caller utterance (optionally marking end-of-utterance). */
  say(text: string, endOfUtterance?: boolean): void;
  hangup(): Promise<void>;
}

export class MockTelephony implements TelephonyProvider {
  readonly name = "mock";
  private handler?: (handle: BaseCallHandle) => void | Promise<void>;

  onInboundCall(handler: (handle: BaseCallHandle) => void | Promise<void>): void {
    this.handler = handler;
  }

  /** Simulate an inbound call end-to-end. Returns the sim harness. */
  async simulateInboundCall(call: InboundCall): Promise<CallSim> {
    const outbound: AudioFrame[] = [];
    const handle = new BaseCallHandle(call, (frame) => outbound.push(frame));
    let seq = 0;
    const sim: CallSim = {
      handle,
      outbound,
      say(text, endOfUtterance = true) {
        seq += 1;
        handle.emitCallerFrame({ seq, data: text, endOfUtterance });
      },
      hangup: () => handle.hangup(),
    };
    // Dispatch to the app's inbound handler (which answers + wires the pipeline).
    await this.handler?.(handle);
    return sim;
  }
}
