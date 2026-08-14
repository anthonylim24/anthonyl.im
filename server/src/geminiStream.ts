/** Shared Gemini response-text extraction for concierge + trips AI.
 *
 *  Gemini 3.x streams several shapes: SSE `data: {GenerateContentResponse}`,
 *  newline-delimited JSON (when `alt=sse` is dropped), a single JSON body,
 *  and parts that mix `thought: true` scratchpads with the visible answer.
 *  One helper keeps those quirks out of each route. */

export type GeminiPart = {
  text?: string
  thought?: boolean
}

export type GeminiStreamChunk = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    text?: string
    finishReason?: string
  }>
  promptFeedback?: { blockReason?: string }
  text?: string
}

export function textFromGeminiParts(parts: GeminiPart[] | undefined): string {
  if (!parts?.length) return ""
  let out = ""
  for (const part of parts) {
    if (part.thought || typeof part.text !== "string" || !part.text) continue
    out += part.text
  }
  return out
}

export function extractGeminiTextDelta(chunk: GeminiStreamChunk): string {
  const candidate = chunk.candidates?.[0]
  const fromParts = textFromGeminiParts(candidate?.content?.parts)
  if (fromParts) return fromParts
  if (typeof candidate?.text === "string" && candidate.text) return candidate.text
  if (typeof chunk.text === "string" && chunk.text) return chunk.text
  return ""
}

export interface GeminiStreamLine {
  delta: string
  finishReason?: string
  blockReason?: string
}

/** Parse one stream line — SSE (`data: …`) or raw NDJSON. */
export function parseGeminiStreamLine(line: string): GeminiStreamLine | null {
  const trimmed = line.trim()
  if (!trimmed || trimmed === "[DONE]") return null
  const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed
  if (!payload || payload === "[DONE]") return null
  try {
    const json = JSON.parse(payload) as GeminiStreamChunk
    if (!json || typeof json !== "object") return null
    return {
      delta: extractGeminiTextDelta(json),
      finishReason: json.candidates?.[0]?.finishReason,
      blockReason: json.promptFeedback?.blockReason,
    }
  } catch {
    return null
  }
}

export interface GeminiRelayResult {
  sawText: boolean
  finishReason?: string
  blockReason?: string
}

/** Read a Gemini HTTP body (SSE, NDJSON, or one JSON object) and emit text deltas. */
export async function relayGeminiChatBody(
  body: ReadableStream<Uint8Array>,
  writeDelta: (text: string) => Promise<void>,
): Promise<GeminiRelayResult> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let raw = ""
  let sawText = false
  let finishReason: string | undefined
  let blockReason: string | undefined

  const flushLine = async (line: string) => {
    const parsed = parseGeminiStreamLine(line)
    if (!parsed) return
    if (parsed.blockReason) blockReason = parsed.blockReason
    if (parsed.finishReason) finishReason = parsed.finishReason
    if (parsed.delta) {
      sawText = true
      await writeDelta(parsed.delta)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      const tail = decoder.decode()
      raw += tail
      buffer += tail
      break
    }
    const decoded = decoder.decode(value, { stream: true })
    raw += decoded
    buffer += decoded
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) await flushLine(line)
  }
  if (buffer) await flushLine(buffer)

  if (!sawText) {
    const leftover = extractGeminiTextFromBody(raw)
    if (leftover?.delta) {
      sawText = true
      if (leftover.finishReason) finishReason = leftover.finishReason
      if (leftover.blockReason) blockReason = leftover.blockReason
      await writeDelta(leftover.delta)
    }
  }

  return { sawText, finishReason, blockReason }
}

/** Last-resort parse when Gemini returned one JSON object instead of SSE. */
export function extractGeminiTextFromBody(raw: string): GeminiStreamLine | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null
  try {
    const json = JSON.parse(trimmed) as GeminiStreamChunk
    if (!json || typeof json !== "object") return null
    return {
      delta: extractGeminiTextDelta(json),
      finishReason: json.candidates?.[0]?.finishReason,
      blockReason: json.promptFeedback?.blockReason,
    }
  } catch {
    return null
  }
}
