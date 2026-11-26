import { describe, expect, it } from "vitest"
import { makeItem } from "../../__tests__/tripFixtures"
import { dayHolds } from "../dayChoices"
import type { TripDay } from "../../types"

const day = (items: TripDay["items"]): TripDay => ({ id: "d", date: "2026-07-10", items })
const market = makeItem({ id: "idea", title: "Time Out Market", location: { name: "Time Out Market", lat: 38.707, lng: -9.146, source: "user" } })

describe("dayHolds", () => {
  it("knows the same place by id, Google place, or name at the same spot", () => {
    expect(dayHolds(day([{ ...market }]), market)).toBe(true)
    expect(dayHolds(day([makeItem({ id: "x", title: "Lunch", location: { name: "Somewhere", placeId: "P1", source: "user" } })]), { ...market, location: { ...market.location!, placeId: "P1" } })).toBe(true)
    expect(dayHolds(day([makeItem({ id: "x", title: "TIME OUT market", location: { name: "TIME OUT market", lat: 38.7072, lng: -9.1462, source: "user" } })]), market)).toBe(true)
    expect(dayHolds(day([makeItem({ id: "x", title: "Time Out Market" })]), market)).toBe(true)
  })

  it("does not count another branch, another place, or a note with the name", () => {
    expect(dayHolds(day([makeItem({ id: "x", title: "Time Out Market", location: { name: "Time Out Market", lat: 41.15, lng: -8.61, source: "user" } })]), market)).toBe(false)
    expect(dayHolds(day([makeItem({ id: "x", title: "Belém Tower" })]), market)).toBe(false)
    expect(dayHolds(day([makeItem({ id: "x", kind: "note", title: "Time Out Market" })]), market)).toBe(false)
  })
})
