import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { AiBusy, SuggestionsReview, reviewProgress } from "../workspace/AiPanels"
import { OverviewPanel } from "../workspace/OverviewPanel"
import type { EnhancementRun, EnhancementSuggestion, RunQueueInfo } from "../types"
import { makeItem, makeTrip } from "./tripFixtures"

const days = [
  { id: "day-1", label: "Day 1 · Fri 10 Jul" },
  { id: "day-2", label: "Day 2 · Sat 11 Jul" },
]

const base: EnhancementRun = {
  id: "run-1",
  tripId: "lisbon",
  scope: "trip",
  status: "complete",
  suggestions: [],
  appliedSuggestionIds: [],
  createdAt: "2026-07-01T00:00:00Z",
}

const add = (id: string, title: string, more: Partial<EnhancementSuggestion> = {}): EnhancementSuggestion => ({
  id,
  kind: "add",
  dayId: "day-1",
  title,
  detail: "",
  confidence: "high",
  proposedItem: makeItem({ id: `${id}-stop`, title }),
  ...more,
})

const going = (queue?: RunQueueInfo): EnhancementRun => ({ ...base, status: "running", ...(queue ? { queue } : {}) })

const review = (run: EnhancementRun) =>
  render(<SuggestionsReview run={run} trip={makeTrip()} dayOptions={days} applying={false} onApply={vi.fn()} onDismiss={vi.fn()} />)

describe("reviewProgress", () => {
  it("names each place in the server's queue in a few calm words", () => {
    expect(reviewProgress(null, "your trip")).toEqual({ line: "Starting the review…", hint: "This usually takes about a minute." })
    expect(reviewProgress(going({ state: "queued", attempt: 0, maxAttempts: 3 }), "your trip")?.line).toBe("Starting the review…")
    expect(reviewProgress(going({ state: "working", attempt: 1, maxAttempts: 3 }), "your trip")?.line).toBe("Reviewing your trip…")
    expect(reviewProgress(going({ state: "working", attempt: 1, maxAttempts: 3 }), "Day 3")?.line).toBe("Reviewing Day 3…")
    expect(reviewProgress(going({ state: "queued", attempt: 1, maxAttempts: 3, lastError: "deadline" }), "your trip")).toEqual({
      line: "The AI was slow, so it’s trying again (attempt 2 of 3)…",
      hint: "It keeps going if you leave this page.",
    })
    expect(reviewProgress(going({ state: "working", attempt: 3, maxAttempts: 3 }), "your trip")?.line).toBe("Reviewing your trip (attempt 3 of 3)…")
  })

  it("leaves a server without a queue to the stepping copy", () => {
    expect(reviewProgress(going(), "your trip")).toBeUndefined()
    render(<AiBusy steps={["Reading the whole itinerary…", "Checking pacing and routes…"]} progress={reviewProgress(going(), "your trip")} />)
    expect(screen.getByText("Reading the whole itinerary…")).toHaveAttribute("role", "status")
  })

  it("never raises its voice", () => {
    const lines = [0, 1, 2, 3].flatMap((attempt) =>
      (["queued", "working", "done"] as const).map((state) => reviewProgress(going({ state, attempt, maxAttempts: 3 }), "your trip")),
    )
    for (const progress of lines) expect(`${progress?.line} ${progress?.hint ?? ""}`).not.toMatch(/!|sorry|oops|fail/i)
  })
})

describe("a draft in progress", () => {
  const drafting = (dayCount: number) => {
    const noop = vi.fn()
    const trip = makeTrip({
      days: Array.from({ length: dayCount }, (_, i) => ({ id: `day-${i + 1}`, date: `2026-07-${String(10 + i).padStart(2, "0")}`, items: [] })),
    })
    render(
      <MemoryRouter>
        <OverviewPanel
          trip={trip}
          forecast={new Map()}
          basePath="/trips/lisbon"
          editable
          locked
          drafting
          enhancing={false}
          applying={false}
          run={null}
          dayOptions={[]}
          onDraft={noop}
          onHoverDay={noop}
          onApplyRun={noop}
          onDismissRun={noop}
          onStopAi={noop}
        />
      </MemoryRouter>,
    )
    return screen.getByText("Reading up on the area…", { exact: false })
  }

  it("tells a long trip it takes a few minutes, not about a minute", () => {
    expect(drafting(12)).toHaveTextContent("A trip this long takes a few minutes.")
  })

  it("keeps the shorter promise for a trip drafted in one go", () => {
    expect(drafting(4)).toHaveTextContent("This usually takes about a minute.")
  })
})

describe("SuggestionsReview and the wishlist", () => {
  it("labels a suggested stop that schedules a wishlist idea", () => {
    review({ ...base, suggestions: [add("s1", "Sintra", { fromIdeaId: "idea-1" }), add("s2", "Time Out Market")] })
    const sintra = screen.getByText("Sintra").closest("label") as HTMLElement
    expect(within(sintra).getByText("From your wishlist")).toBeInTheDocument()
    const market = screen.getByText("Time Out Market").closest("label") as HTMLElement
    expect(within(market).queryByText("From your wishlist")).toBeNull()
  })

  it("says which added places came off the wishlist", () => {
    const { unmount } = review({ ...base, suggestions: [add("s1", "Sintra", { fromIdeaId: "idea-1" })], appliedSuggestionIds: ["s1"] })
    expect(screen.getByText(/Added 1 place to the itinerary and the map: Sintra\. It came from your wishlist\./)).toBeInTheDocument()
    unmount()

    review({
      ...base,
      suggestions: [add("s1", "Sintra", { fromIdeaId: "idea-1" }), add("s2", "Time Out Market"), add("s3", "Belém", { fromIdeaId: "idea-2" })],
      appliedSuggestionIds: ["s1", "s2", "s3"],
    })
    expect(screen.getByText(/Added 3 places .* 2 came from your wishlist\./)).toBeInTheDocument()
  })

  it("shows a reorder's new clock in one capped line, in time order", () => {
    const names = ["Castle", "Tram", "Lunch", "Tiles", "Fado"]
    const trip = makeTrip({
      days: [{ id: "day-1", date: "2026-07-10", items: names.map((title, i) => makeItem({ id: `it-${i}`, title })) }, { id: "day-2", date: "2026-07-11", items: [] }],
    })
    const reorder: EnhancementSuggestion = {
      id: "s-order",
      kind: "reorder",
      dayId: "day-1",
      title: "Castle first, before the heat",
      detail: "",
      confidence: "high",
      proposedTimes: {
        "it-1": { time: "10:30" },
        "it-0": { time: "09:00", endTime: "10:15" },
        "it-4": { time: "20:00" },
        "it-2": { time: "12:30" },
        "it-3": { time: "15:00" },
      },
    }
    render(<SuggestionsReview run={{ ...base, suggestions: [reorder] }} trip={trip} dayOptions={days} applying={false} onApply={vi.fn()} onDismiss={vi.fn()} />)
    expect(screen.getByText("Castle 9:00 AM · Tram 10:30 AM · Lunch 12:30 PM · Tiles 3:00 PM …")).toBeInTheDocument()
  })

  it("says why a suggestion couldn’t be applied and leaves it unticked", () => {
    const sintra = add("s1", "Sintra")
    const market = add("s2", "Time Out Market")
    render(
      <SuggestionsReview
        run={{ ...base, suggestions: [sintra, market] }}
        trip={makeTrip()}
        skipReasons={{ s1: "Day 1 has no room left." }}
        dayOptions={days}
        applying={false}
        onApply={vi.fn()}
        onDismiss={vi.fn()}
      />,
    )
    expect(screen.getByRole("checkbox", { name: /Sintra/ })).not.toBeChecked()
    expect(screen.getByText(/Couldn’t apply: Day 1 has no room left\./)).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: /Time Out Market/ })).toBeChecked()
  })

  it("gives the server's reason for a failed review, and only then promises nothing changed", () => {
    review({ ...base, status: "error", outcomeReason: "The AI review failed before it could add places.", error: "deadline" })
    expect(
      screen.getByText("The AI review failed before it could add places. Nothing in your itinerary changed, so you can run it again."),
    ).toBeInTheDocument()
  })
})
