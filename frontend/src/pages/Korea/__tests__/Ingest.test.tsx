import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock Clerk — the Ingest component uses useAuth().getToken()
vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ getToken: vi.fn().mockResolvedValue('test-token') }),
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

vi.mock('../ingestApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ingestApi')>()
  return {
    ...actual,
    submitUrl: (...args: unknown[]) => mockSubmitUrl(...args),
    listJobs: (...args: unknown[]) => mockListJobs(...args),
    fetchStats: (...args: unknown[]) => mockFetchStats(...args),
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
    attempts: 1,
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    post_id: null,
    places: [],
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
})
