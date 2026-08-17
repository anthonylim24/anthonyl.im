import { Schema } from "effect"

/** HTTP response was not OK. `message` is the user-facing string (same as the
 *  pre-Effect `throw new Error(message)` contract). */
export class HttpStatusError extends Schema.TaggedError<HttpStatusError>()("HttpStatusError", {
  status: Schema.Number,
  message: Schema.String,
}) {}

/** JSON body could not be parsed, or was the wrong shape. */
export class DecodeError extends Schema.TaggedError<DecodeError>()("DecodeError", {
  message: Schema.String,
}) {}

/** SSE stream ended without a body, or the connection dropped. */
export class StreamError extends Schema.TaggedError<StreamError>()("StreamError", {
  message: Schema.String,
}) {}

/** Chat / invoke watchdog fired after prolonged silence. */
export class TimeoutError extends Schema.TaggedError<TimeoutError>()("TimeoutError", {
  message: Schema.String,
  partialContent: Schema.optional(Schema.String),
}) {}

/** Auth token is missing or the server rejected the session. */
export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  message: Schema.String,
}) {}

/** Enhancement polling exceeded its deadline. */
export class PollTimeoutError extends Schema.TaggedError<PollTimeoutError>()("PollTimeoutError", {
  message: Schema.String,
}) {}

/** Display string for any thrown value — TaggedError, Error, or unknown. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === "string" && message.length > 0) return message
  }
  return String(err)
}
