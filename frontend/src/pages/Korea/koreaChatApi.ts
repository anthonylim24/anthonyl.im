import { Effect } from "effect"
import { type ConciergeSource } from "../../lib/conciergeGrounding"
import { parseConciergeSsePayload } from "../../lib/conciergeSse"
import { fetchApi, readErrorMessage } from "../../effect/http"
import { runPromise } from "../../effect/runtime"
import { readSse } from "../../effect/sse"
import { HttpStatusError, StreamError } from "../../effect/errors"

export interface KoreaChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface KoreaChatResult {
  content: string
  error?: string
  sources?: ConciergeSource[]
}

const streamKoreaChatEffect = Effect.fn("KoreaChatService.stream")(function* (
  prompt: string,
  messages: KoreaChatMessage[],
  slug: string | undefined,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
) {
  const response = yield* fetchApi("/api/korea/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ prompt, messages, slug }),
    credentials: "include",
    signal,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    const parsed = yield* readErrorMessage(response, "message-only")
    if (parsed !== `HTTP ${response.status}`) message = parsed
    return yield* Effect.fail(new HttpStatusError({ status: response.status, message }))
  }

  if (!response.body) {
    return yield* Effect.fail(new StreamError({ message: "Response body is empty" }))
  }

  let content = ""
  let streamError: string | undefined
  let sources: ConciergeSource[] | undefined

  yield* readSse(response.body, {
    signal,
    onData: (data) => {
      const parsed = parseConciergeSsePayload(data)
      if (parsed.kind === "text") {
        content += parsed.text
        onUpdate(content)
      } else if (parsed.kind === "error") {
        streamError = parsed.error
      } else if (parsed.kind === "sources") {
        sources = parsed.sources
      }
    },
  })

  return { content, error: streamError, sources } satisfies KoreaChatResult
})

export function streamKoreaChat(
  prompt: string,
  messages: KoreaChatMessage[],
  slug: string | undefined,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
): Promise<KoreaChatResult> {
  return runPromise(streamKoreaChatEffect(prompt, messages, slug, onUpdate, signal))
}
