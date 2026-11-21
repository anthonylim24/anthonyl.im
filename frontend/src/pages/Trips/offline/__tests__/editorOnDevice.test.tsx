import { useLayoutEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { TimeoutError } from "@/effect/errors"
import { makeTrip } from "../../__tests__/tripFixtures"
import type { Trip } from "../../types"
import { memoryStore } from "../deviceStore"
import { keepDraft, keepTrip, readDraft, readTrip } from "../tripCopies"
import { TripsDeviceContext, type TripsDevice } from "../tripsDevice"

const { mockGetToken } = vi.hoisted(() => ({ mockGetToken: vi.fn().mockResolvedValue("test-token") }))
vi.mock("@/lib/safeAuth", () => ({ useGetToken: () => mockGetToken }))

const mockGetTrip = vi.fn()
const mockUpdateTrip = vi.fn()
vi.mock("../../tripsApi", () => ({
  getTrip: (...args: unknown[]) => mockGetTrip(...args),
  updateTrip: (...args: unknown[]) => mockUpdateTrip(...args),
  applySuggestions: vi.fn(),
  enhanceTrip: vi.fn(),
  generateItinerary: vi.fn(),
}))

import { useTripEditor } from "../../useTripEditor"

type Editor = ReturnType<typeof useTripEditor>
const seen: { editor: Editor | null } = { editor: null }

function Harness() {
  const editor = useTripEditor()
  useLayoutEffect(() => {
    seen.editor = editor
  })
  return <p>{editor.trip?.name ?? editor.state.s}</p>
}

const server = makeTrip({ id: "t1", slug: "lisbon", name: "Lisbon", updatedAt: "2026-03-01T00:00:00.000Z" })
const later = (trip: Trip, at = "2026-03-02T00:00:00.000Z") => ({ ...trip, updatedAt: at })

function open(device: TripsDevice, path = "/trips/lisbon") {
  return render(
    <TripsDeviceContext.Provider value={device}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trips/:tripId" element={<Harness />} />
          <Route path="/trips" element={<p>Index</p>} />
        </Routes>
      </MemoryRouter>
    </TripsDeviceContext.Provider>,
  )
}

function device(overrides: Partial<TripsDevice> = {}): TripsDevice & { store: ReturnType<typeof memoryStore> } {
  return { store: memoryStore(), owner: "u1", mode: "live", showCopy: vi.fn(), leftUnsaved: vi.fn(), ...overrides } as TripsDevice & {
    store: ReturnType<typeof memoryStore>
  }
}

const editor = () => seen.editor!

describe("the editor and this device", () => {
  beforeEach(() => {
    mockGetTrip.mockReset()
    mockUpdateTrip.mockReset()
    mockUpdateTrip.mockImplementation(async (_t: unknown, _id: string, patch: Partial<Trip>) => later({ ...server, ...patch }))
    seen.editor = null
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("opens a trip with a deadline and keeps the server's copy", async () => {
    const d = device()
    mockGetTrip.mockResolvedValue({ trip: server, access: "owner" })
    open(d)
    await waitFor(() => expect(editor().trip?.name).toBe("Lisbon"))
    expect(mockGetTrip).toHaveBeenCalledWith(expect.any(Function), "lisbon", { timeoutMs: 20_000 })
    await waitFor(async () => expect((await readTrip(d.store, "u1", "lisbon")).copy?.trip.id).toBe("t1"), { timeout: 3_000 })
  })

  it("offline, shows the kept copy read-only and asks the server nothing", async () => {
    const d = device()
    await keepTrip(d.store, "u1", server, 1000)
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    open(d)
    await waitFor(() => expect(editor().trip?.name).toBe("Lisbon"))
    expect(editor().copy).toEqual({ savedAt: 1000, unsaved: false })
    expect(editor().editable).toBe(false)
    expect(editor().online).toBe(false)
    expect(mockGetTrip).not.toHaveBeenCalled()
    await waitFor(() => expect(d.showCopy).toHaveBeenCalledWith({ what: "trip", savedAt: 1000, unsaved: false }))
  })

  it("shows the kept copy, with this device's unsaved edits, when the server doesn't answer", async () => {
    const d = device()
    await keepTrip(d.store, "u1", server, 1000)
    await keepDraft(d.store, "u1", { doc: { ...server, name: "Lisbon and Porto" }, base: server, savedAt: 2000 })
    mockGetTrip.mockRejectedValue(new TimeoutError({ message: "Couldn’t reach the server." }))
    open(d)
    await waitFor(() => expect(editor().trip?.name).toBe("Lisbon and Porto"))
    expect(editor().copy).toEqual({ savedAt: 1000, unsaved: true })
  })

  it("with nothing kept, says the trip isn't on this device", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    open(device())
    await waitFor(() => expect(editor().state).toEqual({ s: "loadError", message: "You’re offline, and this trip isn’t saved on this device yet." }))
  })

  it("brings back edits that never reached the server, and saves them", async () => {
    const d = device()
    await keepDraft(d.store, "u1", { doc: { ...server, name: "Lisbon and Porto" }, base: server, savedAt: 2000 })
    mockGetTrip.mockResolvedValue({ trip: server, access: "owner" })
    open(d)
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledWith(expect.any(Function), "t1", expect.objectContaining({ name: "Lisbon and Porto" })))
    expect(editor().notice).toBe("Brought back edits made on this device that hadn’t been saved. Saving them now.")
    await waitFor(() => expect(editor().sync.k).toBe("clean"))
    await waitFor(async () => expect(await readDraft(d.store, "u1", "t1")).toBeNull())
  })

  it("drops a kept draft the server already has", async () => {
    const d = device()
    const edited = { ...server, name: "Lisbon and Porto" }
    await keepDraft(d.store, "u1", { doc: edited, base: server, savedAt: 2000 })
    mockGetTrip.mockResolvedValue({ trip: later(edited), access: "owner" })
    open(d)
    await waitFor(() => expect(editor().trip?.name).toBe("Lisbon and Porto"))
    await waitFor(async () => expect(await readDraft(d.store, "u1", "t1")).toBeNull())
    expect(mockUpdateTrip).not.toHaveBeenCalled()
    expect(editor().notice).toBeNull()
  })

  it("keeps unsaved edits on the device, and retries the save when the connection returns", async () => {
    const d = device()
    mockGetTrip.mockResolvedValue({ trip: server, access: "owner" })
    mockUpdateTrip.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    open(d)
    await waitFor(() => expect(editor().trip).not.toBeNull())
    act(() => editor().edit((doc) => ({ ...doc, name: "Lisbon by train" })))
    await waitFor(() => expect(editor().sync.k).toBe("saveError"), { timeout: 3_000 })
    expect(editor().notice).toMatch(/^Couldn’t save your latest edits: the server didn’t answer\. They’re kept on this device/)
    await waitFor(async () => expect((await readDraft(d.store, "u1", "t1"))?.doc.name).toBe("Lisbon by train"))

    act(() => {
      window.dispatchEvent(new Event("online"))
    })
    await waitFor(() => expect(editor().sync.k).toBe("clean"))
    expect(mockUpdateTrip).toHaveBeenCalledTimes(2)
    expect(editor().notice).toBeNull()
    await waitFor(async () => expect(await readDraft(d.store, "u1", "t1")).toBeNull())
  })

  it("leaving with a save that can't go through keeps the edits and says so", async () => {
    const d = device()
    mockGetTrip.mockResolvedValue({ trip: server, access: "owner" })
    mockUpdateTrip.mockRejectedValue(new TypeError("Failed to fetch"))
    const view = open(d)
    await waitFor(() => expect(editor().trip).not.toBeNull())
    act(() => editor().edit((doc) => ({ ...doc, name: "Lisbon by train" })))
    view.unmount()
    await waitFor(() => expect(d.leftUnsaved).toHaveBeenCalledWith("Lisbon by train", "there was no connection"))
    expect((await readDraft(d.store, "u1", "t1"))?.doc.name).toBe("Lisbon by train")
  })

  it("leaving with edits that do save stores them and drops the draft", async () => {
    const d = device()
    mockGetTrip.mockResolvedValue({ trip: server, access: "owner" })
    const view = open(d)
    await waitFor(() => expect(editor().trip).not.toBeNull())
    act(() => editor().edit((doc) => ({ ...doc, name: "Lisbon by train" })))
    view.unmount()
    await waitFor(() => expect(mockUpdateTrip).toHaveBeenCalledWith(expect.any(Function), "t1", expect.objectContaining({ name: "Lisbon by train" })))
    await waitFor(async () => expect((await readTrip(d.store, "u1", "t1")).copy?.trip.name).toBe("Lisbon by train"))
    expect(await readDraft(d.store, "u1", "t1")).toBeNull()
    expect(d.leftUnsaved).not.toHaveBeenCalled()
  })
})
