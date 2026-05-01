import { describe, expect, it } from 'vitest'
import indexCss from '../../index.css?raw'

describe('visual debt guardrails', () => {
  it('does not keep the old purple gradient text utility in the global stylesheet', () => {
    expect(indexCss).not.toContain('.gradient-text')
    expect(indexCss).not.toMatch(/#7c8aff|#a78bfa|#c4b5fd/i)
  })

  it('does not keep unused glass compatibility surface classes', () => {
    expect(indexCss).not.toMatch(/\.(glass|card-elevated|sculpted-card|surface-well)\b/)
  })
})
