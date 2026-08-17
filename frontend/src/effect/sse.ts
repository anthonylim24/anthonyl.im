import { Effect } from "effect"
import { readSseStream, type SseReadOptions, type SseReadResult } from "../lib/sseStream"
import { StreamError } from "./errors"

export const readSse = (
  body: ReadableStream<Uint8Array> | null,
  opts: SseReadOptions,
): Effect.Effect<SseReadResult, Error | StreamError> =>
  Effect.gen(function* () {
    if (!body) return yield* Effect.fail(new StreamError({ message: "Response body is empty" }))
    return yield* Effect.tryPromise({
      try: () => readSseStream(body, opts),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
  })
