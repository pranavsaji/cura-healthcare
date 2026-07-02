import { systemClock, type Clock } from "@cura/core";
import type { AudioFrame, CallHandle } from "@cura/telephony";
import type { PipelineMetrics, Responder, SpeechToText, TextToSpeech } from "./types.js";

export interface PipelineDeps {
  stt: SpeechToText;
  tts: TextToSpeech;
  /** Produces the agent's reply for a transcribed utterance (the agent loop). */
  respond: Responder;
  /** The agent's opening line, spoken immediately on answer (the < 2s response). */
  greeting?: string;
  clock?: Clock;
  /**
   * Awaited between outbound frames — the cooperative yield point where a
   * barge-in can preempt speech. Defaults to a resolved promise (fast path);
   * tests inject a controllable yield to interleave a caller interruption.
   */
  betweenFrames?: () => Promise<void>;
}

/**
 * Turns a {@link CallHandle} into a full-duplex voice agent: caller audio is
 * endpointed into utterances, transcribed, answered by the agent, and spoken
 * back — with **barge-in** (a caller frame during agent speech cancels it). The
 * first agent frame is emitted on answer (the greeting) so the SLO clock — from
 * answer to first audio — is minimized.
 */
export class VoicePipeline {
  constructor(private readonly deps: PipelineDeps) {}

  attach(handle: CallHandle): VoiceSession {
    return new VoiceSession(handle, this.deps);
  }
}

export class VoiceSession {
  private readonly clock: Clock;
  private readonly betweenFrames: () => Promise<void>;
  private buffer: AudioFrame[] = [];
  private speaking = false;
  private interrupt = false;
  private answeredAtMs = 0;
  private chain: Promise<void> = Promise.resolve();
  readonly metrics: PipelineMetrics = { bargeIns: 0, agentUtterances: 0 };

  constructor(
    private readonly handle: CallHandle,
    private readonly deps: PipelineDeps,
  ) {
    this.clock = deps.clock ?? systemClock;
    this.betweenFrames = deps.betweenFrames ?? (() => Promise.resolve());
    this.handle.onCallerFrame((f) => this.onCallerFrame(f));
  }

  /** Answer the call and speak the greeting (the first agent audio). */
  async start(): Promise<void> {
    await this.handle.answer();
    this.answeredAtMs = this.clock.nowMs();
    if (this.deps.greeting) await this.speak(this.deps.greeting);
  }

  /** Await all queued utterance processing (test/quiescence helper). */
  async idle(): Promise<void> {
    await this.chain;
  }

  private onCallerFrame(frame: AudioFrame): void {
    // Barge-in: a caller frame during agent speech preempts the current reply.
    if (this.speaking) {
      this.interrupt = true;
      this.metrics.bargeIns += 1;
    }
    this.buffer.push(frame);
    // Endpointing: an end-of-utterance frame closes the turn.
    if (frame.endOfUtterance) {
      const frames = this.buffer;
      this.buffer = [];
      this.chain = this.chain.then(() => this.handleUtterance(frames));
    }
  }

  private async handleUtterance(frames: AudioFrame[]): Promise<void> {
    const utterance = await this.deps.stt.transcribe(frames);
    if (!utterance) return;
    const reply = await this.deps.respond(utterance);
    await this.speak(reply);
  }

  /** Stream a reply to the caller, honoring barge-in between frames. */
  private async speak(text: string): Promise<void> {
    this.speaking = true;
    this.interrupt = false;
    this.metrics.agentUtterances += 1;
    const frames = this.deps.tts.synthesize(text);
    for (const frame of frames) {
      if (this.interrupt) break; // barge-in: stop mid-utterance
      this.handle.sendFrame(frame);
      if (this.metrics.firstResponseMs === undefined && this.answeredAtMs) {
        this.metrics.firstResponseMs = this.clock.nowMs() - this.answeredAtMs;
      }
      await this.betweenFrames();
    }
    this.speaking = false;
  }
}
