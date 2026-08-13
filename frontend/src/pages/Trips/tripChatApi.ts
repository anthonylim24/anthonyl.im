import { readSseStream } from "../../lib/sseStream"

export interface TripChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface TripChatResult {
  content: string
  error?: string
}

/**
 * Streams a reply from the trip concierge (Gemini, server-relayed as SSE).
 * Same wire format as the Korea concierge: each `data:` line is a
 * JSON-encoded text delta, terminated by `[DONE]`.
 */
export async function streamTripChat(
  tripId: string,
  prompt: string,
  messages: TripChatMessage[],
  dayId: string | undefined,
  getToken: () => Promise<string | null>,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
): Promise<TripChatResult> {
  const token = await getToken()
  const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ prompt, messages, dayId }),
    credentials: "include",
    signal,
  })

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.message) message = body.message
      else if (body?.error) message = String(body.error)
    } catch {
      /* non-JSON body */
    }
    throw new Error(message)
  }

  if (!response.body) throw new Error("Response body is empty")

  let content = ""
  let streamError: string | undefined

  const handleData = (data: string) => {
    if (data === "[DONE]") return
    try {
      const parsed = JSON.parse(data)
      if (typeof parsed === "string") {
        content += parsed
        onUpdate(content)
      } else if (parsed && typeof parsed === "object" && "error" in parsed) {
        streamError = String((parsed as { error: unknown }).error)
      }
    } catch {
      content += data
      onUpdate(content)
    }
  }

  await readSseStream(response.body, { onData: handleData, signal })

  return { content, error: streamError }
}
