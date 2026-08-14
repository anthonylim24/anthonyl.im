import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { ItemIcon } from "../components/ItemIcon"

describe("ItemIcon", () => {
  it("renders a Lucide glyph at strokeWidth 1.5 with a token colour", () => {
    const { container } = render(<ItemIcon kind="reservation" reservationType="flight" />)
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute("stroke-width", "1.5")
    expect(svg).toHaveClass("text-[color:var(--tr-ink-muted)]")
    expect(svg).toHaveAttribute("aria-hidden", "true")
  })
})
