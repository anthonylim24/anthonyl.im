import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TimeoutError } from "@/effect/errors"
import { makeSummary } from "../../__tests__/tripFixtures"
import { memoryStore } from "../deviceStore"
import { keepList, readList } from "../tripCopies"

const mockListTrips = vi.fn()
vi.mock("../../tripsApi", () => ({ listTrips: (...args: unknown[]) => mockListTrips(...args) }))

import { canLoadTripList, loadTripList } from "../tripList"

const readToken = async () => "token"
const live = [makeSummary({ id: "t1", name: "Seoul" })]

describe("the trip list", () => {
  beforeEach(() => {
    mockListTrips.mockReset()
  })
  afterEach(() => vi.restoreAllMocks())

  it("comes from the server with a deadline, and is kept for next time", async () => {
    const store = memoryStore()
    mockListTrips.mockResolvedValue(live)
    expect(await loadTripList(readToken, { store, owner: "u1", mode: "live" })).toEqual({ trips: live, copiedAt: null })
    expect(mockListTrips).toHaveBeenCalledWith(readToken, { timeoutMs: 20_000 })
    expect((await readList(store, "u1"))?.trips).toEqual(live)
  })

  it("falls back to the kept list when the server doesn't answer", async () => {
    const store = memoryStore()
    await keepList(store, "u1", live, 1234)
    mockListTrips.mockRejectedValue(new TimeoutError({ message: "Couldn’t reach the server." }))
    expect(await loadTripList(readToken, { store, owner: "u1", mode: "live" })).toEqual({ trips: live, copiedAt: 1234 })
  })

  it("other failures, and no kept list, fail as before", async () => {
    const store = memoryStore()
    await keepList(store, "u1", live)
    mockListTrips.mockRejectedValue(new Error("HTTP 500"))
    await expect(loadTripList(readToken, { store, owner: "u1", mode: "live" })).rejects.toThrow("HTTP 500")
    mockListTrips.mockRejectedValue(new TypeError("Failed to fetch"))
    await expect(loadTripList(readToken, { store: memoryStore(), owner: "u1", mode: "live" })).rejects.toThrow("Failed to fetch")
  })

  it("with sign-in out of reach, reads only the device and asks for no token", async () => {
    const store = memoryStore()
    await keepList(store, "u1", live, 99)
    expect(await loadTripList(readToken, { store, owner: "u1", mode: "copy" })).toEqual({ trips: live, copiedAt: 99 })
    expect(mockListTrips).not.toHaveBeenCalled()
    expect(canLoadTripList(false, { mode: "copy" })).toBe(true)
    expect(canLoadTripList(false, { mode: "live" })).toBe(false)
  })

  it("offline, says the list isn't on this device when it isn't", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    await expect(loadTripList(readToken, { store: memoryStore(), owner: "u1", mode: "live" })).rejects.toThrow(
      "You’re offline, and your trips aren’t saved on this device yet.",
    )
    expect(mockListTrips).not.toHaveBeenCalled()
  })
})
