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

  it("renders *italic* spans", () => {
    render(<ConciergeText text="that's *very* good" />)
    expect(screen.getByText("very").tagName).toBe("EM")
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

  it("renders headings, links, and inline code", () => {
    const { container } = render(
      <ConciergeText text={"## Dinner\nBook at [Mingles](https://example.com) then `KTX`."} />,
    )
    expect(container.querySelector("h2")?.textContent).toBe("Dinner")
    const link = screen.getByRole("link", { name: "Mingles" })
    expect(link.getAttribute("href")).toBe("https://example.com")
    expect(screen.getByText("KTX").tagName).toBe("CODE")
  })

  it("renders GFM tables and strikethrough", () => {
    const md = [
      "| Place | Time |",
      "| --- | --- |",
      "| Mingles | 19:00 |",
      "",
      "~~skip Mosu~~",
    ].join("\n")
    const { container } = render(<ConciergeText text={md} />)
    expect(container.querySelectorAll("table")).toHaveLength(1)
    expect(screen.getByText("Mingles")).toBeTruthy()
    expect(screen.getByText("skip Mosu").tagName).toBe("DEL")
  })

  it("renders a blockquote and fenced code", () => {
    const { container } = render(<ConciergeText text={"> reserved\n\n```\nUA 123\n```"} />)
    expect(container.querySelector("blockquote")?.textContent).toMatch(/reserved/)
    expect(container.querySelector("pre")).toBeTruthy()
  })

  it("unwraps a Gemini ```markdown fence before rendering", () => {
    render(<ConciergeText text={"```markdown\nTry **Doori**\n```"} />)
    expect(screen.getByText("Doori").tagName).toBe("STRONG")
    expect(screen.queryByText(/```/)).toBeNull()
  })

  it("converts HTML emphasis Gemini sometimes emits", () => {
    render(<ConciergeText text={"<b>Mosu</b> is <i>quiet</i>"} />)
    expect(screen.getByText("Mosu").tagName).toBe("STRONG")
    expect(screen.getByText("quiet").tagName).toBe("EM")
  })
})
