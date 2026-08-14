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

    const overlay = document.querySelector<HTMLElement>('.leaves-overlay')
    expect(overlay).toBeTruthy()
    expect(container.contains(overlay)).toBe(false)
    expect(overlay?.parentElement).toBe(document.body)
    await waitFor(() => {
      expect(overlay).toHaveStyle({ opacity: '0.5' })
    })
  })

  it('does not render autoplaying ambient video for reduced-motion users', () => {
    mocks.reducedMotion = true

    render(
      <MemoryRouter>
        <BreathworkLayout />
      </MemoryRouter>,
    )

    expect(document.querySelector('.leaves-overlay')).toBeNull()
    expect(document.querySelector('[data-testid="breath-starfield"]')).toBeNull()
    expect(document.querySelector('[data-testid="breath-aura-field"]')).toBeNull()
  })

  it('does not reserve floating-footer space on any BreathFlow route', () => {
    const home = render(
      <MemoryRouter initialEntries={['/breathwork']}>
        <BreathworkLayout />
      </MemoryRouter>,
    )

    expect(home.container.querySelector('[style*="--mobile-content-bottom-space"]')).toBeNull()
    expect(home.container.querySelector('[data-testid="mobile-nav-clearance"]')).toBeNull()
    expect(home.container.querySelector('main')?.className).toContain('pb-10')
    expect(home.container.querySelector('main')?.className).not.toContain('mobile-content-bottom-space')
    home.unmount()

    const session = render(
      <MemoryRouter initialEntries={['/breathwork/session']}>
        <BreathworkLayout />
      </MemoryRouter>,
    )

    expect(session.container.querySelector('[style*="--mobile-content-bottom-space"]')).toBeNull()
    expect(session.container.querySelector('[data-testid="mobile-nav-clearance"]')).toBeNull()
    session.unmount()
  })
})
