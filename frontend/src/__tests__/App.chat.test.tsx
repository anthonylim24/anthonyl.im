import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import MessageContent from '../components/message-content'
import { HttpStatusError } from '../effect/errors'
import { LIM_ERRORS } from '../effect/chatErrors'

vi.mock('../lib/analytics', () => ({ getPostHogConfig: () => null }))

type Invoke = (prompt: string, history: unknown[], onUpdate?: (c: string) => void, signal?: AbortSignal) => Promise<{ content: string }>
const invoke = vi.fn<Invoke>()
vi.mock('../lib/apiService', () => ({ invokeDeepseek: (...args: Parameters<Invoke>) => invoke(...args) }))

function Where() {
  const location = useLocation()
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>
}

const renderAt = (entry = '/') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <App />
      <Where />
    </MemoryRouter>,
  )

beforeEach(() => {
  localStorage.clear()
  invoke.mockReset()
})
afterEach(() => vi.restoreAllMocks())

describe('Lim page', () => {
  it('prefills the composer from ?q= without sending, and takes it out of the address bar', async () => {
    renderAt('/?q=What%20is%20he%20building%3F&ref=x')
    expect(screen.getByLabelText('Ask about Anthony')).toHaveValue('What is he building?')
    expect(invoke).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/?ref=x'))
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveAttribute('aria-disabled', 'false')
  })

  it('caps the composer at the server limit', () => {
    renderAt()
    expect(screen.getByLabelText('Ask about Anthony')).toHaveAttribute('maxLength', '8000')
  })

  it('shows how much room is left near the limit', () => {
    renderAt()
    const box = screen.getByLabelText('Ask about Anthony')
    fireEvent.change(box, { target: { value: 'x'.repeat(7_500) } })
    expect(screen.getByText('500 characters left')).toBeInTheDocument()
    expect(box).toHaveAttribute('aria-describedby', 'chat-input-count')
  })

  it("shows a failure in Lim's words beside the reply, with Try again", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    invoke.mockRejectedValueOnce(new HttpStatusError({ status: 429, message: LIM_ERRORS.busy }))
    renderAt()
    fireEvent.change(screen.getByLabelText('Ask about Anthony'), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(LIM_ERRORS.busy)).toBeInTheDocument()
    expect(screen.queryByText(/⚠️|\[object Object\]|status/)).toBeNull()
    invoke.mockResolvedValueOnce({ content: '' })
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2))
  })

  it('labels who said what for screen readers, and offers follow-ups once a reply settles', async () => {
    invoke.mockImplementationOnce(async (_p, _h, onUpdate) => {
      onUpdate?.('He builds things.')
      return { content: 'He builds things.' }
    })
    renderAt()
    fireEvent.click(screen.getByRole('button', { name: "What is Anthony's background?" }))
    await screen.findByText('He builds things.')
    expect(screen.getByText('You:')).toBeInTheDocument()
    expect(screen.getByText('Lim:')).toBeInTheDocument()
    const next = await screen.findByRole('group', { name: 'Ask next' })
    expect(next.querySelectorAll('button')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: "What is Anthony's background?" })).toBeNull()
  })

  it('needs Alt+Shift for the lights and sound shortcuts', () => {
    renderAt()
    const night = screen.getByRole('button', { name: 'Night mode' })
    act(() => void fireEvent.keyDown(window, { key: 's', code: 'KeyS' }))
    expect(night).toHaveAttribute('aria-pressed', 'false')
    act(() => void fireEvent.keyDown(window, { key: 'S', code: 'KeyS', altKey: true, shiftKey: true }))
    expect(night).toHaveAttribute('aria-pressed', 'true')
    expect(night).toHaveAttribute('aria-keyshortcuts', 'Alt+Shift+S')
    const sound = screen.getByRole('button', { name: "Lim's sounds" })
    const before = sound.getAttribute('aria-pressed')
    act(() => void fireEvent.keyDown(window, { key: 'm', code: 'KeyM' }))
    expect(sound).toHaveAttribute('aria-pressed', before)
  })
})

describe('MessageContent', () => {
  it('never loads a model-written image, only links to it', () => {
    const { container } = render(<MessageContent content={'Look: ![a cat](https://evil.example/c.png?q=secret) and ![x](javascript:alert(1))'} />)
    expect(container.querySelector('img')).toBeNull()
    const link = screen.getByRole('link', { name: 'a cat' })
    expect(link).toHaveAttribute('href', 'https://evil.example/c.png?q=secret')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.queryByRole('link', { name: 'x' })).toBeNull()
  })
})
