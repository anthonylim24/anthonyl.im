import { Effect } from "effect"
import { readSseStream, type SseReadOptions } from "../lib/sseStream"
import { StreamError } from "./errors"

export const readSse = (
  body: ReadableStream<Uint8Array> | null,
  opts: SseReadOptions,
): Effect.Effect<void, Error | StreamError> =>
  Effect.gen(function* () {
    if (!body) return yield* Effect.fail(new StreamError({ message: "Response body is empty" }))
    yield* Effect.tryPromise({
      try: () => readSseStream(body, opts),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
  })
