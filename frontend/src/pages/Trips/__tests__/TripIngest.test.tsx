import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/safeAuth", () => ({
  useGetToken: () => vi.fn().mockResolvedValue("test-token"),
  clerkEnabled: true,
}))

const mockSubmitUrl = vi.fn()
const mockListJobs = vi.fn()
const mockRetryJob = vi.fn()

vi.mock("../../Korea/ingestApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../Korea/ingestApi")>()
  return {
    ...actual,
    submitUrl: (...args: unknown[]) => mockSubmitUrl(...args),
    listJobs: (...args: unknown[]) => mockListJobs(...args),
    retryJob: (...args: unknown[]) => mockRetryJob(...args),
  }
})

import { TripIngest } from "../TripIngest"
import type { Job } from "../../Korea/ingestApi"
import type { Trip, TripDay } from "../types"

function makeTrip(): Trip {
  return {
    id: "t1",
    ownerId: "u1",
    name: "Tokyo Long Weekend",
    destinations: ["Tokyo"],
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    timezone: "Asia/Tokyo",
    status: "active",
    tags: [],
    collaborators: [],
    days: [
      { id: "day-1", date: "2026-07-10", title: "Arrival", items: [] },
      { id: "day-2", date: "2026-07-11", title: "Tsukiji", items: [] },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  }
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    url: "https://www.instagram.com/reel/ABC123/",
    status: "done",
    step: "done",
    step_started_at: null,
    attempts: 1,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    post_id: 9,
    places: [
      {
        id: 11,
        name: "Sushi Saito",
        name_romanized: null,
        city: "Tokyo",
        category: "restaurant",
        confidence: 0.9,
        confidence_band: "high",
        is_subject: true,
        supporting_quote: "Go here",
        address: "Minami-Aoyama",
        lat: 35.66,
        lng: 139.72,
        geocode_source: "google",
        geocode_disagree: false,
        signal_source: "caption",
        vote_count: 3,
      },
    ],
    logs: [],
    post_preview: null,
    ...overrides,
  }
}

async function renderIngest(trip = makeTrip(), dayId = "day-1") {
  const onDaysChange = vi.fn((fn: (days: TripDay[]) => TripDay[]) => fn(trip.days))
  await act(async () => {
    render(<TripIngest trip={trip} dayId={dayId} onDaysChange={onDaysChange} />)
    await Promise.resolve()
    await Promise.resolve()
  })
  return { onDaysChange, trip }
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^instagram$/i }))
}

describe("TripIngest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListJobs.mockResolvedValue([])
    mockSubmitUrl.mockResolvedValue({ jobs: [{ jobId: 1, status: "pending", reused: false }] })
    mockRetryJob.mockResolvedValue(undefined)
  })

  it("keeps the extractor collapsed until Instagram is opened", async () => {
    await renderIngest()
    expect(screen.queryByRole("button", { name: /extract places/i })).toBeNull()
    expect(screen.getByRole("button", { name: /^instagram$/i })).toBeTruthy()
  })

  it("disables extract until the URL is a valid Instagram link", async () => {
    const user = userEvent.setup()
    await renderIngest()
    await openPanel(user)

    const btn = screen.getByRole("button", { name: /extract places/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText("Instagram URL"), {
      target: { value: "https://example.com/nope" },
    })
    expect((screen.getByRole("button", { name: /extract places/i }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText("Instagram URL"), {
      target: { value: "https://www.instagram.com/reel/ABC123/" },
    })
    expect((screen.getByRole("button", { name: /extract places/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("submits a URL and tracks the new job", async () => {
    const user = userEvent.setup()
    await renderIngest()
    await openPanel(user)
    fireEvent.change(screen.getByLabelText("Instagram URL"), {
      target: { value: "https://www.instagram.com/reel/ABC123/" },
    })
    await user.click(screen.getByRole("button", { name: /extract places/i }))
    await waitFor(() => {
      expect(mockSubmitUrl).toHaveBeenCalled()
    })
    expect(mockListJobs).toHaveBeenCalled()
  })

  it("adds an extracted place to the focused day via onDaysChange", async () => {
    mockListJobs.mockResolvedValue([makeJob()])
    const user = userEvent.setup()
    const { onDaysChange, trip } = await renderIngest(makeTrip(), "day-1")
    await openPanel(user)

    await waitFor(() => {
      expect(screen.getByText("Sushi Saito")).toBeTruthy()
    })

    await user.click(screen.getByRole("button", { name: /add to this day/i }))
    await waitFor(() => {
      expect(onDaysChange).toHaveBeenCalled()
    })
    const updater = onDaysChange.mock.calls[0]![0] as (days: TripDay[]) => TripDay[]
    const next = updater(trip.days)
    expect(next[0]!.items[0]!.title).toBe("Sushi Saito")
    expect(next[0]!.items[0]!.location?.lat).toBe(35.66)
    expect(next[0]!.items[0]!.links).toEqual(["https://www.instagram.com/reel/ABC123/"])
    expect(next[1]!.items).toHaveLength(0)
  })
})
