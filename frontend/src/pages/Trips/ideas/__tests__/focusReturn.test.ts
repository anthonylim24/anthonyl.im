import { afterEach, describe, expect, it } from "vitest"
import { ideaFocusReturn } from "../focusReturn"

const add = (html: string) => {
  const host = document.createElement("div")
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}
// happy-dom lays nothing out: a hidden element reports no boxes, as one under display: none does.
const hide = (el: Element) => {
  el.getClientRects = () => ({ length: 0 }) as DOMRectList
}

afterEach(() => {
  document.body.innerHTML = ""
})

describe("ideaFocusReturn", () => {
  it("is the place's own heart while it is drawn, else the fold it is drawn into", () => {
    add(`<button data-idea-id="a">A</button><button data-idea-fold="b a">2</button>`)
    const heart = document.querySelector<HTMLElement>('[data-idea-id="a"]')!
    expect(ideaFocusReturn("a")).toBe(heart)
    hide(heart)
    expect(ideaFocusReturn("a")).toBe(document.querySelector('[data-idea-fold]'))
  })

  it("follows a place put on a day to its entry under On your days, else its new stop", () => {
    add(`<a data-scheduled-idea="a">Day 2</a><button data-pin-id="a">2</button><button data-pin-id="ab">3</button>`)
    const entry = document.querySelector<HTMLElement>("[data-scheduled-idea]")!
    expect(ideaFocusReturn("a")).toBe(entry)
    hide(entry)
    expect(ideaFocusReturn("a")).toBe(document.querySelector('[data-pin-id="a"]'))
  })

  it("is the overview's pin for the day the place went to", () => {
    add(`<button data-pin-id="day:d1">1</button><button data-pin-id="day:d2">2</button>`)
    expect(ideaFocusReturn("a", "d2")).toBe(document.querySelector('[data-pin-id="day:d2"]'))
    expect(ideaFocusReturn("a")).toBeNull()
  })

  it("is the map the heart was on once the place is gone, and nothing on a page without one", () => {
    expect(ideaFocusReturn("gone")).toBeNull()
    add(`<button data-idea-id="other">B</button><canvas class="maplibregl-canvas" tabindex="0"></canvas>`)
    expect(ideaFocusReturn("gone")).toBe(document.querySelector("canvas"))
  })
})
