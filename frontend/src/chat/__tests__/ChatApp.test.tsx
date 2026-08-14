import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}))

vi.mock('@/lib/apiService', () => ({
  invokeDeepseek: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock('@/lib/analytics', () => ({
  getPostHogConfig: () => null,
}))

import { ChatApp } from '../ChatApp'
import { CHAT_NAME, CHAT_POSITIONING, CHAT_SUBTEXT, CHAT_SUGGESTIONS } from '../copy'

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

function renderChat() {
  return render(
    <MemoryRouter>
      <ChatApp />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  mockInvoke.mockReset()
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

describe('ChatApp', () => {
  it('renders the identity and four suggestions in the empty state', () => {
    renderChat()

    expect(screen.getByRole('heading', { name: CHAT_NAME })).toBeInTheDocument()
    expect(screen.getByText(CHAT_POSITIONING)).toBeInTheDocument()
    expect(screen.getByText(CHAT_SUBTEXT)).toBeInTheDocument()
    expect(screen.getByAltText('DoorDash')).toBeInTheDocument()
    expect(screen.getByAltText('eBay')).toBeInTheDocument()

    for (const suggestion of CHAT_SUGGESTIONS) {
      expect(screen.getByRole('button', { name: suggestion })).toBeInTheDocument()
    }

    expect(document.querySelector('[data-condensed="true"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear conversation' })).toBeNull()
  })

  it('streams a mocked answer after a suggestion is clicked', async () => {
    mockInvoke.mockImplementation(async (_prompt, _history, onUpdate: (content: string) => void) => {
      onUpdate('He builds the Local Commerce Service Partner platform.')
      return { content: 'He builds the Local Commerce Service Partner platform.' }
    })

    renderChat()
    fireEvent.click(screen.getByRole('button', { name: CHAT_SUGGESTIONS[0] }))

    const log = await screen.findByRole('log')
    expect(await within(log).findByText(CHAT_SUGGESTIONS[0])).toBeInTheDocument()
    expect(
      await within(log).findByText('He builds the Local Commerce Service Partner platform.'),
    ).toBeInTheDocument()
  })

  it('shows an inline error row and resends on Try again', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('stream failed'))
      .mockImplementation(async (_prompt, _history, onUpdate: (content: string) => void) => {
        onUpdate('Try the email on the rail.')
        return { content: 'Try the email on the rail.' }
      })

    renderChat()
    fireEvent.click(screen.getByRole('button', { name: CHAT_SUGGESTIONS[3] }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The reply did not come through.')
    expect(screen.queryByText(/I apologize/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('Try the email on the rail.')).toBeInTheDocument()
    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(mockInvoke).toHaveBeenLastCalledWith(CHAT_SUGGESTIONS[3], [], expect.any(Function))
  })

  it('condenses the rail once a transcript exists', async () => {
    mockInvoke.mockImplementation(async (_prompt, _history, onUpdate: (content: string) => void) => {
      onUpdate('Stacks include TypeScript and React.')
      return { content: 'Stacks include TypeScript and React.' }
    })

    renderChat()
    fireEvent.click(screen.getByRole('button', { name: CHAT_SUGGESTIONS[1] }))

    await waitFor(() => {
      expect(document.querySelector('[data-condensed="true"]')).not.toBeNull()
    })

    expect(screen.getByRole('heading', { name: CHAT_NAME })).toBeInTheDocument()
    expect(screen.getByText(CHAT_POSITIONING)).toBeInTheDocument()
    expect(screen.queryByText(CHAT_SUBTEXT)).toBeNull()
    expect(screen.queryByAltText('DoorDash')).toBeNull()
    expect(screen.getByRole('link', { name: 'LinkedIn' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear conversation' })).toBeInTheDocument()
  })

  it('follows prefers-color-scheme on first load', () => {
    mockMatchMedia({
      '(prefers-color-scheme: dark)': true,
      '(prefers-reduced-motion: reduce)': false,
    })

    const { container } = renderChat()
    expect(container.querySelector('.chat-dark')).not.toBeNull()
    expect(container.querySelector('.chat-light')).toBeNull()
  })
})
