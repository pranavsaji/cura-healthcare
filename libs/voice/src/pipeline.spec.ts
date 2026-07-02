import { describe, expect, it } from "vitest";
import { BaseCallHandle, type AudioFrame, type InboundCall } from "@cura/telephony";
import { MockStt, MockTts } from "./mocks.js";
import { VoicePipeline } from "./pipeline.js";

const CALL: InboundCall = { id: "c1", orgId: "org-1", from: "+1", to: "+2" };

function handleWithCapture(): { handle: BaseCallHandle; outbound: AudioFrame[] } {
  const outbound: AudioFrame[] = [];
  const handle = new BaseCallHandle(CALL, (f) => outbound.push(f));
  return { handle, outbound };
}

describe("VoicePipeline", () => {
  it("answers and speaks a greeting as the FIRST audio (SLO metric set)", async () => {
    const { handle, outbound } = handleWithCapture();
    const pipeline = new VoicePipeline({
      stt: new MockStt(),
      tts: new MockTts(),
      respond: async () => "unused",
      greeting: "Thanks for calling Cura, how can I help?",
    });
    const session = pipeline.attach(handle);
    await session.start();

    expect(outbound.length).toBeGreaterThan(0);
    expect(outbound.map((f) => f.data).join(" ")).toContain("Thanks for calling");
    expect(session.metrics.firstResponseMs).toBeDefined();
    // The SLO: first agent audio within 2 seconds of answering.
    expect(session.metrics.firstResponseMs!).toBeLessThan(2000);
  });

  it("endpoints a caller utterance, transcribes, and speaks the agent reply", async () => {
    const { handle, outbound } = handleWithCapture();
    const heard: string[] = [];
    const pipeline = new VoicePipeline({
      stt: new MockStt(),
      tts: new MockTts(),
      respond: async (utterance) => {
        heard.push(utterance);
        return `You said ${utterance}`;
      },
    });
    const session = pipeline.attach(handle);
    await session.start();

    // Two frames, boundary on the second (endpointing).
    handle.emitCallerFrame({ seq: 1, data: "I need", endOfUtterance: false });
    handle.emitCallerFrame({ seq: 2, data: "an appointment", endOfUtterance: true });
    await session.idle();

    expect(heard).toEqual(["I need an appointment"]);
    expect(outbound.map((f) => f.data).join(" ")).toContain("You said I need an appointment");
  });

  it("BARGE-IN: a caller frame during agent speech cancels the rest of the reply", async () => {
    const { handle, outbound } = handleWithCapture();
    let between = 0;
    const pipeline = new VoicePipeline({
      stt: new MockStt(),
      tts: new MockTts(),
      // Long reply so there are many frames to interrupt.
      respond: async () => "one two three four five six seven eight",
      betweenFrames: async () => {
        between += 1;
        // After the 2nd frame is sent, the caller interrupts.
        if (between === 2) {
          handle.emitCallerFrame({ seq: 99, data: "stop", endOfUtterance: true });
        }
      },
    });
    const session = pipeline.attach(handle);
    await session.start();

    // Kick off the agent's long reply.
    handle.emitCallerFrame({ seq: 1, data: "tell me everything", endOfUtterance: true });
    await session.idle();

    // The agent was cut off: it sent fewer than all 8 words of the first reply.
    const firstReplyFrames = outbound.filter((f) =>
      ["one", "two", "three", "four", "five", "six", "seven", "eight"].includes(f.data),
    );
    expect(firstReplyFrames.length).toBeLessThan(8);
    expect(session.metrics.bargeIns).toBeGreaterThanOrEqual(1);
  });
});
