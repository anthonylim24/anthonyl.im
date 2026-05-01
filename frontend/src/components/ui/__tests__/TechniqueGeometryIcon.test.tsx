import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TECHNIQUE_IDS } from '@/lib/constants'
import { TechniqueGeometryIcon } from '../TechniqueGeometryIcon'

describe('TechniqueGeometryIcon', () => {
  it('marks the geometric icon as decorative', () => {
    render(
      <button type="button">
        <TechniqueGeometryIcon techniqueId={TECHNIQUE_IDS.BOX_BREATHING} />
        Box
      </button>,
    )

    expect(screen.getByRole('button', { name: 'Box' })).toBeInTheDocument()
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('svg')).toHaveAttribute('focusable', 'false')
  })
})
