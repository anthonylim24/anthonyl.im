import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import appSource from '../../App.tsx?raw'

describe('mobile overflow guardrails', () => {
  it('keeps the document free of nested scrollports and fixed containing blocks on #root', () => {
    expect(indexCss).toMatch(/#root \{[\s\S]*?min-height:\s*0/)
    expect(indexCss).not.toMatch(/#root \{[\s\S]*?overflow-x:\s*clip/)
    expect(indexCss).not.toMatch(/html,\s*\nbody \{[\s\S]*?min-height:\s*100dvh/)
  })

  it('covers the chatbot leaves video with a viewport wrapper, not intrinsic video size', () => {
    expect(indexCss).toMatch(/\.leaves-overlay \{[\s\S]*?contain:\s*layout paint/)
    expect(indexCss).toMatch(/\.leaves-overlay \{[\s\S]*?inset:\s*0/)
    expect(indexCss).not.toMatch(/\.leaves-overlay \{[\s\S]*?width:\s*100vw/)
    expect(indexCss).not.toMatch(/\.leaves-overlay \{[\s\S]*?height:\s*100vh/)
    expect(indexCss).toMatch(/\.leaves-overlay-media \{[\s\S]*?object-fit:\s*cover/)
    expect(appSource).toContain('className="leaves-overlay"')
    expect(appSource).toContain('className="leaves-overlay-media"')
    expect(appSource).not.toMatch(/<video[^>]*className="leaves-overlay"/)
  })

  it('lets the document grow instead of pinning html/body/#root to 100%', () => {
    expect(indexCss).toMatch(/html,\s*\nbody \{[\s\S]*?height:\s*auto/)
    expect(indexCss).toMatch(/#root \{[\s\S]*?height:\s*auto/)
  })

  it('keeps the chatbot viewport pin on App rootStyle, not on #root', () => {
    expect(appSource).toMatch(/const rootStyle = \{[\s\S]*?height:\s*"100dvh"[\s\S]*?overflow:\s*"hidden"/)
    expect(appSource).toMatch(/minHeight:\s*"100svh"/)
    const rootBlock = indexCss.match(/#root \{[^}]+\}/)?.[0] ?? ''
    expect(rootBlock).toContain('height: auto')
    expect(rootBlock).not.toContain('overflow')
  })

  it('pauses the looping leaves video when reduced motion is preferred', () => {
    expect(appSource).toContain('prefers-reduced-motion: reduce')
    expect(appSource).toMatch(/media\.matches[\s\S]*v\.pause\(\)/)
  })
})
