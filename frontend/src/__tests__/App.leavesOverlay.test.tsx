import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'

vi.mock('../lib/analytics', () => ({
  getPostHogConfig: () => null,
}))

describe('chatbot leaves overlay', () => {
  it('wraps the leaves video so object-fit can cover the viewport', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )

    const overlay = document.querySelector('.leaves-overlay')
    const media = document.querySelector('.leaves-overlay-media')

    expect(overlay?.tagName).toBe('DIV')
    expect(media?.tagName).toBe('VIDEO')
    expect(overlay?.contains(media)).toBe(true)
  })
})
