import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PersonalBests } from '../PersonalBests'
import { TECHNIQUE_IDS, type TechniqueId } from '@/lib/constants'
import type { PersonalBest } from '@/stores/historyStore'

describe('PersonalBests', () => {
  it('announces the empty personal-best state', () => {
    render(<PersonalBests personalBests={{} as Record<TechniqueId, PersonalBest | undefined>} />)

    expect(
      screen.getByRole('status', {
        name: /no personal bests recorded yet/i,
      })
    ).toBeInTheDocument()
  })

  it('renders personal records as a labeled list', () => {
    render(
      <PersonalBests
        personalBests={{
          [TECHNIQUE_IDS.CO2_TOLERANCE]: {
            techniqueId: TECHNIQUE_IDS.CO2_TOLERANCE,
            maxHoldTime: 45,
            date: '2026-05-01T10:00:00.000Z',
          },
          [TECHNIQUE_IDS.BOX_BREATHING]: undefined,
          [TECHNIQUE_IDS.POWER_BREATHING]: undefined,
          [TECHNIQUE_IDS.CYCLIC_SIGHING]: undefined,
          [TECHNIQUE_IDS.RESONANCE_BREATHING]: undefined,
          [TECHNIQUE_IDS.EXTENDED_EXHALE]: undefined,
          [TECHNIQUE_IDS.FOUR_SEVEN_EIGHT]: undefined,
          [TECHNIQUE_IDS.PURSED_LIP_RECOVERY]: undefined,
        }}
      />
    )

    expect(screen.getByRole('list', { name: /1 personal best/i })).toBeInTheDocument()
    expect(
      screen.getByRole('listitem', {
        name: /CO2 Tolerance Table, best hold 45 seconds, May 1, 2026/i,
      })
    ).toBeInTheDocument()
  })
})
