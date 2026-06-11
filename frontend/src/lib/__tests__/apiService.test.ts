import { describe, it, expect, vi, afterEach } from "vitest";
import { invokeDeepseek } from "../apiService";

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

  it("throws on non-OK response with status in message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("error", { status: 503 }),
    );

    await expect(invokeDeepseek("hi")).rejects.toThrow("503");
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

    await expect(promise).rejects.toThrow("timed out");
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
