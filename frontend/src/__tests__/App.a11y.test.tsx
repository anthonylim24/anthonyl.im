import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('../lib/analytics', () => ({
  getPostHogConfig: () => null,
}))

describe('chatbot accessibility', () => {
  it('exposes a skip link, conversation landmark, and labeled composer', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Skip to conversation' })).toHaveAttribute(
      'href',
      '#chat-main',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'chat-main')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
    const log = screen.getByRole('log', { name: 'Conversation' })
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(log).toHaveAttribute('aria-relevant', 'additions')
    expect(screen.getByLabelText('Ask about Anthony')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Night mode' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Send message' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
