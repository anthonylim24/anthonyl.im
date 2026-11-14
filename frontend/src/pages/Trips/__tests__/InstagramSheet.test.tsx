import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { IgJob, IgPlace } from "../instagram/instagramApi"
import { makeTrip } from "./tripFixtures"

const mockSubmit = vi.fn()
const mockJobs = vi.fn()
const mockRetry = vi.fn()
const mockReextract = vi.fn()
const mockSaved = vi.fn()
const mockRemove = vi.fn()

vi.mock("../instagram/instagramApi", () => {
  class IgNotConfiguredError extends Error {}
  return {
    IgNotConfiguredError,
    submitPosts: (...args: unknown[]) => mockSubmit(...args),
    listJobs: (...args: unknown[]) => mockJobs(...args),
    retryJob: (...args: unknown[]) => mockRetry(...args),
    reextractJob: (...args: unknown[]) => mockReextract(...args),
    listSaved: (...args: unknown[]) => mockSaved(...args),
    removeSaved: (...args: unknown[]) => mockRemove(...args),
  }
})

vi.mock("../map/AtlasMap", () => ({
  AtlasMap: ({ pins, label }: { pins: Array<{ id: string }>; label: string }) => <div role="region" aria-label={label} data-pins={pins.length} />,
}))

import { InstagramSheet } from "../instagram/InstagramSheet"
import { IgNotConfiguredError } from "../instagram/instagramApi"

const getToken = async () => "t"
const LINK = "https://www.instagram.com/reel/abc/"

const place = (id: number, name: string): IgPlace => ({
  id,
  post_id: 1,
  name,
  name_romanized: null,
  city: "Lisbon",
  category: "cafe",
  confidence_band: "high",
  supporting_quote: "go early",
  address: "Lisbon",
  lat: 38.7 + id / 1000,
  lng: -9.14,
})

const job = (overrides: Partial<IgJob> = {}): IgJob => ({
  id: 7,
  url: LINK,
  status: "running",
  step: "bundling",
  step_started_at: null,
  attempts: 1,
  last_error: null,
  created_at: "",
  updated_at: "",
  post_id: 1,
  skip_video: true,
  places: [],
  post_preview: { caption: "Five places", owner_username: "lisboa" },
  ...overrides,
})

const onAdd = vi.fn()
const onClose = vi.fn()

function renderSheet(props: Partial<Parameters<typeof InstagramSheet>[0]> = {}) {
  return render(<InstagramSheet open trip={makeTrip()} getToken={getToken} onAdd={onAdd} onClose={onClose} {...props} />)
}

describe("InstagramSheet", () => {
  beforeEach(() => {
    mockJobs.mockResolvedValue([])
    mockSaved.mockResolvedValue({ places: [], total: 0, hasMore: false })
    mockSubmit.mockResolvedValue({ jobs: [{ jobId: 7, status: "pending", reused: false }] })
    mockReextract.mockResolvedValue(undefined)
    mockRetry.mockResolvedValue(undefined)
    mockRemove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("explains itself on first run and refuses text that is not a link", async () => {
    renderSheet()
    expect(await screen.findByText(/choose Share, then Copy link/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: /Instagram post or Reel link/ }), { target: { value: "pasteis de belem" } })
    expect(screen.getByRole("status")).toHaveTextContent("doesn’t look like an Instagram link")
    expect(screen.getByRole("button", { name: "Find places" })).toBeDisabled()
    expect(mockSubmit).not.toHaveBeenCalled()
  })

  it("starts reading the moment a link is pasted, quick read first", async () => {
    mockJobs.mockResolvedValueOnce([]).mockResolvedValue([job()])
    renderSheet()
    const input = await screen.findByRole("textbox", { name: /Instagram post or Reel link/ })
    fireEvent.paste(input, { clipboardData: { getData: () => `watch this ${LINK}?igsh=1` } })
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledWith(getToken, [`${LINK}?igsh=1`], true))
    expect(await screen.findByRole("progressbar", { name: "Reading the caption" })).toBeInTheDocument()
    expect(screen.getByText("@lisboa")).toBeInTheDocument()
  })

  it("adds a place to the day in view, and all of a post's places at once", async () => {
    mockJobs.mockResolvedValue([job({ status: "done", step: "done", places: [place(1, "Manteigaria"), place(2, "LX Factory")] })])
    renderSheet({ dayId: "day-2", initialUrls: [LINK] })
    fireEvent.click(await screen.findByRole("button", { name: "Add Manteigaria to day 2" }))
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd.mock.calls[0]![0]).toBe("day-2")
    expect(onAdd.mock.calls[0]![1][0]).toMatchObject({ title: "Manteigaria", links: [LINK], location: { name: "Manteigaria", lat: 38.701 } })

    fireEvent.click(screen.getByRole("button", { name: /Add all 2/ }))
    expect(onAdd.mock.calls[1]![1]).toHaveLength(2)
    expect(screen.getByRole("region", { name: /Map of 2 places/ })).toHaveAttribute("data-pins", "2")
  })

  it("shows a place that is already on the trip as added, not addable", async () => {
    const trip = makeTrip({
      days: [
        { id: "day-1", date: "2026-07-10", items: [] },
        { id: "day-2", date: "2026-07-11", items: [{ id: "x", kind: "place", title: "Manteigaria", status: "none", createdBy: "user" }] },
      ],
    })
    mockJobs.mockResolvedValue([job({ status: "done", step: "done", places: [place(1, "Manteigaria")] })])
    renderSheet({ trip, initialUrls: [LINK] })
    expect(await screen.findByText("On day 2")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Add Manteigaria/ })).not.toBeInTheDocument()
  })

  it("reads the video on its own when the caption names nothing", async () => {
    mockJobs.mockResolvedValue([job({ status: "done", step: "done", places: [] })])
    let accept!: () => void
    mockReextract.mockReturnValue(new Promise<void>((resolve) => (accept = resolve)))
    renderSheet({ initialUrls: [LINK] })
    await waitFor(() => expect(mockReextract).toHaveBeenCalledWith(getToken, 7))
    expect(mockSubmit).toHaveBeenLastCalledWith(getToken, [LINK], false)
    expect(await screen.findByRole("progressbar", { name: /Watching the video/ })).toBeInTheDocument()

    // The re-read is over before any poll sees it running: the card must not keep watching.
    await act(async () => accept())
    await waitFor(() => expect(screen.queryByRole("progressbar", { name: /Watching the video/ })).not.toBeInTheDocument())
    expect(mockReextract).toHaveBeenCalledTimes(1)
  })

  it("says so plainly when a post cannot be read, and lets you try again", async () => {
    mockJobs.mockResolvedValue([job({ status: "dead", step: "fetching", skip_video: false, last_error: "bright data returned empty array" })])
    renderSheet({ initialUrls: [LINK] })
    expect(await screen.findByRole("alert")).toHaveTextContent("It may be private or deleted")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(mockRetry).toHaveBeenCalledWith(getToken, 7))
  })

  it("keeps every place under Saved, searchable and removable", async () => {
    const saved = { ...place(5, "Time Out Market"), created_at: "", post: { id: 2, url: "https://www.instagram.com/p/z/", shortcode: "z", owner_username: "eat", caption: null } }
    mockSaved.mockResolvedValue({ places: [saved], total: 1, hasMore: false })
    renderSheet()
    fireEvent.click(await screen.findByRole("tab", { name: /Saved/ }))
    expect(await screen.findByText("Time Out Market")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add Time Out Market to day 1" }))
    expect(onAdd.mock.calls[0]![1][0].links).toEqual(["https://www.instagram.com/p/z/"])
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "market" } })
    await waitFor(() => expect(mockSaved).toHaveBeenLastCalledWith(getToken, { q: "market", offset: 0 }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove Time Out Market from saved" }))
    })
    expect(mockRemove).toHaveBeenCalledWith(getToken, 5)
    expect(screen.queryByText("Time Out Market")).not.toBeInTheDocument()
  })

  it("tells the traveller when import is not set up on the server", async () => {
    mockJobs.mockRejectedValue(new IgNotConfiguredError())
    renderSheet()
    expect(await screen.findByText(/isn’t switched on for this server/)).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: /Instagram post or Reel link/ })).not.toBeInTheDocument()
  })
})
