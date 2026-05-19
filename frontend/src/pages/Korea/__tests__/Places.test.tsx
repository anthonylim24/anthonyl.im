import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/safeAuth', () => ({
  useGetToken: () => vi.fn().mockResolvedValue('test-token'),
  clerkEnabled: true,
}))

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

const mockFetchExtractedPlaces = vi.fn()

vi.mock('../placesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../placesApi')>()
  return {
    ...actual,
    fetchExtractedPlaces: (...args: unknown[]) => mockFetchExtractedPlaces(...args),
  }
})

// Static import AFTER mocks are declared (vi.mock is hoisted)
import { Places } from '../Places'
import type { ExtractedPlace } from '../placesApi'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlace(overrides: Partial<ExtractedPlace> = {}): ExtractedPlace {
  return {
    id: 1,
    name: '어니언 성수',
    name_romanized: 'Onion Seongsu',
    city: 'Seoul',
    category: 'cafe',
    confidence: 0.9,
    confidence_band: 'high',
    is_subject: true,
    supporting_quote: '성수동에서 가장 좋아하는 카페!',
    signal_source: 'caption',
    vote_count: 3,
    address: '서울 성동구 아차산로9길 8',
    lat: 37.544,
    lng: 127.057,
    phone: '02-1234-5678',
    rating: 4.6,
    business_types: ['cafe'],
    geocode_source: 'google+kakao',
    geocode_kakao_id: 'kakao-123',
    geocode_disagree: false,
    google_place_id: 'ChIJplace123',
    status: 'extracted',
    created_at: new Date().toISOString(),
    post: {
      id: 10,
      url: 'https://www.instagram.com/reel/ABC/',
      shortcode: 'ABC',
      owner_username: 'anonfoodie',
      caption: 'Best cafe in Seongsu!',
      fetched_at: new Date().toISOString(),
    },
    ...overrides,
  }
}

function emptyResponse() {
  return { places: [], total: 0, hasMore: false }
}

// ── Helper ────────────────────────────────────────────────────────────────────

async function renderPlaces() {
  let result: ReturnType<typeof render>
  await act(async () => {
    result = render(
      <MemoryRouter>
        <Places />
      </MemoryRouter>,
    )
    await Promise.resolve()
    await Promise.resolve()
  })
  return result!
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Places page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchExtractedPlaces.mockResolvedValue(emptyResponse())
  })

  it('renders the page header', async () => {
    await renderPlaces()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toBeTruthy()
    expect(heading.textContent).toMatch(/extracted places/i)
  })

  it('renders the empty state when API returns no places', async () => {
    await renderPlaces()
    await waitFor(() => {
      expect(screen.getByText(/no extracted places yet/i)).toBeTruthy()
    })
  })

  it('renders a card with place name, category badge, and band badge', async () => {
    const place = makePlace()
    // Set mock BEFORE rendering so the initial fetch returns the place
    mockFetchExtractedPlaces.mockResolvedValue({
      places: [place],
      total: 1,
      hasMore: false,
    })

    await renderPlaces()

    await waitFor(() => {
      // Korean name rendered in the card
      expect(screen.getByRole('article', { name: /어니언 성수/i })).toBeTruthy()
    })

    // Romanized name
    expect(screen.getByText(/onion seongsu/i)).toBeTruthy()
    // Category badge — the article's own badge (aria-label distinguishes from filter chips)
    const article = screen.getByRole('article', { name: /어니언 성수/i })
    expect(article.textContent).toContain('Cafe')
    expect(article.textContent).toMatch(/high/i)
  })

  it('clicking a category chip triggers a refetch with that category', async () => {
    await renderPlaces()

    // Wait for initial load
    await waitFor(() => expect(mockFetchExtractedPlaces).toHaveBeenCalledTimes(1))

    // Click the "Cafe" chip
    const cafeChip = screen.getByRole('button', { name: 'Cafe' })
    await act(async () => {
      await userEvent.click(cafeChip)
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(mockFetchExtractedPlaces).toHaveBeenCalledTimes(2)
    })

    // The second call should have category=cafe
    const secondCall = mockFetchExtractedPlaces.mock.calls[1] as [unknown, Record<string, unknown>]
    expect(secondCall[1].category).toBe('cafe')
  })

  it('search box is debounced — does not call API immediately', async () => {
    vi.useFakeTimers()

    await act(async () => {
      render(
        <MemoryRouter>
          <Places />
        </MemoryRouter>,
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    // Wait for initial fetch
    await act(async () => {
      vi.runAllTimers()
    })

    const initialCallCount = mockFetchExtractedPlaces.mock.calls.length

    const searchInput = screen.getByRole('searchbox')

    // Type but don't advance timers — no extra fetch yet
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '어니언' } })
    })

    expect(mockFetchExtractedPlaces.mock.calls.length).toBe(initialCallCount)

    // Advance past the 300ms debounce — now the fetch fires
    await act(async () => {
      vi.advanceTimersByTime(350)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockFetchExtractedPlaces.mock.calls.length).toBeGreaterThan(initialCallCount)

    const calls = mockFetchExtractedPlaces.mock.calls as [unknown, Record<string, unknown>][]
    const lastCall = calls[calls.length - 1]
    expect(lastCall[1].q).toBe('어니언')

    vi.useRealTimers()
  })
})
