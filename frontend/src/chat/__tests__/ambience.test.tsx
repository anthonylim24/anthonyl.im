import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_APPEARANCE_KEY } from '../useChatAppearance'
import { LeafAmbience } from '../LeafAmbience'
import { ChatApp } from '../ChatApp'

vi.mock('@/lib/analytics', () => ({
  getPostHogConfig: () => null,
}))

const originalMatchMedia = window.matchMedia

function mockMatchMedia(matches: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn((query: string) => ({
      matches: matches[query] ?? false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  mockMatchMedia({
    '(prefers-color-scheme: dark)': false,
    '(prefers-reduced-motion: reduce)': false,
  })
})

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  })
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('leaf ambience', () => {
  it('uses the local leaves asset inside a wrapper, not on the video', () => {
    render(<LeafAmbience enabled />)

    const overlay = document.querySelector('.chat-ambience')
    const media = document.querySelector('.chat-ambience-media')

    expect(overlay?.tagName).toBe('DIV')
    expect(media?.tagName).toBe('VIDEO')
    expect(overlay?.contains(media)).toBe(true)
    expect(media).toHaveAttribute('src', '/leaves.mp4')
    expect(media?.getAttribute('src')).not.toContain('leaves.anthonylim-ucsc.workers.dev')
    expect(media).not.toHaveClass('chat-ambience')
  })

  it('pauses and hides the footage when reduced motion is preferred', () => {
    mockMatchMedia({
      '(prefers-color-scheme: dark)': false,
      '(prefers-reduced-motion: reduce)': true,
    })

    render(<LeafAmbience enabled />)

    const overlay = document.querySelector('.chat-ambience')
    expect(overlay).toHaveAttribute('data-visible', 'false')
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
  })

  it('pauses and hides the footage when the user turns ambience off', () => {
    render(
      <MemoryRouter>
        <ChatApp />
      </MemoryRouter>,
    )

    const overlay = document.querySelector('.chat-ambience')
    expect(overlay).toHaveAttribute('data-visible', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Ambience' }))

    expect(document.querySelector('.chat-ambience')).toHaveAttribute('data-visible', 'false')
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    expect(localStorage.getItem(CHAT_APPEARANCE_KEY)).toContain('"ambience":false')
  })
})
