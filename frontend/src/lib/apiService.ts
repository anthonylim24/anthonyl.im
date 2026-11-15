import { Effect } from "effect"
import { fetchApi } from "../effect/http"
import { runPromise } from "../effect/runtime"
import { readSse } from "../effect/sse"
import { HttpStatusError, TimeoutError } from "../effect/errors"
import { LIM_ERRORS, ReplyStreamError, isLostConnection, limHttpError } from "../effect/chatErrors"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface ApiResponse {
  content: string
}

/** How a reply can fail: a Stop is an `AbortError`, everything else carries Lim's line. */
export type InvokeFailure = HttpStatusError | ReplyStreamError | TimeoutError | DOMException

const WATCHDOG_INTERVAL_MS = 5_000
const WATCHDOG_SILENCE_LIMIT_MS = 45_000

/**
 * One `data:` payload from `/api/invoke`. The server JSON-encodes each chunk
 * as a string, and reports a failure part-way as `{"error": "…"}` with no
 * `[DONE]` after it. Anything else (a bare line, another shape) is not text
 * Lim wrote and is dropped rather than shown.
 */
export function readInvokeChunk(data: string): { text: string } | { error: string } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof parsed === "string") return { text: parsed }
  if (typeof parsed === "object" && parsed !== null && "error" in parsed) {
    const { error } = parsed as { error: unknown }
    return { error: typeof error === "string" ? error : "unknown" }
  }
  return null
}

const invokeDeepseekEffect = Effect.fn("ChatService.invokeDeepseek")(function* (
  prompt: string,
  messages: Message[] = [],
  onUpdate?: (content: string) => void,
  signal?: AbortSignal,
  world?: unknown,
) {
  const controller = new AbortController()
  // Caller-driven cancel (Stop button) shares the watchdog's abort path.
  const forwardAbort = () => controller.abort(signal?.reason)
  if (signal?.aborted) forwardAbort()
  else signal?.addEventListener("abort", forwardAbort, { once: true })
  let lastActivity = Date.now()
  let silent = false
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > WATCHDOG_SILENCE_LIMIT_MS) {
      silent = true
      controller.abort(new Error("Response timed out"))
    }
  }, WATCHDOG_INTERVAL_MS)

  let content = ""
  const partial = () => content || undefined
  const program = Effect.gen(function* () {
    const response = yield* fetchApi("/api/invoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(world ? { prompt, messages, world } : { prompt, messages }),
      credentials: "include",
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn(`[chat] /api/invoke answered ${response.status}`)
      return yield* Effect.fail(new HttpStatusError({ status: response.status, message: limHttpError(response.status) }))
    }

    const { completed } = yield* readSse(response.body, {
      signal: controller.signal,
      onData: (data) => {
        lastActivity = Date.now()
        const chunk = readInvokeChunk(data)
        if (chunk === null) return
        if ("error" in chunk) {
          console.warn(`[chat] reply failed on the server: ${chunk.error}`)
          // Ends the read; readSse passes the tagged error through as is.
          throw new ReplyStreamError({ reason: "server", message: LIM_ERRORS.broke, partialContent: partial() })
        }
        content += chunk.text
        try {
          onUpdate?.(content)
        } catch {
          /* swallow — callback errors must not corrupt content */
        }
      },
    })

    if (!completed) {
      return yield* Effect.fail(new ReplyStreamError({ reason: "cut", message: LIM_ERRORS.cut, partialContent: partial() }))
    }

    return { content } satisfies ApiResponse
  }).pipe(
    Effect.catchAll((err): Effect.Effect<never, InvokeFailure> => {
      if (err instanceof ReplyStreamError || err instanceof HttpStatusError) return Effect.fail(err)
      // The visitor's Stop: hand the abort back as it is, so the caller tells it from a failure.
      if (signal?.aborted) return Effect.fail(new DOMException("Aborted", "AbortError"))
      if (silent) return Effect.fail(new TimeoutError({ message: LIM_ERRORS.silent, partialContent: partial() }))
      if (isLostConnection(err)) {
        return Effect.fail(new ReplyStreamError({ reason: content ? "cut" : "offline", message: content ? LIM_ERRORS.cut : LIM_ERRORS.offline, partialContent: partial() }))
      }
      console.warn("[chat] reply failed:", err)
      return Effect.fail(new ReplyStreamError({ reason: "cut", message: LIM_ERRORS.unknown, partialContent: partial() }))
    }),
    Effect.ensuring(Effect.sync(() => {
      clearInterval(watchdog)
      signal?.removeEventListener("abort", forwardAbort)
    })),
  )

  return yield* program
})

/**
 * Ask Lim. Resolves with the whole reply; rejects with an `AbortError` after
 * a Stop, or with a typed error whose `message` is Lim's own line and whose
 * `partialContent` keeps what had arrived: `HttpStatusError` (400 / 413 /
 * 429 / 5xx), `ReplyStreamError` (server error event, connection cut,
 * offline) or `TimeoutError` (45 s of silence).
 */
export async function invokeDeepseek(
  prompt: string,
  messages: Message[] = [],
  onUpdate?: (content: string) => void,
  signal?: AbortSignal,
  /** Lim's toy world, when it is up: lets the model answer an order for it. */
  world?: unknown,
): Promise<ApiResponse> {
  return runPromise(invokeDeepseekEffect(prompt, messages, onUpdate, signal, world))
}
