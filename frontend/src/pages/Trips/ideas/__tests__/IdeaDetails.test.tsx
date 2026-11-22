import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState, type ReactNode } from "react"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { makeItem, makeTrip, stubMatchMedia } from "../../__tests__/tripFixtures"
import { Presence } from "../../components/presence"
import type { ItineraryItem } from "../../types"
import type { IdeaOpener, PlaceDetails } from "../contract"
import { IdeaDetails } from "../IdeaDetails"
import { clearPlaceDetailsCache } from "../placeDetailsApi"

const getToken = async () => "test-token"
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const palace: PlaceDetails = {
  placeId: "ChIJod7tSseifDUR9hXHLFNGMIs",
  name: "Gyeongbokgung Palace",
  typeLabel: "Cultural landmark",
  summary: "A large 14th-century royal palace with a museum and gardens.",
  summarySource: "google",
  address: "161 Sajik-ro, Jongno District, Seoul",
  rating: 4.6,
  ratingCount: 47397,
  priceLevel: 0,
  hours: ["Monday: 9:00 AM – 6:00 PM", "Tuesday: Closed"],
  website: "https://royal.khs.go.kr/gbg",
  phone: "+82 2-3700-3900",
  mapsUrl: "https://maps.google.com/?cid=1002",
  photos: [
    { url: "https://lh3.googleusercontent.com/p/one=s1200", width: 1200, height: 900, author: { name: "아삭", uri: "https://maps.google.com/maps/contrib/1" } },
    { url: "https://lh3.googleusercontent.com/p/two=s1200", author: { name: "Min" } },
  ],
}

const idea = (overrides: Partial<ItineraryItem> = {}) =>
  makeItem({
    id: "idea-1",
    title: "Gyeongbokgung",
    notes: "Go early, before the tour buses.",
    links: ["https://www.instagram.com/p/abc123/", "javascript:alert(1)"],
    location: { name: "Gyeongbokgung", lat: 37.5796, lng: 126.977, placeId: "ChIJod7tSseifDUR9hXHLFNGMIs", source: "user" },
    ...overrides,
  })

/** A row laid out at `top`, as the browser would report it (the test DOM lays nothing out). */
function layOut(node: HTMLElement | null, top = 120) {
  if (!node) return
  node.getBoundingClientRect = () => ({ x: 16, y: top, top, left: 16, width: 160, height: 20, right: 176, bottom: top + 20, toJSON: () => ({}) })
}

interface HarnessProps {
  item?: ItineraryItem
  editable?: boolean
  locked?: boolean
  from?: IdeaOpener | null
  /** Changing it re-creates the row's element, as re-grouping the list does; null takes the row away. */
  rowKey?: string | null
  /** Where the row sits: -400 is scrolled out of view above. */
  rowTop?: number
  themeControl?: ReactNode
  onAddToDay?: () => void
  onRemove?: () => void
}

/** The details as the overlay mounts them: inside a Presence, opened from the row. */
function Harness({
  item = idea(),
  editable = true,
  locked = false,
  from = "row",
  rowKey = "row",
  rowTop = 120,
  themeControl = <button type="button">Sights</button>,
  onAddToDay = () => {},
  onRemove = () => {},
}: HarnessProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {rowKey !== null ? (
        <button key={rowKey} type="button" data-idea-anchor="idea-1" ref={(node) => layOut(node, rowTop)} onClick={() => setOpen(true)}>
          Open Gyeongbokgung
        </button>
      ) : null}
      <button type="button">Elsewhere</button>
      <Presence when={open ? item : null}>{(shown) => (
        <IdeaDetails
          key={shown.id}
          trip={makeTrip()}
          idea={shown}
          from={from}
          editable={editable}
          locked={locked}
          getToken={getToken}
          themeControl={themeControl}
          onAddToDay={onAddToDay}
          onRemove={onRemove}
          onClose={() => setOpen(false)}
        />
      )}</Presence>
    </>
  )
}

function openDetails(props: HarnessProps = {}) {
  const view = render(<Harness {...props} />)
  const opener = screen.getByRole("button", { name: "Open Gyeongbokgung" })
  opener.focus()
  fireEvent.click(opener)
  return { opener, rerender: (next: HarnessProps) => view.rerender(<Harness {...props} {...next} />) }
}

/** A press: down, then up (its click lands in between in a browser). */
function press(node: Element) {
  fireEvent.pointerDown(node)
  fireEvent.pointerUp(node)
}

beforeEach(() => {
  clearPlaceDetailsCache()
  stubMatchMedia(true)
})
afterEach(() => vi.restoreAllMocks())

describe("IdeaDetails", () => {
  it("shows the shape of what is coming, then the place", async () => {
    let answer: ((response: Response) => void) | null = null
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)))
    openDetails()

    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    expect(within(dialog).getByRole("status")).toHaveTextContent("Loading details")
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull()

    // The token is read first, so the request goes out a tick later.
    await waitFor(() => expect(answer).not.toBeNull())
    answer!(json({ place: palace }))
    await waitFor(() => expect(within(dialog).getByText(palace.summary!)).toBeInTheDocument())
    expect(within(dialog).getByText("Cultural landmark")).toBeInTheDocument()
    expect(within(dialog).getByText(/Rated 4\.6 out of 5 on Google Maps, from 47,397 reviews/)).toBeInTheDocument()
    expect(within(dialog).getByText("Free")).toBeInTheDocument()
    expect(within(dialog).getByText("Details and photos from Google Maps")).toBeInTheDocument()
    expect(within(dialog).getByText(palace.address!)).toBeInTheDocument()
    expect(within(dialog).getByText("Opening hours")).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: "royal.khs.go.kr" })).toHaveAttribute("href", "https://royal.khs.go.kr/gbg")
    expect(within(dialog).getByRole("link", { name: "+82 2-3700-3900" })).toHaveAttribute("href", "tel:+82237003900")
    expect(within(dialog).getAllByRole("img")).toHaveLength(2)
    expect(within(dialog).getByText("1 / 2")).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: "아삭" })).toHaveAttribute("href", "https://maps.google.com/maps/contrib/1")
    // The idea's own notes and only its web links.
    expect(within(dialog).getByText("Go early, before the tour buses.")).toBeInTheDocument()
    expect(within(dialog).getByRole("link", { name: "instagram.com" })).toBeInTheDocument()
    expect(within(dialog).queryByText(/javascript/)).toBeNull()
    expect(within(dialog).getByRole("button", { name: "Sights" })).toBeInTheDocument()
  })

  it("leaves no empty photo box when the place has no photos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: { ...palace, photos: [] } }))
    openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    await waitFor(() => expect(within(dialog).getByText(palace.summary!)).toBeInTheDocument())
    expect(within(dialog).queryByRole("img")).toBeNull()
    expect(within(dialog).queryByRole("button", { name: "Next photo" })).toBeNull()
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument()
  })

  it("drops a photo that fails to load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    await waitFor(() => expect(within(dialog).getAllByRole("img")).toHaveLength(2))
    fireEvent.error(within(dialog).getAllByRole("img")[0]!)
    await waitFor(() => expect(within(dialog).getAllByRole("img")).toHaveLength(1))
    expect(within(dialog).queryByText("1 / 2")).toBeNull()
  })

  it("says what failed and tries again", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json({ error: "place details failed" }, 502))
    openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    const alert = await within(dialog).findByRole("alert")
    expect(alert).toHaveTextContent("Couldn’t load this place’s details just now.")
    // The idea's own notes stay readable.
    expect(within(dialog).getByText("Go early, before the tour buses.")).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(json({ place: palace }))
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(within(dialog).getByText(palace.summary!)).toBeInTheDocument())
    expect(within(dialog).queryByRole("alert")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("looks nothing up for an idea with no place id or pin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    openDetails({ item: idea({ title: "Hotteok somewhere", location: undefined }) })
    const dialog = screen.getByRole("dialog", { name: "Hotteok somewhere" })
    expect(within(dialog).getByText("Go early, before the tour buses.")).toBeInTheDocument()
    expect(within(dialog).queryByRole("status")).toBeEmptyDOMElement()
    // A note is not a place: no map search for its sentence.
    expect(within(dialog).queryByRole("link", { name: /maps/i })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("gives editors Add to day and Remove", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    const onAddToDay = vi.fn()
    const onRemove = vi.fn()
    openDetails({ onAddToDay, onRemove })
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to day" }))
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }))
    expect(onAddToDay).toHaveBeenCalledTimes(1)
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it("holds the actions while the trip is locked", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails({ locked: true })
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    expect(within(dialog).getByRole("button", { name: "Add to day" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Remove" })).toBeDisabled()
  })

  it("shows viewers no actions", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails({ editable: false })
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    await waitFor(() => expect(within(dialog).getByText(palace.summary!)).toBeInTheDocument())
    expect(within(dialog).queryByRole("button", { name: "Add to day" })).toBeNull()
    expect(within(dialog).queryByRole("button", { name: "Remove" })).toBeNull()
  })


  it("takes focus, and Escape closes it and hands focus back to the row", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    const { opener } = openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it("closes on a press outside once it lands, but not on its own row or inside", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    const { opener } = openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    press(within(dialog).getByRole("button", { name: "Sights" }))
    press(opener)
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    // Down alone decides nothing: the click that follows may open something else.
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.pointerUp(screen.getByRole("button", { name: "Elsewhere" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("opens as a sheet on a phone", async () => {
    stubMatchMedia(false)
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails()
    const dialog = await screen.findByRole("dialog", { name: "Gyeongbokgung" })
    expect(dialog).not.toHaveAttribute("aria-modal", "false")
    expect(dialog).toHaveClass("trips-dialog")
    await waitFor(() => expect(within(dialog).getByText(palace.summary!)).toBeInTheDocument())
    fireEvent.keyDown(dialog, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it.each([["map" as const], [null]])("opens as a sheet when opened by %s, even with the row in view", async (from) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails({ from })
    const dialog = await screen.findByRole("dialog", { name: "Gyeongbokgung" })
    expect(dialog).not.toHaveAttribute("aria-modal", "false")
    expect(dialog).toHaveClass("trips-dialog")
  })

  it("opens as a sheet when its row is scrolled out of view as it opens", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    render(<Harness rowTop={-400} />)
    fireEvent.click(screen.getByRole("button", { name: "Open Gyeongbokgung" }))
    expect(await screen.findByRole("dialog", { name: "Gyeongbokgung" })).toHaveClass("trips-dialog")
  })

  it("stays put, a popover, with focus where it was, when the list re-renders its row", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    const { rerender } = openDetails({ themeControl: <select aria-label="Category"><option>Sights</option><option>Food</option></select> })
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    const where = () => [dialog.style.top, dialog.style.left]
    const placed = where()
    expect(placed).not.toEqual(["", ""])
    const select = within(dialog).getByRole("combobox", { name: "Category" })
    select.focus()

    // A new category under Type grouping: the row's element is a new one.
    rerender({ themeControl: <select aria-label="Category"><option>Sights</option><option>Food</option></select>, rowKey: "row-2" })
    fireEvent.scroll(window)
    expect(screen.getByRole("dialog", { name: "Gyeongbokgung" })).toBe(dialog)
    expect(dialog).toHaveAttribute("aria-modal", "false")
    expect(where()).toEqual(placed)
    expect(document.activeElement).toBe(select)

    // The row gone altogether (filtered out): the card keeps its last place, not a corner.
    rerender({ themeControl: <select aria-label="Category"><option>Sights</option><option>Food</option></select>, rowKey: null })
    fireEvent.scroll(window)
    expect(where()).toEqual(placed)
    expect(document.activeElement).toBe(select)
  })

  it("leaves at once, inert, so nothing in it can be pressed on the way out", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    fireEvent.click(within(dialog).getAllByRole("button", { name: "Close" })[0]!)
    // On its way out: marked closed for the exit animation, inert and hidden.
    expect(dialog).toHaveAttribute("data-state", "closed")
    expect(dialog).toHaveAttribute("inert")
    expect(dialog).toHaveAttribute("aria-hidden", "true")
    // Gone as soon as its own exit ends, not at the 600 ms backstop.
    await waitFor(() => expect(document.body.contains(dialog)).toBe(false), { timeout: 300 })
  })

  it("is not modal: Tab past either end hands focus back to the row and closes it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    const { opener } = openDetails()
    let dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    expect(dialog).toHaveAttribute("aria-modal", "false")
    const remove = within(dialog).getByRole("button", { name: "Remove" })
    remove.focus()
    // Not prevented: the browser carries the Tab on from the row.
    expect(fireEvent.keyDown(remove, { key: "Tab" })).toBe(true)
    expect(document.activeElement).toBe(opener)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())

    fireEvent.click(opener)
    dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    // From the card itself (where focus lands as it opens), Shift+Tab goes back to the row.
    expect(fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true })).toBe(false)
    expect(document.activeElement).toBe(opener)
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("lets Tab move between its own controls, the category select included", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails({ themeControl: <select aria-label="Category"><option>Sights</option></select> })
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    const select = within(dialog).getByRole("combobox", { name: "Category" })
    select.focus()
    expect(fireEvent.keyDown(select, { key: "Tab", shiftKey: true })).toBe(true)
    expect(fireEvent.keyDown(select, { key: "Tab" })).toBe(true)
    expect(document.activeElement).toBe(select)
    expect(screen.getByRole("dialog")).not.toHaveAttribute("data-state", "closed")
  })

  it("closes when focus moves elsewhere on the page", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    within(dialog).getByRole("button", { name: "Remove" }).focus()
    act(() => screen.getByRole("button", { name: "Elsewhere" }).focus())
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })

  it("names a place with no title by its location, or as untitled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: null }))
    openDetails({ item: idea({ title: "", location: { name: "Cheonggyecheon", lat: 37.569, lng: 126.978, source: "user" } }) })
    expect(screen.getByRole("dialog", { name: "Cheonggyecheon" })).toBeInTheDocument()
  })
})
