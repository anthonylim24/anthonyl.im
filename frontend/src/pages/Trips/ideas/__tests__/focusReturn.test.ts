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
    expect(ideaFocusReturn("a", { dayId: "d2" })).toBe(document.querySelector('[data-pin-id="day:d2"]'))
    expect(ideaFocusReturn("a")).toBeNull()
  })

  it("is the heart nearest where a removed place's was, else the map it was on, else nothing", () => {
    expect(ideaFocusReturn("gone")).toBeNull()
    add(`<canvas class="maplibregl-canvas" tabindex="0"></canvas>`)
    expect(ideaFocusReturn("gone")).toBe(document.querySelector("canvas"))
    add(`<button data-idea-id="far">B</button><button data-idea-fold="c d">2</button>`)
    const at = (el: Element, x: number, y: number) => {
      el.getBoundingClientRect = () => ({ left: x - 13, top: y - 13, width: 26, height: 26 }) as DOMRect
    }
    at(document.querySelector('[data-idea-id="far"]')!, 600, 400)
    at(document.querySelector("[data-idea-fold]")!, 120, 90)
    expect(ideaFocusReturn("gone", { near: { x: 100, y: 100 } })).toBe(document.querySelector("[data-idea-fold]"))
    expect(ideaFocusReturn("gone", { near: { x: 590, y: 380 } })).toBe(document.querySelector('[data-idea-id="far"]'))
  })
})
