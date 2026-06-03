export interface KoreaChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface KoreaChatResult {
  content: string
  error?: string
}

/**
 * Streams a reply from the Korea trip concierge (Gemini, server-relayed as
 * SSE). Mirrors the home chatbot's `invokeDeepseek` wire format exactly:
 * each `data:` line is a JSON-encoded text delta, terminated by `[DONE]`.
 *
 * @param prompt    the user's message
 * @param messages  prior turns for multi-turn context
 * @param slug      the day the user is currently viewing (e.g. "day-3"),
 *                  or undefined for trip-wide context
 * @param onUpdate  called with the full accumulated content on each delta
 * @param signal    abort signal — lets the UI cancel an in-flight stream
 */
export async function streamKoreaChat(
  prompt: string,
  messages: KoreaChatMessage[],
  slug: string | undefined,
  onUpdate: (content: string) => void,
  signal?: AbortSignal,
): Promise<KoreaChatResult> {
  const response = await fetch("/api/korea/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ prompt, messages, slug }),
    credentials: "include",
    signal,
  })

  if (!response.ok) {
    // The server answers JSON (not SSE) on the un-configured / error paths.
    let message = `Request failed (${response.status})`
    try {
      const body = await response.json()
      if (body?.message) message = body.message
    } catch {
      /* non-JSON body — keep the generic message */
    }
    throw new Error(message)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error("Response body is empty")

  const decoder = new TextDecoder()
  let content = ""
  let buffer = ""
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
      // Fallback: treat the raw payload as text.
      content += data
      onUpdate(content)
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith("data:")) handleData(trimmed.slice(5).trim())
      }
    }
    const tail = buffer.trim()
    if (tail.startsWith("data:")) handleData(tail.slice(5).trim())
  } finally {
    reader.releaseLock()
  }

  return { content, error: streamError }
}
