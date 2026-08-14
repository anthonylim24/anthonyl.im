import { describe, expect, it } from "vitest"
import { parseConciergeSsePayload } from "../conciergeSse"

describe("parseConciergeSsePayload", () => {
  it("appends JSON-encoded strings", () => {
    expect(parseConciergeSsePayload(JSON.stringify("Hello **world**"))).toEqual({
      kind: "text",
      text: "Hello **world**",
    })
  })

  it("treats raw markdown as text when JSON.parse fails", () => {
    expect(parseConciergeSsePayload("## Dinner\n- Mingles")).toEqual({
      kind: "text",
      text: "## Dinner\n- Mingles",
    })
  })

  it("reads { text } / { content } / { delta } wrappers", () => {
    expect(parseConciergeSsePayload(JSON.stringify({ text: "A" }))).toEqual({ kind: "text", text: "A" })
    expect(parseConciergeSsePayload(JSON.stringify({ content: "B" }))).toEqual({ kind: "text", text: "B" })
    expect(parseConciergeSsePayload(JSON.stringify({ delta: "C" }))).toEqual({ kind: "text", text: "C" })
  })

  it("extracts visible text from a leaked Gemini chunk and skips thoughts", () => {
    const chunk = {
      candidates: [
        {
          content: {
            parts: [{ thought: true, text: "scratch" }, { text: "Try **Mingles**." }],
          },
        },
      ],
    }
    expect(parseConciergeSsePayload(JSON.stringify(chunk))).toEqual({
      kind: "text",
      text: "Try **Mingles**.",
    })
  })

  it("surfaces { error } objects", () => {
    expect(parseConciergeSsePayload(JSON.stringify({ error: "boom" }))).toEqual({
      kind: "error",
      error: "boom",
    })
  })

  it("ignores [DONE] and empty payloads", () => {
    expect(parseConciergeSsePayload("[DONE]")).toEqual({ kind: "ignore" })
    expect(parseConciergeSsePayload("")).toEqual({ kind: "ignore" })
  })
})
