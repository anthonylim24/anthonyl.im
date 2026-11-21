import { afterEach, describe, expect, it, vi } from "vitest"
import { scrollUnderRail } from "../workspace/scroll"
import { stubMatchMedia } from "./tripFixtures"

/** A phone page: the rail sticks 56 px down (under the chrome) and stands 77 px tall. */
function page(targetTop: number) {
  const rail = document.createElement("nav")
  rail.dataset.dayRail = ""
  rail.style.top = "56px"
  Object.defineProperty(rail, "offsetHeight", { value: 77 })
  const target = document.createElement("div")
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue({ top: targetTop } as DOMRect)
  document.body.append(rail, target)
  return target
}

afterEach(() => {
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("scrollUnderRail", () => {
  it("brings the target to 24 px under the stuck rail", () => {
    stubMatchMedia(false)
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    scrollUnderRail(page(900))
    expect(scrollBy).toHaveBeenCalledWith({ top: 900 - 56 - 77 - 24, behavior: "smooth" })
  })

  it("jumps under reduced motion", () => {
    stubMatchMedia(true)
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    scrollUnderRail(page(900))
    expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }))
  })

  it("only ever scrolls down", () => {
    stubMatchMedia(false)
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {})
    scrollUnderRail(page(140))
    expect(scrollBy).not.toHaveBeenCalled()
  })
})
