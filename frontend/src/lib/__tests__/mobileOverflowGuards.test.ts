import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import homeSource from '../../pages/Home.tsx?raw'
import sessionSource from '../../pages/Session.tsx?raw'
import layoutSource from '../../components/layout/BreathworkLayout.tsx?raw'

describe('mobile overflow guardrails', () => {
  it('keeps BreathFlow pages clipped at the app shell instead of allowing page-level horizontal scroll', () => {
    expect(indexCss).toContain('.breathwork-layout')
    expect(indexCss).toMatch(/overflow-x:\s*clip/)
  })

  it('uses a dedicated iOS scrollport instead of mixing overflow-x clip with overflow-y auto', () => {
    expect(indexCss).toContain('.bw-page-scroll')
    expect(indexCss).toContain('-webkit-overflow-scrolling: touch')
    expect(indexCss).toMatch(/\.breathwork-layout \{\s*position:\s*fixed/)
    expect(layoutSource).toContain('bw-page-scroll min-h-0 flex-1')
    expect(layoutSource).not.toContain('overflow-x-clip overflow-y-auto')
  })

  it('contains mobile rails without negative-margin max-content patterns', () => {
    const railSources = `${homeSource}\n${sessionSource}`

    expect(railSources).not.toContain('width: \'max-content\'')
    expect(homeSource).not.toContain('-mx-4 px-4 overflow-x-auto')
    expect(sessionSource).not.toContain('-mx-5 mb-3 overflow-x-auto')
  })

  it('lets the mobile session column fill the layout scroller instead of guessing a dvh offset', () => {
    expect(sessionSource).toContain('data-testid="mobile-session-scroller"')
    expect(sessionSource).toContain('bw-page-scroll')
    expect(sessionSource).toContain('min-h-0 flex-1')
    expect(sessionSource).not.toContain('overflow-x-clip overflow-y-auto')
    expect(sessionSource).not.toContain('h-[calc(100dvh-5.5rem)]')
    expect(sessionSource).not.toContain('h-[calc(100svh-8.5rem)]')
    expect(sessionSource).not.toContain('max-h-[calc(100dvh-8.5rem)]')
  })

  it('reflows the live session for short landscape and vehicle browsers', () => {
    expect(indexCss).toContain('@media (orientation: landscape) and (max-height: 700px)')
    expect(indexCss).toContain('.session-orb')
    expect(indexCss).toContain('.session-coach')
  })
})
