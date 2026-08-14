/** Shared Gemini response-text extraction for concierge + trips AI.
 *
 *  Gemini 3.x streams several shapes: SSE `data: {GenerateContentResponse}`,
 *  newline-delimited JSON (when `alt=sse` is dropped), a single JSON body,
 *  and parts that mix `thought: true` scratchpads with the visible answer.
 *  One helper keeps those quirks out of each route. */

import {
  normalizePlaceId,
  safeHttpUrl,
  type GeminiGrounding,
  type GeminiGroundingChunk,
} from "./geminiGrounding"

export type GeminiPart = {
  text?: string
  thought?: boolean
}

type GeminiGroundingChunkRaw = {
  maps?: { uri?: string; title?: string; placeId?: string }
  web?: { uri?: string; title?: string }
}

type GeminiGroundingMetadata = {
  groundingChunks?: GeminiGroundingChunkRaw[]
  webSearchQueries?: string[]
}

export type GeminiStreamChunk = {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    text?: string
    finishReason?: string
    groundingMetadata?: GeminiGroundingMetadata
  }>
  promptFeedback?: { blockReason?: string }
  groundingMetadata?: GeminiGroundingMetadata
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
  grounding?: GeminiGrounding
}

function chunkFromRaw(raw: GeminiGroundingChunkRaw): GeminiGroundingChunk | null {
  if (raw.maps) {
    const uri = safeHttpUrl(raw.maps.uri)
    if (!uri) return null
    return {
      kind: "maps",
      title: typeof raw.maps.title === "string" ? raw.maps.title : "",
      uri,
      placeId: normalizePlaceId(raw.maps.placeId),
    }
  }
  if (raw.web) {
    const uri = safeHttpUrl(raw.web.uri)
    if (!uri) return null
    return {
      kind: "web",
      title: typeof raw.web.title === "string" ? raw.web.title : "",
      uri,
    }
  }
  return null
}

export function groundingFromGeminiChunk(chunk: GeminiStreamChunk): GeminiGrounding | undefined {
  const meta = chunk.candidates?.[0]?.groundingMetadata ?? chunk.groundingMetadata
  if (!meta) return undefined
  const chunks: GeminiGroundingChunk[] = []
  for (const raw of meta.groundingChunks ?? []) {
    const parsed = chunkFromRaw(raw)
    if (parsed) chunks.push(parsed)
  }
  const webSearchQueries = (meta.webSearchQueries ?? []).filter((q): q is string => typeof q === "string" && q.trim() !== "")
  if (chunks.length === 0 && webSearchQueries.length === 0) return undefined
  return { chunks, webSearchQueries }
}

export function mergeGeminiGrounding(
  current: GeminiGrounding | undefined,
  next: GeminiGrounding | undefined,
): GeminiGrounding | undefined {
  if (!current) return next
  if (!next) return current
  const seen = new Set(current.chunks.map((c) => c.uri))
  const chunks = [...current.chunks]
  for (const chunk of next.chunks) {
    if (seen.has(chunk.uri)) continue
    seen.add(chunk.uri)
    chunks.push(chunk)
  }
  const webSearchQueries = [...new Set([...current.webSearchQueries, ...next.webSearchQueries])]
  return { chunks, webSearchQueries }
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
      grounding: groundingFromGeminiChunk(json),
    }
  } catch {
    return null
  }
}

export interface GeminiRelayResult {
  sawText: boolean
  finishReason?: string
  blockReason?: string
  grounding?: GeminiGrounding
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
  let grounding: GeminiGrounding | undefined

  const flushLine = async (line: string) => {
    const parsed = parseGeminiStreamLine(line)
    if (!parsed) return
    if (parsed.blockReason) blockReason = parsed.blockReason
    if (parsed.finishReason) finishReason = parsed.finishReason
    if (parsed.grounding) grounding = mergeGeminiGrounding(grounding, parsed.grounding)
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
      if (leftover.grounding) grounding = mergeGeminiGrounding(grounding, leftover.grounding)
      await writeDelta(leftover.delta)
    }
  }

  return { sawText, finishReason, blockReason, grounding }
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
      grounding: groundingFromGeminiChunk(json),
    }
  } catch {
    return null
  }
}
