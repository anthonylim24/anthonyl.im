import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { StageLoad } from '../chat/LimStage'

vi.mock('../lib/analytics', () => ({ getPostHogConfig: () => null }))
const reported = vi.hoisted(() => vi.fn())
vi.mock('../lib/telemetry', async (original) => ({
  ...(await original<typeof import('../lib/telemetry')>()),
  reportClientEvent: reported,
}))

/** The stage as the page drives it: what it was last told, and a way to report its load. */
const stage: { onLoad: (load: StageLoad) => void; revealed: boolean | undefined; gpu: boolean } = { onLoad: () => {}, revealed: undefined, gpu: true }
vi.mock('../chat/LimStage', () => ({
  canRender3D: () => stage.gpu,
  LimStage: (props: { onLoad: (load: StageLoad) => void; revealed: boolean }) => {
    stage.onLoad = props.onLoad
    stage.revealed = props.revealed
    return null
  },
}))

const report = (load: StageLoad) => act(() => stage.onLoad(load))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  stage.gpu = true
})

// The screen shows once per visit, so each test imports a fresh page.
describe('Lim page loading screen', () => {
  it('holds the page while Lim loads, and Chat first shows the chat at once, ready to type on a desk', async () => {
    vi.resetModules()
    const { default: App } = await import('../App')
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    const loading = screen.getByRole('dialog', { name: 'Setting the jelly' })
    expect(screen.getByRole('button', { name: 'Chat first' })).toHaveFocus()
    expect(document.getElementById('chat-main')).toHaveAttribute('inert')
    expect(stage.revealed).toBe(false)

    report({ kind: 'loading', step: 'light', done: 0.6 })
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')

    fireEvent.click(screen.getByRole('button', { name: 'Chat first' }))
    expect(loading).not.toBeInTheDocument()
    expect(document.getElementById('chat-main')).not.toHaveAttribute('inert')
    expect(window.innerWidth).toBeGreaterThanOrEqual(1024)
    expect(screen.getByLabelText('Ask about Anthony')).toHaveFocus()
    expect(stage.revealed).toBe(true)

    report({ kind: 'ready' })
    expect(screen.getByRole('status')).toHaveTextContent("Lim's playground is ready.")
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('slides away when the stage is ready, lets Lim in as it goes, and never comes back', async () => {
    vi.resetModules()
    const { default: App } = await import('../App')
    vi.useFakeTimers()
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    act(() => vi.advanceTimersByTime(2000))
    report({ kind: 'loading', step: 'warm', done: 1 })
    report({ kind: 'ready' })
    expect(document.getElementById('chat-main')).not.toHaveAttribute('inert')
    expect(document.getElementById('chat-main')).toHaveFocus()
    expect(stage.revealed).toBe(true)
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('inert')
    act(() => vi.advanceTimersByTime(800))
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()

    report({ kind: 'loading', step: 'code', done: 0 })
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()

    cleanup()
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    expect(stage.revealed).toBe(true)
  })

  it('lets the visitor into the chat when the stage misses its deadline, and says where it stuck', async () => {
    vi.resetModules()
    const { default: App } = await import('../App')
    const { LOAD_DEADLINE_MS } = await import('../chat/loader')
    vi.useFakeTimers()
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    report({ kind: 'loading', step: 'gpu', done: 0.2 })
    act(() => vi.advanceTimersByTime(LOAD_DEADLINE_MS - 100))
    expect(screen.getByRole('dialog', { name: 'Setting the jelly' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(100))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.getElementById('chat-main')).not.toHaveAttribute('inert')
    expect(screen.getByLabelText('Ask about Anthony')).toHaveFocus()
    expect(reported).toHaveBeenCalledWith('lim_stage_slow', expect.any(String), { step: 'gpu', done: 0.2 })

    // The stage still arrives, late, behind the chat.
    report({ kind: 'ready' })
    expect(stage.revealed).toBe(true)
  })

  it('goes straight to the chat when there is no live stage', async () => {
    vi.resetModules()
    const { default: App } = await import('../App')
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    report({ kind: 'failed' })
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
    expect(document.getElementById('chat-main')).toHaveFocus()
  })

  it('never shows without a GPU to draw the stage', async () => {
    vi.resetModules()
    stage.gpu = false
    const { default: App } = await import('../App')
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog', { hidden: true })).toBeNull()
  })
})
