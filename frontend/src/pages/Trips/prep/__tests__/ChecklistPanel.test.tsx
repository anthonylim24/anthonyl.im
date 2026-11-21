import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { makeTrip } from "../../__tests__/tripFixtures"
import type { UndoMark } from "../../editorMachine"
import type { ChecklistItem, Trip, TripPerson } from "../../types"
import { ChecklistPanel } from "../ChecklistPanel"

type Updater = (doc: Trip) => Trip

const entry = (id: string, text: string, overrides: Partial<ChecklistItem> = {}): ChecklistItem => ({
  id,
  text,
  done: false,
  group: "packing",
  createdAt: "2026-01-01T00:00:00Z",
  ...overrides,
})

const PEOPLE: TripPerson[] = [
  { id: "p1", name: "Ana Lima" },
  { id: "p2", name: "Ben Ko" },
]

/** The panel over real state, so every write lands and re-renders; `spy` sees each updater and mark. */
function setup({
  checklist = [],
  editable = true,
  locked = false,
  people,
}: { checklist?: ChecklistItem[]; editable?: boolean; locked?: boolean; people?: TripPerson[] } = {}) {
  const initial = makeTrip({ destinations: ["Seoul"], timezone: "Asia/Seoul", checklist })
  const spy = vi.fn<(fn: Updater, mark?: UndoMark) => void>()
  function Harness() {
    const [trip, setTrip] = useState(initial)
    return (
      <ChecklistPanel
        trip={trip}
        editable={editable}
        locked={locked}
        people={people}
        homeCountry={null}
        onEdit={(fn, mark) => {
          spy(fn, mark)
          setTrip((current) => fn(current))
        }}
      />
    )
  }
  render(<Harness />)
  /** The document after every write so far. */
  const doc = () => spy.mock.calls.reduce((current, [fn]) => fn(current), initial)
  return { spy, doc }
}

afterEach(() => {
  vi.useRealTimers()
})

// The same words also go to the screen-reader announcement; these find the visible copy.
const SEEN = { ignore: 'script, style, [role="status"]' }
const shown = (text: string) => screen.getByText(text, SEEN)
const notShown = (text: string) => screen.queryByText(text, SEEN)

describe("ChecklistPanel", () => {
  it("shows the first-run state with both ways in", () => {
    setup()
    expect(screen.getByRole("heading", { name: /ready when you go/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Suggest from your plan" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Add your own" }))
    expect(screen.getByRole("heading", { name: "Packing" })).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Add to Before you go" })).toBeInTheDocument()
  })

  it("adds suggestions from the plan and says how many", () => {
    const { spy, doc } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Suggest from your plan" }))
    const added = doc().checklist ?? []
    expect(added.length).toBeGreaterThan(5)
    expect(added.map((i) => i.text)).toContain("Power adapter (type C, F)")
    expect(shown(`Added ${added.length} from your plan`)).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent(`Added ${added.length} from your plan`)
    expect(spy.mock.calls[0]?.[1]).toEqual({ label: "Suggested from the plan" })

    fireEvent.click(screen.getByRole("button", { name: "Suggest from your plan" }))
    expect(doc().checklist).toHaveLength(added.length)
    expect(shown("Your list already covers the plan")).toBeInTheDocument()
  })

  it("adds on Enter and keeps focus in the field", () => {
    const { doc } = setup({ checklist: [entry("a", "Socks")] })
    const field = screen.getByRole("textbox", { name: "Add to Packing" })
    field.focus()
    fireEvent.change(field, { target: { value: "  Wool hat " } })
    fireEvent.submit(field.closest("form") as HTMLFormElement)
    expect(doc().checklist?.map((i) => [i.text, i.group])).toEqual([
      ["Socks", "packing"],
      ["Wool hat", "packing"],
    ])
    expect(field).toHaveValue("")
    expect(field).toHaveFocus()
    // Blank input adds nothing.
    fireEvent.submit(field.closest("form") as HTMLFormElement)
    expect(doc().checklist).toHaveLength(2)
  })

  it("toggles an entry and updates the tally", () => {
    const { doc } = setup({ checklist: [entry("a", "Socks"), entry("b", "Passport", { group: "documents" })] })
    expect(screen.getByText("0 of 2 done")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Socks" }))
    expect(doc().checklist?.[0]?.done).toBe(true)
    expect(screen.getByRole("checkbox", { name: "Socks" })).toBeChecked()
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Passport" }))
    expect(screen.getByText("All 2 done")).toBeInTheDocument()
    expect(screen.getByText("Everything is checked off.")).toBeInTheDocument()
  })

  it("renames inline: Enter saves, Escape cancels", () => {
    const { doc } = setup({ checklist: [entry("a", "Socks")] })
    fireEvent.click(screen.getByRole("button", { name: "Edit “Socks”" }))
    const editor = screen.getByRole("textbox", { name: "Edit “Socks”" })
    fireEvent.change(editor, { target: { value: "Wool socks" } })
    fireEvent.keyDown(editor, { key: "Enter" })
    expect(doc().checklist?.[0]?.text).toBe("Wool socks")

    fireEvent.click(screen.getByRole("button", { name: "Edit “Wool socks”" }))
    const again = screen.getByRole("textbox", { name: "Edit “Wool socks”" })
    fireEvent.change(again, { target: { value: "Nope" } })
    fireEvent.keyDown(again, { key: "Escape" })
    fireEvent.blur(again)
    expect(doc().checklist?.[0]?.text).toBe("Wool socks")
  })

  it("leaves the Enter that confirms a composed Korean word to the input method", () => {
    const { spy, doc } = setup({ checklist: [entry("a", "양말")] })
    fireEvent.click(screen.getByRole("button", { name: "Edit “양말”" }))
    const editor = screen.getByRole("textbox", { name: "Edit “양말”" })
    expect(editor).toHaveAttribute("maxLength", "300")
    fireEvent.change(editor, { target: { value: "양말 두 켤레" } })
    fireEvent.keyDown(editor, { key: "Enter", isComposing: true })
    fireEvent.keyDown(editor, { key: "Enter", keyCode: 229 })
    expect(spy).not.toHaveBeenCalled()
    expect(screen.getByRole("textbox", { name: "Edit “양말”" })).toBeInTheDocument()
    fireEvent.keyDown(editor, { key: "Enter" })
    expect(doc().checklist?.[0]?.text).toBe("양말 두 켤레")
  })

  it("holds the add row's Enter while a word is composed", () => {
    setup({ checklist: [entry("a", "Socks")] })
    const field = screen.getByRole("textbox", { name: "Add to Packing" })
    expect(field).toHaveAttribute("maxLength", "300")
    const composingEnter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, isComposing: true })
    field.dispatchEvent(composingEnter)
    expect(composingEnter.defaultPrevented).toBe(true)
  })

  it("removes an entry in place and puts it back on Undo", async () => {
    const { doc } = setup({ checklist: [entry("a", "Socks"), entry("b", "Hat"), entry("c", "Scarf")] })
    fireEvent.click(screen.getByRole("button", { name: "Remove “Hat”" }))
    expect(doc().checklist?.map((i) => i.id)).toEqual(["a", "c"])
    expect(shown("Removed “Hat”")).toBeInTheDocument()
    expect(screen.getByRole("status")).toHaveTextContent("Removed “Hat”")
    const undo = screen.getByRole("button", { name: "Undo" })
    await waitFor(() => expect(undo).toHaveFocus())

    fireEvent.click(undo)
    expect(doc().checklist?.map((i) => i.id)).toEqual(["a", "b", "c"])
    expect(notShown("Removed “Hat”")).toBeNull()
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Hat" })).toHaveFocus())
  })

  it("holds the Undo line while keyboard focus is on it, then lets it go ten seconds after", () => {
    vi.useFakeTimers()
    const { doc } = setup({ checklist: [entry("a", "Socks"), entry("b", "Hat")] })
    fireEvent.click(screen.getByRole("button", { name: "Remove “Hat”" }))
    // Focus lands on Undo on the next frame (happy-dom counts it as keyboard focus).
    act(() => vi.advanceTimersByTime(50))
    expect(screen.getByRole("button", { name: "Undo" })).toHaveFocus()
    act(() => vi.advanceTimersByTime(30_000))
    expect(shown("Removed “Hat”")).toBeInTheDocument()

    act(() => screen.getByRole("textbox", { name: "Add to Packing" }).focus())
    act(() => vi.advanceTimersByTime(9_000))
    expect(shown("Removed “Hat”")).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_500))
    expect(notShown("Removed “Hat”")).toBeNull()
    expect(doc().checklist?.map((i) => i.id)).toEqual(["a"])
  })

  it("holds the Undo line while the pointer is on it", () => {
    vi.useFakeTimers()
    setup({ checklist: [entry("a", "Socks"), entry("b", "Hat")] })
    fireEvent.click(screen.getByRole("button", { name: "Remove “Hat”" }))
    act(() => vi.advanceTimersByTime(50))
    act(() => screen.getByRole("textbox", { name: "Add to Packing" }).focus())
    const line = shown("Removed “Hat”").parentElement as HTMLElement
    fireEvent.mouseEnter(line)
    act(() => vi.advanceTimersByTime(30_000))
    expect(shown("Removed “Hat”")).toBeInTheDocument()
    fireEvent.mouseLeave(line)
    act(() => vi.advanceTimersByTime(10_500))
    expect(notShown("Removed “Hat”")).toBeNull()
  })

  it("clears checked entries with an Undo", () => {
    const { doc } = setup({
      checklist: [entry("a", "Socks", { done: true }), entry("b", "Hat"), entry("c", "Visa", { group: "documents", done: true })],
    })
    fireEvent.click(screen.getByRole("button", { name: "Clear checked" }))
    expect(doc().checklist?.map((i) => i.id)).toEqual(["b"])
    expect(shown("Cleared 2 checked items")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))
    expect(doc().checklist?.map((i) => i.id)).toEqual(["a", "b", "c"])
    expect(screen.getByRole("button", { name: "Clear checked" })).toBeEnabled()
  })

  it("assigns an entry when two or more people are on the trip", () => {
    const { doc } = setup({ checklist: [entry("a", "Sunscreen")], people: PEOPLE })
    fireEvent.click(screen.getByRole("button", { name: "Assign “Sunscreen”" }))
    fireEvent.click(screen.getByRole("menuitem", { name: "Ben Ko" }))
    expect(doc().checklist?.[0]?.assignee).toBe("p2")
    const chip = screen.getByRole("button", { name: "“Sunscreen” is with Ben Ko. Reassign" })
    expect(chip).toHaveTextContent("BK")
    fireEvent.click(chip)
    fireEvent.click(screen.getByRole("menuitem", { name: "Nobody" }))
    expect(doc().checklist?.[0]?.assignee).toBeUndefined()
  })

  it("hides assignment for one person", () => {
    setup({ checklist: [entry("a", "Sunscreen")], people: [{ id: "p1", name: "Ana Lima" }] })
    expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull()
  })

  it("shows no controls when read-only", () => {
    setup({ editable: false, checklist: [entry("a", "Socks", { done: true, assignee: "p1" }), entry("b", "Hat")], people: PEOPLE })
    expect(screen.queryByRole("checkbox")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByText("1 of 2 done")).toBeInTheDocument()
    const socks = screen.getByText("Socks")
    expect(socks).toHaveTextContent("Done: Socks")
    expect(within(socks.closest("li") as HTMLElement).getByText("Ana Lima")).toBeInTheDocument()
    // Empty groups are left out.
    expect(screen.queryByRole("heading", { name: "Documents" })).toBeNull()
  })

  it("says so calmly when a read-only list is empty", () => {
    setup({ editable: false })
    expect(screen.getByText("Nothing on the checklist yet.")).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("disables every control while locked", () => {
    setup({ locked: true, checklist: [entry("a", "Socks")], people: PEOPLE })
    expect(screen.getByRole("checkbox", { name: "Socks" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Suggest from your plan" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Remove “Socks”" })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "Add to Packing" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: /Assign/ })).toBeNull()
  })
})
