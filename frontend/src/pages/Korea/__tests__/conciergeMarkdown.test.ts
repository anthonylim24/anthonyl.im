import { describe, expect, it } from "vitest"
import { normalizeGeminiMarkdown } from "../conciergeMarkdown"

describe("normalizeGeminiMarkdown", () => {
  it("unwraps a whole-message markdown fence", () => {
    expect(normalizeGeminiMarkdown("```markdown\n**Mingles**\n```")).toBe("**Mingles**")
    expect(normalizeGeminiMarkdown("```\n- one\n```")).toBe("- one")
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
