import { describe, expect, it } from "vitest"
import { foldIdeas, HEART_REACH } from "../map/ideaFolds"

const at = (id: string, x: number, y: number) => ({ id, x, y })

describe("foldIdeas", () => {
  it("leaves hearts apart when none is under another's target", () => {
    expect(foldIdeas([at("a", 0, 0), at("b", HEART_REACH, 0), at("c", 0, 100)])).toEqual([["a"], ["b"], ["c"]])
  })

  it("folds hearts whose centres fall inside each other's target, diagonals included", () => {
    // 26 px apart on the diagonal: their discs do not touch, but a tap on one lands on the other.
    expect(foldIdeas([at("a", 0, 0), at("b", 18, 19)])).toEqual([["a", "b"]])
    expect(foldIdeas([at("a", 0, 0), at("b", 0, 0)])).toEqual([["a", "b"]])
  })

  it("folds a fold that lands on another heart, keeping the given order", () => {
    // b is clear of a; c folds with a at x = 10.5, which is under b's target.
    expect(foldIdeas([at("a", 0, 0), at("b", 30, 0), at("c", 21, 0)])).toEqual([["a", "b", "c"]])
  })

  it("keeps separate crowds separate", () => {
    expect(foldIdeas([at("a", 0, 0), at("x", 300, 0), at("b", 5, 5), at("y", 305, 5)])).toEqual([
      ["a", "b"],
      ["x", "y"],
    ])
  })
})
