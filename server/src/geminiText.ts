import { fetchGeminiModel, GEMINI_BASE, GEMINI_MODEL, geminiThinking, isModelUnavailable } from "./igPlaces/gemini"

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
  /** A model other than the app's (`GEMINI_MODEL`). If this key cannot use it, the app model answers instead. */
  model?: string
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

/** POST to `method` on the requested model, stepping down to the app model when this key cannot use it. */
async function post(args: GeminiTextArgs, method: string, signal: AbortSignal): Promise<Response> {
  const f = args.fetchImpl ?? fetch
  const init: RequestInit = { method: "POST", headers: headers(args.apiKey), body: requestBody(args), signal }
  const url = (model: string) => `${GEMINI_BASE}/models/${model}:${method}`
  if (args.model && args.model !== GEMINI_MODEL) {
    const res = await f(url(args.model), init)
    if (res.ok || !(await isModelUnavailable(res))) return res
    await res.text().catch(() => {})
    console.warn(`[gemini] ${args.model} is unavailable to this key; using ${GEMINI_MODEL}`)
  }
  return fetchGeminiModel(f, url(GEMINI_MODEL), init)
}

type Part = { text?: string; thought?: boolean }
const visibleText = (parts: Part[] | undefined) =>
  (parts ?? [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("")

/** One complete answer. Throws on any failure so the caller can fall back. */
export async function geminiText(args: GeminiTextArgs): Promise<string> {
  const res = await post(args, "generateContent", args.signal ?? AbortSignal.timeout(30_000))
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
  const res = await post(args, "streamGenerateContent?alt=sse", args.signal ?? AbortSignal.timeout(120_000))
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
