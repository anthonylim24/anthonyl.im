/** Interpret one concierge SSE `data:` payload.
 *
 *  The server normally JSON-encodes a text delta. Gemini (or a proxy) can
 *  also leak a GenerateContentResponse object, a `{ text }` / `{ content }`
 *  wrapper, an `{ error }`, or raw markdown. Accept all of those so a
 *  well-formed answer is never dropped. */

export type ConciergeSseDelta =
  | { kind: "text"; text: string }
  | { kind: "error"; error: string }
  | { kind: "ignore" }

function textFromGeminiShaped(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  const obj = value as Record<string, unknown>
  const candidates = obj.candidates
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== "object") {
    return typeof obj.text === "string" ? obj.text : ""
  }
  const candidate = candidates[0] as Record<string, unknown>
  const content = candidate.content
  if (content && typeof content === "object") {
    const parts = (content as Record<string, unknown>).parts
    if (Array.isArray(parts)) {
      let out = ""
      for (const part of parts) {
        if (!part || typeof part !== "object") continue
        const p = part as { text?: unknown; thought?: unknown }
        if (p.thought || typeof p.text !== "string" || !p.text) continue
        out += p.text
      }
      if (out) return out
    }
  }
  return typeof candidate.text === "string" ? candidate.text : ""
}

function interpretPayload(parsed: unknown): ConciergeSseDelta {
  if (typeof parsed === "string") return parsed ? { kind: "text", text: parsed } : { kind: "ignore" }
  if (typeof parsed === "number" || typeof parsed === "boolean") {
    return { kind: "text", text: String(parsed) }
  }
  if (Array.isArray(parsed)) {
    const texts: string[] = []
    for (const item of parsed) {
      const inner = interpretPayload(item)
      if (inner.kind === "text") texts.push(inner.text)
    }
    return texts.length ? { kind: "text", text: texts.join("") } : { kind: "ignore" }
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>
    if (obj.error != null && obj.error !== "") {
      return { kind: "error", error: errorMessage(obj.error) }
    }
    for (const key of ["text", "content", "delta", "message"] as const) {
      if (typeof obj[key] === "string" && obj[key]) {
        return { kind: "text", text: obj[key] }
      }
    }
    const fromGemini = textFromGeminiShaped(parsed)
    if (fromGemini) return { kind: "text", text: fromGemini }
  }
  return { kind: "ignore" }
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    if (typeof e.message === "string" && e.message) return e.message
    if (typeof e.status === "string" && e.status) return e.status
  }
  return String(err)
}

export function parseConciergeSsePayload(data: string): ConciergeSseDelta {
  if (!data || data === "[DONE]") return { kind: "ignore" }
  try {
    return interpretPayload(JSON.parse(data) as unknown)
  } catch {
    // SSE framing ate the trailing newline. Keep GFM line breaks intact
    // when Gemini (or a proxy) streams raw markdown instead of JSON.
    return { kind: "text", text: data.endsWith("\n") ? data : `${data}\n` }
  }
}
