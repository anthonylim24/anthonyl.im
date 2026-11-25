import { lazy, StrictMode, type ComponentType } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearBoot, paintBoot } from '@/test/bootPage'

/**
 * Paints the boot screen at `path`, then loads the app's modules fresh, the
 * order a browser runs them in: the inline script first, the bundle after.
 */
async function bootAt(path: string) {
  const boot = paintBoot(path)
  vi.resetModules()
  const [screenModule, routes] = await Promise.all([import('../bootScreen'), import('../../AppRoutes')])
  return { boot, ...screenModule, ...routes }
}

const flush = () => act(async () => {})

/** Every value the screen's `data-state` has held, so an exit that started and was taken back still shows. */
function stateHistory(boot: HTMLElement) {
  const seen: (string | null)[] = []
  const observer = new MutationObserver((records) => seen.push(...records.map((record) => record.oldValue)))
  observer.observe(boot, { attributeFilter: ['data-state'], attributeOldValue: true })
  return () => [...seen, ...observer.takeRecords().map((record) => record.oldValue), boot.dataset.state]
}

function reducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query }))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  clearBoot()
})

describe('the boot screen', () => {
  it('leaves after React’s first commit when nothing waits, quickly when it was barely up', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady } = await bootAt('/lab')
    render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-state', 'leaving')
    expect(boot).toHaveAttribute('data-exit', 'quick')
    expect(boot).toHaveAttribute('inert')
    expect(boot).not.toHaveAttribute('aria-busy')
    act(() => vi.advanceTimersByTime(159))
    expect(boot.isConnected).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(boot.isConnected).toBe(false)
  })

  it('plays its own exit, for as long as it says, when it has been up a while', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady } = await bootAt('/trips')
    act(() => vi.advanceTimersByTime(1_000))
    render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-state', 'leaving')
    expect(boot).not.toHaveAttribute('data-exit')
    const exitMs = Number(boot.dataset.exitMs)
    expect(exitMs).toBeGreaterThan(160)
    act(() => vi.advanceTimersByTime(exitMs - 1))
    expect(boot.isConnected).toBe(true)
    act(() => vi.advanceTimersByTime(1))
    expect(boot.isConnected).toBe(false)
  })

  it('takes the quick exit under reduced motion, however long it was up', async () => {
    vi.useFakeTimers()
    reducedMotion(true)
    const { boot, BootReady } = await bootAt('/breathwork')
    act(() => vi.advanceTimersByTime(1_000))
    render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-exit', 'quick')
    act(() => vi.advanceTimersByTime(160))
    expect(boot.isConnected).toBe(false)
  })

  it('stays at the code step while a route’s code is on its way, and leaves once the route renders', async () => {
    reducedMotion(false)
    const { boot, BootReady, BootHold, Guarded } = await bootAt('/breathwork')
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

  it('gets out of the way of the error screen when a route’s code fails', async () => {
    reducedMotion(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { boot, BootReady, BootHold, Guarded } = await bootAt('/trips')
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
    await waitFor(() => expect(document.getElementById('boot')).toBeNull())
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible()
  })

  it('comes back for a later wait, and leaves again when it is over', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady, BootHold } = await bootAt('/trips')
    const view = render(<BootReady />)
    await flush()
    act(() => vi.advanceTimersByTime(160))
    expect(boot.isConnected).toBe(false)

    view.rerender(
      <>
        <BootReady />
        <BootHold world="trips" step="auth" />
      </>,
    )
    const again = document.getElementById('boot')
    expect(again).not.toBeNull()
    expect(again).not.toBe(boot)
    expect(again).toHaveAttribute('data-world', 'trips')
    expect(again).toHaveAttribute('data-step', 'auth')
    expect(again).toHaveAttribute('data-state', 'showing')

    view.rerender(<BootReady />)
    await flush()
    expect(again).toHaveAttribute('data-state', 'leaving')
    act(() => vi.advanceTimersByTime(160))
    expect(document.getElementById('boot')).toBeNull()
  })

  it('a wait that starts during the exit keeps the screen', async () => {
    vi.useFakeTimers()
    reducedMotion(false)
    const { boot, BootReady, BootHold } = await bootAt('/breathwork')
    act(() => vi.advanceTimersByTime(1_000))
    const view = render(<BootReady />)
    await flush()
    expect(boot).toHaveAttribute('data-state', 'leaving')
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
    expect(boot).not.toHaveAttribute('data-exit')
    act(() => vi.advanceTimersByTime(10_000))
    expect(boot.isConnected).toBe(true)
    expect(document.querySelectorAll('#boot')).toHaveLength(1)
  })

  it('shows the newest wait, and a second release lets go of nothing more', async () => {
    reducedMotion(false)
    const { boot, holdBoot, BootReady } = await bootAt('/trips')
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
    const { boot, BootHold } = await bootAt('/lab/specimen')
    render(<BootHold world="lim" step="code" />)
    const swapped = document.getElementById('boot')
    expect(boot.isConnected).toBe(false)
    expect(swapped).toHaveAttribute('data-world', 'lim')
    expect(swapped).toHaveAttribute('data-step', 'code')
    expect(document.querySelectorAll('#boot')).toHaveLength(1)
  })
})
