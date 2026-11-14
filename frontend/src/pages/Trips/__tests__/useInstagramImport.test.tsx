import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { IgJob } from "../instagram/instagramApi"

const mockSubmit = vi.fn()
const mockJobs = vi.fn()
const mockReextract = vi.fn()

vi.mock("../instagram/instagramApi", () => {
  class IgNotConfiguredError extends Error {}
  return {
    IgNotConfiguredError,
    submitPosts: (...args: unknown[]) => mockSubmit(...args),
    listJobs: (...args: unknown[]) => mockJobs(...args),
    retryJob: vi.fn(),
    reextractJob: (...args: unknown[]) => mockReextract(...args),
  }
})

import { DEEPEN_LIMIT_MS, useInstagramImport } from "../instagram/useInstagramImport"

const getToken = async () => "t"
const A = "https://www.instagram.com/reel/aaa/"
const B = "https://www.instagram.com/reel/bbb/"

const job = (overrides: Partial<IgJob> = {}): IgJob => ({
  id: 7,
  url: A,
  status: "done",
  step: "done",
  step_started_at: null,
  attempts: 1,
  last_error: null,
  created_at: "",
  updated_at: "",
  post_id: 1,
  skip_video: false,
  places: [],
  post_preview: null,
  ...overrides,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe("useInstagramImport", () => {
  beforeEach(() => {
    mockJobs.mockResolvedValue([])
    mockReextract.mockResolvedValue(undefined)
    mockSubmit.mockResolvedValue({ jobs: [] })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it("keeps submitting and the pending links until every overlapping submit has answered", async () => {
    const first = deferred<{ jobs: [] }>()
    const second = deferred<{ jobs: [] }>()
    mockSubmit.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useInstagramImport(getToken, true))
    await waitFor(() => expect(result.current.status).toBe("ready"))

    act(() => {
      void result.current.submit([A])
      void result.current.submit([B])
    })
    expect(result.current.submitting).toBe(true)
    expect(result.current.pendingUrls).toEqual([A, B])

    await act(async () => {
      first.resolve({ jobs: [] })
      await first.promise
    })
    await waitFor(() => expect(result.current.pendingUrls).toEqual([B]))
    expect(result.current.submitting).toBe(true)

    await act(async () => {
      second.resolve({ jobs: [] })
      await second.promise
    })
    await waitFor(() => expect(result.current.submitting).toBe(false))
    expect(result.current.pendingUrls).toEqual([])
  })

  it("stops saying it is watching the video once a refresh after the re-read shows the job is not running", async () => {
    // The re-read finished (still nothing found) before the first poll saw it running.
    mockJobs.mockResolvedValue([job()])
    const { result } = renderHook(() => useInstagramImport(getToken, true))
    await waitFor(() => expect(result.current.status).toBe("ready"))

    await act(async () => {
      await result.current.deepen(job())
    })
    expect(mockReextract).toHaveBeenCalledWith(getToken, 7)
    await waitFor(() => expect(result.current.deepening.has(7)).toBe(false))
  })

  it("lets go when the job has fallen off the list", async () => {
    mockJobs.mockResolvedValue([])
    const { result } = renderHook(() => useInstagramImport(getToken, true))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    await act(async () => {
      await result.current.deepen(job())
    })
    await waitFor(() => expect(result.current.deepening.has(7)).toBe(false))
  })

  it("gives up after a hard limit when no refresh gets through", async () => {
    const { result } = renderHook(() => useInstagramImport(getToken, true))
    await waitFor(() => expect(result.current.status).toBe("ready"))
    vi.useFakeTimers()
    // The re-read request never answers.
    mockSubmit.mockReturnValue(new Promise(() => {}))
    act(() => {
      void result.current.deepen(job())
    })
    expect(result.current.deepening.has(7)).toBe(true)
    act(() => {
      vi.advanceTimersByTime(DEEPEN_LIMIT_MS + 1)
    })
    expect(result.current.deepening.has(7)).toBe(false)
  })
})
