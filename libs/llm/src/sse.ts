/**
 * Minimal SSE parsing shared by the streaming providers. Both the Anthropic
 * Messages API and OpenAI-compatible Chat Completions (DeepSeek) frame events as
 * `data: <json>\n\n` lines, terminate with `[DONE]`, and may interleave
 * keep-alive noise — one parser covers both. Internal to this package.
 */

/** Parse an SSE stream body into JSON events (skips `[DONE]` and malformed lines). */
export async function* parseSseJson<T>(body: ReadableStream<Uint8Array>): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!dataLine) continue;
      const json = dataLine.slice(5).trim();
      if (!json || json === "[DONE]") continue;
      try {
        yield JSON.parse(json) as T;
      } catch {
        /* skip malformed keep-alive lines */
      }
    }
  }
}
