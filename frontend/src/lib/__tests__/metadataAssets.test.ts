// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('metadata assets', () => {
  it('links the web app manifest from index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />')
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/favicon-breath.svg" />')
  })

  it('does not preconnect or prefetch optional analytics hosts from static HTML', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).not.toContain('posthog.com')
  })

  it('defines an installable BreathFlow manifest', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/site.webmanifest'), 'utf8')
    )

    expect(manifest.name).toBe('BreathFlow')
    expect(manifest.start_url).toBe('/breathwork')
    expect(manifest.display).toBe('standalone')
    expect(manifest.orientation).toBe('portrait-primary')
    expect(manifest.categories).toEqual(
      expect.arrayContaining(['health', 'fitness', 'lifestyle'])
    )
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: '/favicon-breath.svg',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        }),
      ])
    )
    expect(manifest.shortcuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Start Calm Session',
          url: '/breathwork/session?technique=cyclic_sighing&rounds=30',
        }),
        expect.objectContaining({
          name: 'Sleep Downshift',
          url: '/breathwork/session?technique=four_seven_eight&rounds=16',
        }),
        expect.objectContaining({
          name: 'View Progress',
          url: '/breathwork/progress',
        }),
      ])
    )
  })
})
