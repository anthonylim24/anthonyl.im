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

  it('uses the Forest instrument palette, not parchment/amber or indigo', () => {
    expect(favicon).toContain('#EFEDE6')
    expect(favicon).toContain('#22624A')
    expect(favicon).toContain('#161D18')

    expect(favicon).not.toMatch(/#F5F2ED|#B8860B|#D6AD47|#6366F1|#818CF8|#050816/i)
  })
})
