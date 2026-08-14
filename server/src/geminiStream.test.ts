import { describe, expect, test } from "bun:test"
import {
  extractGeminiTextDelta,
  extractGeminiTextFromBody,
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
    })
  })

  test("parses raw NDJSON (no data: prefix)", () => {
    const chunk = { candidates: [{ content: { parts: [{ text: "- Mingles" }] }, finishReason: "STOP" }] }
    expect(parseGeminiStreamLine(JSON.stringify(chunk))).toEqual({
      delta: "- Mingles",
      finishReason: "STOP",
      blockReason: undefined,
    })
  })

  test("captures safety blocks and ignores keepalives", () => {
    expect(parseGeminiStreamLine(`data: ${JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })}`)).toEqual({
      delta: "",
      finishReason: undefined,
      blockReason: "SAFETY",
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
})
