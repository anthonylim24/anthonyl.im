// The inline route-metadata scripts in index.html, run the way a browser meets
// them in production: after the server-injected tags at the top of <head>.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BREATHFLOW_ROUTE_METADATA, manifestForPath, syncManifest } from '../routeMetadata'

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const scripts = [...html.matchAll(/<script data-route-metadata="\w+">([\s\S]*?)<\/script>/g)].map((m) => m[1]!)

function serverTags(title: string, description: string, installName: string) {
  return `
    <meta name="description" content="${description}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    <meta name="apple-mobile-web-app-title" content="${installName}" />
    <meta name="application-name" content="${installName}" />`
}

/** `injected` is what the server writes after `<meta charset>`; the scripts run after it, mid-parse. */
function boot(path: string, injected: string) {
  window.history.replaceState(null, '', path)
  document.head.innerHTML = `${injected}<link rel="icon" type="image/svg+xml" href="/favicon-chat.svg" /><link rel="manifest" href="/korea.webmanifest" />`
  for (const code of scripts) new Function(code)()
}

const contents = (selector: string) =>
  [...document.head.querySelectorAll(selector)].map((tag) => tag.getAttribute('content'))

afterEach(() => {
  document.head.innerHTML = ''
})

describe('route metadata bootstrap', () => {
  it('ships three scripts, the shared helper first', () => {
    expect(scripts).toHaveLength(3)
    expect(scripts[0]).toContain('window.__setRouteMeta =')
  })

  it('updates the server-injected tags in place, one of each kind', () => {
    const { title, description } = BREATHFLOW_ROUTE_METADATA
    boot('/breathwork', serverTags(title, 'stale', 'BreathFlow'))

    for (const selector of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
    ]) {
      expect(contents(selector)).toHaveLength(1)
    }
    expect(contents('meta[name="description"]')).toEqual([description])
    expect(document.title).toBe(title)
  })

  it('keeps the trip install name short', () => {
    boot('/trips', serverTags('Trips — plan a trip, pin by pin', 'Plan trips', 'Trips'))
    expect(contents('meta[name="apple-mobile-web-app-title"]')).toEqual(['Trips'])
    expect(contents('meta[name="application-name"]')).toEqual(['Trips'])
  })

  it('leaves Lim\'s server tags alone', () => {
    boot('/', serverTags('Lim', 'Meet Lim', 'Lim'))
    expect(contents('meta[property="og:title"]')).toEqual(['Lim'])
    expect(contents('meta[name="apple-mobile-web-app-title"]')).toEqual(['Lim'])
  })

  it('links the Trips manifest on trips, Korea\'s on the Korea trip, under any preview base', () => {
    const manifest = () => document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')
    for (const [path, href] of [
      ['/trips', '/trips.webmanifest'],
      ['/trips/tokyo/day/1', '/trips.webmanifest'],
      ['/trips/korea-2026', '/korea.webmanifest'],
      ['/korea', '/korea.webmanifest'],
      ['/preview/pr/12/trips', '/preview/pr/12/trips.webmanifest'],
      ['/preview/pr/12/trips/korea-2026/day/3', '/preview/pr/12/korea.webmanifest'],
      ['/', '/korea.webmanifest'],
    ] as const) {
      boot(path, '')
      expect(manifest()).toBe(href)
      expect(manifestForPath(path)).toBe(href)
    }
  })

  it('moves the manifest link with a client-side navigation', () => {
    boot('/trips', '')
    syncManifest('/trips/korea-2026')
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/korea.webmanifest')
    syncManifest('/preview/pr/7/trips/new')
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/preview/pr/7/trips.webmanifest')
  })

  it('creates the tags in dev, where nothing is injected', () => {
    boot('/trips/korea-2026', '')
    expect(contents('meta[property="og:title"]')).toEqual(['Seoul + Busan — Korea 2026 trip dossier'])
    expect(contents('meta[name="apple-mobile-web-app-title"]')).toEqual(['Korea Trip'])
  })
})
