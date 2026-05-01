import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TECHNIQUE_IDS } from '@/lib/constants'
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
})
