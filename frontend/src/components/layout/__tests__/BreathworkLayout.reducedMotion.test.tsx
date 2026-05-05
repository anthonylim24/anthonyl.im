import { render, waitFor } from '@testing-library/react'
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

  it('renders the ambient leaves overlay as a subtle texture when motion is allowed', async () => {
    const { container } = render(
      <MemoryRouter>
        <BreathworkLayout />
      </MemoryRouter>,
    )

    const overlay = container.querySelector<HTMLVideoElement>('.leaves-overlay')
    expect(overlay).toBeTruthy()
    await waitFor(() => {
      expect(overlay).toHaveStyle({ opacity: '0.08' })
    })
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

  it('does not reserve bottom navigation space on the session setup route', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/breathwork/session']}>
        <BreathworkLayout />
      </MemoryRouter>,
    )

    const content = container.querySelector<HTMLElement>(
      '[style*="--mobile-content-bottom-space"]',
    )

    expect(content?.style.getPropertyValue('--mobile-content-bottom-space')).toContain('1rem')
    expect(content?.style.getPropertyValue('--mobile-content-bottom-space')).not.toContain('7.5rem')
  })
})
