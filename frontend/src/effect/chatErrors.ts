import { Schema } from "effect"

/** Shared remapping for concierge SSE (Korea + trips). */

export const CONCIERGE_CUTOFF_ERROR = "The concierge lost its connection. Please try again."

export function isLostConnection(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /network\s*error|failed to fetch|load failed|opaqueredirect/i.test(message)
}

export function remapChatFailure(err: unknown): Error {
  if (err instanceof DOMException && err.name === "AbortError") return err
  if (isLostConnection(err)) {
    return new Error(CONCIERGE_CUTOFF_ERROR)
  }
  return err instanceof Error ? err : new Error(String(err))
}

export function errorIfIncomplete(completed: boolean, existing?: string): string | undefined {
  if (existing) return existing
  return completed ? undefined : CONCIERGE_CUTOFF_ERROR
}

/* ── Lim (`/api/invoke`) ─────────────────────────────── */

/**
 * What Lim says when a reply does not come through, in Lim's voice. The
 * status code and server detail go to the console, never on screen.
 */
export const LIM_ERRORS = {
  tooLong: "That's more than I can take in at once. Try a shorter message.",
  busy: "I need a breather. Try again in a minute.",
  server: "My insides went wobbly for a moment. Try again in a bit.",
  /** The server said something went wrong part-way (an SSE `{error}` event). */
  broke: "Something went wrong on my end part-way through. Try again.",
  /** The stream ended without `[DONE]`. */
  cut: "I lost the connection part-way through. Try again.",
  /** The watchdog: nothing arrived for a long while. */
  silent: "I went quiet for too long. Try again.",
  offline: "I couldn't reach the server. Check your connection and try again.",
  unknown: "The reply didn't come through. Try again.",
} as const

/** Lim's line for a non-OK `/api/invoke` answer. */
export function limHttpError(status: number): string {
  if (status === 400 || status === 413) return LIM_ERRORS.tooLong
  if (status === 429) return LIM_ERRORS.busy
  if (status >= 500) return LIM_ERRORS.server
  return LIM_ERRORS.unknown
}

/**
 * Lim's reply stream failed after it opened: the server reported an error
 * (`server`), the connection ended without `[DONE]` (`cut`), or the request
 * never reached it (`offline`). `message` is what Lim says; whatever had
 * already arrived is kept in `partialContent`.
 */
export class ReplyStreamError extends Schema.TaggedError<ReplyStreamError>()("ReplyStreamError", {
  reason: Schema.Literal("server", "cut", "offline"),
  message: Schema.String,
  partialContent: Schema.optional(Schema.String),
}) {}
