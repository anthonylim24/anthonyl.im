import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BreathworkNotFound } from '../BreathworkNotFound'

function renderNotFound() {
  render(
    <MemoryRouter>
      <BreathworkNotFound />
    </MemoryRouter>
  )
}

describe('BreathworkNotFound', () => {
  it('offers recovery links with accessible target sizes', () => {
    renderNotFound()

    expect(screen.getByRole('heading', { name: /return to the breath/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open protocol lab/i })).toHaveAttribute('href', '/breathwork')
    expect(screen.getByRole('link', { name: /open protocol lab/i })).toHaveClass('min-h-11')
    expect(screen.getByRole('link', { name: /start a session/i })).toHaveAttribute('href', '/breathwork/session')
    expect(screen.getByRole('link', { name: /start a session/i })).toHaveClass('min-h-11')
  })
})
