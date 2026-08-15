import { Effect } from "effect"
import { fetchApi } from "../effect/http"
import { runPromise } from "../effect/runtime"
import { readSse } from "../effect/sse"
import { StreamError, TimeoutError } from "../effect/errors"

interface Message {
  role: "user" | "assistant"
  content: string
}

interface ApiResponse {
  content: string
  error?: string
}

const WATCHDOG_INTERVAL_MS = 5_000
const WATCHDOG_SILENCE_LIMIT_MS = 45_000

function isTimeoutCause(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.message.includes("timed out"))
  )
}

const invokeDeepseekEffect = Effect.fn("ChatService.invokeDeepseek")(function* (
  prompt: string,
  messages: Message[] = [],
  onUpdate?: (content: string) => void,
) {
  const controller = new AbortController()
  let lastActivity = Date.now()
  const watchdog = setInterval(() => {
    if (Date.now() - lastActivity > WATCHDOG_SILENCE_LIMIT_MS) {
      controller.abort(new Error("Response timed out — please try again."))
    }
  }, WATCHDOG_INTERVAL_MS)

  let content = ""
  const program = Effect.gen(function* () {
    const response = yield* fetchApi("/api/invoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ prompt, messages }),
      credentials: "include",
      signal: controller.signal,
    })

    if (!response.ok) {
      return yield* Effect.fail(new Error(`HTTP error! status: ${response.status}`))
    }
    if (!response.body) {
      return yield* Effect.fail(new StreamError({ message: "Response body is null" }))
    }

    const { completed } = yield* readSse(response.body, {
      signal: controller.signal,
      onData: (data) => {
        lastActivity = Date.now()
        let chunk: string
        try {
          chunk = JSON.parse(data) as string
        } catch {
          chunk = data
        }
        content += chunk
        try {
          onUpdate?.(content)
        } catch {
          /* swallow — callback errors must not corrupt content */
        }
      },
    })

    if (!completed) {
      return yield* Effect.fail(new TimeoutError({
        message: "Response timed out — please try again.",
        partialContent: content || undefined,
      }))
    }

    return { content } satisfies ApiResponse
  }).pipe(
    Effect.catchAll((err) =>
      isTimeoutCause(err)
        ? Effect.fail(new TimeoutError({
            message: "Response timed out — please try again.",
            partialContent: content || undefined,
          }))
        : Effect.fail(err instanceof Error ? err : new Error(String(err))),
    ),
    Effect.ensuring(Effect.sync(() => clearInterval(watchdog))),
  )

  return yield* program
})

export async function invokeDeepseek(
  prompt: string,
  messages: Message[] = [],
  onUpdate?: (content: string) => void,
): Promise<ApiResponse> {
  return runPromise(invokeDeepseekEffect(prompt, messages, onUpdate))
}
