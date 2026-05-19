import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock the safe token wrapper — Ingest calls useGetToken() instead of useAuth()
// directly so it doesn't crash builds without VITE_CLERK_PUBLISHABLE_KEY.
vi.mock('@/lib/safeAuth', () => ({
  useGetToken: () => vi.fn().mockResolvedValue('test-token'),
}))

// Mock motion/react to remove animation side-effects in tests
vi.mock('motion/react', async () => {
  const React = await import('react')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeEl = (tag: string) => ({ children, ...rest }: any) => {
    const {
      initial: _i, animate: _a, exit: _e, transition: _tr,
      whileInView: _wiv, viewport: _vp, layout: _l,
      ...domProps
    } = rest
    return React.createElement(tag, domProps, children)
  }
  return {
    motion: new Proxy(
      {},
      { get: (_t, prop: string) => makeEl(prop) },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
  }
})

// Mock the API module
const mockSubmitUrl = vi.fn()
const mockListJobs = vi.fn()
const mockFetchStats = vi.fn()
const mockRetryJob = vi.fn()

vi.mock('../ingestApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ingestApi')>()
  return {
    ...actual,
    submitUrl: (...args: unknown[]) => mockSubmitUrl(...args),
    listJobs: (...args: unknown[]) => mockListJobs(...args),
    fetchStats: (...args: unknown[]) => mockFetchStats(...args),
    retryJob: (...args: unknown[]) => mockRetryJob(...args),
  }
})

// Static import AFTER mocks are declared (vi.mock is hoisted, so this is safe)
import { Ingest } from '../Ingest'
import type { Job } from '../ingestApi'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    url: 'https://www.instagram.com/reel/ABC123/',
    status: 'running',
    step: 'extracting',
    step_started_at: new Date().toISOString(),
    attempts: 1,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    post_id: null,
    places: [],
    logs: [],
    post_preview: null,
    ...overrides,
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

/** Render the Ingest page and wait for the initial effects to settle. */
async function renderIngest() {
  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <MemoryRouter>
        <Ingest />
      </MemoryRouter>,
    )
    // Flush promises so listJobs/fetchStats initial calls resolve
    await Promise.resolve()
    await Promise.resolve()
  })
  return result!
}

/** Set the URL input value and flush the resulting state update. */
async function setUrlValue(input: HTMLElement, value: string) {
  await act(async () => {
    fireEvent.change(input, { target: { value } })
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Ingest page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockListJobs.mockResolvedValue([])
    mockFetchStats.mockResolvedValue({ enabled: true, pending: 0, running: 0, done: 0 })
    mockSubmitUrl.mockResolvedValue({ jobs: [{ jobId: 1, status: 'pending', reused: false }] })
    mockRetryJob.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // Restore real timers if a test used fake ones without restoring
    vi.useRealTimers()
  })

  it('renders the submission form with label and submit button', async () => {
    await renderIngest()
    expect(screen.getByLabelText('Instagram URL')).toBeTruthy()
    expect(screen.getByRole('button', { name: /submit/i })).toBeTruthy()
  })

  it('submit button is disabled when the input is empty', async () => {
    await renderIngest()
    const btn = screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('submit button is disabled for a non-Instagram URL', async () => {
    await renderIngest()
    const input = screen.getByLabelText('Instagram URL')
    await setUrlValue(input, 'https://example.com/post/123')
    const btn = screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('submit button is enabled for a valid Instagram URL', async () => {
    await renderIngest()
    const input = screen.getByLabelText('Instagram URL')
    await setUrlValue(input, 'https://www.instagram.com/reel/ABC123/')
    const btn = screen.getByRole('button', { name: /submit/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('shows correct validation hints for different URL inputs', async () => {
    await renderIngest()

    // Default (empty) hint — present on initial render
    expect(screen.getByText(/paste an instagram post or reel url/i)).toBeTruthy()

    // Invalid URL → red hint (always re-query the input in case of re-renders)
    await setUrlValue(screen.getByLabelText('Instagram URL'), 'https://twitter.com/something')
    await waitFor(() => {
      expect(screen.getByText(/not an instagram url/i)).toBeTruthy()
    })

    // Valid URL → green hint
    await setUrlValue(screen.getByLabelText('Instagram URL'), 'https://www.instagram.com/p/DEF456/')
    await waitFor(() => {
      expect(screen.getByText(/looks good/i)).toBeTruthy()
    })
  })

  it('calls submitUrl with the correct URL on a successful submission', async () => {
    await renderIngest()
    const validUrl = 'https://www.instagram.com/reel/ABC123/'

    await setUrlValue(screen.getByLabelText('Instagram URL'), validUrl)

    // Confirm button is enabled before clicking
    const btn = screen.getByRole('button', { name: /submit/i })
    expect((btn as HTMLButtonElement).disabled).toBe(false)

    await act(async () => {
      fireEvent.click(btn)
      // Flush microtasks so the async handleSubmit chain resolves
      await new Promise((r) => setTimeout(r, 20))
    })

    // submitUrl must have been called once with the correct URL
    await waitFor(() => {
      expect(mockSubmitUrl).toHaveBeenCalledOnce()
    })
    // Second argument is the URL; first argument is the getToken function
    expect(mockSubmitUrl.mock.calls[0][1]).toBe(validUrl)

    // Input must be cleared once the submission completes
    await waitFor(() => {
      expect((screen.getByLabelText('Instagram URL') as HTMLInputElement).value).toBe('')
    }, { timeout: 3000 })
  })

  it('shows an inline error when submission fails', async () => {
    const errorMsg = 'Rate limit exceeded'
    mockSubmitUrl.mockRejectedValueOnce(new Error(errorMsg))

    await renderIngest()
    const input = screen.getByLabelText('Instagram URL') as HTMLInputElement
    await setUrlValue(input, 'https://www.instagram.com/reel/ABC123/')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /submit/i }))
      await new Promise((r) => setTimeout(r, 0))
    })

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeTruthy()
    })
  })

  it('renders a job card with the correct status pill and active step for a running job', async () => {
    const job = makeJob({ status: 'running', step: 'extracting' })
    mockListJobs.mockResolvedValue([job])

    await renderIngest()

    // Status pill with aria-label
    const pill = screen.getByLabelText('Status: Running')
    expect(pill).toBeTruthy()

    // "Extract" step label is visible (current step in the pipeline)
    expect(screen.getByText('Extract')).toBeTruthy()
  })

  it('renders the empty state when there are no jobs', async () => {
    mockListJobs.mockResolvedValue([])
    await renderIngest()
    expect(screen.getByText(/no ingested links yet/i)).toBeTruthy()
  })

  it('shows Retry button for dead jobs and calls retryJob on click', async () => {
    const job = makeJob({ id: 42, status: 'dead', last_error: 'boom' })
    mockListJobs.mockResolvedValue([job])

    await renderIngest()

    // Retry button should be visible for dead job
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeTruthy()

    // Click the retry button
    await act(async () => {
      await userEvent.click(retryBtn)
      await new Promise((r) => setTimeout(r, 20))
    })

    // retryJob should have been called with the job's id
    await waitFor(() => {
      expect(mockRetryJob).toHaveBeenCalledOnce()
    })
    expect(mockRetryJob.mock.calls[0][1]).toBe(42)
  })

  it('shows ETA pill for a running job', async () => {
    // step_started_at 2 seconds ago so there is some elapsed time
    const stepStartedAt = new Date(Date.now() - 2000).toISOString()
    const job = makeJob({
      status: 'running',
      step: 'extracting',
      step_started_at: stepStartedAt,
    })
    mockListJobs.mockResolvedValue([job])

    await renderIngest()

    // ETA pill should show "~Xs left" (remaining time for extracting=4s minus ~2s elapsed = ~2s,
    // plus geocoding=3s + saving=1s = ~6s total, but clamped to at least 1)
    await waitFor(() => {
      expect(screen.getByText(/~\d+s left/)).toBeTruthy()
    })
  })

  it('shows slow-step warning when elapsed exceeds 2× estimate', async () => {
    // bundling estimate is 25s; set step_started_at to 60s ago (2× + exceeded)
    const stepStartedAt = new Date(Date.now() - 60_000).toISOString()
    const job = makeJob({
      status: 'running',
      step: 'bundling',
      step_started_at: stepStartedAt,
    })
    mockListJobs.mockResolvedValue([job])

    await renderIngest()

    await waitFor(() => {
      expect(screen.getByText(/taking longer than expected/i)).toBeTruthy()
    })
  })

  it('shows fetch-failure banner after 3 consecutive listJobs failures', async () => {
    // Make listJobs always reject so every poll increments the failure counter
    mockListJobs.mockRejectedValue(new Error('network error'))

    await renderIngest()

    // The initial fetch already triggered 1 failure; trigger 2 more by
    // directly calling doFetchJobs — we do that by firing the visibilitychange
    // event which triggers a poll cycle, or by advancing the polling interval.
    // Simplest: just wait for the polling interval to fire 3+ times.
    // The polling interval is 2000ms, so wait with a generous timeout.
    await waitFor(
      () => {
        expect(screen.getByText(/reconnecting/i)).toBeTruthy()
      },
      { timeout: 10_000 },
    )
  }, 15_000)

  it('extracted places show vote_count, signal_source, and address when present', async () => {
    const place = {
      id: 10,
      name: '성수동카페',
      name_romanized: 'Seongsu Cafe',
      city: 'Seoul',
      category: 'cafe' as const,
      confidence: 0.85,
      confidence_band: 'high' as const,
      is_subject: false,
      supporting_quote: null,
      address: '서울 성동구 아차산로 123',
      lat: 37.5,
      lng: 127.0,
      geocode_source: 'google' as const,
      geocode_disagree: false,
      signal_source: 'multiple' as const,
      vote_count: 3,
    }

    const job = makeJob({
      status: 'done',
      step: 'done',
      places: [place],
    })
    mockListJobs.mockResolvedValue([job])

    await renderIngest()

    // Expand the places list
    const expandBtn = await screen.findByRole('button', { name: /1 place extracted/i })
    await act(async () => {
      fireEvent.click(expandBtn)
    })

    await waitFor(() => {
      // vote_count
      expect(screen.getByText(/voted 3×/i)).toBeTruthy()
      // signal_source (rendered as "from multiple signals")
      expect(screen.getByText(/from multiple signals/i)).toBeTruthy()
      // address
      expect(screen.getByText('서울 성동구 아차산로 123')).toBeTruthy()
    })
  })

  it('renders log lines for a job', async () => {
    const logs = [
      { id: 1, job_id: 1, step: 'fetching' as const, level: 'info' as const, message: 'starting fetch', created_at: new Date().toISOString() },
      { id: 2, job_id: 1, step: 'fetching' as const, level: 'info' as const, message: 'got payload via apify; 1 media item(s)', created_at: new Date().toISOString() },
    ]
    const job = makeJob({ logs })
    mockListJobs.mockResolvedValue([job])

    await renderIngest()

    // Logs accordion summary should show count
    const summary = screen.getByText(/Logs \(2\)/)
    expect(summary).toBeTruthy()

    // Expand the details element
    await act(async () => {
      fireEvent.click(summary)
    })

    // Log messages should now be visible (may appear in log list + step popover)
    await waitFor(() => {
      expect(screen.getAllByText('starting fetch').length).toBeGreaterThan(0)
      expect(screen.getAllByText(/got payload via apify/).length).toBeGreaterThan(0)
    })
  })
})
