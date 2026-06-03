import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ConciergeText } from "../ConciergeText"

describe("ConciergeText", () => {
  it("renders **bold** spans", () => {
    render(<ConciergeText text="Try **Mingles** tonight" />)
    const strong = screen.getByText("Mingles")
    expect(strong.tagName).toBe("STRONG")
  })

  it("groups consecutive '-' lines into a single list", () => {
    const { container } = render(<ConciergeText text={"Options:\n- Mingles\n- Mosu\n- Doori"} />)
    const lists = container.querySelectorAll("ul")
    expect(lists).toHaveLength(1)
    expect(lists[0].querySelectorAll("li")).toHaveLength(3)
  })

  it("renders numbered lists as <ol>", () => {
    const { container } = render(<ConciergeText text={"1. First\n2. Second"} />)
    expect(container.querySelectorAll("ol")).toHaveLength(1)
    expect(container.querySelectorAll("ol li")).toHaveLength(2)
  })

  it("separates paragraphs on blank lines", () => {
    const { container } = render(<ConciergeText text={"Para one.\n\nPara two."} />)
    expect(container.querySelectorAll("p")).toHaveLength(2)
  })

  it("leaves unmatched asterisks as literal text", () => {
    render(<ConciergeText text="a ** b" />)
    expect(screen.getByText(/a \*\* b/)).toBeTruthy()
  })

  it("handles bold inside a bullet item", () => {
    render(<ConciergeText text={"- **Doori** — capstone"} />)
    expect(screen.getByText("Doori").tagName).toBe("STRONG")
  })

  it("renders empty input without crashing", () => {
    const { container } = render(<ConciergeText text="" />)
    expect(container.firstChild).toBeTruthy()
  })
})
