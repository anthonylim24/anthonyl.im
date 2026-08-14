import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('useWebGLOrb glass shader', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/hooks/useWebGLOrb.ts'), 'utf8')

  it('keeps the existing breath radius contract', () => {
    expect(source).toContain('0.16 + u_amplitude * 0.22')
  })

  it('renders a spacey glass nebula with motion particles', () => {
    expect(source).toContain('nebulaColor')
    expect(source).toContain('dustMotes')
    expect(source).toContain('iridescent')
  })
})
