import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import homeSource from '../../pages/Home.tsx?raw'
import sessionSource from '../../pages/Session.tsx?raw'
import layoutSource from '../../components/layout/BreathworkLayout.tsx?raw'

describe('mobile overflow guardrails', () => {
  it('keeps BreathFlow pages from creating a nested scrollport or a fixed containing block on #root', () => {
    expect(indexCss).toContain('.breathwork-layout')
    expect(indexCss).toMatch(/#root \{[\s\S]*?min-height:\s*0/)
    expect(indexCss).not.toMatch(/#root \{[\s\S]*?overflow-x:\s*clip/)
    expect(indexCss).toMatch(/\.leaves-overlay \{[\s\S]*?contain:\s*layout paint/)
    expect(indexCss).toMatch(/\.leaves-overlay \{[\s\S]*?inset:\s*0/)
    expect(indexCss).not.toMatch(/\.leaves-overlay \{[\s\S]*?width:\s*100vw/)
    expect(indexCss).not.toMatch(/\.leaves-overlay \{[\s\S]*?height:\s*100vh/)
    expect(indexCss).not.toMatch(/\.breathwork-layout \{\s*position:\s*fixed/)
    expect(indexCss).not.toContain('.bw-page-scroll')
    expect(indexCss).not.toContain('.bw-mobile-nav')
    expect(indexCss).not.toContain('touch-action: pan-y pinch-zoom')
    expect(indexCss).not.toMatch(/html,\s*\nbody \{[\s\S]*?min-height:\s*100dvh/)
    expect(indexCss).not.toMatch(/\.breathwork-layout,\s*\n\.breathwork \{[\s\S]*?min-height:\s*100vh/)
  })

  it('lets the document grow instead of pinning html/body/#root to 100%', () => {
    expect(indexCss).toMatch(/html,\s*\nbody \{[\s\S]*?height:\s*auto/)
    expect(indexCss).toMatch(/#root \{[\s\S]*?height:\s*auto/)
    expect(layoutSource).not.toContain('bw-page-scroll')
    expect(layoutSource).not.toContain('overflow-x-clip overflow-y-auto')
    expect(layoutSource).not.toContain('h-full min-h-0')
    expect(layoutSource).not.toContain('data-testid="mobile-nav-clearance"')
    expect(layoutSource).not.toContain('mobile-content-bottom-space')
    expect(layoutSource).not.toContain('Navigation')
    expect(layoutSource).toContain('createPortal')
    expect(layoutSource).toContain('document.body')
  })

  it('contains mobile rails without negative-margin max-content patterns', () => {
    const railSources = `${homeSource}\n${sessionSource}`

    expect(railSources).not.toContain('width: \'max-content\'')
    expect(homeSource).not.toContain('-mx-4 px-4 overflow-x-auto')
    expect(sessionSource).not.toContain('-mx-5 mb-3 overflow-x-auto')
  })

  it('lets the mobile session column use document scroll instead of a nested overflow column', () => {
    expect(sessionSource).toContain('data-testid="mobile-session-scroller"')
    expect(sessionSource).toContain('data-testid="mobile-session-action-bar"')
    expect(sessionSource).toContain('fixed inset-x-0 bottom-0')
    expect(sessionSource).not.toContain('bw-page-scroll')
    expect(sessionSource).not.toContain('overflow-x-clip overflow-y-auto')
    expect(sessionSource).not.toContain('h-[calc(100dvh-5.5rem)]')
    expect(sessionSource).not.toContain('h-[calc(100svh-8.5rem)]')
    expect(sessionSource).not.toContain('max-h-[calc(100dvh-8.5rem)]')
    expect(sessionSource).not.toContain('flex h-full min-h-0 max-w-full flex-col overflow-hidden')
  })

  it('reflows the live session for short landscape and vehicle browsers', () => {
    expect(indexCss).toContain('@media (orientation: landscape) and (max-height: 700px)')
    expect(indexCss).toContain('.session-orb')
    expect(indexCss).toContain('.session-coach')
  })
})
