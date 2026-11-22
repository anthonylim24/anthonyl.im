import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { useState } from "react"
import { MemoryRouter, useLocation, useNavigate, useSearchParams } from "react-router-dom"
import type { IdeaDayPickerProps, IdeaDetailsProps } from "../contract"

// The details popover and the day picker are other pieces of the wishlist:
// stand-ins that show the props they were given and press their callbacks.
const detailsProps = vi.fn<(props: IdeaDetailsProps) => void>()
const pickerProps = vi.fn<(props: IdeaDayPickerProps) => void>()

vi.mock("../IdeaDetails", () => ({
  IdeaDetails: (props: IdeaDetailsProps) => {
    detailsProps(props)
    return (
      <div role="dialog" aria-label={`Details: ${props.idea.title}`} data-anchor={props.anchor?.getAttribute("data-idea-anchor") ?? "none"}>
        {props.themeControl}
        <button type="button" disabled={!props.editable || props.locked} onClick={props.onAddToDay}>
          Add to day
        </button>
        <button type="button" disabled={!props.editable || props.locked} onClick={props.onRemove}>
          Remove
        </button>
        <button type="button" onClick={props.onClose}>
          Close details
        </button>
      </div>
    )
  },
}))

vi.mock("../IdeaDayPicker", () => ({
  IdeaDayPicker: (props: IdeaDayPickerProps) => {
    pickerProps(props)
    return (
      <div role="dialog" aria-label={`Pick a day: ${props.idea.title}`}>
        {props.trip.days.map((day) => (
          // Like the workspace's DayPicker: pick, then close, in the same click.
          <button
            key={day.id}
            type="button"
            onClick={() => {
              props.onPick(day.id)
              props.onClose()
            }}
          >
            Pick {day.id}
          </button>
        ))}
        <button type="button" onClick={props.onClose}>
          Cancel
        </button>
      </div>
    )
  },
}))

import type { UndoMark } from "../../editorMachine"
import { LIMITS } from "../../limits"
import type { Trip } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { Presence } from "../../components/presence"
import { IDEA_PARAM } from "../contract"
import { IdeaOverlay } from "../IdeaOverlay"

afterEach(() => {
  vi.clearAllMocks()
  document.querySelector("[data-trips-announcer]")?.remove()
})

const tram = makeItem({ id: "idea-tram", title: "Tram 28" })
const getToken = async () => "token"

interface Harness {
  trip: Trip
  marks: (UndoMark | undefined)[]
  search: string
  navigate: (to: string) => void
  setTrip: (trip: Trip) => void
}

function renderOverlay(trip: Trip, { url = "/trips/lisbon?idea=idea-tram", editable = true, locked = false, anchor = false } = {}) {
  const state = { trip, marks: [], search: "" } as unknown as Harness
  function Probe() {
    const location = useLocation()
    state.search = location.search
    state.navigate = useNavigate()
    return null
  }
  function Workspace() {
    const [doc, setDoc] = useState(trip)
    const [searchParams] = useSearchParams()
    state.setTrip = (next) => {
      state.trip = next
      setDoc(next)
    }
    return (
      <>
        {anchor && (
          <button type="button" data-idea-anchor="idea-tram">
            Tram 28
          </button>
        )}
        {/* Mounted as TripWorkspace mounts it: inside a Presence keyed on ?idea. */}
        <Presence when={searchParams.has(IDEA_PARAM)}>{() => (
          <IdeaOverlay
            trip={doc}
            editable={editable}
            locked={locked}
            getToken={getToken}
            onEdit={(fn, mark) => {
              state.trip = fn(state.trip)
              state.marks.push(mark)
              setDoc(state.trip)
            }}
          />
        )}</Presence>
      </>
    )
  }
  render(
    <MemoryRouter initialEntries={[url]}>
      <Workspace />
      <Probe />
    </MemoryRouter>,
  )
  return state
}

const params = (state: Harness) => new URLSearchParams(state.search)
const twoDays = () =>
  makeTrip({
    ideas: [tram],
    days: [
      { id: "day-1", date: "2026-07-10", items: [] },
      { id: "day-2", date: "2026-07-11", items: [makeItem({ id: "lunch", title: "Lunch" })] },
    ],
  })

describe("IdeaOverlay", () => {
  it("opens the details of the idea in ?idea=, with the editor's category control", () => {
    renderOverlay(twoDays())
    const details = screen.getByRole("dialog", { name: "Details: Tram 28" })
    const props = detailsProps.mock.lastCall![0]
    expect(props.idea.id).toBe("idea-tram")
    expect(props.editable).toBe(true)
    expect(props.locked).toBe(false)
    expect(props.getToken).toBe(getToken)
    expect(within(details).getByRole("button", { name: "Category for Tram 28: Other (automatic)" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: /Pick a day/ })).toBeNull()
  })

  it("anchors on the list row's name when it is on the page", () => {
    // As in the workspace: the row is on the page before its name is pressed.
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon", anchor: true })
    act(() => state.navigate("/trips/lisbon?idea=idea-tram"))
    expect(screen.getByRole("dialog", { name: "Details: Tram 28" })).toHaveAttribute("data-anchor", "idea-tram")
  })

  it("has no anchor when the row is not on the page (a map pin opened it)", () => {
    renderOverlay(twoDays())
    expect(detailsProps.mock.lastCall![0].anchor).toBeNull()
  })

  it("gives a viewer the details only: no category control, no picker", () => {
    renderOverlay(twoDays(), { url: "/trips/lisbon?idea=idea-tram&add=1", editable: false })
    expect(screen.getByRole("dialog", { name: "Details: Tram 28" })).toBeInTheDocument()
    expect(detailsProps.mock.lastCall![0].themeControl).toBeUndefined()
    expect(screen.queryByRole("dialog", { name: /Pick a day/ })).toBeNull()
  })

  it("opens the day picker for ?add=1, instead of the details", () => {
    renderOverlay(twoDays(), { url: "/trips/lisbon?idea=idea-tram&add=1" })
    expect(screen.getByRole("dialog", { name: "Pick a day: Tram 28" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: /Details/ })).toBeNull()
    const props = pickerProps.mock.lastCall![0]
    expect(props.idea.id).toBe("idea-tram")
    expect(props.getToken).toBe(getToken)
    expect(props.trip.days.map((day) => day.id)).toEqual(["day-1", "day-2"])
  })

  it("puts the idea on the picked day with an Undo toast, announces it and closes, without reopening the details", async () => {
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon?tab=wishlist&idea=idea-tram&add=1" })
    fireEvent.click(screen.getByRole("button", { name: "Pick day-2" }))
    expect(state.trip.ideas).toEqual([])
    expect(state.trip.days[1]!.items.map((item) => item.id)).toEqual(["lunch", "idea-tram"])
    expect(state.marks).toEqual([{ label: "Added “Tram 28” to day 2", toast: true }])
    expect(document.querySelector("[data-trips-announcer]")).toHaveTextContent("Added Tram 28 to day 2")
    expect(document.querySelector("[data-trips-announcer]")).toHaveAttribute("aria-live", "polite")
    // The picker's onClose after onPick did not put ?idea= back.
    expect(params(state).get("idea")).toBeNull()
    expect(params(state).get("add")).toBeNull()
    expect(params(state).get("tab")).toBe("wishlist")
    // The picker leaves (its exit has nothing to animate here), and the details never come back.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(detailsProps).not.toHaveBeenCalled()
  })

  it("will not add to a full day", () => {
    const items = Array.from({ length: LIMITS.itemsPerDay }, (_, i) => makeItem({ id: `s-${i}`, title: `Stop ${i}` }))
    const state = renderOverlay(makeTrip({ ideas: [tram], days: [{ id: "day-1", date: "2026-07-10", items }] }), {
      url: "/trips/lisbon?idea=idea-tram&add=1",
    })
    fireEvent.click(screen.getByRole("button", { name: "Pick day-1" }))
    expect(state.marks).toEqual([])
    expect(state.trip.ideas).toHaveLength(1)
  })

  it("goes from the details to the picker, and Cancel goes back to the details", () => {
    const state = renderOverlay(twoDays())
    fireEvent.click(screen.getByRole("button", { name: "Add to day" }))
    expect(params(state).get("add")).toBe("1")
    expect(screen.getByRole("dialog", { name: "Pick a day: Tram 28" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(params(state).get("idea")).toBe("idea-tram")
    expect(params(state).get("add")).toBeNull()
    expect(screen.getByRole("dialog", { name: "Details: Tram 28" })).toBeInTheDocument()
  })

  it("closes everything when a picker opened straight from the list is cancelled", () => {
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon?idea=idea-tram&add=1" })
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(params(state).get("idea")).toBeNull()
    expect(params(state).get("add")).toBeNull()
  })

  it("removes the idea from the details with an Undo toast, and closes", () => {
    const state = renderOverlay(twoDays())
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(state.trip.ideas).toEqual([])
    expect(state.marks).toEqual([{ label: "Removed “Tram 28” from the wishlist", toast: true }])
    expect(document.querySelector("[data-trips-announcer]")).toHaveTextContent("Removed Tram 28")
    expect(params(state).get("idea")).toBeNull()
  })

  it("closes on the details' Close", () => {
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon?tab=wishlist&idea=idea-tram" })
    fireEvent.click(screen.getByRole("button", { name: "Close details" }))
    expect(params(state).toString()).toBe("tab=wishlist")
  })

  it("changes the category from inside the details through onEdit", () => {
    const state = renderOverlay(twoDays())
    fireEvent.click(screen.getByRole("button", { name: /Category for Tram 28/ }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Bars & nightlife" }))
    expect(state.trip.ideas?.[0]?.theme).toBe("nightlife")
    expect(state.marks).toEqual([{ label: "Filed “Tram 28” under Bars & nightlife" }])
  })

  it("keeps showing the idea while the details leave", async () => {
    const state = renderOverlay(twoDays())
    fireEvent.click(screen.getByRole("button", { name: "Close details" }))
    expect(params(state).get("idea")).toBeNull()
    // Still the same idea on the way out, not an empty frame.
    expect(screen.getByRole("dialog", { name: "Details: Tram 28" })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("clears both params when the idea is not on the list", () => {
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon?tab=wishlist&idea=gone&add=1" })
    expect(params(state).toString()).toBe("tab=wishlist")
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("closes when someone else schedules the idea while it is open", () => {
    const state = renderOverlay(twoDays())
    expect(screen.getByRole("dialog", { name: "Details: Tram 28" })).toBeInTheDocument()
    act(() => state.setTrip({ ...state.trip, ideas: [] }))
    expect(params(state).get("idea")).toBeNull()
  })

  it("holds every change while the trip is locked", () => {
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon?idea=idea-tram&add=1", locked: true })
    // No picker while locked: the details, with their actions held.
    expect(screen.queryByRole("dialog", { name: /Pick a day/ })).toBeNull()
    expect(detailsProps.mock.lastCall![0].locked).toBe(true)
    // The category shows as text, not as a menu.
    expect(screen.queryByRole("button", { name: /Category for/ })).toBeNull()
    // Even if the details call through, nothing is written.
    act(() => detailsProps.mock.lastCall![0].onRemove())
    act(() => detailsProps.mock.lastCall![0].onAddToDay())
    expect(state.marks).toEqual([])
    expect(state.trip.ideas).toHaveLength(1)
  })

  it("opens again for the same idea after an undo brings it back", () => {
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon?idea=idea-tram&add=1" })
    fireEvent.click(screen.getByRole("button", { name: "Pick day-1" }))
    act(() => state.setTrip(twoDays()))
    act(() => state.navigate("/trips/lisbon?idea=idea-tram"))
    fireEvent.click(screen.getByRole("button", { name: "Remove" }))
    expect(state.marks[state.marks.length - 1]).toEqual({ label: "Removed “Tram 28” from the wishlist", toast: true })
  })
})
