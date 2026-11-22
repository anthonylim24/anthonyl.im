import { describe, expect, test } from "bun:test"
import {
  extractGeminiTextDelta,
  mergeGeminiGrounding,
  parseGeminiStreamLine,
  readGeminiAgentRound,
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

describe("readGeminiAgentRound", () => {
  const body = (chunks: unknown[], split = false) => {
    const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")
    const bytes = new TextEncoder().encode(text)
    return new ReadableStream<Uint8Array>({
      start(controller) {
        // Optionally cut mid-line (and mid-character) like a real socket.
        if (split) {
          controller.enqueue(bytes.slice(0, 37))
          controller.enqueue(bytes.slice(37))
        } else controller.enqueue(bytes)
        controller.close()
      },
    })
  }

  test("separates text, our function calls and server-side tool activity", async () => {
    const seen: string[] = []
    const round = await readGeminiAgentRound(
      body(
        [
          {
            modelVersion: "gemini-4-neon",
            candidates: [{ content: { parts: [{ thoughtSignature: "s1", toolCall: { toolType: "GOOGLE_SEARCH_WEB", args: { queries: ["metro strike"] } } }] } }],
          },
          { candidates: [{ content: { parts: [{ toolResponse: { toolType: "GOOGLE_SEARCH_WEB" } }, { text: "hidden", thought: true }, { text: "Olá, " }] } }] },
          {
            candidates: [
              {
                content: { parts: [{ text: "Lisboa." }, { functionCall: { name: "find_places", args: { query: "café" }, id: "c1" }, thoughtSignature: "s2" }] },
                finishReason: "STOP",
                groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/a", title: "example.com" } }] },
              },
            ],
            usageMetadata: { totalTokenCount: 12 },
          },
        ],
        true,
      ),
      {
        onText: (delta) => void seen.push(`text:${delta}`),
        onServerTool: (call) => void seen.push(`tool:${call.toolType}:${call.queries.join("|")}`),
        onModelVersion: (model) => void seen.push(`model:${model}`),
      },
    )
    expect(seen).toEqual(["model:gemini-4-neon", "tool:GOOGLE_SEARCH_WEB:metro strike", "text:Olá, ", "text:Lisboa."])
    expect(round.text).toBe("Olá, Lisboa.")
    expect(round.functionCalls).toEqual([{ name: "find_places", args: { query: "café" }, id: "c1" }])
    expect(round.finishReason).toBe("STOP")
    expect(round.modelVersion).toBe("gemini-4-neon")
    expect(round.grounding?.chunks[0]?.uri).toBe("https://example.com/a")
    // Parts are kept verbatim, signatures included, for the follow-up request.
    expect(round.parts).toHaveLength(6)
    expect(round.parts[0]!.thoughtSignature).toBe("s1")
    expect(round.parts[5]!.thoughtSignature).toBe("s2")
  })

  test("reports a blocked prompt and survives junk lines", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {not json\n\ndata: {"promptFeedback":{"blockReason":"SAFETY"}}\n\ndata: [DONE]\n'))
        controller.close()
      },
    })
    const round = await readGeminiAgentRound(stream)
    expect(round.blockReason).toBe("SAFETY")
    expect(round.text).toBe("")
    expect(round.functionCalls).toEqual([])
  })
})
