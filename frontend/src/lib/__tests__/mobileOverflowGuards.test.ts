import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import chatAppSource from '../../chat/ChatApp.tsx?raw'
import leafSource from '../../chat/LeafAmbience.tsx?raw'

describe('mobile overflow guardrails', () => {
  it('keeps the document free of nested scrollports and fixed containing blocks on #root', () => {
    expect(indexCss).toMatch(/#root \{[\s\S]*?min-height:\s*0/)
    expect(indexCss).not.toMatch(/#root \{[\s\S]*?overflow-x:\s*clip/)
    expect(indexCss).not.toMatch(/html,\s*\nbody \{[\s\S]*?min-height:\s*100dvh/)
  })

  it('covers the chatbot leaves video with a viewport wrapper, not intrinsic video size', () => {
    expect(indexCss).toMatch(/\.chat-ambience \{[\s\S]*?contain:\s*layout paint/)
    expect(indexCss).toMatch(/\.chat-ambience \{[\s\S]*?inset:\s*0/)
    expect(indexCss).not.toMatch(/\.chat-ambience \{[\s\S]*?width:\s*100vw/)
    expect(indexCss).not.toMatch(/\.chat-ambience \{[\s\S]*?height:\s*100vh/)
    expect(indexCss).toMatch(/\.chat-ambience-media \{[\s\S]*?object-fit:\s*cover/)
    expect(leafSource).toContain('className="chat-ambience"')
    expect(leafSource).toContain('className="chat-ambience-media"')
    expect(leafSource).not.toMatch(/<video[^>]*className="chat-ambience"/)
  })

  it('lets the document grow instead of pinning html/body/#root to 100%', () => {
    expect(indexCss).toMatch(/html,\s*\nbody \{[\s\S]*?height:\s*auto/)
    expect(indexCss).toMatch(/#root \{[\s\S]*?height:\s*auto/)
  })

  it('keeps the chatbot viewport pin on the app shell, not on #root', () => {
    expect(chatAppSource).toContain('min-h-[100dvh]')
    expect(chatAppSource).toMatch(/height:\s*'100dvh'/)
    expect(chatAppSource).toContain('overflow-hidden')
    expect(chatAppSource).not.toContain('h-screen')
    const rootBlock = indexCss.match(/#root \{[^}]+\}/)?.[0] ?? ''
    expect(rootBlock).toContain('height: auto')
    expect(rootBlock).not.toContain('overflow')
  })

  it('pauses the looping leaves video when reduced motion is preferred', () => {
    expect(leafSource).toContain('prefers-reduced-motion: reduce')
    expect(leafSource).toMatch(/media\.matches[\s\S]*video\.pause\(\)/)
  })
})
