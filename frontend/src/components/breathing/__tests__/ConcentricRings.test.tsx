import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TECHNIQUE_IDS } from '@/lib/constants'
import { ConcentricRings } from '../ConcentricRings'

describe('ConcentricRings', () => {
  it('renders a labeled image when it is not interactive', () => {
    render(
      <ConcentricRings
        phase={null}
        amplitude={0.3}
        isActive={false}
        techniqueId={TECHNIQUE_IDS.BOX_BREATHING}
      />
    )

    expect(screen.getByRole('img', { name: /breathing visualization: ready/i })).toBeInTheDocument()
  })

  it('uses a native button for interactive visual toggles', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <ConcentricRings
        phase={null}
        amplitude={0.3}
        isActive={false}
        techniqueId={TECHNIQUE_IDS.BOX_BREATHING}
        onClick={onClick}
      />
    )

    const button = screen.getByRole('button', { name: /breathing visualization/i })
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('type', 'button')
    expect(screen.queryByRole('img')).toBeNull()

    button.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')

    expect(onClick).toHaveBeenCalledTimes(2)
  })
})
