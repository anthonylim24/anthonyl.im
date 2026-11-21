import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LimLoader, LoadPill } from '../LimLoader'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('LimLoader', () => {
  it('reports the real progress, says what is happening, and starts on Chat first', () => {
    render(<LimLoader state={{ phase: 'loading', step: 'toys', done: 0.45, since: 0 }} onSkip={() => {}} onExited={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Setting the jelly' })).toHaveAttribute('aria-modal', 'true')
    const bar = screen.getByRole('progressbar', { name: 'Setting the jelly' })
    expect(bar).toHaveAttribute('aria-valuenow', '45')
    expect(bar).toHaveAttribute('aria-valuetext', '45%, Unpacking the toy box')
    expect(screen.getByRole('status')).toHaveTextContent('Unpacking the toy box')
    expect(screen.getByRole('button', { name: 'Chat first' })).toHaveFocus()
  })

  it('shows the chat on Chat first or Escape', () => {
    const onSkip = vi.fn()
    render(<LimLoader state={{ phase: 'loading', step: 'gpu', done: 0.2, since: 0 }} onSkip={onSkip} onExited={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chat first' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Poke Lim' }), { key: 'Escape' })
    expect(onSkip).toHaveBeenCalledTimes(2)
  })

  it('answers a poke with a word', () => {
    render(<LimLoader state={{ phase: 'loading', step: 'warm', done: 0.8, since: 0 }} onSkip={() => {}} onExited={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Poke Lim' }))
    expect(screen.getByText('boing!')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Poke Lim' }))
    expect(screen.getByText('hehe!')).toBeInTheDocument()
  })

  it('lets go of the page as it leaves, and says when its exit is over', () => {
    vi.useFakeTimers()
    const onExited = vi.fn()
    const { container } = render(<LimLoader state={{ phase: 'leaving', quick: false }} onSkip={() => {}} onExited={onExited} />)
    expect(container.firstElementChild).toHaveAttribute('inert')
    expect(screen.getByRole('progressbar', { hidden: true })).toHaveAttribute('aria-valuenow', '100')
    act(() => vi.advanceTimersByTime(700))
    expect(onExited).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(100))
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('leaves at once after a quick load', () => {
    vi.useFakeTimers()
    const onExited = vi.fn()
    render(<LimLoader state={{ phase: 'leaving', quick: true }} onSkip={() => {}} onExited={onExited} />)
    act(() => vi.advanceTimersByTime(250))
    expect(onExited).toHaveBeenCalledTimes(1)
  })
})

describe('LoadPill', () => {
  it('shows progress while the visitor chats first, then that Lim is here, and nothing otherwise', () => {
    const { container, rerender } = render(<LoadPill state={{ phase: 'chat-first', step: 'light', done: 0.62 }} />)
    expect(container).toHaveTextContent("Lim is on the way62%")
    rerender(<LoadPill state={{ phase: 'gone', late: true }} />)
    expect(container).toHaveTextContent("Lim's here")
    rerender(<LoadPill state={{ phase: 'gone', late: false }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
