// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function expectPngAsset(relativePath: string) {
  const assetPath = resolve(process.cwd(), relativePath)
  const asset = readFileSync(assetPath)

  expect(asset.subarray(0, pngSignature.length)).toEqual(pngSignature)
  expect(statSync(assetPath).size).toBeGreaterThan(1024)
}

describe('metadata assets', () => {
  it('links the web app manifest from index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />')
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
    expect(html).toContain('<link rel="icon" type="image/png" sizes="192x192" href="/icons/breathflow-192.png" />')
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />')
  })

  it('does not preconnect or prefetch optional analytics hosts from static HTML', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).not.toContain('posthog.com')
  })

  it('does not prefetch unused third-party media hosts from static HTML', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).not.toContain('i.imgur.com')
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
          src: '/icons/breathflow-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        }),
        expect.objectContaining({
          src: '/icons/breathflow-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        }),
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

  it('ships concrete PNG install icons for mobile and PWA surfaces', () => {
    expectPngAsset('public/apple-touch-icon.png')
    expectPngAsset('public/icons/breathflow-192.png')
    expectPngAsset('public/icons/breathflow-512.png')
  })

  it('publishes robots and sitemap metadata for crawlable public routes', () => {
    const robots = readFileSync(resolve(process.cwd(), 'public/robots.txt'), 'utf8')
    const sitemap = readFileSync(resolve(process.cwd(), 'public/sitemap.xml'), 'utf8')

    expect(robots).toContain('Sitemap: https://anthonyl.im/sitemap.xml')
    expect(sitemap).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    for (const route of [
      '/',
      '/chatbot',
      '/breathwork',
      '/breathwork/session',
      '/breathwork/progress',
      '/breathwork/settings',
    ]) {
      expect(sitemap).toContain(`<loc>https://anthonyl.im${route === '/' ? '/' : route}</loc>`)
    }
  })

  it('keeps PWA metadata precached for offline install contexts', () => {
    const worker = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')

    for (const asset of [
      '/site.webmanifest',
      '/apple-touch-icon.png',
      '/icons/breathflow-192.png',
      '/icons/breathflow-512.png',
      '/robots.txt',
      '/sitemap.xml',
    ]) {
      expect(worker).toContain(`'${asset}'`)
      expect(existsSync(resolve(process.cwd(), `public${asset}`))).toBe(true)
    }
  })
})
