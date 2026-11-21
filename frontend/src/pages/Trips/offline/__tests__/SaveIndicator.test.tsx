import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { makeTrip } from "../../__tests__/tripFixtures"
import type { Sync } from "../../editorMachine"
import { SaveIndicator } from "../SaveIndicator"
import { saveWords } from "../saveWords"

const trip = makeTrip()
const saving: Sync = { k: "saving", sent: trip, against: trip.updatedAt, queued: false, fitted: null }

function show(sync: Sync, { online = true, locked = false } = {}) {
  const onRetry = vi.fn()
  const view = render(<SaveIndicator sync={sync} online={online} locked={locked} onRetry={onRetry} place="bar" />)
  return { onRetry, ...view }
}

describe("SaveIndicator", () => {
  it("says Saved, then Saving, in the same live region", () => {
    const { rerender } = show({ k: "clean" })
    const status = screen.getByRole("status")
    expect(status).toHaveTextContent("Saved")
    rerender(<SaveIndicator sync={saving} online locked={false} onRetry={() => undefined} place="bar" />)
    expect(screen.getByRole("status")).toBe(status)
    expect(status).toHaveTextContent("Saving")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("offline, says edits will save when back online, with nothing to press", () => {
    show({ k: "dirty" }, { online: false })
    expect(screen.getByRole("status")).toHaveTextContent("Offline · will save when back online")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("a save with no answer says why and offers Retry", () => {
    const { onRetry } = show({ k: "saveError", message: "Failed to fetch", failure: "network" })
    expect(screen.getByRole("status")).toHaveTextContent("Not saved · Couldn’t reach the server")
    fireEvent.click(screen.getByRole("button", { name: "Retry saving" }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("Retry waits while an AI run holds the trip", () => {
    show({ k: "saveError", message: "HTTP 500", failure: "server" }, { locked: true })
    expect(screen.getByRole("status")).toHaveTextContent("Not saved · The server had a problem")
    expect(screen.getByRole("button", { name: "Retry saving" })).toBeDisabled()
  })

  it("a refused save names the problem and offers no Retry (sending it again can't help)", () => {
    show({ k: "saveError", message: "The trip name can’t be empty.", failure: "refused", refused: trip })
    expect(screen.getByRole("status")).toHaveTextContent("Not saved · The trip name can’t be empty.")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("a conflict asks for a choice", () => {
    expect(saveWords({ k: "conflict", theirs: trip }, true)).toMatchObject({ word: "Not saved", detail: "Choose whose version to keep", retry: false })
  })
})
