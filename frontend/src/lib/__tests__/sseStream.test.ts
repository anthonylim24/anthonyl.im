import { describe, it, expect } from "vitest";
import { readSseStream } from "../sseStream";

function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("readSseStream", () => {
  it("emits multiple data lines from one chunk", async () => {
    const received: string[] = [];
    await readSseStream(
      makeStream([`data: foo\ndata: bar\ndata: [DONE]\n`]),
      { onData: (d) => received.push(d) },
    );
    expect(received).toEqual(["foo", "bar"]);
  });

  it("handles a data line split across two chunks", async () => {
    const received: string[] = [];
    await readSseStream(
      makeStream([`data: hel`, `lo\ndata: [DONE]\n`]),
      { onData: (d) => received.push(d) },
    );
    expect(received).toEqual(["hello"]);
  });

  it("[DONE] terminates without emitting it", async () => {
    const received: string[] = [];
    await readSseStream(
      makeStream([`data: hi\ndata: [DONE]\ndata: ignored\n`]),
      { onData: (d) => received.push(d) },
    );
    expect(received).toEqual(["hi"]);
  });

  it("flushes a trailing data line with no final newline", async () => {
    const received: string[] = [];
    await readSseStream(
      makeStream([`data: tail`]), // no trailing newline
      { onData: (d) => received.push(d) },
    );
    expect(received).toEqual(["tail"]);
  });

  it("propagates errors from onData", async () => {
    await expect(
      readSseStream(
        makeStream([`data: boom\n`]),
        { onData: () => { throw new Error("cb error"); } },
      ),
    ).rejects.toThrow("cb error");
  });

  it("reader lock is released after an error (stream can be re-read)", async () => {
    // If releaseLock is NOT called in finally, getReader() on the same stream
    // will throw "ReadableStream is locked". We verify the finally path by
    // catching the error then successfully acquiring the reader again.
    const stream = makeStream([`data: boom\n`]);
    try {
      await readSseStream(stream, { onData: () => { throw new Error("cb error"); } });
    } catch {
      // expected
    }
    // Should not throw — lock was released
    expect(() => stream.getReader()).not.toThrow();
  });
});
