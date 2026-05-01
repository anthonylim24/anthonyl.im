import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { BreathworkLayout } from '../BreathworkLayout'

const mocks = vi.hoisted(() => ({
  reducedMotion: false,
}))

vi.mock('@/lib/clerk', () => ({ CLERK_ENABLED: false }))
vi.mock('@/hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {} }) }))
vi.mock('@/hooks/useFavicon', () => ({ useFavicon: () => {} }))
vi.mock('@/hooks/useDocumentMetadata', () => ({ useDocumentMetadata: () => {} }))
vi.mock('@/hooks/useViewportOffset', () => ({
  useViewportOffset: () => ({ bottomOffset: 0 }),
}))
vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mocks.reducedMotion,
}))

describe('BreathworkLayout reduced motion', () => {
  beforeEach(() => {
    mocks.reducedMotion = false
  })

  it('renders the ambient leaves overlay when motion is allowed', () => {
    const { container } = render(
      <MemoryRouter>
        <BreathworkLayout />
      </MemoryRouter>,
    )

    expect(container.querySelector('.leaves-overlay')).toBeTruthy()
  })

  it('does not render autoplaying ambient video for reduced-motion users', () => {
    mocks.reducedMotion = true

    const { container } = render(
      <MemoryRouter>
        <BreathworkLayout />
      </MemoryRouter>,
    )

    expect(container.querySelector('.leaves-overlay')).toBeNull()
  })
})
