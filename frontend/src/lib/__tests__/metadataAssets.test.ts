// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('metadata assets', () => {
  it('links the web app manifest from index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/favicon-breath.svg" />')
  })

  it('defines an installable BreathFlow manifest', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/site.webmanifest'), 'utf8')
    )

    expect(manifest.name).toBe('BreathFlow')
    expect(manifest.start_url).toBe('/breathwork')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/favicon-breath.svg',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        }),
      ])
    )
  })
})
