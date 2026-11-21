import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { MemoryRouter, useLocation } from "react-router-dom"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { UndoMark } from "../../editorMachine"
import type { Trip, TripExpense } from "../../types"
import { makeItem, makeTrip } from "../../__tests__/tripFixtures"
import { memberPersonId, type Viewer } from "../budget"

const mockLoadRates = vi.fn<(base: string, symbols: readonly string[]) => Promise<Record<string, number>>>()
vi.mock("../rates", () => ({
  loadRates: (base: string, symbols: readonly string[]) => mockLoadRates(base, symbols),
}))

import { BudgetPanel } from "../BudgetPanel"

const viewer = { id: "u1", name: "Anthony" }
const me = memberPersonId("u1")

function expense(overrides: Partial<TripExpense> = {}): TripExpense {
  return {
    id: "ex-lunch",
    title: "Lunch",
    amount: 30,
    currency: "EUR",
    category: "food",
    date: "2026-07-10",
    createdAt: "2026-07-10T12:00:00.000Z",
    ...overrides,
  }
}

/** The address bar, for the deep-link tests. */
function Address() {
  const location = useLocation()
  return <output data-testid="address">{location.search}</output>
}

/** The panel over a live copy of the trip, the way the workspace drives it. */
function renderPanel(
  initial: Trip,
  props: {
    editable?: boolean
    locked?: boolean
    viewer?: Viewer
    onOpenItem?: (dayId: string, itemId: string) => void
    /** Where the workspace is, e.g. "/trips/lisbon?tab=budget&add=expense". */
    at?: string
  } = {},
) {
  const edits: Array<{ before: Trip; after: Trip; mark?: UndoMark }> = []
  let current = initial
  function Harness({ locked }: { locked: boolean }) {
    const [trip, setTrip] = useState(initial)
    return (
      <BudgetPanel
        trip={trip}
        editable={props.editable ?? true}
        locked={locked}
        viewer={props.viewer ?? viewer}
        onOpenItem={props.onOpenItem}
        onEdit={(fn, mark) => {
          const after = fn(current)
          edits.push({ before: current, after, mark })
          current = after
          setTrip(after)
        }}
      />
    )
  }
  const tree = (locked: boolean) => (
    <MemoryRouter initialEntries={[props.at ?? "/trips/lisbon?tab=budget"]}>
      <Harness locked={locked} />
      <Address />
    </MemoryRouter>
  )
  const view = render(tree(props.locked ?? false))
  return { edits, latest: () => current, setLocked: (locked: boolean) => view.rerender(tree(locked)) }
}

describe("BudgetPanel", () => {
  beforeEach(() => {
    mockLoadRates.mockResolvedValue({})
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("starts a fresh trip with what this is for and the two ways in", () => {
    renderPanel(makeTrip())
    expect(screen.getByRole("heading", { name: "What the trip costs" })).toBeInTheDocument()
    expect(screen.getByText("Log what you spend as you go, set a budget, and see who owes whom.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Log an expense" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Set a budget" })).toBeInTheDocument()
    expect(mockLoadRates).not.toHaveBeenCalled()
  })

  it("logs an expense as a valid TripExpense, paid by the viewer", async () => {
    const { edits, latest } = renderPanel(makeTrip())
    fireEvent.click(screen.getByRole("button", { name: "Log an expense" }))
    const form = screen.getByRole("form", { name: "Log an expense" })
    fireEvent.change(within(form).getByRole("textbox", { name: "What for" }), { target: { value: "Sushi" } })
    fireEvent.change(within(form).getByRole("textbox", { name: "Amount" }), { target: { value: "1.234,50" } })
    fireEvent.click(within(form).getByRole("radio", { name: "Food & drink" }))
    fireEvent.click(within(form).getByRole("button", { name: "Log expense" }))

    expect(edits).toHaveLength(1)
    expect(edits[0].mark).toEqual({ label: "Logged “Sushi”" })
    const [logged] = latest().expenses ?? []
    expect(logged).toEqual({
      id: expect.stringMatching(/^ex-[0-9a-f]{8}$/),
      title: "Sushi",
      amount: 1234.5,
      currency: "EUR",
      category: "food",
      paidBy: me,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
    // Naming a payer saves the party it points into.
    expect(latest().party).toEqual([{ id: me, name: "Anthony", userId: "u1" }])

    expect(await screen.findByRole("button", { name: "Edit “Sushi”, €1,234.50" })).toBeInTheDocument()
    expect(screen.queryByRole("form")).toBeNull()
  })

  it("asks for an amount before logging", () => {
    const { edits } = renderPanel(makeTrip())
    fireEvent.click(screen.getByRole("button", { name: "Log an expense" }))
    fireEvent.click(screen.getByRole("button", { name: "Log expense" }))
    expect(edits).toHaveLength(0)
    expect(screen.getByText("Enter an amount, like 12.50")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveAttribute("aria-invalid", "true")
  })

  it("removes an expense with an inline Undo that puts it back where it was", () => {
    const trip = makeTrip({
      budget: { currency: "EUR", total: 500 },
      expenses: [expense({ id: "ex-a", title: "Coffee", amount: 4 }), expense(), expense({ id: "ex-c", title: "Tram", amount: 3 })],
    })
    const { edits, latest } = renderPanel(trip)
    fireEvent.click(screen.getByRole("button", { name: "Edit “Lunch”, €30" }))
    fireEvent.click(within(screen.getByRole("form", { name: "Edit “Lunch”" })).getByRole("button", { name: "Remove" }))

    expect(latest().expenses?.map((e) => e.id)).toEqual(["ex-a", "ex-c"])
    const spent = screen.getByRole("region", { name: "Spent" })
    expect(within(spent).getByText("Removed “Lunch”")).toBeInTheDocument()
    fireEvent.click(within(spent).getByRole("button", { name: "Undo" }))

    expect(latest().expenses?.map((e) => e.id)).toEqual(["ex-a", "ex-lunch", "ex-c"])
    expect(edits[edits.length - 1]?.mark).toEqual({ label: "Restored “Lunch”" })
    expect(within(spent).queryByText("Removed “Lunch”")).toBeNull()
  })

  it("lets the Undo lapse after a while", () => {
    vi.useFakeTimers()
    try {
      renderPanel(makeTrip({ budget: { currency: "EUR" }, expenses: [expense()] }))
      fireEvent.click(screen.getByRole("button", { name: "Edit “Lunch”, €30" }))
      fireEvent.click(screen.getByRole("button", { name: "Remove" }))
      const spent = screen.getByRole("region", { name: "Spent" })
      expect(within(spent).getByText("Removed “Lunch”")).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(10_500))
      expect(within(spent).queryByText("Removed “Lunch”")).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("shows the budget, the meter and what is over", () => {
    const trip = makeTrip({
      budget: { currency: "EUR", total: 100 },
      days: [
        { id: "day-1", date: "2026-07-10", items: [makeItem({ id: "tram", title: "Tram pass", cost: { amount: 20, currency: "EUR" } })] },
        { id: "day-2", date: "2026-07-11", items: [] },
      ],
      expenses: [expense({ amount: 160 })],
    })
    renderPanel(trip)
    expect(screen.getByText("€100")).toBeInTheDocument()
    expect(screen.getByText("€80 over")).toBeInTheDocument()
    expect(screen.getByRole("meter", { name: "Budget used" })).toHaveAttribute(
      "aria-valuetext",
      "€160 spent and €20 planned of €100: €80 over",
    )
  })

  it("says which currencies it couldn't convert and leaves them out", async () => {
    mockLoadRates.mockResolvedValue({})
    renderPanel(makeTrip({ budget: { currency: "EUR", total: 100 }, expenses: [expense(), expense({ id: "ex-y", title: "Ramen", amount: 1200, currency: "JPY" })] }))
    expect(screen.getByText("Converting JPY to EUR…")).toBeInTheDocument()
    expect(await screen.findByText("Couldn’t convert JPY to EUR, so those amounts aren’t in the totals.")).toBeInTheDocument()
    expect(mockLoadRates).toHaveBeenCalledWith("EUR", ["JPY"])
    expect(screen.getByText("€70 left")).toBeInTheDocument()
    expect(screen.getByText("JPY · not in totals")).toBeInTheDocument()
  })

  it("converts foreign amounts once rates arrive", async () => {
    mockLoadRates.mockResolvedValue({ JPY: 160 })
    renderPanel(makeTrip({ budget: { currency: "EUR", total: 100 }, expenses: [expense({ id: "ex-y", title: "Ramen", amount: 1600, currency: "JPY" })] }))
    expect(await screen.findByText("€90 left")).toBeInTheDocument()
    expect(screen.getByText("¥1,600 JPY")).toBeInTheDocument()
  })

  it("settles up between the people on the trip", () => {
    const trip = makeTrip({
      party: [
        { id: me, name: "Anthony", userId: "u1" },
        { id: "p-sam", name: "Sam" },
      ],
      expenses: [expense({ amount: 30, paidBy: me }), expense({ id: "ex-2", title: "Taxi", amount: 8 })],
    })
    renderPanel(trip)
    const settle = screen.getByRole("region", { name: "Settle up" })
    expect(within(settle).getByText("Sam")).toBeInTheDocument()
    expect(within(settle).getByText("pays", { exact: false })).toBeInTheDocument()
    expect(within(settle).getByText("you")).toBeInTheDocument()
    expect(within(settle).getByText("€15")).toBeInTheDocument()
    expect(within(settle).getByText("1 expense doesn’t say who paid, so it isn’t split.")).toBeInTheDocument()
  })

  it("marks a planned stop paid by logging it against the stop", () => {
    const hotel = makeItem({
      id: "hotel",
      kind: "reservation",
      title: "Casa do Bairro",
      reservation: { type: "hotel", status: "confirmed" },
      cost: { amount: 240, currency: "EUR" },
    })
    const onOpenItem = vi.fn()
    const { latest } = renderPanel(
      makeTrip({ days: [{ id: "day-1", date: "2026-07-10", items: [hotel] }, { id: "day-2", date: "2026-07-11", items: [] }] }),
      { onOpenItem },
    )
    fireEvent.click(screen.getByRole("button", { name: "Open “Casa do Bairro” on day 1" }))
    expect(onOpenItem).toHaveBeenCalledWith("day-1", "hotel")

    fireEvent.click(screen.getByRole("button", { name: "Mark “Casa do Bairro” paid" }))
    expect(latest().expenses?.[0]).toMatchObject({
      title: "Casa do Bairro",
      amount: 240,
      currency: "EUR",
      category: "lodging",
      date: "2026-07-10",
      itemId: "hotel",
      paidBy: me,
    })
    expect(screen.getByText("Paid")).toBeInTheDocument()
  })

  it("logs and marks paid without a payer when no one is signed in", () => {
    const hotel = makeItem({
      id: "hotel",
      kind: "reservation",
      title: "Casa do Bairro",
      reservation: { type: "hotel", status: "confirmed" },
      cost: { amount: 240, currency: "EUR" },
    })
    const { latest } = renderPanel(makeTrip({ days: [{ id: "day-1", date: "2026-07-10", items: [hotel] }] }), {
      viewer: { id: null, name: null },
    })
    fireEvent.click(screen.getByRole("button", { name: "Log an expense" }))
    const form = screen.getByRole("form", { name: "Log an expense" })
    fireEvent.change(within(form).getByRole("textbox", { name: "What for" }), { target: { value: "Tram" } })
    fireEvent.change(within(form).getByRole("textbox", { name: "Amount" }), { target: { value: "3" } })
    fireEvent.click(within(form).getByRole("button", { name: "Log expense" }))
    fireEvent.click(screen.getByRole("button", { name: "Mark “Casa do Bairro” paid" }))

    const logged = latest().expenses ?? []
    expect(logged).toHaveLength(2)
    for (const entry of logged) expect(entry.paidBy).toBeUndefined()
    expect(JSON.stringify(latest())).not.toContain("u-null")
    expect(screen.queryByText("You")).not.toBeInTheDocument()
    expect(screen.queryByText(/Paid by you/)).not.toBeInTheDocument()
  })

  it("adds and removes people, seeding the party from the trip's members", async () => {
    const { latest } = renderPanel(
      makeTrip({ budget: { currency: "EUR" }, collaborators: [{ userId: "u2", role: "editor", name: "Mina" }] }),
    )
    fireEvent.change(screen.getByRole("textbox", { name: "Name of someone else on the trip" }), { target: { value: "Sam" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(latest().party?.map((p) => p.name)).toEqual(["Anthony", "Mina", "Sam"])

    fireEvent.click(screen.getByRole("button", { name: "Remove Mina" }))
    expect(latest().party?.map((p) => p.name)).toEqual(["Anthony", "Sam"])
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(latest().party?.map((p) => p.name)).toEqual(["Anthony", "Mina", "Sam"])
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your name" })).toHaveValue("Anthony"))
  })

  it("sets a budget and removes it with Undo", () => {
    const { latest } = renderPanel(makeTrip())
    fireEvent.click(screen.getByRole("button", { name: "Set a budget" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Budget for the whole trip" }), { target: { value: "2000" } })
    fireEvent.click(screen.getByRole("button", { name: "Save budget" }))
    expect(latest().budget).toEqual({ currency: "EUR", total: 2000 })
    expect(screen.getByText("€2,000 left")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Change budget" }))
    fireEvent.click(screen.getByRole("button", { name: "Remove budget" }))
    expect(latest().budget).toBeUndefined()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(latest().budget).toEqual({ currency: "EUR", total: 2000 })
  })

  it("shows a viewer the money with no way to edit it", () => {
    const trip = makeTrip({
      budget: { currency: "EUR", total: 500 },
      party: [
        { id: me, name: "Anthony", userId: "u1" },
        { id: "p-sam", name: "Sam" },
      ],
      days: [
        { id: "day-1", date: "2026-07-10", items: [makeItem({ id: "tour", title: "Tour", cost: { amount: 25, currency: "EUR" } })] },
        { id: "day-2", date: "2026-07-11", items: [] },
      ],
      expenses: [expense({ paidBy: me })],
    })
    renderPanel(trip, { editable: false })
    expect(screen.getByText("€500")).toBeInTheDocument()
    expect(screen.getByText("Lunch")).toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
    expect(screen.queryAllByRole("textbox")).toHaveLength(0)
    expect(screen.queryAllByRole("combobox")).toHaveLength(0)
  })

  it("tells a viewer of a fresh trip there is nothing yet", () => {
    renderPanel(makeTrip(), { editable: false })
    expect(screen.getByText("Nothing spent or planned yet.")).toBeInTheDocument()
    expect(screen.queryAllByRole("button")).toHaveLength(0)
  })

  it("keeps controls visible but disabled while an AI run holds the trip", () => {
    renderPanel(makeTrip({ budget: { currency: "EUR", total: 100 }, expenses: [expense()] }), { locked: true })
    expect(screen.getByRole("button", { name: "Log an expense" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Change budget" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Edit “Lunch”, €30" })).toBeDisabled()
  })

  it("opens the new-expense form from ?add=expense and drops it from the address", async () => {
    renderPanel(makeTrip(), { at: "/trips/lisbon?tab=budget&add=expense" })
    expect(await screen.findByRole("form", { name: "Log an expense" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("address")).toHaveTextContent(/^\?tab=budget$/))
  })

  it("holds ?add=expense while the trip is locked, then opens the form", async () => {
    const { setLocked } = renderPanel(makeTrip({ expenses: [expense()] }), { at: "/trips/lisbon?tab=budget&add=expense", locked: true })
    expect(screen.queryByRole("form", { name: "Log an expense" })).toBeNull()
    expect(screen.getByTestId("address")).toHaveTextContent("add=expense")
    setLocked(false)
    expect(await screen.findByRole("form", { name: "Log an expense" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("address")).not.toHaveTextContent("add=expense"))
  })

  it("ignores ?add=expense for a viewer", async () => {
    renderPanel(makeTrip({ expenses: [expense()] }), { at: "/trips/lisbon?tab=budget&add=expense", editable: false })
    await waitFor(() => expect(screen.getByTestId("address")).not.toHaveTextContent("add=expense"))
    expect(screen.queryByRole("form")).toBeNull()
    expect(screen.queryAllByRole("textbox")).toHaveLength(0)
  })

  it("lets an Enter that confirms a composed word through without logging", () => {
    const { edits } = renderPanel(makeTrip())
    fireEvent.click(screen.getByRole("button", { name: "Log an expense" }))
    const form = screen.getByRole("form", { name: "Log an expense" })
    const title = within(form).getByPlaceholderText("Dinner, train tickets, museum…")
    expect(title).toHaveAttribute("maxLength", "200")
    const composingEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })
    title.dispatchEvent(composingEnter)
    expect(composingEnter.defaultPrevented).toBe(true)
    const safariEnter = new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true })
    title.dispatchEvent(safariEnter)
    expect(safariEnter.defaultPrevented).toBe(true)
    const plainEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    title.dispatchEvent(plainEnter)
    expect(plainEnter.defaultPrevented).toBe(false)
    expect(edits).toHaveLength(0)
  })
})
