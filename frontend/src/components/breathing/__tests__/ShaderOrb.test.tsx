import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BREATH_PHASES, TECHNIQUE_IDS } from '@/lib/constants'
import { ShaderOrb } from '../ShaderOrb'

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}))

vi.mock('@/hooks/useWebGL2', () => ({
  useWebGL2: () => false,
}))

vi.mock('@/hooks/useWebGLOrb', () => ({
  useWebGLOrb: () => false,
}))

describe('ShaderOrb', () => {
  it('uses selected theme colors for the reduced-motion static fallback', () => {
    render(
      <ShaderOrb
        phase={null}
        amplitude={0.2}
        isActive={false}
        techniqueId={TECHNIQUE_IDS.BOX_BREATHING}
        themeColors={['#3D9088', '#7AD0C6']}
      />
    )

    expect(screen.getByTestId('concentric-rings')).toHaveStyle({
      background: '#3D9088',
    })
  })

  it('uses a native button for interactive reduced-motion fallback', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <ShaderOrb
        phase={null}
        amplitude={0.2}
        isActive={false}
        techniqueId={TECHNIQUE_IDS.BOX_BREATHING}
        themeColors={['#3D9088', '#7AD0C6']}
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

  it('uses user-facing phase names in interactive labels', () => {
    render(
      <ShaderOrb
        phase={BREATH_PHASES.DEEP_INHALE}
        amplitude={0.2}
        isActive={false}
        techniqueId={TECHNIQUE_IDS.CYCLIC_SIGHING}
        themeColors={['#3D9088', '#7AD0C6']}
        onClick={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /Sip In phase/i })).toBeInTheDocument()
  })
})
