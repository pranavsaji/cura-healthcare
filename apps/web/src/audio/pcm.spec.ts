import { describe, it, expect } from "vitest";
import { pcm16ToBase64 } from "./mic.js";

// Pure-fn coverage only: the capture pipeline itself needs a real AudioContext
// (jsdom has none) and is exercised by the live app, not unit tests.

describe("pcm16ToBase64", () => {
  it("round-trips PCM16 bytes through base64", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 12345]);
    const b64 = pcm16ToBase64(pcm.buffer);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    expect(new Int16Array(bytes.buffer)).toEqual(pcm);
  });

  it("handles buffers larger than the 32k chunking window", () => {
    const pcm = new Int16Array(40_000).fill(1000); // 80k bytes > 0x8000 chunk
    const b64 = pcm16ToBase64(pcm.buffer);
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const decoded = new Int16Array(bytes.buffer);
    expect(decoded.length).toBe(40_000);
    expect(decoded[0]).toBe(1000);
    expect(decoded[39_999]).toBe(1000);
  });

  it("encodes an empty buffer to an empty string", () => {
    expect(pcm16ToBase64(new ArrayBuffer(0))).toBe("");
  });
});
