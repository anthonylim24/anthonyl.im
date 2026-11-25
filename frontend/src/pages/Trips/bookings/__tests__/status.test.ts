import { describe, expect, it } from "vitest"
import type { ItineraryItem } from "../../types"
import { restingStatus, toggledStatus } from "../../tripEdits"
import { bookingStatus, bookingStatusPatch } from "../status"

const booking = (status: ItineraryItem["status"], reservation: ItineraryItem["reservation"]): ItineraryItem => ({
  id: "b1",
  kind: "reservation",
  title: "Dinner",
  status,
  createdBy: "user",
  reservation,
})

describe("a booking's one status", () => {
  it("reads the booking's own state until the stop is done or skipped", () => {
    expect(bookingStatus(booking("booked", { type: "restaurant", status: "confirmed" }))).toBe("confirmed")
    // A pair the editor never wrote (an older template) still reads the booking's word, not "Booked".
    expect(bookingStatus(booking("booked", { type: "restaurant", status: "pending" }))).toBe("pending")
    expect(bookingStatus(booking("none", undefined))).toBe("confirmed")
    expect(bookingStatus(booking("completed", { type: "restaurant", status: "tentative" }))).toBe("completed")
    expect(bookingStatus(booking("skipped", { type: "restaurant", status: "pending" }))).toBe("skipped")
  })

  it("moves both fields together, paired as an imported booking pairs them", () => {
    const item = booking("booked", { type: "flight", status: "confirmed", seat: "14A" })
    expect(bookingStatusPatch(item, "pending")).toEqual({ status: "needs_review", reservation: { type: "flight", status: "pending", seat: "14A" } })
    expect(bookingStatusPatch(item, "tentative")).toEqual({ status: "optional", reservation: { type: "flight", status: "tentative", seat: "14A" } })
    expect(bookingStatusPatch(booking("optional", { type: "flight", status: "tentative" }), "confirmed")).toEqual({
      status: "booked",
      reservation: { type: "flight", status: "confirmed" },
    })
  })

  it("marks how it went on the stop alone, keeping the booking's state", () => {
    const item = booking("needs_review", { type: "flight", status: "pending" })
    expect(bookingStatusPatch(item, "completed")).toEqual({ status: "completed" })
    expect(bookingStatusPatch(item, "skipped")).toEqual({ status: "skipped" })
  })

  it("comes back from Done to the stop status its booking pairs with", () => {
    expect(restingStatus(booking("completed", { type: "hotel", status: "confirmed" }))).toBe("booked")
    expect(restingStatus(booking("completed", { type: "hotel", status: "tentative" }))).toBe("optional")
    expect(toggledStatus(booking("skipped", { type: "hotel", status: "pending" }), "skipped")).toBe("needs_review")
    expect(restingStatus({ kind: "place", reservation: undefined })).toBe("none")
  })
})
