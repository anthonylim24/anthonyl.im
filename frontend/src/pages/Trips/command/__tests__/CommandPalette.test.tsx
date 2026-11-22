import { StrictMode, useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { CommandButton } from "../CommandButton"
import { CommandProvider, useCommandPalette, useRegisterCommands } from "../CommandContext"
import type { Command } from "../commands"
import { createCommandRegistry } from "../registry"
import { TRIPS_THEME_EVENT } from "../theme"
import { stubMatchMedia } from "../../__tests__/tripFixtures"

function Registrar({ source = "test", commands }: { source?: string; commands: Command[] }) {
  useRegisterCommands(source, commands)
  return null
}

function Where() {
  const { pathname } = useLocation()
  return <output data-testid="where">{pathname}</output>
}

function OpenState() {
  const { open } = useCommandPalette()
  return <output data-testid="open">{open ? "open" : "closed"}</output>
}

const command = (id: string, title: string, run: () => void, extra: Partial<Command> = {}): Command => ({
  id,
  title,
  group: "Actions",
  run,
  ...extra,
})

function renderPalette(children: React.ReactNode, path = "/trips/lisbon") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CommandProvider>
        <button type="button">Before</button>
        <input aria-label="Notes" />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
        <OpenState />
        {children}
      </CommandProvider>
    </MemoryRouter>,
  )
}

const pressModK = (target: Element | Window = window, mod: "metaKey" | "ctrlKey" = "metaKey") =>
  fireEvent.keyDown(target, { key: "k", [mod]: true })

const options = () => within(screen.getByRole("listbox")).getAllByRole("option")
const activeOption = () => options().find((option) => option.getAttribute("aria-selected") === "true")
/** The visible empty message (the live region says the same thing). */
const emptyMessage = () => screen.getAllByText(/No matches for/).find((el) => el.getAttribute("role") !== "status")

describe("command palette", () => {
  beforeEach(() => {
    stubMatchMedia(false)
    localStorage.clear()
  })
  afterEach(() => {
    document.documentElement.classList.remove("dark")
  })

  it("opens with ⌘K, filters as you type, and runs the active row with ↓ and Enter", async () => {
    const share = vi.fn()
    const print = vi.fn()
    renderPalette(<Registrar commands={[command("share", "Share trip", share), command("print", "Print itinerary", print)]} />)

    pressModK()
    const input = screen.getByRole("combobox", { name: "Search commands" })
    await waitFor(() => expect(input).toHaveFocus())
    expect(input).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByTestId("open")).toHaveTextContent("open")

    fireEvent.change(input, { target: { value: "r" } })
    // Both have an r mid-word: equal matches keep the order they were given.
    expect(activeOption()).toHaveTextContent("Share trip")
    expect(input).toHaveAttribute("aria-activedescendant", activeOption()!.id)
    expect(screen.getByRole("status")).toHaveTextContent(/results?/)

    fireEvent.change(input, { target: { value: "itinerary" } })
    expect(options().map((option) => option.textContent)).toEqual(["Print itinerary"])

    fireEvent.change(input, { target: { value: "" } })
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(activeOption()).toHaveTextContent("Print itinerary")
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(print).toHaveBeenCalledTimes(1))
    expect(share).not.toHaveBeenCalled()
    expect(screen.queryByRole("combobox")).toBeNull()
  })

  it("opens with Ctrl+K too, even from a text field", async () => {
    renderPalette(null)
    const notes = screen.getByRole("textbox", { name: "Notes" })
    notes.focus()
    pressModK(notes, "ctrlKey")
    expect(await screen.findByRole("combobox")).toBeInTheDocument()
  })

  it("closes on Esc and puts focus back where it was", async () => {
    renderPalette(null)
    const before = screen.getByRole("button", { name: "Before" })
    before.focus()
    pressModK(before)
    const input = await screen.findByRole("combobox")
    await waitFor(() => expect(input).toHaveFocus())

    fireEvent.keyDown(input, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull())
    await waitFor(() => expect(before).toHaveFocus())
  })

  it("⌘K again closes it", async () => {
    renderPalette(null)
    pressModK()
    const input = await screen.findByRole("combobox")
    pressModK(input)
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull())
  })

  it("moves with the arrow keys, Home and End, skipping disabled rows", async () => {
    renderPalette(
      <Registrar
        commands={[
          command("c", "Big alpha", vi.fn()),
          command("b", "Alpha route", vi.fn(), { disabled: true }),
          command("a", "Alpha", vi.fn()),
        ]}
      />,
    )
    pressModK()
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "alpha" } })
    // Exact, then prefix (disabled), then word start.
    expect(options().map((option) => option.textContent)).toEqual(["Alpha", "Alpha route", "Big alpha"])
    expect(options()[1]).toHaveAttribute("aria-disabled", "true")
    expect(activeOption()).toHaveTextContent("Alpha")

    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(activeOption()).toHaveTextContent("Big alpha")
    // Wraps at both ends.
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(activeOption()).toHaveTextContent("Alpha")
    fireEvent.keyDown(input, { key: "ArrowUp" })
    expect(activeOption()).toHaveTextContent("Big alpha")
    fireEvent.keyDown(input, { key: "Home" })
    expect(activeOption()).toHaveTextContent("Alpha")
    fireEvent.keyDown(input, { key: "End" })
    expect(activeOption()).toHaveTextContent("Big alpha")
    // Typing starts again from the best match.
    fireEvent.change(input, { target: { value: "alph" } })
    expect(activeOption()).toHaveTextContent("Alpha")
  })

  it("lets the pointer choose the active row, and runs a clicked row", async () => {
    const charlie = vi.fn()
    const bravo = vi.fn()
    renderPalette(<Registrar commands={[command("a", "Alpha", vi.fn()), command("b", "Bravo", bravo, { disabled: true }), command("c", "Charlie", charlie)]} />)
    pressModK()
    await screen.findByRole("combobox")
    const row = options().find((option) => option.textContent === "Charlie")!
    fireEvent.pointerMove(row)
    expect(row).toHaveAttribute("aria-selected", "true")

    fireEvent.click(options().find((option) => option.textContent === "Bravo")!)
    expect(screen.getByRole("combobox")).toBeInTheDocument()

    fireEvent.click(row)
    await waitFor(() => expect(charlie).toHaveBeenCalledTimes(1))
    expect(bravo).not.toHaveBeenCalled()
  })

  it("says so when nothing matches", async () => {
    renderPalette(null)
    pressModK()
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "zzqx" } })
    expect(emptyMessage()).toHaveTextContent("No matches for “zzqx”")
    expect(input).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("status")).toHaveTextContent("No matches for “zzqx”")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(screen.getByRole("combobox")).toBeInTheDocument()
  })

  it("does not run a command on the Enter that ends an IME composition", async () => {
    const run = vi.fn()
    renderPalette(<Registrar commands={[command("a", "경복궁", run)]} />)
    pressModK()
    const input = await screen.findByRole("combobox")
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByRole("combobox")).toBeInTheDocument()
  })

  it("offers built-ins on every page: new trip, all trips, shortcuts, themes and looks", async () => {
    renderPalette(null)
    pressModK()
    const input = await screen.findByRole("combobox")
    expect(options().map((option) => option.textContent)).toEqual([
      "New trip",
      "All trips",
      "Keyboard shortcuts?",
      "Use light theme",
      "Use dark theme",
      "Match the system themeIn use",
      "Use the Liquid Glass look",
      "Use the atlas lookIn use",
    ])
    fireEvent.change(input, { target: { value: "new trip" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/trips/new"))
  })

  it("changes the theme and tells the header toggle", async () => {
    const heard = vi.fn()
    window.addEventListener(TRIPS_THEME_EVENT, heard)
    renderPalette(null)
    pressModK()
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "dark theme" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"))
    expect(localStorage.getItem("korea-theme")).toBe("dark")
    expect((heard.mock.calls[0]![0] as CustomEvent).detail).toBe("dark")
    window.removeEventListener(TRIPS_THEME_EVENT, heard)

    pressModK()
    await screen.findByRole("combobox")
    expect(options().find((option) => option.textContent?.startsWith("Use dark theme"))).toHaveTextContent("Use dark themeIn use")
  })

  it("opens from the header button", async () => {
    renderPalette(<CommandButton />)
    fireEvent.click(screen.getByRole("button", { name: "Search" }))
    expect(await screen.findByRole("combobox")).toBeInTheDocument()
  })
})

describe("under StrictMode", () => {
  beforeEach(() => stubMatchMedia(false))

  it("registers once, runs a chosen command once, and gives focus back", async () => {
    const share = vi.fn()
    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/trips/lisbon"]}>
          <CommandProvider>
            <button type="button">Before</button>
            <Registrar commands={[command("share", "Share trip", share)]} />
          </CommandProvider>
        </MemoryRouter>
      </StrictMode>,
    )
    const before = screen.getByRole("button", { name: "Before" })
    before.focus()
    pressModK(before)
    let input = await screen.findByRole("combobox")
    await waitFor(() => expect(input).toHaveFocus())
    // React replays effects on mount: the palette must stay open and focused.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(screen.getByRole("combobox")).toHaveFocus()
    fireEvent.change(input, { target: { value: "share" } })
    expect(options().map((option) => option.textContent)).toEqual(["Share trip"])
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(before).toHaveFocus())

    pressModK(before)
    input = await screen.findByRole("combobox")
    await waitFor(() => expect(input).toHaveFocus())
    fireEvent.keyDown(input, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("combobox")).toBeNull())
    await waitFor(() => expect(before).toHaveFocus())
    expect(share).toHaveBeenCalledTimes(1)
  })
})

describe("registering commands", () => {
  beforeEach(() => stubMatchMedia(false))

  it("shows a screen's commands while it is mounted", async () => {
    function Toggle() {
      const [on, setOn] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOn((v) => !v)}>
            Toggle
          </button>
          {on && <Registrar source="day" commands={[command("stop", "Gyeongbokgung Palace", vi.fn(), { group: "Stops" })]} />}
        </>
      )
    }
    renderPalette(<Toggle />)
    pressModK()
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "palace" } })
    expect(options().map((option) => option.textContent)).toEqual(["Gyeongbokgung Palace"])

    // Unmounting the screen takes its commands away, live.
    act(() => screen.getByRole("button", { name: "Toggle", hidden: true }).click())
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(emptyMessage()).toHaveTextContent("No matches for “palace”")
  })

  it("runs the newest closure without re-rendering the palette for it", async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderPalette(<Registrar commands={[command("share", "Share trip", first)]} />)
    rerender(
      <MemoryRouter initialEntries={["/trips/lisbon"]}>
        <CommandProvider>
          <Registrar commands={[command("share", "Share trip", second)]} />
        </CommandProvider>
      </MemoryRouter>,
    )
    pressModK()
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "share" } })
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(second).toHaveBeenCalledTimes(1))
    expect(first).not.toHaveBeenCalled()
  })

  it("updates titles in the open palette", async () => {
    function Renamer() {
      const [name, setName] = useState("Day 1 · Seoul")
      return (
        <>
          <button type="button" onClick={() => setName("Day 1 · Busan")}>
            Rename
          </button>
          <Registrar commands={[command("day-1", name, vi.fn(), { group: "Days" })]} />
        </>
      )
    }
    renderPalette(<Renamer />)
    pressModK()
    await screen.findByRole("combobox")
    expect(options().map((option) => option.textContent)).toContain("Day 1 · Seoul")
    act(() => screen.getByRole("button", { name: "Rename", hidden: true }).click())
    expect(options().map((option) => option.textContent)).toContain("Day 1 · Busan")
  })

  it("is a no-op outside a provider", () => {
    expect(() => render(<Registrar commands={[command("a", "Alpha", vi.fn())]} />)).not.toThrow()
  })
})

describe("registry", () => {
  it("keeps the first command of an id, and only removes its own registration", () => {
    const registry = createCommandRegistry()
    const listener = vi.fn()
    registry.subscribe(listener)
    const a = { current: [command("x", "From A", vi.fn())] }
    const b = { current: [command("x", "From B", vi.fn()), command("y", "Only B", vi.fn())] }
    const removeA = registry.register("a", a)
    registry.register("b", b)
    expect(registry.snapshot().map((c) => c.title)).toEqual(["From A", "Only B"])
    expect(registry.snapshot()).toBe(registry.snapshot())

    const replaced = { current: [command("z", "A again", vi.fn())] }
    registry.register("a", replaced)
    removeA()
    expect(registry.snapshot().map((c) => c.title)).toEqual(["From B", "Only B", "A again"])
    expect(listener).toHaveBeenCalledTimes(3)

    // `find` reads the live ref, not the snapshot.
    const fresh = vi.fn()
    b.current = [command("x", "From B", fresh)]
    registry.find("x")!.run()
    expect(fresh).toHaveBeenCalled()
  })
})

describe("keyboard shortcuts sheet", () => {
  beforeEach(() => stubMatchMedia(false))

  it("opens on ? and lists the shortcuts, then gives focus back", async () => {
    renderPalette(null)
    const before = screen.getByRole("button", { name: "Before" })
    before.focus()
    fireEvent.keyDown(before, { key: "?", shiftKey: true })
    const sheet = await screen.findByRole("dialog", { name: "Keyboard shortcuts" })
    for (const section of ["Everywhere", "Trips list", "Trip", "Stops"]) {
      expect(within(sheet).getByRole("heading", { name: section })).toBeInTheDocument()
    }
    expect(within(sheet).getByText("Open the palette")).toBeInTheDocument()

    fireEvent.keyDown(sheet, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(before).toHaveFocus())
  })

  it("leaves ? alone while typing in a field", () => {
    renderPalette(null)
    const notes = screen.getByRole("textbox", { name: "Notes" })
    notes.focus()
    fireEvent.keyDown(notes, { key: "?", shiftKey: true })
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("opens from the palette's Keyboard shortcuts row", async () => {
    renderPalette(null)
    pressModK()
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "keyboard" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument()
  })
})
