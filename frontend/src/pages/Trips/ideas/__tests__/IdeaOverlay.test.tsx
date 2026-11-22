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
      <div role="dialog" aria-label={`Details: ${props.idea.title}`} data-from={props.from ?? "none"}>
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
import { useIdeaNav } from "../ideaNav"
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
  pathname: string
  search: string
  navigate: (to: string | number) => void
  setTrip: (trip: Trip) => void
}

function renderOverlay(
  trip: Trip,
  {
    url = "/trips/lisbon?idea=idea-tram",
    /** Entries before `url`, as Back would find them. */
    before = [] as string[],
    editable = true,
    locked = false,
  } = {},
) {
  const state = { trip, marks: [], search: "" } as unknown as Harness
  function Probe() {
    const location = useLocation()
    state.pathname = location.pathname
    state.search = location.search
    const navigate = useNavigate()
    state.navigate = (to) => (typeof to === "number" ? navigate(to) : navigate(to))
    return null
  }
  /** What opens an idea in the workspace: a list row's name, its Add to day, a map pin; and an overview tab. */
  function Openers() {
    const nav = useIdeaNav()
    const [, setParams] = useSearchParams()
    return (
      <>
        <button
          type="button"
          onClick={() =>
            // As the workspace's tabs do.
            nav.replaceClosing((params) => {
              params.set("tab", "budget")
              return params
            })
          }
        >
          Tab: Budget
        </button>
        <button
          type="button"
          onClick={() => {
            // One instance holds the tab bar and the map pins (TripWorkspace): both in one task.
            nav.replaceClosing((params) => {
              params.set("tab", "budget")
              return params
            })
            nav.open("idea-other", "map")
          }}
        >
          Tab: Budget, then Pin: Other
        </button>
        <button
          type="button"
          onClick={() =>
            // Something else that replaces the URL and keeps every other param.
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set("note", "1")
                return next
              },
              { replace: true },
            )
          }
        >
          Replace, keeping the place
        </button>
        <button type="button" onClick={() => nav.open("idea-other", "row")}>
          Row: Other
        </button>
        <button type="button" onClick={() => nav.open("idea-tram", "row")}>
          Row: Tram 28
        </button>
        <button type="button" onClick={() => nav.open("idea-tram", "row", true)}>
          Row: Add to day
        </button>
        <button type="button" onClick={() => nav.open("idea-tram", "map")}>
          Pin: Tram 28
        </button>
      </>
    )
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
        <Openers />
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
    <MemoryRouter initialEntries={[...before, url]} initialIndex={before.length}>
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
    expect(within(details).getByRole("combobox", { name: "Category for Tram 28: Other (automatic)" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog", { name: /Pick a day/ })).toBeNull()
  })

  it.each([
    ["Row: Tram 28", "row"],
    ["Pin: Tram 28", "map"],
  ])("tells the details who opened them: %s", (opener, from) => {
    renderOverlay(twoDays(), { url: "/trips/lisbon" })
    fireEvent.click(screen.getByRole("button", { name: opener }))
    expect(screen.getByRole("dialog", { name: "Details: Tram 28" })).toHaveAttribute("data-from", from)
  })

  it("opens a pasted link with no opener, so as a sheet", () => {
    renderOverlay(twoDays())
    expect(detailsProps.mock.lastCall![0].from).toBeNull()
  })

  it("keeps who opened them from the details to the picker and back", () => {
    renderOverlay(twoDays(), { url: "/trips/lisbon" })
    fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
    fireEvent.click(screen.getByRole("button", { name: "Add to day" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(screen.getByRole("dialog", { name: "Details: Tram 28" })).toHaveAttribute("data-from", "row")
  })

  it("ignores details on their way out: their Remove or Close change nothing", () => {
    const state = renderOverlay(twoDays())
    fireEvent.click(screen.getByRole("button", { name: "Add to day" }))
    // The details still render while they leave, with this render's callbacks.
    const leaving = detailsProps.mock.lastCall![0]
    act(() => leaving.onRemove())
    act(() => leaving.onClose())
    expect(state.marks).toEqual([])
    expect(params(state).get("add")).toBe("1")
    expect(screen.getByRole("dialog", { name: "Pick a day: Tram 28" })).toBeInTheDocument()
  })

  describe("history", () => {
    const fromTrips = { url: "/trips/lisbon?tab=wishlist", before: ["/trips"] }

    it("opening adds one entry and closing takes it back: the next Back leaves the trip", () => {
      const state = renderOverlay(twoDays(), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
      expect(params(state).get("idea")).toBe("idea-tram")
      fireEvent.click(screen.getByRole("button", { name: "Close details" }))
      expect(state.search).toBe("?tab=wishlist")
      // No dead entry left behind: Back goes where it went before the place was opened.
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    it("closes from a map pin the same way", () => {
      const state = renderOverlay(twoDays(), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Pin: Tram 28" }))
      fireEvent.click(screen.getByRole("button", { name: "Close details" }))
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    it("adds nothing when the open place's name is pressed again", () => {
      const state = renderOverlay(twoDays(), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
      fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
      fireEvent.click(screen.getByRole("button", { name: "Close details" }))
      expect(state.search).toBe("?tab=wishlist")
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    it("goes through the picker and back on one entry", () => {
      const state = renderOverlay(twoDays(), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
      fireEvent.click(screen.getByRole("button", { name: "Add to day" }))
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
      fireEvent.click(screen.getByRole("button", { name: "Close details" }))
      expect(state.search).toBe("?tab=wishlist")
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    it("takes the entry back after a pick or a removal", () => {
      const state = renderOverlay(twoDays(), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Row: Add to day" }))
      fireEvent.click(screen.getByRole("button", { name: "Pick day-1" }))
      expect(state.search).toBe("?tab=wishlist")
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    describe("a close while the browser is already on an entry not yet shown", () => {
      /** As BrowserRouter leaves it between a navigation and its commit: history.state names another entry. */
      const pending = () => window.history.replaceState({ key: "not-yet-shown" }, "")
      afterEach(() => window.history.replaceState(null, ""))

      it("still closes once that entry shows the same place", () => {
        const state = renderOverlay(twoDays(), fromTrips)
        fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
        pending()
        fireEvent.click(screen.getByRole("button", { name: "Close details" }))
        expect(params(state).get("idea")).toBe("idea-tram")
        window.history.replaceState(null, "")
        fireEvent.click(screen.getByRole("button", { name: "Replace, keeping the place" }))
        expect(params(state).get("note")).toBe("1")
        expect(params(state).has("idea")).toBe(false)
      })

      it("lapses when that entry opens another place", () => {
        const state = renderOverlay(makeTrip({ ...twoDays(), ideas: [tram, makeItem({ id: "idea-other", title: "Other" })] }), fromTrips)
        fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
        pending()
        fireEvent.click(screen.getByRole("button", { name: "Close details" }))
        window.history.replaceState(null, "")
        fireEvent.click(screen.getByRole("button", { name: "Row: Other" }))
        expect(params(state).get("idea")).toBe("idea-other")
        expect(screen.getByRole("dialog", { name: "Details: Other" })).toBeInTheDocument()
      })
    })

    it("closes an opened place on a tab change, made on the entry before it: the next Back leaves the trip", () => {
      const state = renderOverlay(twoDays(), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
      fireEvent.click(screen.getByRole("button", { name: "Tab: Budget" }))
      expect(state.search).toBe("?tab=budget")
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    it("makes a tab change and a pin pressed with it both, in order", () => {
      const state = renderOverlay(makeTrip({ ...twoDays(), ideas: [tram, makeItem({ id: "idea-other", title: "Other" })] }), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
      fireEvent.click(screen.getByRole("button", { name: "Tab: Budget, then Pin: Other" }))
      expect(state.search).toBe("?tab=budget&idea=idea-other")
      expect(screen.getByRole("dialog", { name: "Details: Other" })).toHaveAttribute("data-from", "map")
      act(() => state.navigate(-1))
      expect(state.search).toBe("?tab=budget")
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    it("keeps a place open when the last one's close lands after it opened (a fast press on another row)", () => {
      const state = renderOverlay(makeTrip({ ...twoDays(), ideas: [tram, makeItem({ id: "idea-other", title: "Other" })] }), fromTrips)
      fireEvent.click(screen.getByRole("button", { name: "Row: Tram 28" }))
      // Tram 28's details took the press on the other row as a press outside;
      // their close timer still holds the callbacks they had then.
      const tramDetails = detailsProps.mock.lastCall![0]
      expect(tramDetails.idea.id).toBe("idea-tram")
      fireEvent.click(screen.getByRole("button", { name: "Row: Other" }))
      expect(state.search).toBe("?tab=wishlist&idea=idea-other")
      act(() => tramDetails.onClose())
      expect(state.search).toBe("?tab=wishlist&idea=idea-other")
      expect(screen.getByRole("dialog", { name: "Details: Other" })).toBeInTheDocument()
    })

    it("closes a pasted link's place on a tab change in the same entry", () => {
      const state = renderOverlay(twoDays(), { url: "/trips/lisbon?tab=wishlist&idea=idea-tram", before: ["/trips"] })
      fireEvent.click(screen.getByRole("button", { name: "Tab: Budget" }))
      expect(state.search).toBe("?tab=budget")
      act(() => state.navigate(-1))
      expect(state.pathname).toBe("/trips")
    })

    it("replaces a pasted link's entry rather than going back past it", () => {
      const state = renderOverlay(twoDays(), { url: "/trips/lisbon?tab=wishlist&idea=idea-tram", before: ["/trips"] })
      fireEvent.click(screen.getByRole("button", { name: "Close details" }))
      expect(state.pathname).toBe("/trips/lisbon")
      expect(state.search).toBe("?tab=wishlist")
    })
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
    fireEvent.change(screen.getByRole("combobox", { name: /Category for Tram 28/ }), { target: { value: "nightlife" } })
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

  it("clears an empty ?idea=", () => {
    const state = renderOverlay(twoDays(), { url: "/trips/lisbon?tab=wishlist&idea=" })
    expect(params(state).toString()).toBe("tab=wishlist")
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
    expect(screen.queryByRole("combobox", { name: /Category for/ })).toBeNull()
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
