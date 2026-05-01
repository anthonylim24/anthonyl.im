/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('BreathFlow favicon asset', () => {
  const favicon = readFileSync(
    resolve(process.cwd(), 'public/favicon-breath.svg'),
    'utf8'
  )

  it('uses the warm BreathFlow palette instead of the old indigo-on-navy palette', () => {
    expect(favicon).toContain('#F5F2ED')
    expect(favicon).toContain('#B8860B')
    expect(favicon).toContain('#1C1917')

    expect(favicon).not.toMatch(/#6366F1|#818CF8|#050816/i)
  })
})
