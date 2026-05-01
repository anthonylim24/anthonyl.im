import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'
import breathAuraSource from '../../components/breathing/BreathAura.tsx?raw'
import breathingSessionSource from '../../components/breathing/BreathingSession.tsx?raw'
import progressSource from '../../pages/Progress.tsx?raw'
import settingsSource from '../../pages/Settings.tsx?raw'

describe('visual debt guardrails', () => {
  it('does not keep the old purple gradient text utility in the global stylesheet', () => {
    expect(indexCss).not.toContain('.gradient-text')
    expect(indexCss).not.toMatch(/#7c8aff|#a78bfa|#c4b5fd/i)
  })

  it('does not keep unused glass compatibility surface classes', () => {
    expect(indexCss).not.toMatch(/\.(glass|card-elevated|sculpted-card|surface-well)\b/)
  })

  it('keeps destructive BreathFlow actions on semantic tokens', () => {
    expect(`${settingsSource}\n${progressSource}`).not.toMatch(
      /(?:text|bg|border|hover:bg|hover:text)-red-\d{3}/,
    )
  })

  it('keeps aura visualization colors on semantic BreathFlow tokens', () => {
    const auraSource = `${breathAuraSource}\n${breathingSessionSource}`

    expect(auraSource).toContain('var(--bw-accent)')
    expect(auraSource).toContain('var(--bw-surface)')
    expect(auraSource).not.toMatch(
      /#(?:fffefa|d6ad47|b8860b|5f574f|1c1917)|rgba\((?:214,\s*173,\s*71|184,\s*134,\s*11)/i,
    )
  })
})
