import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { makeItem, makeTrip, stubMatchMedia } from "../../__tests__/tripFixtures"
import type { ItineraryItem } from "../../types"
import type { PlaceDetails } from "../contract"
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

function Harness({
  item = idea(),
  editable = true,
  locked = false,
  withAnchor = true,
  onAddToDay = () => {},
  onRemove = () => {},
}: {
  item?: ItineraryItem
  editable?: boolean
  locked?: boolean
  withAnchor?: boolean
  onAddToDay?: () => void
  onRemove?: () => void
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" ref={setAnchor} onClick={() => setOpen(true)}>
        Open Gyeongbokgung
      </button>
      <button type="button">Elsewhere</button>
      {open ? (
        <IdeaDetails
          trip={makeTrip()}
          idea={item}
          anchor={withAnchor ? anchor : null}
          editable={editable}
          locked={locked}
          getToken={getToken}
          themeControl={<button type="button">Sights</button>}
          onAddToDay={onAddToDay}
          onRemove={onRemove}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  )
}

function openDetails(props: Parameters<typeof Harness>[0] = {}) {
  render(<Harness {...props} />)
  const opener = screen.getByRole("button", { name: "Open Gyeongbokgung" })
  opener.focus()
  fireEvent.click(opener)
  return opener
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
    const opener = openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it("closes on a press outside, but not on its own row or inside", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    const opener = openDetails()
    const dialog = screen.getByRole("dialog", { name: "Gyeongbokgung" })
    fireEvent.pointerDown(within(dialog).getByRole("button", { name: "Sights" }))
    fireEvent.pointerDown(opener)
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }))
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

  it("opens as a sheet from the map, with no row to sit beside", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ place: palace }))
    openDetails({ withAnchor: false })
    const dialog = await screen.findByRole("dialog", { name: "Gyeongbokgung" })
    expect(dialog).not.toHaveAttribute("aria-modal", "false")
    expect(dialog).toHaveClass("trips-dialog")
  })
})
