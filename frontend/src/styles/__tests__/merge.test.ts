import * as stylex from "@stylexjs/stylex"
import { describe, expect, it } from "vitest"
import { sx } from "../merge"

const s = stylex.create({
  base: { color: "red", padding: 4 },
  small: { padding: 2 },
  blue: { color: "blue" },
  empty: {},
})

const classesOf = (className: string | undefined) => (className ?? "").split(" ").filter(Boolean).sort()

describe("sx", () => {
  it("styles an array of StyleX styles like the same styles passed flat", () => {
    expect(classesOf(sx([s.base, s.small]).className)).toEqual(classesOf(stylex.props(s.base, s.small).className))
  })

  it("keeps the order inside nested arrays, so a later style still wins", () => {
    expect(classesOf(sx([s.blue, [s.base]], false, [null, [undefined, s.small]]).className)).toEqual(
      classesOf(stylex.props(s.blue, s.base, s.small).className),
    )
  })

  it("passes semantic class names through, inside or outside an array", () => {
    const classes = classesOf(sx([s.base, "trips-title-input"], ["group", ["peer"]]).className)
    expect(classes).toEqual(classesOf(`${stylex.props(s.base).className} trips-title-input group peer`))
  })

  it("reads a boolean map as class names and an empty style as no class", () => {
    expect(sx({ open: true, shut: false }).className).toBe("open")
    expect(sx(s.empty).className).toBeUndefined()
  })
})
