import { fetchGeminiModel, GEMINI_BASE, GEMINI_MODEL, geminiThinking } from "./igPlaces/gemini"

// Plain text generation on the app's Gemini model, for the small surfaces
// that are not trip planning: entity blurbs and the homepage chatbot. Both
// keep their previous model as the backup when Gemini is missing or fails.

export interface GeminiTurn {
  role: "user" | "assistant"
  content: string
}

interface GeminiTextArgs {
  apiKey: string
  system: string
  /** Earlier turns, oldest first. The last entry must be the user's message. */
  messages: GeminiTurn[]
  /** Ask for a JSON object back. */
  json?: boolean
  maxOutputTokens?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

function requestBody(args: GeminiTextArgs): string {
  return JSON.stringify({
    systemInstruction: { parts: [{ text: args.system }] },
    contents: args.messages.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
    generationConfig: {
      maxOutputTokens: args.maxOutputTokens ?? 2048,
      thinkingConfig: geminiThinking("low"),
      ...(args.json ? { responseMimeType: "application/json" } : {}),
    },
  })
}

const headers = (apiKey: string) => ({ "Content-Type": "application/json", "x-goog-api-key": apiKey })

type Part = { text?: string; thought?: boolean }
const visibleText = (parts: Part[] | undefined) =>
  (parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")

/** One complete answer. Throws on any failure so the caller can fall back. */
export async function geminiText(args: GeminiTextArgs): Promise<string> {
  const res = await fetchGeminiModel(args.fetchImpl ?? fetch, `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: headers(args.apiKey),
    body: requestBody(args),
    signal: args.signal ?? AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`)
  const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Part[] } }> }
  const text = visibleText(body.candidates?.[0]?.content?.parts)
  if (!text) throw new Error("gemini returned an empty response")
  return text
}

/**
 * The answer as it is written. Resolves once the stream is open (so a
 * failure to start can fall back to another model) and then yields text.
 */
export async function geminiTextStream(args: GeminiTextArgs): Promise<AsyncGenerator<string>> {
  const res = await fetchGeminiModel(
    args.fetchImpl ?? fetch,
    `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
    { method: "POST", headers: headers(args.apiKey), body: requestBody(args), signal: args.signal ?? AbortSignal.timeout(120_000) },
  )
  if (!res.ok || !res.body) throw new Error(`gemini ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  return (async function* () {
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let cut: number
      while ((cut = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, cut).trim()
        buffer = buffer.slice(cut + 1)
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        try {
          const chunk = JSON.parse(payload) as { candidates?: Array<{ content?: { parts?: Part[] } }> }
          const text = visibleText(chunk.candidates?.[0]?.content?.parts)
          if (text) yield text
        } catch {
          // A partial or keep-alive line: skip it.
        }
      }
    }
  })()
}
