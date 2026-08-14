import { describe, expect, it } from 'vitest'
import { GLASS_ORB_FRAG } from '../useGlassOrb'

describe('glass orb shader contract', () => {
  it('keeps a circular glass silhouette and orbiting dust motes', () => {
    expect(GLASS_ORB_FRAG).toContain('float baseRadius = 0.36;')
    expect(GLASS_ORB_FRAG).toContain('dustMotes')
    expect(GLASS_ORB_FRAG).toContain('nebulaColor')
    expect(GLASS_ORB_FRAG).toContain('fresnel')
  })
})
