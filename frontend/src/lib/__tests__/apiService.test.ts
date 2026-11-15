import { describe, it, expect, vi, afterEach } from "vitest";
import { HttpStatusError, TimeoutError } from "../../effect/errors";
import { LIM_ERRORS, ReplyStreamError } from "../../effect/chatErrors";
import { invokeDeepseek, readInvokeChunk } from "../apiService";

function sseResponse(lines: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const l of lines) controller.enqueue(encoder.encode(l));
      controller.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("invokeDeepseek", () => {
  it("accumulates JSON-encoded chunks and resolves on [DONE]", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify("Hello")}\n`,
        `data: ${JSON.stringify(", world")}\n`,
        `data: [DONE]\n`,
      ]),
    );

    const updates: string[] = [];
    const result = await invokeDeepseek("hi", [], (c) => updates.push(c));

    expect(result.content).toBe("Hello, world");
    expect(updates).toEqual(["Hello", "Hello, world"]);
  });

  it("answers a non-OK response in Lim's words, keeping the status for code", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [status, line] of [
      [400, LIM_ERRORS.tooLong],
      [429, LIM_ERRORS.busy],
      [503, LIM_ERRORS.server],
    ] as const) {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("error", { status }));
      const err = await invokeDeepseek("hi").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpStatusError);
      expect((err as HttpStatusError).status).toBe(status);
      expect((err as HttpStatusError).message).toBe(line);
    }
  });

  it("turns a mid-stream {error} event into a typed failure that keeps the partial reply", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify("Anthony is")}\n`,
        `data: ${JSON.stringify({ error: "Streaming error occurred" })}\n`,
      ]),
    );
    const updates: string[] = [];
    const err = await invokeDeepseek("hi", [], (c) => updates.push(c)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReplyStreamError);
    expect((err as ReplyStreamError).reason).toBe("server");
    expect((err as ReplyStreamError).message).toBe(LIM_ERRORS.broke);
    expect((err as ReplyStreamError).partialContent).toBe("Anthony is");
    // The error object never reaches the text.
    expect(updates).toEqual(["Anthony is"]);
    expect(String((err as Error).message)).not.toContain("[object Object]");
  });

  it("drops payloads that are not text chunks", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([`data: ${JSON.stringify("A")}\n`, `data: {"weird":1}\n`, `data: not json\n`, `data: [DONE]\n`]),
    );
    expect((await invokeDeepseek("hi")).content).toBe("A");
  });

  it("hands a Stop back as an AbortError, not a failure", async () => {
    const controller = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    );
    const pending = invokeDeepseek("hi", [], undefined, controller.signal).catch((e: unknown) => e);
    controller.abort();
    const err = await pending;
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe("AbortError");
  });

  it("says when the server could not be reached", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await invokeDeepseek("hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReplyStreamError);
    expect((err as ReplyStreamError).reason).toBe("offline");
    expect((err as ReplyStreamError).message).toBe(LIM_ERRORS.offline);
  });

  it("fires the watchdog after 45 s of silence", async () => {
    vi.useFakeTimers();

    // A stream controlled by us: we enqueue one chunk then let the watchdog fire.
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        streamController = c;
        // Enqueue one chunk so lastActivity is set, but never close.
        c.enqueue(encoder.encode(`data: ${JSON.stringify("hi")}\n`));
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );

    const promise = invokeDeepseek("hi");

    // Advance past the watchdog threshold.
    // We need to let microtasks (reader.read resolving on enqueued chunk) run
    // first, then advance time for the silence window.
    await vi.advanceTimersByTimeAsync(100); // let the first read resolve
    await vi.advanceTimersByTimeAsync(50_000); // fire the watchdog

    // Abort should cause the hung reader.read() to reject — close the stream
    // to unblock it (AbortSignal abort propagates through the fetch mock's body).
    try { streamController!.close(); } catch { /* already closed */ }

    const err = await promise.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).message).toBe(LIM_ERRORS.silent);
    expect((err as TimeoutError).partialContent).toBe("hi");
  });

  it("tells a stream that ended without [DONE] from the watchdog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([`data: ${JSON.stringify("Hello")}\n`]),
    );
    const updates: string[] = [];
    const err = await invokeDeepseek("hi", [], (content) => updates.push(content)).catch((e: unknown) => e);
    expect(err instanceof ReplyStreamError).toBe(true);
    expect((err as ReplyStreamError).reason).toBe("cut");
    expect((err as ReplyStreamError).message).toBe(LIM_ERRORS.cut);
    expect((err as ReplyStreamError).partialContent).toBe("Hello");
    expect(updates).toEqual(["Hello"]);
  });

  it("onUpdate throwing does not double-append (content equals parsed sum)", async () => {
    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      sseResponse([
        `data: ${JSON.stringify("A")}\n`,
        `data: ${JSON.stringify("B")}\n`,
        `data: [DONE]\n`,
      ]),
    );

    const result = await invokeDeepseek("hi", [], () => {
      callCount++;
      if (callCount === 1) throw new Error("first callback throws");
    });

    // Even though the first onUpdate threw, content must be exactly "AB"
    expect(result.content).toBe("AB");
  });
});

describe("readInvokeChunk", () => {
  it("accepts only string chunks and {error} events", () => {
    expect(readInvokeChunk(JSON.stringify("hi\nthere"))).toEqual({ text: "hi\nthere" });
    expect(readInvokeChunk(JSON.stringify({ error: "Streaming error occurred" }))).toEqual({ error: "Streaming error occurred" });
    expect(readInvokeChunk(JSON.stringify({ error: { code: 1 } }))).toEqual({ error: "unknown" });
    for (const bad of ["not json", "42", "null", "[1]", JSON.stringify({ content: "x" })]) expect(readInvokeChunk(bad)).toBeNull();
  });
});
