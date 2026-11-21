import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { copyItinerary, shareItinerary } from "../copyItinerary"
import { itineraryText } from "../itineraryText"
import { printTrip } from "./printFixture"

function setNavigator(key: "clipboard" | "share", value: unknown) {
  Object.defineProperty(navigator, key, { configurable: true, writable: true, value })
}

let execCommand: ReturnType<typeof vi.fn>

beforeEach(() => {
  execCommand = vi.fn(() => true)
  Object.defineProperty(document, "execCommand", { configurable: true, writable: true, value: execCommand })
})

afterEach(() => {
  setNavigator("clipboard", undefined)
  setNavigator("share", undefined)
  document.body.innerHTML = ""
})

describe("copyItinerary", () => {
  it("writes the plain itinerary to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator("clipboard", { writeText })
    const trip = printTrip()
    await expect(copyItinerary(trip)).resolves.toBe("copied")
    expect(writeText).toHaveBeenCalledWith(itineraryText(trip, { format: "plain" }))
    expect(execCommand).not.toHaveBeenCalled()
  })

  it("falls back to a selection copy when the clipboard refuses, and hands focus back", async () => {
    setNavigator("clipboard", { writeText: vi.fn().mockRejectedValue(new Error("NotAllowedError")) })
    const button = document.createElement("button")
    document.body.append(button)
    button.focus()
    await expect(copyItinerary(printTrip())).resolves.toBe("copied")
    expect(execCommand).toHaveBeenCalledWith("copy")
    expect(document.activeElement).toBe(button)
    expect(document.querySelector("textarea")).toBeNull()
  })

  it("says so when nothing could copy", async () => {
    execCommand.mockReturnValue(false)
    await expect(copyItinerary(printTrip())).resolves.toBe("failed")
  })
})

describe("shareItinerary", () => {
  it("opens the share sheet with the trip name and text", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    setNavigator("share", share)
    const trip = printTrip()
    await expect(shareItinerary(trip)).resolves.toBe("shared")
    expect(share).toHaveBeenCalledWith({ title: "Lisbon Long Weekend", text: itineraryText(trip, { format: "plain" }) })
  })

  it("treats a dismissed sheet as a choice, not a reason to copy", async () => {
    setNavigator("share", vi.fn().mockRejectedValue(Object.assign(new Error("dismissed"), { name: "AbortError" })))
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator("clipboard", { writeText })
    await expect(shareItinerary(printTrip())).resolves.toBe("cancelled")
    expect(writeText).not.toHaveBeenCalled()
  })

  it("copies when sharing is refused or unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator("clipboard", { writeText })
    setNavigator("share", vi.fn().mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" })))
    await expect(shareItinerary(printTrip())).resolves.toBe("copied")
    setNavigator("share", undefined)
    await expect(shareItinerary(printTrip())).resolves.toBe("copied")
    expect(writeText).toHaveBeenCalledTimes(2)
  })
})
