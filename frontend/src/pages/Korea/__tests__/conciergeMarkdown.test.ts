import { describe, expect, it } from "vitest"
import { normalizeGeminiMarkdown, splitMarkdownBlocks } from "../conciergeMarkdown"

describe("splitMarkdownBlocks", () => {
  it("cuts paragraphs, headings and lists apart at blank lines", () => {
    expect(splitMarkdownBlocks("**Fuunji** first.\n\n### Why\n\n- one\n- two\n\nAfter.")).toEqual([
      "**Fuunji** first.",
      "### Why",
      "- one\n- two",
      "After.",
    ])
  })

  it("keeps a loose list and indented continuations in one block", () => {
    expect(splitMarkdownBlocks("1. a\n\n2. b\n\n   more of b\n\nEnd")).toEqual(["1. a\n\n2. b\n\n   more of b", "End"])
  })

  it("never cuts inside a code fence", () => {
    expect(splitMarkdownBlocks("```\nUA 123\n\nKE 17\n```\n\nNext")).toEqual(["```\nUA 123\n\nKE 17\n```", "Next"])
    // Still open while streaming: everything after the fence stays with it.
    expect(splitMarkdownBlocks("```\nUA 123\n\nKE")).toEqual(["```\nUA 123\n\nKE"])
  })

  it("drops leading and trailing blank lines, and keeps a table whole", () => {
    expect(splitMarkdownBlocks("\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n")).toEqual(["| a | b |\n| - | - |\n| 1 | 2 |"])
    expect(splitMarkdownBlocks("")).toEqual([])
  })

  it("gives a growing text stable leading blocks", () => {
    const early = splitMarkdownBlocks("Para one.\n\nPara tw")
    const later = splitMarkdownBlocks("Para one.\n\nPara two.\n\n- a")
    expect(later[0]).toBe(early[0])
  })
})

describe("normalizeGeminiMarkdown", () => {
  it("unwraps a whole-message markdown fence", () => {
    expect(normalizeGeminiMarkdown("```markdown\n**Mingles**\n```")).toBe("**Mingles**")
    expect(normalizeGeminiMarkdown("```md\n- one\n```")).toBe("- one")
  })

  it("leaves a bare code fence as a code block", () => {
    expect(normalizeGeminiMarkdown("```\nUA 123\n```")).toBe("```\nUA 123\n```")
  })

  it("strips an opening fence while the close is still streaming", () => {
    expect(normalizeGeminiMarkdown("```md\n## Dinner\n- Mingles")).toBe("## Dinner\n- Mingles")
  })

  it("drops complete <think> blocks", () => {
    expect(normalizeGeminiMarkdown("<think>plan</think>\n\nGo to **Mosu**").trim()).toBe("Go to **Mosu**")
  })

  it("rewrites common Gemini HTML into markdown", () => {
    expect(normalizeGeminiMarkdown("<b>Doori</b> is <i>great</i><br>next")).toBe("**Doori** is *great*\nnext")
    expect(normalizeGeminiMarkdown('<a href="https://maps.google.com">maps</a>')).toBe("[maps](https://maps.google.com)")
  })

  it("turns unicode bullets into GFM list markers", () => {
    expect(normalizeGeminiMarkdown("• Mingles\n· Mosu")).toBe("- Mingles\n- Mosu")
  })
})
