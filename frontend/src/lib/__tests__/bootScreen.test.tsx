import { lazy, StrictMode, useLayoutEffect, type ComponentType } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBoot, paintBoot, quickExitMs } from '@/test/bootPage'

async function paintThenLoad(path: string) {
  const boot = paintBoot(path)
  vi.resetModules()
  const [screenModule, routes] = await Promise.all([import('../bootScreen'), import('../../AppRoutes')])
  return { boot, ...screenModule, ...routes }
}

const flush = () => act(async () => {})

function stateHistory(boot: HTMLElement) {
  const seen: (string | null)[] = []
  const observer = new MutationObserver((records) => seen.push(...records.map((record) => record.oldValue)))
  observer.observe(boot, { attributeFilter: ['data-state'], attributeOldValue: true })
  return () => [...seen, ...observer.takeRecords().map((record) => record.oldValue), boot.dataset.state]
}

function reducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query }))
}

/** The page's FontFaceSet: each face as the browser holds it after the app has drawn. */
function fontFaces(faces: [family: string, style: string, status: FontFaceLoadStatus][]) {
  const set = Object.assign(
    faces.map(([family, style, status]) => ({ family, style, status })),
    { ready: Promise.resolve() },
  )
  Object.defineProperty(document, 'fonts', { configurable: true, value: set })
}

afterEach(() => {
  Reflect.deleteProperty(document, 'fonts')
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.doUnmock('../lazyRetry')
  clearBoot()
})

describe('the boot screen', () => {
  it('leaves after React’s first commit when nothing waits, quickly when it was barely up', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady } = await paintThenLoad('/lab')
    render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-state', 'leaving')
    expect(boot).toHaveAttribute('data-exit', 'quick')
    expect(boot).toHaveAttribute('inert')
    expect(boot).not.toHaveAttribute('aria-busy')
    expect(quickExitMs).toBeGreaterThan(0)
    act(() => vi.advanceTimersByTime(quickExitMs - 1))
    expect(boot.isConnected).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(boot.isConnected).toBe(false)
  })

  it('plays its own exit, for as long as it says, when it has been up a while', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady } = await paintThenLoad('/trips')
    act(() => vi.advanceTimersByTime(1_000))
    render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-state', 'leaving')
    expect(boot).not.toHaveAttribute('data-exit')
    const exitMs = Number(boot.dataset.exitMs)
    expect(exitMs).toBeGreaterThan(quickExitMs)
    act(() => vi.advanceTimersByTime(exitMs - 1))
    expect(boot.isConnected).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(boot.isConnected).toBe(false)
  })

  it('takes the quick exit under reduced motion, however long it was up', async () => {
    vi.useFakeTimers()
    reducedMotion(true)
    const { boot, BootReady } = await paintThenLoad('/breathwork')
    act(() => vi.advanceTimersByTime(1_000))
    render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-exit', 'quick')
    act(() => vi.advanceTimersByTime(quickExitMs))
    expect(boot.isConnected).toBe(false)
  })

  it('stays at the code step while a route’s code is on its way, and leaves once the route renders', async () => {
    reducedMotion(false)
    const { boot, BootReady, BootHold, Guarded } = await paintThenLoad('/breathwork')
    let arrive!: (module: { default: ComponentType }) => void
    const Page = lazy(() => new Promise<{ default: ComponentType }>((resolve) => (arrive = resolve)))
    const states = stateHistory(boot)
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/breathwork']}>
          <BootReady />
          <Guarded app="breathwork" fallback={<BootHold world="breathwork" step="code" />}>
            <Page />
          </Guarded>
        </MemoryRouter>
      </StrictMode>,
    )
    await flush()
    expect(states()).not.toContain('leaving')
    expect(boot).toHaveAttribute('data-step', 'code')
    expect(boot).toHaveAttribute('aria-busy', 'true')

    await act(async () => arrive({ default: () => <h1>Breathe</h1> }))
    expect(await screen.findByRole('heading', { name: 'Breathe' })).toBeInTheDocument()
    await waitFor(() => expect(boot).toHaveAttribute('data-state', 'leaving'))
  })

  it('keeps the page out of reach while it shows, and hands it back in time for the route to focus a field', async () => {
    reducedMotion(false)
    const { boot, BootReady, BootHold, Guarded } = await paintThenLoad('/trips/new')
    const root = document.getElementById('root')!
    let arrive!: (module: { default: ComponentType }) => void
    const Page = lazy(() => new Promise<{ default: ComponentType }>((resolve) => (arrive = resolve)))
    let coveredAsTheRouteMounted: boolean | undefined
    function NewTrip() {
      useLayoutEffect(() => {
        coveredAsTheRouteMounted = root.hasAttribute('inert')
      }, [])
      return <input aria-label="Where to?" autoFocus />
    }
    render(
      <MemoryRouter initialEntries={['/trips/new']}>
        <BootReady />
        <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
          <Page />
        </Guarded>
      </MemoryRouter>,
      { container: root },
    )
    await flush()
    expect(root).toHaveAttribute('inert')

    await act(async () => arrive({ default: NewTrip }))
    expect(await screen.findByRole('textbox', { name: 'Where to?' })).toHaveFocus()
    expect(coveredAsTheRouteMounted).toBe(false)
    expect(boot).toHaveAttribute('data-state', 'leaving')
    expect(root).not.toHaveAttribute('inert')
  })

  it('gets out of the way of the error screen when a route’s code fails', async () => {
    reducedMotion(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { boot, BootReady, BootHold, Guarded } = await paintThenLoad('/trips')
    const Page = lazy(() => Promise.reject(new Error('boom')))
    render(
      <MemoryRouter initialEntries={['/trips']}>
        <BootReady />
        <Guarded app="trips" fallback={<BootHold world="trips" step="code" />}>
          <Page />
        </Guarded>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong loading the trip planner.')
    expect(boot).toHaveAttribute('data-state', 'leaving')
    expect(boot).toHaveAttribute('inert')
    await waitFor(() => expect(document.getElementById('boot')).toBeNull(), { timeout: 2_000 })
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
  })

  it('comes back for a later wait, and leaves again when it is over', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady, BootHold } = await paintThenLoad('/trips')
    const view = render(<BootReady />)
    await flush()
    act(() => vi.advanceTimersByTime(quickExitMs))
    expect(boot.isConnected).toBe(false)

    view.rerender(
      <>
        <BootReady />
        <BootHold world="trips" step="auth" />
      </>,
    )
    act(() => vi.advanceTimersByTime(199))
    expect(document.getElementById('boot')).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    const again = document.getElementById('boot')
    expect(again).not.toBeNull()
    expect(document.getElementById('root')).toHaveAttribute('inert')
    expect(again).toHaveAttribute('data-late')
    expect(again).not.toBe(boot)
    expect(again).toHaveAttribute('data-world', 'trips')
    expect(again).toHaveAttribute('data-step', 'auth')
    expect(again).toHaveAttribute('data-state', 'showing')

    view.rerender(<BootReady />)
    await flush()
    expect(again).toHaveAttribute('data-state', 'leaving')
    expect(document.getElementById('root')).not.toHaveAttribute('inert')
    act(() => vi.advanceTimersByTime(quickExitMs))
    expect(document.getElementById('boot')).toBeNull()
  })

  it('does not cover the page for a short wait once the page has shown', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady, BootHold } = await paintThenLoad('/trips')
    const view = render(<BootReady />)
    await flush()
    act(() => vi.advanceTimersByTime(quickExitMs))
    expect(boot.isConnected).toBe(false)

    const seen = vi.fn()
    const observer = new MutationObserver(() => document.getElementById('boot') && seen())
    observer.observe(document.body, { childList: true })
    view.rerender(
      <>
        <BootReady />
        <BootHold world="trips" step="auth" />
      </>,
    )
    act(() => vi.advanceTimersByTime(150))
    view.rerender(<BootReady />)
    await flush()
    act(() => vi.advanceTimersByTime(1_000))
    observer.disconnect()
    expect(seen).not.toHaveBeenCalled()
    expect(document.getElementById('boot')).toBeNull()
  })

  it('remembers each app whose screen’s faces the page has loaded, once the app has settled', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    fontFaces([
      ['"Fragment Mono"', 'normal', 'loaded'],
      ['"Instrument Serif"', 'normal', 'loaded'],
      ['"Instrument Serif"', 'italic', 'loaded'],
      ['Inter', 'normal', 'loaded'],
      ['Geist', 'normal', 'loaded'],
      ['Fraunces', 'italic', 'unloaded'],
      ['Archivo', 'normal', 'loading'],
    ])
    localStorage.setItem('boot-fonts', '["lim"]')
    const { boot, BootReady } = await paintThenLoad('/trips')
    render(<BootReady />)
    await flush()
    act(() => vi.advanceTimersByTime(quickExitMs))
    expect(boot.isConnected).toBe(false)
    act(() => vi.advanceTimersByTime(3_999))
    await flush()
    expect(localStorage.getItem('boot-fonts')).toBe('["lim"]')
    act(() => vi.advanceTimersByTime(1))
    await flush()
    expect(JSON.parse(localStorage.getItem('boot-fonts')!)).toEqual(['lim', 'trips', 'auth'])
  })

  it('a wait that starts during the exit keeps the screen', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady, BootHold } = await paintThenLoad('/breathwork')
    act(() => vi.advanceTimersByTime(1_000))
    const view = render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-state', 'leaving')
    expect(document.getElementById('root')).not.toHaveAttribute('inert')
    act(() => vi.advanceTimersByTime(100))

    view.rerender(
      <>
        <BootReady />
        <BootHold world="breathwork" step="code" />
      </>,
    )
    expect(boot).toHaveAttribute('data-state', 'showing')
    expect(boot).toHaveAttribute('data-step', 'code')
    expect(boot).toHaveAttribute('aria-busy', 'true')
    expect(boot).not.toHaveAttribute('inert')
    expect(document.getElementById('root')).toHaveAttribute('inert')
    expect(boot).not.toHaveAttribute('data-exit')
    act(() => vi.advanceTimersByTime(10_000))
    expect(boot.isConnected).toBe(true)
    expect(document.querySelectorAll('#boot')).toHaveLength(1)
  })

  it('shows the newest wait, and a second release lets go of nothing more', async () => {
    reducedMotion(false)
    const { boot, holdBoot, BootReady } = await paintThenLoad('/trips')
    render(<BootReady />)
    const releaseCode = holdBoot('trips', 'code')
    const releaseAuth = holdBoot('trips', 'auth')
    expect(boot).toHaveAttribute('data-step', 'auth')
    releaseCode()
    releaseCode()
    await flush()
    expect(boot).toHaveAttribute('data-state', 'showing')
    expect(boot).toHaveAttribute('data-step', 'auth')
    releaseAuth()
    await flush()
    expect(boot).toHaveAttribute('data-state', 'leaving')
  })

  it('swaps in the other app’s screen when a wait belongs to another app', async () => {
    reducedMotion(false)
    const { boot, BootHold } = await paintThenLoad('/trips')
    render(<BootHold world="auth" step="auth" />)
    const swapped = document.getElementById('boot')
    expect(boot.isConnected).toBe(false)
    expect(swapped).toHaveAttribute('data-world', 'auth')
    expect(swapped).toHaveAttribute('data-step', 'auth')
    expect(document.querySelectorAll('#boot')).toHaveLength(1)
  })

  it('lets go when the app renders without a sign-in provider', async () => {
    reducedMotion(false)
    const { boot, AppRoutes } = await paintThenLoad('/some-404')
    render(
      <StrictMode>
        <AppRoutes />
      </StrictMode>,
    )
    expect(await screen.findByRole('heading', { name: 'This page is not here.' })).toBeInTheDocument()
    await waitFor(() => expect(boot).toHaveAttribute('data-state', 'leaving'))
    await waitFor(() => expect(document.getElementById('boot')).toBeNull(), { timeout: 2_000 })
  })

  it.each([
    ['/', 'lim'],
    ['/chatbot', 'lim'],
    ['/lab', 'lab'],
    ['/breathwork/session', 'breathwork'],
    ['/korea', 'trips'],
    ['/korea/day/day-3', 'trips'],
    ['/trips', 'trips'],
    ['/trips/korea-2026', 'trips'],
    ['/sign-in', 'auth'],
    ['/sign-up', 'auth'],
    ['/some-404', 'lim'],
  ])('at %s, the %s screen the page painted waits for the route’s code', async (path, world) => {
    reducedMotion(false)
    vi.doMock('../lazyRetry', async (original) => {
      const { lazy } = await import('react')
      const never = () => Object.assign(lazy(() => new Promise<never>(() => {})), { preload: () => {} })
      return { ...(await original<typeof import('../lazyRetry')>()), lazyRetry: never }
    })
    const { boot, AppRoutes } = await paintThenLoad(path)
    expect(boot).toHaveAttribute('data-world', world)
    render(<AppRoutes />)
    await flush()
    expect(document.getElementById('boot')).toBe(boot)
    expect(boot).toHaveAttribute('data-step', 'code')
    expect(boot).toHaveAttribute('data-state', 'showing')
  })
})
