import { describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS } from '../constants'
import { techniqueActiveStyle, techniqueCardGradient } from '../techniqueConfig'

describe('technique style helpers', () => {
  it('uses explicit rgba colors for alpha-adjusted technique styles', () => {
    const activeStyle = techniqueActiveStyle(TECHNIQUE_IDS.BOX_BREATHING)
    const cardStyle = techniqueCardGradient(TECHNIQUE_IDS.BOX_BREATHING)

    expect(activeStyle.borderColor).toBe('rgba(184,134,11,0.14)')
    expect(activeStyle.background).toBe('rgba(184,134,11,0.04)')
    expect(cardStyle.border).toBe('1px solid rgba(184,134,11,0.08)')
  })
})
