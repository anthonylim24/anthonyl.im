import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import homeSource from '../../pages/Home.tsx?raw'
import sessionSource from '../../pages/Session.tsx?raw'

describe('mobile overflow guardrails', () => {
  it('keeps BreathFlow pages clipped at the app shell instead of allowing page-level horizontal scroll', () => {
    expect(indexCss).toContain('.breathwork-layout')
    expect(indexCss).toMatch(/overflow-x:\s*clip/)
  })

  it('contains mobile rails without negative-margin max-content patterns', () => {
    const railSources = `${homeSource}\n${sessionSource}`

    expect(railSources).not.toContain('width: \'max-content\'')
    expect(homeSource).not.toContain('-mx-4 px-4 overflow-x-auto')
    expect(sessionSource).not.toContain('-mx-5 mb-3 overflow-x-auto')
  })

  it('keeps the mobile session footer tied to the dynamic viewport instead of leaving browser chrome gaps', () => {
    expect(sessionSource).toContain('h-[calc(100dvh-5.5rem)]')
    expect(sessionSource).toContain('min-h-[calc(100svh-5.5rem)]')
    expect(sessionSource).not.toContain('h-[calc(100svh-8.5rem)]')
    expect(sessionSource).not.toContain('max-h-[calc(100dvh-8.5rem)]')
  })
})
