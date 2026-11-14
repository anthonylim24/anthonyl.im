import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

// Concierge replies render markdown through these two style files. They once
// carried hard-coded light-theme text colours with a dark override that never
// matched, so bold names, headings, tables and quotes were unreadable in dark
// mode. Text colours here must come from theme tokens (or inherit).

const read = (file: string) => readFileSync(resolve(__dirname, "../../Korea", file), "utf8")

describe("concierge markdown colours follow the theme", () => {
  for (const file of ["ConciergeText.stylex.ts", "ConciergeSources.stylex.ts"]) {
    it(`${file} has no fixed text colours and no class-based dark override`, () => {
      const source = read(file)
      expect(source).not.toMatch(/:is\(\.dark\)/)
      const fixed = [...source.matchAll(/["']?(?:color|borderColor)["']?:\s*["'](#[0-9a-fA-F]{3,8}|rgba?\([^"']*\))["']/g)]
        // The rose list markers are only used by the legacy Korea chat and read on both themes.
        .filter((match) => !["#f43f5e"].includes(match[1]!))
      expect(fixed.map((match) => match[0])).toEqual([])
    })
  }

  it("the reply input placeholder uses readable ink", () => {
    const chat = readFileSync(resolve(__dirname, "../chat.stylex.ts"), "utf8")
    expect(chat).toMatch(/"::placeholder": \{ color: "var\(--trips-ink-tertiary\)" \}/)
  })
})
