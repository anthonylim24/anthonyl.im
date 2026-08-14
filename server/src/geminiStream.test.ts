import { describe, expect, test } from "bun:test"
import {
  extractGeminiTextDelta,
  extractGeminiTextFromBody,
  mergeGeminiGrounding,
  parseGeminiStreamLine,
  relayGeminiChatBody,
  textFromGeminiParts,
} from "./geminiStream"

describe("textFromGeminiParts", () => {
  test("joins visible text and skips thought scratchpads", () => {
    expect(
      textFromGeminiParts([
        { thought: true, text: "planning {not json}" },
        { text: "Try **Mingles**." },
        { thought: true, text: "more thinking" },
        { text: " Booked at 7." },
      ]),
    ).toBe("Try **Mingles**. Booked at 7.")
  })

  test("returns empty for missing or thought-only parts", () => {
    expect(textFromGeminiParts(undefined)).toBe("")
    expect(textFromGeminiParts([])).toBe("")
    expect(textFromGeminiParts([{ thought: true, text: "hidden" }])).toBe("")
  })
})

describe("extractGeminiTextDelta", () => {
  test("reads candidates[0].content.parts", () => {
    expect(
      extractGeminiTextDelta({
        candidates: [{ content: { parts: [{ text: "Hello" }, { text: " there" }] } }],
      }),
    ).toBe("Hello there")
  })

  test("falls back to candidate.text or top-level text", () => {
    expect(extractGeminiTextDelta({ candidates: [{ text: "plain" }] })).toBe("plain")
    expect(extractGeminiTextDelta({ text: "top" })).toBe("top")
  })
})

describe("parseGeminiStreamLine", () => {
  test("parses SSE data: lines", () => {
    const chunk = { candidates: [{ content: { parts: [{ text: "# Dinner" }] } }] }
    expect(parseGeminiStreamLine(`data: ${JSON.stringify(chunk)}`)).toEqual({
      delta: "# Dinner",
      finishReason: undefined,
      blockReason: undefined,
      grounding: undefined,
    })
  })

  test("parses raw NDJSON (no data: prefix)", () => {
    const chunk = { candidates: [{ content: { parts: [{ text: "- Mingles" }] }, finishReason: "STOP" }] }
    expect(parseGeminiStreamLine(JSON.stringify(chunk))).toEqual({
      delta: "- Mingles",
      finishReason: "STOP",
      blockReason: undefined,
      grounding: undefined,
    })
  })

  test("extracts Maps grounding metadata", () => {
    const chunk = {
      candidates: [
        {
          content: { parts: [{ text: "Go." }] },
          groundingMetadata: {
            groundingChunks: [{ maps: { title: "Cafe", uri: "https://maps.google.com/?cid=1", placeId: "places/ChIJabcdefgh" } }],
            webSearchQueries: ["cafe nearby"],
          },
        },
      ],
    }
    expect(parseGeminiStreamLine(`data: ${JSON.stringify(chunk)}`)).toEqual({
      delta: "Go.",
      finishReason: undefined,
      blockReason: undefined,
      grounding: {
        chunks: [{ kind: "maps", title: "Cafe", uri: "https://maps.google.com/?cid=1", placeId: "ChIJabcdefgh" }],
        webSearchQueries: ["cafe nearby"],
      },
    })
  })

  test("drops grounding chunks with an unsafe uri", () => {
    const chunk = {
      candidates: [
        {
          content: { parts: [{ text: "Go." }] },
          groundingMetadata: { groundingChunks: [{ web: { title: "X", uri: "javascript:alert(1)" } }] },
        },
      ],
    }
    expect(parseGeminiStreamLine(`data: ${JSON.stringify(chunk)}`)?.grounding).toBeUndefined()
  })

  test("merges grounding chunks across stream lines and dedupes by uri", () => {
    const first = mergeGeminiGrounding(undefined, {
      chunks: [{ kind: "maps", title: "A", uri: "https://maps.google.com/?cid=1" }],
      webSearchQueries: ["a"],
    })
    const merged = mergeGeminiGrounding(first, {
      chunks: [
        { kind: "maps", title: "A again", uri: "https://maps.google.com/?cid=1" },
        { kind: "web", title: "Guide", uri: "https://example.com/guide" },
      ],
      webSearchQueries: ["a", "b"],
    })
    expect(merged).toEqual({
      chunks: [
        { kind: "maps", title: "A", uri: "https://maps.google.com/?cid=1" },
        { kind: "web", title: "Guide", uri: "https://example.com/guide" },
      ],
      webSearchQueries: ["a", "b"],
    })
  })

  test("captures safety blocks and ignores keepalives", () => {
    expect(parseGeminiStreamLine(`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}`)).toEqual({
      delta: "",
      finishReason: undefined,
      blockReason: "SAFETY",
      grounding: undefined,
    })
    expect(parseGeminiStreamLine("")).toBeNull()
    expect(parseGeminiStreamLine("data: [DONE]")).toBeNull()
    expect(parseGeminiStreamLine("not-json")).toBeNull()
  })
})

describe("extractGeminiTextFromBody", () => {
  test("parses a complete GenerateContentResponse body", () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: "```markdown\n**Hi**\n```" }] } }],
    })
    expect(extractGeminiTextFromBody(body)?.delta).toBe("```markdown\n**Hi**\n```")
  })

  test("returns null for non-JSON", () => {
    expect(extractGeminiTextFromBody("hello **world**")).toBeNull()
  })
})

describe("relayGeminiChatBody", () => {
  test("emits visible text from mixed SSE thought + answer parts", async () => {
    const chunk = {
      candidates: [{ content: { parts: [{ thought: true, text: "x" }, { text: "**Hi**" }] } }],
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`))
        controller.close()
      },
    })
    const deltas: string[] = []
    const result = await relayGeminiChatBody(stream, async (d) => {
      deltas.push(d)
    })
    expect(deltas).toEqual(["**Hi**"])
    expect(result.sawText).toBe(true)
  })

  test("flushes a UTF-8 character split across chunks", async () => {
    const chunk = { candidates: [{ content: { parts: [{ text: "안녕" }] } }] }
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`)
    const splitAt = bytes.indexOf(0xec) + 1 // mid-character of 안 (U+C548)
    expect(splitAt).toBeGreaterThan(1)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, splitAt))
        controller.enqueue(bytes.slice(splitAt))
        controller.close()
      },
    })
    const deltas: string[] = []
    const result = await relayGeminiChatBody(stream, async (d) => {
      deltas.push(d)
    })
    expect(deltas.join("")).toBe("안녕")
    expect(result.sawText).toBe(true)
  })
})
