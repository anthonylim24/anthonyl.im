import { describe, expect, it, vi } from "vitest"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { TripConflictError } from "../../tripConflict"
import type { Trip } from "../../types"
import { saveOnLeave } from "../leaveSave"

const base = makeTrip({ updatedAt: "2026-01-01T00:00:00.000Z" })
const stamped = (trip: Trip, at: string) => ({ ...trip, updatedAt: at })

describe("saving as the traveller leaves", () => {
  it("sends the edits against the copy they were made from", async () => {
    const doc = { ...base, name: "Renamed" }
    const update = vi.fn(async (trip: Trip) => stamped(trip, "2026-01-02T00:00:00.000Z"))
    const saved = await saveOnLeave({ doc, base, update })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ name: "Renamed" }), base.updatedAt)
    expect(saved.name).toBe("Renamed")
  })

  it("waits for the save in flight, then sends only if more changed", async () => {
    const sent = { ...base, name: "Renamed" }
    const landed = stamped(sent, "2026-01-02T00:00:00.000Z")
    const update = vi.fn(async (trip: Trip) => stamped(trip, "2026-01-03T00:00:00.000Z"))
    expect(await saveOnLeave({ doc: sent, base, before: Promise.resolve(landed), update })).toBe(landed)
    expect(update).not.toHaveBeenCalled()

    const more = { ...sent, description: "and more" }
    await saveOnLeave({ doc: more, base, before: Promise.resolve(landed), update })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ description: "and more" }), landed.updatedAt)
  })

  it("folds in someone else's save once, then stores both", async () => {
    const day = base.days[0]!
    const theirs = {
      ...base,
      updatedAt: "2026-01-02T00:00:00.000Z",
      days: [{ ...day, items: [...day.items, makeItem({ id: "their-stop", title: "Theirs" })] }, ...base.days.slice(1)],
    }
    const doc = { ...base, name: "Mine" }
    const update = vi
      .fn<(trip: Trip, against: string) => Promise<Trip>>()
      .mockRejectedValueOnce(new TripConflictError({ message: "conflict", trip: theirs }))
      .mockImplementation(async (trip) => stamped(trip, "2026-01-03T00:00:00.000Z"))
    const saved = await saveOnLeave({ doc, base, update })
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Mine" }), theirs.updatedAt)
    expect(saved.days[0]!.items.map((i) => i.id)).toContain("their-stop")
  })

  it("gives up on a real clash, and on no connection", async () => {
    const theirs = { ...base, updatedAt: "2026-01-02T00:00:00.000Z", name: "Theirs" }
    const clash = vi.fn().mockRejectedValue(new TripConflictError({ message: "conflict", trip: theirs }))
    await expect(saveOnLeave({ doc: { ...base, name: "Mine" }, base, update: clash })).rejects.toBeInstanceOf(TripConflictError)
    expect(clash).toHaveBeenCalledOnce()

    const offline = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(saveOnLeave({ doc: { ...base, name: "Mine" }, base, update: offline })).rejects.toThrow("Failed to fetch")
  })
})
