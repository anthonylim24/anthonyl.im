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
    expect(screen.getByRole('log')).toHaveAttribute('id', 'chat-main')
    expect(screen.getByLabelText('Ask about Anthony')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
